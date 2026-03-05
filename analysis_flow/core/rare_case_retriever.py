"""
core/rare_case_retriever.py

Dedicated FAISS retriever for the rare cardiology case database.
Uses the PubMedBERT-based index at knowledge_base/faiss_index/rare_cardio.faiss.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import faiss
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
#  Result dataclass
# ---------------------------------------------------------------------------

@dataclass
class RareCaseResult:
    """A single rare-case match from the FAISS index."""
    index: int
    score: float                    # cosine similarity (0..1)
    doi: str = ""
    pmcid: str = ""
    keyword: str = ""
    section: str = ""
    authors: str = ""
    source_url: str = ""
    diseases: List[str] = field(default_factory=list)
    chemicals: List[str] = field(default_factory=list)
    year: str = ""
    journal: str = ""

    def to_dict(self) -> Dict:
        return {
            "index": self.index,
            "score": self.score,
            "doi": self.doi,
            "pmcid": self.pmcid,
            "keyword": self.keyword,
            "source_url": self.source_url,
            "diseases": self.diseases,
            "year": self.year,
        }


# ---------------------------------------------------------------------------
#  Retriever
# ---------------------------------------------------------------------------

# Resolve paths relative to the project root (two levels up from core/)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_INDEX = _PROJECT_ROOT / "knowledge_base" / "faiss_index" / "rare_cardio.faiss"
_DEFAULT_META  = _PROJECT_ROOT / "knowledge_base" / "faiss_index" / "metadata.json"

# PubMedBERT sentence-transformer — 768-d, fits easily on a GTX 1080 (8 GB)
_DEFAULT_MODEL = "pritamdeka/S-PubMedBert-MS-MARCO"


class RareCaseRetriever:
    """
    Searches the rare-cardiology FAISS index for patient-symptom matches.

    The index was built with a 768-d PubMedBERT-class model.  We load the
    same model here so the query embeddings land in the correct vector space.
    """

    def __init__(
        self,
        index_path: str | Path = _DEFAULT_INDEX,
        metadata_path: str | Path = _DEFAULT_META,
        model_name: str = _DEFAULT_MODEL,
        device: str = "cuda",           # "cuda" or "cpu"
    ):
        index_path = Path(index_path)
        metadata_path = Path(metadata_path)

        # ----- Load FAISS index -----
        if not index_path.exists():
            raise FileNotFoundError(f"Rare-case FAISS index not found: {index_path}")
        self.index = faiss.read_index(str(index_path))
        logger.info("Rare-case FAISS index loaded: %d vectors, dim=%d",
                     self.index.ntotal, self.index.d)

        # ----- Load metadata -----
        if not metadata_path.exists():
            raise FileNotFoundError(f"Rare-case metadata not found: {metadata_path}")
        with open(metadata_path, "r", encoding="utf-8") as f:
            self._raw_meta: Dict[str, Dict] = json.load(f)
        logger.info("Rare-case metadata loaded: %d entries", len(self._raw_meta))

        # ----- Load embedding model (lazy import keeps startup fast) -----
        from sentence_transformers import SentenceTransformer
        logger.info("Loading rare-case embedding model: %s (device=%s)", model_name, device)
        self.model = SentenceTransformer(model_name, device=device)
        self._dim = self.model.get_sentence_embedding_dimension()
        logger.info("Model ready — dim=%d", self._dim)

    # ------------------------------------------------------------------
    #  Embed
    # ------------------------------------------------------------------

    def embed_query(self, query: str) -> np.ndarray:
        """Embed a query string and L2-normalise for cosine similarity."""
        vec = self.model.encode([query], show_progress_bar=False)[0]
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.astype("float32")

    # ------------------------------------------------------------------
    #  Search
    # ------------------------------------------------------------------

    def search(self, query: str, top_k: int = 5) -> List[RareCaseResult]:
        """
        Return the *top_k* rare-case records most semantically similar
        to *query*.  Scores are cosine-similarity values in [0, 1].
        """
        qvec = self.embed_query(query).reshape(1, -1)

        # IndexFlatIP → inner product on L2-normed vectors = cosine sim
        distances, indices = self.index.search(qvec, top_k)

        results: List[RareCaseResult] = []
        for dist, idx in zip(distances[0], indices[0]):
            if idx == -1:
                continue

            meta = self._raw_meta.get(str(idx), {})
            results.append(RareCaseResult(
                index=int(idx),
                score=float(max(dist, 0.0)),   # clamp negatives
                doi=meta.get("doi", ""),
                pmcid=meta.get("pmcid", ""),
                keyword=meta.get("keyword", ""),
                section=meta.get("section", ""),
                authors=meta.get("authors", ""),
                source_url=meta.get("source_url", ""),
                diseases=meta.get("diseases", []),
                chemicals=meta.get("chemicals", []),
                year=meta.get("year", ""),
                journal=meta.get("journal", ""),
            ))
        return results

    # ------------------------------------------------------------------
    #  Context string (for KRA prompt)
    # ------------------------------------------------------------------

    def get_context_string(self, query: str, top_k: int = 3) -> str:
        """Format search results into a readable context block."""
        results = self.search(query, top_k)
        if not results:
            return ""

        parts = ["--- RARE CASE REFERENCES (PubMed) ---"]
        for i, r in enumerate(results, 1):
            diseases_str = ", ".join(r.diseases) if r.diseases else "N/A"
            parts.append(
                f"\n[{i}] Score: {r.score:.3f} | Keyword: {r.keyword}\n"
                f"    Diseases: {diseases_str}\n"
                f"    Source: {r.source_url or r.pmcid}\n"
                f"    Year: {r.year}"
            )
        return "\n".join(parts)

    # ------------------------------------------------------------------
    #  Quality metrics
    # ------------------------------------------------------------------

    def calculate_quality(self, query: str, top_k: int = 5) -> Dict:
        """Score-distribution metrics for the rare-case search."""
        results = self.search(query, top_k)
        if not results:
            return {"status": "NO_RESULTS", "top_score": 0.0, "avg_score": 0.0}

        scores = [r.score for r in results]
        top = max(scores)
        avg = sum(scores) / len(scores)

        if top > 0.70:
            status = "HIGH_CONFIDENCE"
        elif top > 0.45:
            status = "MEDIUM_CONFIDENCE"
        else:
            status = "LOW_CONFIDENCE"

        return {
            "status": status,
            "top_score": top,
            "avg_score": avg,
            "num_results": len(results),
        }
