from __future__ import annotations

from typing import Any, Dict, List

from faiss_retriever import FAISSRetriever

from .models import RetrievedChunk, RetrievalQuality


class DualFAISSRetriever:
    """Retrieve from two sources every time: books/guidelines + rare cases.

    Prototype behavior (until you have 2 separate indices):
    - Use a single FAISS index and split results by metadata.category == 'rare_case'.
    """

    def __init__(
        self,
        *,
        index_path: str = "knowledge_base/vector_index.faiss",
        metadata_path: str = "knowledge_base/vector_db_metadata.pkl",
    ):
        self.retriever = FAISSRetriever(index_path=index_path, metadata_path=metadata_path)

    def retrieve(
        self,
        query: str,
        *,
        top_k_books: int = 5,
        top_k_rare: int = 3,
    ) -> tuple[list[RetrievedChunk], RetrievalQuality]:
        raw = self.retriever.search(query, top_k=(top_k_books + top_k_rare) * 4)

        books: List[RetrievedChunk] = []
        rare: List[RetrievedChunk] = []
        for r in raw:
            category = (r.get("category") or "").lower()
            source = "rare_cases" if category == "rare_case" else "books"
            chunk = RetrievedChunk(
                source=source,
                text=str(r.get("text") or ""),
                score=float(r.get("score") or 0.0),
                metadata={
                    **(r.get("record") or {}),
                    "pmid": r.get("pmid"),
                    "condition": r.get("condition"),
                    "source_file": r.get("source_file"),
                    "category": r.get("category"),
                },
            )

            if source == "rare_cases":
                if len(rare) < top_k_rare:
                    rare.append(chunk)
            else:
                if len(books) < top_k_books:
                    books.append(chunk)

            if len(books) >= top_k_books and len(rare) >= top_k_rare:
                break

        chunks = books + rare
        quality_raw: Dict[str, Any] = self.retriever.calculate_retrieval_quality(query, top_k=min(5, max(1, len(chunks))))
        quality = RetrievalQuality(**quality_raw)
        return chunks, quality
