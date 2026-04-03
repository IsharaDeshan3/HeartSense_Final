
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import base64
import traceback
import numpy as np
from scipy.signal import savgol_filter
from io import BytesIO
from PIL import Image
from processing.filtering import apply_filters
from processing.features import extract_features, extract_signal_data
from datetime import datetime, timezone

app = Flask(__name__)
CORS(app)

# env config
from dotenv import load_dotenv
load_dotenv()

# ── MongoDB setup (Motor for async, pymongo for sync Flask) ────────────────
try:
    from pymongo import MongoClient
    MONGO_URL = os.getenv("MONGODB_URL", "mongodb+srv://ridmikranasinghe:Ridmi25106@cardiaclabtest.ith9fcq.mongodb.net/")
    MONGO_DB = os.getenv("MONGODB_DATABASE", "cardiac_db")
    mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    mongo_db = mongo_client[MONGO_DB]
    MONGO_AVAILABLE = True
    print("✓ MongoDB connection configured")
except Exception as e:
    MONGO_AVAILABLE = False
    mongo_db = None
    print(f"✗ MongoDB not available: {e}")

# Import Google Generative AI
try:
    import google.generativeai as genai

    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("google-generativeai not installed. Run: pip install google-generativeai")


GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
MAX_ECG_IMAGE_BYTES = int(os.getenv("MAX_ECG_IMAGE_BYTES", "5242880"))
MAX_ECG_SEGMENTS = int(os.getenv("MAX_ECG_SEGMENTS", "24"))
MIN_QC_SCORE_FOR_ANALYSIS = float(os.getenv("MIN_QC_SCORE_FOR_ANALYSIS", "0.20"))

PIPELINE_VERSION = "ecg_backend_r1"
PROMPT_VERSION = "panoramic_v2"
PREPROCESSING_VERSION = "digitize_v1"

ALLOWED_SEVERITIES = {"normal", "mild", "moderate", "severe", "critical"}
ALLOWED_URGENCIES = {"routine", "urgent", "emergent"}
ALLOWED_REGULARITY = {"regular", "irregular", "regularly_irregular"}


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _build_session_step_trace(analysis, quality_control, provenance, segments_count):
    """Build an ordered technical trace that can be surfaced in admin tooling."""
    qc_status = quality_control.get("status", "unknown") if isinstance(quality_control, dict) else "unknown"
    deterministic_metrics = analysis.get("deterministic_metrics", []) if isinstance(analysis, dict) else []

    steps = [
        {
            "id": "ingestion",
            "label": "Request Ingestion",
            "status": "success",
            "timestamp_utc": _utc_now_iso(),
            "output": {
                "segments_count": segments_count,
                "patient_context_present": bool((analysis or {}).get("patient_context")),
            },
        },
        {
            "id": "quality_control",
            "label": "Segment Quality Control",
            "status": "warning" if qc_status == "caution" else ("failed" if qc_status == "reject" else "success"),
            "timestamp_utc": _utc_now_iso(),
            "output": quality_control,
        },
        {
            "id": "deterministic_extraction",
            "label": "Deterministic Signal Metrics",
            "status": "success",
            "timestamp_utc": _utc_now_iso(),
            "output": {
                "metrics_count": len(deterministic_metrics) if isinstance(deterministic_metrics, list) else 0,
                "deterministic_metrics": deterministic_metrics,
            },
        },
        {
            "id": "model_inference",
            "label": "Model Inference + Schema Validation",
            "status": "success",
            "timestamp_utc": _utc_now_iso(),
            "output": {
                "model_name": provenance.get("model_name") if isinstance(provenance, dict) else None,
                "schema_valid": True,
                "diagnosis": (analysis or {}).get("diagnosis", {}),
            },
        },
        {
            "id": "persistence",
            "label": "Persistence + Provenance",
            "status": "success",
            "timestamp_utc": _utc_now_iso(),
            "output": {
                "pipeline_version": provenance.get("pipeline_version") if isinstance(provenance, dict) else None,
                "prompt_version": provenance.get("prompt_version") if isinstance(provenance, dict) else None,
                "preprocessing_version": provenance.get("preprocessing_version") if isinstance(provenance, dict) else None,
                "generated_at_utc": provenance.get("generated_at_utc") if isinstance(provenance, dict) else None,
            },
        },
    ]

    return steps


def _project_analysis_for_doctor(analysis):
    """Remove deep technical fields from doctor-facing payloads."""
    if not isinstance(analysis, dict):
        return {}

    projected = {
        "rhythm_analysis": analysis.get("rhythm_analysis", {}),
        "abnormalities": analysis.get("abnormalities", {}),
        "diagnosis": analysis.get("diagnosis", {}),
        "full_interpretation": analysis.get("full_interpretation"),
        "source": analysis.get("source"),
        "segments_processed": analysis.get("segments_processed"),
    }

    qc = analysis.get("quality_control", {}) if isinstance(analysis.get("quality_control"), dict) else {}
    projected["quality_indicator"] = {
        "overall_score": qc.get("overall_score"),
        "overall_grade": qc.get("overall_grade"),
        "status": qc.get("status"),
    }

    provenance = analysis.get("provenance", {}) if isinstance(analysis.get("provenance"), dict) else {}
    projected["traceability"] = {
        "pipeline_version": provenance.get("pipeline_version"),
        "model_name": provenance.get("model_name"),
    }

    return projected


def _project_record(record, projection):
    """Return doctor-safe or admin-rich record representation."""
    if projection == "doctor":
        return {
            "_id": str(record.get("_id")),
            "patient_id": record.get("patient_id"),
            "session_id": record.get("session_id"),
            "finding_summary": record.get("finding_summary", {}),
            "analysis": _project_analysis_for_doctor(record.get("analysis", {})),
            "created_at": record.get("created_at").isoformat() if record.get("created_at") else None,
        }

    projected = dict(record)
    projected["_id"] = str(projected.get("_id"))
    if projected.get("created_at"):
        projected["created_at"] = projected["created_at"].isoformat()
    return projected


def _strip_data_url_prefix(b64_text):
    """Return bare base64 data regardless of optional data URL prefix."""
    if not isinstance(b64_text, str):
        raise ValueError("Image payload must be a base64 string")
    return b64_text.split(",", 1)[1] if "," in b64_text else b64_text


def _decode_base64_image(b64_text):
    """Decode and bound-check image payloads to prevent malformed/oversized inputs."""
    raw_b64 = _strip_data_url_prefix(b64_text).strip()
    if not raw_b64:
        raise ValueError("Empty base64 image payload")

    try:
        image_bytes = base64.b64decode(raw_b64, validate=True)
    except Exception as exc:
        raise ValueError(f"Invalid base64 image payload: {exc}") from exc

    if len(image_bytes) > MAX_ECG_IMAGE_BYTES:
        raise ValueError(
            f"Image exceeds max size ({MAX_ECG_IMAGE_BYTES} bytes). "
            "Set MAX_ECG_IMAGE_BYTES env var to adjust."
        )

    return raw_b64, image_bytes


def _normalize_leads_mapping(leads_mapping, image_count):
    """Normalize leads payload into list[list[str]] with one entry per segment."""
    if leads_mapping is None:
        leads_mapping = []

    if not isinstance(leads_mapping, list):
        raise ValueError("'leads' must be a list")

    normalized = []
    for entry in leads_mapping:
        if entry is None:
            normalized.append([])
            continue
        if not isinstance(entry, list):
            raise ValueError("Each leads segment must be a list of lead names")
        if not all(isinstance(lead, str) for lead in entry):
            raise ValueError("Each lead name must be a string")
        normalized.append(entry)

    if len(normalized) < image_count:
        normalized.extend([[] for _ in range(image_count - len(normalized))])

    return normalized[:image_count]


def _parse_and_validate_gemini_json(response_text):
    """Parse model output and enforce required schema keys/types."""
    if not isinstance(response_text, str) or not response_text.strip():
        raise ValueError("Empty Gemini response")

    start = response_text.find("{")
    end = response_text.rfind("}")
    if start < 0 or end < 0 or end <= start:
        raise ValueError("Gemini response did not contain a JSON object")

    try:
        parsed = json.loads(response_text[start:end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned invalid JSON: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError("Gemini JSON root must be an object")

    _validate_analysis_schema(parsed)
    return parsed


def _validate_analysis_schema(result):
    """Research-grade output contract validation for analysis payloads."""
    required_top = ["rhythm_analysis", "abnormalities", "diagnosis"]
    for key in required_top:
        if key not in result or not isinstance(result[key], dict):
            raise ValueError(f"Missing or invalid top-level field: '{key}'")

    rhythm = result["rhythm_analysis"]
    heart_rate = rhythm.get("heart_rate")
    if not isinstance(heart_rate, (int, float)):
        raise ValueError("'rhythm_analysis.heart_rate' must be numeric")
    if not isinstance(rhythm.get("rhythm_type"), str) or not rhythm.get("rhythm_type").strip():
        raise ValueError("'rhythm_analysis.rhythm_type' must be a non-empty string")
    regularity = rhythm.get("regularity")
    if regularity not in ALLOWED_REGULARITY:
        raise ValueError(f"'rhythm_analysis.regularity' must be one of {sorted(ALLOWED_REGULARITY)}")

    abnormalities = result["abnormalities"]
    if not isinstance(abnormalities.get("abnormalities"), list):
        raise ValueError("'abnormalities.abnormalities' must be a list")
    if not all(isinstance(v, str) for v in abnormalities.get("abnormalities", [])):
        raise ValueError("'abnormalities.abnormalities' values must be strings")
    severity = abnormalities.get("severity")
    if severity not in ALLOWED_SEVERITIES:
        raise ValueError(f"'abnormalities.severity' must be one of {sorted(ALLOWED_SEVERITIES)}")
    if not isinstance(abnormalities.get("affected_leads"), list):
        raise ValueError("'abnormalities.affected_leads' must be a list")

    diagnosis = result["diagnosis"]
    if not isinstance(diagnosis.get("primary_diagnosis"), str) or not diagnosis.get("primary_diagnosis").strip():
        raise ValueError("'diagnosis.primary_diagnosis' must be a non-empty string")
    for key in ["differential_diagnoses", "recommendations"]:
        if not isinstance(diagnosis.get(key), list):
            raise ValueError(f"'diagnosis.{key}' must be a list")
        if not all(isinstance(v, str) for v in diagnosis.get(key, [])):
            raise ValueError(f"'diagnosis.{key}' values must be strings")
    urgency = diagnosis.get("urgency")
    if urgency not in ALLOWED_URGENCIES:
        raise ValueError(f"'diagnosis.urgency' must be one of {sorted(ALLOWED_URGENCIES)}")


def _evaluate_segment_quality(gray_arr, width, height, segment_id):
    """Compute simple deterministic ECG image QC metrics for one segment."""
    gray = gray_arr.astype(np.float32)

    mean_intensity = float(np.mean(gray))
    std_intensity = float(np.std(gray))
    p5, p95 = np.percentile(gray, [5, 95])
    dynamic_range = float(p95 - p5)

    black_ratio = float(np.mean(gray <= 10.0))
    white_ratio = float(np.mean(gray >= 245.0))
    saturation_ratio = black_ratio + white_ratio

    edge_x = np.abs(np.diff(gray, axis=1)).mean() if gray.shape[1] > 1 else 0.0
    edge_y = np.abs(np.diff(gray, axis=0)).mean() if gray.shape[0] > 1 else 0.0
    edge_strength = float((edge_x + edge_y) / 2.0)

    score = 1.0
    issues = []

    if std_intensity < 12.0:
        score -= 0.25
        issues.append("low_contrast")
    if dynamic_range < 45.0:
        score -= 0.20
        issues.append("narrow_dynamic_range")
    if saturation_ratio > 0.35:
        score -= 0.20
        issues.append("pixel_saturation")
    if edge_strength < 3.0:
        score -= 0.20
        issues.append("low_detail")
    if width < 250 or height < 120:
        score -= 0.15
        issues.append("low_resolution")
    if mean_intensity < 15.0 or mean_intensity > 245.0:
        score -= 0.30
        issues.append("mostly_blank")

    score = max(0.0, min(1.0, score))
    if score >= 0.8:
        grade = "high"
    elif score >= 0.55:
        grade = "moderate"
    else:
        grade = "low"

    return {
        "segment_id": segment_id,
        "dimensions": {"width": int(width), "height": int(height)},
        "metrics": {
            "mean_intensity": round(mean_intensity, 3),
            "std_intensity": round(std_intensity, 3),
            "dynamic_range_p95_p5": round(dynamic_range, 3),
            "saturation_ratio": round(saturation_ratio, 4),
            "edge_strength": round(edge_strength, 4),
        },
        "issues": issues,
        "quality_score": round(score, 4),
        "quality_grade": grade,
    }


def _build_quality_report(segment_quality):
    """Aggregate segment-level QC into a single report."""
    if not segment_quality:
        return {
            "overall_score": 0.0,
            "overall_grade": "low",
            "status": "reject",
            "min_segment_score": 0.0,
            "segments": [],
            "issues": ["no_segments"],
        }

    scores = [s["quality_score"] for s in segment_quality]
    overall_score = float(np.mean(scores))
    min_score = float(np.min(scores))

    issue_set = set()
    for segment in segment_quality:
        issue_set.update(segment.get("issues", []))

    if overall_score >= 0.8 and min_score >= 0.55:
        overall_grade = "high"
    elif overall_score >= 0.55 and min_score >= 0.35:
        overall_grade = "moderate"
    else:
        overall_grade = "low"

    if overall_score < MIN_QC_SCORE_FOR_ANALYSIS:
        status = "reject"
    elif overall_grade == "low":
        status = "caution"
    else:
        status = "ok"

    return {
        "overall_score": round(overall_score, 4),
        "overall_grade": overall_grade,
        "status": status,
        "min_segment_score": round(min_score, 4),
        "segments": segment_quality,
        "issues": sorted(issue_set),
        "thresholds": {
            "min_qc_score_for_analysis": MIN_QC_SCORE_FOR_ANALYSIS,
        },
    }


def get_gemini_client():
    """Initialize Gemini client"""
    if not GEMINI_AVAILABLE:
        return None

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    genai.configure(api_key=api_key)
    return genai.GenerativeModel(GEMINI_MODEL_NAME)


def parse_gemini_response(response_text):
    """
    Parse and validate Gemini response into structured format.
    """
    return _parse_and_validate_gemini_json(response_text)


def analyze_ecg_with_gemini(base64_images, patient_context="", leads_mapping=None):
    """
    Analyze ECG using Google Gemini with multi-segment support

    Args:
        base64_images: List of Base64 encoded images
        patient_context: Optional patient information
        leads_mapping: Optional list of lead lists per segment

    Returns:
        Dictionary with analysis results
    """
    model = get_gemini_client()
    if not model:
        raise Exception("Gemini not available")

    if not isinstance(base64_images, list) or not base64_images:
        raise ValueError("base64_images must be a non-empty list")
    if len(base64_images) > MAX_ECG_SEGMENTS:
        raise ValueError(
            f"Too many ECG image segments ({len(base64_images)}). "
            f"Maximum allowed is {MAX_ECG_SEGMENTS}."
        )

    leads_mapping = _normalize_leads_mapping(leads_mapping, len(base64_images))

    # Create comprehensive prompt for Panoramic ECG
    prompt = """You are an expert cardiologist analyzing a sequential series of ECG image segments (Panoramic ECG).
These images represent a single long ECG strip that has been captured in parts to maintain high resolution.

CRITICAL TASK:
1. Correlate findings across ALL provided image segments.
2. Synthesize a unified 12-lead interpretation as if viewing the original continuous strip.
3. Identify heart rate, rhythm, and any morphology changes (ST, T, QRS) across the entire sequence.

Analyze the ECG and return ONLY a JSON object with this exact structure:

{
  "rhythm_analysis": {
    "heart_rate": <number>,
    "rhythm_type": "<string describing rhythm>",
    "regularity": "<regular/irregular/regularly_irregular>"
  },
  "abnormalities": {
    "abnormalities": ["<list of specific findings>"],
    "severity": "<normal/mild/moderate/severe/critical>",
    "affected_leads": ["<list of affected ECG leads if any>"]
  },
  "diagnosis": {
    "primary_diagnosis": "<main diagnostic impression>",
    "differential_diagnoses": ["<list of alternative diagnoses>"],
    "recommendations": ["<list of clinical recommendations>"],
    "urgency": "<routine/urgent/emergent>"
  },
  "segment_correlation": {
    "completeness": "<high/partial/low>",
    "noted_overlapping": <boolean>
  }
}

Important guidelines:
- Be thorough and clinically accurate.
- Use the provided Lead Mappings to associate findings with specific leads.
- If a find occurs in one segment but is absent in another, consider the spatial context.
"""

    if patient_context:
        prompt += f"\nPatient Context: {patient_context}\n"
    
    if leads_mapping:
        prompt += "\nLead Mappings per segment:\n"
        for i, leads in enumerate(leads_mapping):
            prompt += f"Segment {i+1}: Leads {', '.join(leads) if leads else 'Unknown'}\n"

    prompt += "\nProvide ONLY the JSON object, no additional text."

    try:
        # Prepare multimodal content (Prompt + all images)
        content_parts = [prompt]
        
        all_features = []
        segment_quality = []
        
        for i, b64 in enumerate(base64_images):
            # Decode image from validated base64 payload
            _, image_data = _decode_base64_image(b64)
            img = Image.open(BytesIO(image_data))
            img.load()

            width, height = img.size
            gray_image = img.convert('L')
            gray_array = np.array(gray_image)

            qc = _evaluate_segment_quality(gray_array, width, height, segment_id=i + 1)
            qc["assigned_leads"] = leads_mapping[i]
            segment_quality.append(qc)

            content_parts.append(img)
            
            # Simplified deterministic signal extraction for EACH segment
            projected_signal = np.mean(gray_array, axis=1)
            filtered_signal = apply_filters(projected_signal)
            features = extract_features(filtered_signal)
            features["segment_id"] = i + 1
            all_features.append(features)

        quality_report = _build_quality_report(segment_quality)
        if quality_report["status"] == "reject":
            raise ValueError(
                "ECG quality too low for reliable analysis. "
                f"overall_score={quality_report['overall_score']}"
            )

        # Enhance prompt with segment-specific findings
        prompt_update = "\n--- Deterministic Signal Scan Results ---"
        for feat in all_features:
            if feat.get("status") == "success":
                prompt_update += f"\nSegment {feat['segment_id']}: {feat['heart_rate_avg']:.1f} BPM, {feat['peak_count']} R-peaks detected."

        prompt_update += "\n--- Image Quality Summary ---"
        prompt_update += (
            f"\nOverall quality: {quality_report['overall_grade']} "
            f"(score={quality_report['overall_score']})."
        )
        if quality_report.get("issues"):
            prompt_update += f"\nQuality issues: {', '.join(quality_report['issues'])}."
        
        content_parts[0] = prompt + prompt_update

        # Generate content with Gemini
        print(f"Sending request to Gemini with {len(base64_images)} segments...")
        response = model.generate_content(content_parts)
        print("Received response from Gemini")

        # Parse the response
        results = parse_gemini_response(response.text)
        results["source"] = "gemini-panoramic"
        results["segments_processed"] = len(base64_images)
        results["deterministic_metrics"] = all_features
        results["quality_control"] = quality_report
        results["provenance"] = {
            "pipeline_version": PIPELINE_VERSION,
            "model_name": GEMINI_MODEL_NAME,
            "prompt_version": PROMPT_VERSION,
            "preprocessing_version": PREPROCESSING_VERSION,
            "generated_at_utc": _utc_now_iso(),
        }
        
        return results

    except Exception as e:
        print(f" Gemini API error: {str(e)}")
        raise


# API Routes

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    model = get_gemini_client()

    return jsonify({
        "status": "healthy",
        "service": "ECG Interpreter Gemini API",
        "version": "1.0.0",
        "ai_provider": "Google Gemini",
        "model": GEMINI_MODEL_NAME,
        "gemini_available": model is not None,
        "free_tier": True
    })


@app.route('/api/analyze', methods=['POST'])
def analyze_ecg():
    """
    Main endpoint to analyze ECG images using Gemini

    Expected JSON payload:
    {
        "images": ["base64_1", "base64_2"],
        "leads": [["I", "II"], ["V1", "V2"]],
        "patientContext": "optional patient information"
    }
    """
    try:
        # Get data from request
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        # Extract images and leads mapping
        base64_images = data.get('images', [])
        leads_mapping = data.get('leads', [])
        patient_context = data.get('patientContext', '')

        # Fallback for single image (legacy support)
        if not base64_images and data.get('image'):
            base64_images = [data.get('image')]
            leads_mapping = [[]]

        if not isinstance(base64_images, list):
            return jsonify({"error": "'images' must be a list of base64 strings"}), 400

        if not base64_images:
            return jsonify({"error": "No images provided"}), 400

        if len(base64_images) > MAX_ECG_SEGMENTS:
            return jsonify({"error": f"Too many images. Maximum is {MAX_ECG_SEGMENTS}"}), 400

        leads_mapping = _normalize_leads_mapping(leads_mapping, len(base64_images))

        # Pre-process and validate base64 strings
        processed_images = []
        for b64 in base64_images:
            cleaned_b64, _ = _decode_base64_image(b64)
            processed_images.append(cleaned_b64)

        # Perform analysis with Gemini
        print(f"Starting Panoramic ECG analysis with {len(processed_images)} segments...")
        results = analyze_ecg_with_gemini(processed_images, patient_context, leads_mapping)

        print(" Analysis complete!")
        print(f"   Diagnosis: {results.get('diagnosis', {}).get('primary_diagnosis', 'N/A')}")
        print(f"   Heart Rate: {results.get('rhythm_analysis', {}).get('heart_rate', 'N/A')} bpm")

        return jsonify(results), 200

    except ValueError as e:
        return jsonify({"error": "Invalid request", "message": str(e)}), 400

    except Exception as e:
        print(f" Error during analysis: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            "error": "Analysis failed",
            "message": str(e),
            "hint": "Make sure GEMINI_API_KEY is set correctly"
        }), 500


@app.route('/api/analyze-file', methods=['POST'])
def analyze_ecg_file():
    """
    Alternative endpoint that accepts file upload

    Expected form data:
    - file: ECG image file
    - patientContext: optional patient information
    """
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # Get patient context from form data
        patient_context = request.form.get('patientContext', '')

        # Read and encode the file
        file_bytes = file.read()
        base64_image = base64.b64encode(file_bytes).decode('utf-8')

        # Perform analysis (single-image path normalized to multi-segment API)
        print(f"Starting ECG analysis for file: {file.filename}")
        results = analyze_ecg_with_gemini([base64_image], patient_context, leads_mapping=[[]])
        print("Analysis complete!")

        # Return results
        return jsonify(results), 200

    except ValueError as e:
        return jsonify({"error": "Invalid request", "message": str(e)}), 400

    except Exception as e:
        print(f" Error during analysis: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            "error": "Analysis failed",
            "message": str(e)
        }), 500


# ── ECG Image Digitization Helpers ──────────────────────────────────────────

def ecg_trace_from_region(gray_arr):
    """
    Digitize an ECG trace from a greyscale numpy array.
    Finds the darkest pixel per column (the ink trace) and converts its
    vertical position into an amplitude value.  Savitzky-Golay smoothing
    removes pixel quantization noise without distorting peak morphology.
    """
    arr = gray_arr.astype(np.float32)
    h = arr.shape[0]

    # argmin per column → row index of the ECG trace (dark ink on light paper)
    trace_row = np.argmin(arr, axis=0).astype(np.float32)

    # Invert: lower row index (top of image) = upward = positive deflection
    signal = (h / 2.0) - trace_row

    # Savitzky-Golay smoothing – preserves peak shapes better than a running mean
    sig_len = len(signal)
    if sig_len >= 11:
        # window = ~1/20 of signal, forced odd, minimum 11
        window = max(11, (sig_len // 20) | 1)
        signal = savgol_filter(signal, window_length=window, polyorder=3)

    return signal


# Standard 12-lead ECG paper: 4 columns × 3 rows
_LEAD_LAYOUT_12 = [
    ["I",   "aVR", "V1", "V4"],
    ["II",  "aVL", "V2", "V5"],
    ["III", "aVF", "V3", "V6"],
]


def split_12lead_image(img):
    """
    Split a standard landscape 12-lead ECG image into 12 lead regions.
    Skips the header (~12%) and rhythm strip (~bottom 20%).
    Returns list of (lead_name: str, gray_array: np.ndarray) tuples.
    """
    gray = np.array(img.convert('L'))
    h, w = gray.shape

    top    = int(h * 0.12)  # skip machine/patient header
    bottom = int(h * 0.80)  # skip rhythm strip at the bottom
    ecg_area = gray[top:bottom, :]

    row_h = ecg_area.shape[0] // 3
    col_w = ecg_area.shape[1] // 4

    regions = []
    for r, row_leads in enumerate(_LEAD_LAYOUT_12):
        for c, lead in enumerate(row_leads):
            y0, y1 = r * row_h, (r + 1) * row_h
            x0, x1 = c * col_w, (c + 1) * col_w
            regions.append((lead, ecg_area[y0:y1, x0:x1]))
    return regions


@app.route('/api/signal-data', methods=['POST'])
def get_signal_data():
    """
    New visualization endpoint: returns cleaned signal arrays + annotated peak indices.
    Does NOT call Gemini. Purely deterministic signal processing.
    Used by the frontend ECG visualization hub after the main analysis completes.

    Expected JSON payload (same format as /api/analyze):
    {
        "images": ["base64_1", "base64_2"],
        "leads": [["I", "II"], ["V1", "V2"]]
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        base64_images = data.get('images', [])
        leads_mapping = data.get('leads', [])

        if not isinstance(base64_images, list):
            return jsonify({"error": "'images' must be a list of base64 strings"}), 400

        if not base64_images:
            return jsonify({"error": "No images provided"}), 400

        if len(base64_images) > MAX_ECG_SEGMENTS:
            return jsonify({"error": f"Too many images. Maximum is {MAX_ECG_SEGMENTS}"}), 400

        leads_mapping = _normalize_leads_mapping(leads_mapping, len(base64_images))

        segments = []
        seg_counter = 0
        for i, b64 in enumerate(base64_images):
            _, image_data = _decode_base64_image(b64)
            img = Image.open(BytesIO(image_data))
            assigned_leads = leads_mapping[i] if i < len(leads_mapping) else []

            w_img, h_img = img.size
            aspect = w_img / max(h_img, 1)

            # Auto-detect 12-lead ECG: landscape paper (aspect > 2) OR ≥ 3 leads assigned
            is_12lead = aspect > 2.0 or len(assigned_leads) >= 3

            if is_12lead:
                # Split into 12 regions, one signal per lead
                lead_regions = split_12lead_image(img)
                for lead_name, region in lead_regions:
                    signal = ecg_trace_from_region(region)
                    # Estimate SR: each column = 2.5 s at 25 mm/s paper speed
                    sr_est = max(50, int(region.shape[1] / 2.5))
                    seg_data = extract_signal_data(signal, sampling_rate=sr_est)
                    seg_data["segment_id"] = seg_counter
                    seg_data["leads"] = [lead_name]
                    segments.append(seg_data)
                    seg_counter += 1
            else:
                # Single-lead strip: extract full trace
                gray_arr = np.array(img.convert('L'))
                signal = ecg_trace_from_region(gray_arr)
                seg_data = extract_signal_data(signal, sampling_rate=500)
                seg_data["segment_id"] = seg_counter
                seg_data["leads"] = assigned_leads
                segments.append(seg_data)
                seg_counter += 1

        return jsonify({"segments": segments}), 200

    except ValueError as e:
        return jsonify({"error": "Invalid request", "message": str(e)}), 400

    except Exception as e:
        print(f"Signal data error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"error": "Signal extraction failed", "message": str(e)}), 500


# ── Doctor ECG Chat ────────────────────────────────────────────────────────

@app.route('/api/ecg/chat', methods=['POST'])
def ecg_chat():
    """
    Real-time doctor conversation about ECG findings.
    Uses Gemini with ECG analysis data as context for an informed discussion.
    Saves conversation to MongoDB for future reference.

    Expected JSON payload:
    {
        "message": "doctor's message",
        "conversationHistory": [{"role": "doctor"|"ai", "content": "..."}],
        "ecgAnalysis": { ... analysis data ... },
        "patientId": "optional",
        "sessionId": "optional",
        "patientContext": "optional patient symptoms"
    }
    """
    try:
        data = request.get_json()
        if not data or not data.get('message'):
            return jsonify({"error": "No message provided"}), 400

        message = data['message']
        conversation_history = data.get('conversationHistory', [])
        ecg_analysis = data.get('ecgAnalysis', {})
        patient_id = data.get('patientId')
        session_id = data.get('sessionId')
        patient_context = data.get('patientContext', '')

        model = get_gemini_client()
        if not model:
            return jsonify({"error": "AI model not available"}), 503

        # Build context-rich prompt for the conversation
        system_prompt = """You are an expert cardiologist AI assistant engaging in a real-time clinical discussion
with a doctor about an ECG analysis. You have access to the full ECG analysis data.

Your role:
- Engage thoughtfully with the doctor's observations and concerns
- Provide evidence-based insights referencing the actual ECG data
- Suggest differential diagnoses when appropriate
- Recommend further investigations when clinically relevant
- Be concise but thorough — this is a professional clinical discussion
- Reference specific findings from the ECG data to support your points
- If the doctor raises a concern, validate it against the ECG data

IMPORTANT: Always ground your response in the actual ECG data provided. Do not make up findings."""

        ecg_context = f"""
ECG ANALYSIS DATA:
- Heart Rate: {ecg_analysis.get('rhythm_analysis', {}).get('heart_rate', 'N/A')} BPM
- Rhythm: {ecg_analysis.get('rhythm_analysis', {}).get('rhythm_type', 'N/A')}
- Regularity: {ecg_analysis.get('rhythm_analysis', {}).get('regularity', 'N/A')}
- Primary Diagnosis: {ecg_analysis.get('diagnosis', {}).get('primary_diagnosis', 'N/A')}
- Severity: {ecg_analysis.get('abnormalities', {}).get('severity', 'N/A')}
- Abnormalities: {', '.join(ecg_analysis.get('abnormalities', {}).get('abnormalities', []))}
- Affected Leads: {', '.join(ecg_analysis.get('abnormalities', {}).get('affected_leads', []))}
- Urgency: {ecg_analysis.get('diagnosis', {}).get('urgency', 'N/A')}
- Recommendations: {'; '.join(ecg_analysis.get('diagnosis', {}).get('recommendations', []))}
- Differential Diagnoses: {', '.join(ecg_analysis.get('diagnosis', {}).get('differential_diagnoses', []))}
"""
        if ecg_analysis.get('full_interpretation'):
            ecg_context += f"- Full Interpretation: {ecg_analysis['full_interpretation'][:500]}\n"

        if patient_context:
            ecg_context += f"\nPATIENT CONTEXT:\n{patient_context}\n"

        # Build conversation for Gemini
        conversation_prompt = system_prompt + "\n\n" + ecg_context + "\n\nCONVERSATION:\n"
        for msg in conversation_history:
            role_label = "Doctor" if msg.get('role') == 'doctor' else "AI"
            conversation_prompt += f"{role_label}: {msg.get('content', '')}\n\n"
        conversation_prompt += f"Doctor: {message}\n\nAI:"

        response = model.generate_content(conversation_prompt)
        ai_response = response.text.strip()

        # Save conversation entry to MongoDB
        if MONGO_AVAILABLE and mongo_db is not None:
            try:
                conversation_doc = {
                    "patient_id": patient_id,
                    "session_id": session_id,
                    "doctor_message": message,
                    "ai_response": ai_response,
                    "ecg_summary": {
                        "heart_rate": ecg_analysis.get('rhythm_analysis', {}).get('heart_rate'),
                        "rhythm_type": ecg_analysis.get('rhythm_analysis', {}).get('rhythm_type'),
                        "primary_diagnosis": ecg_analysis.get('diagnosis', {}).get('primary_diagnosis'),
                        "severity": ecg_analysis.get('abnormalities', {}).get('severity'),
                    },
                    "analysis_provenance": {
                        "pipeline_version": ecg_analysis.get('provenance', {}).get('pipeline_version'),
                        "model_name": ecg_analysis.get('provenance', {}).get('model_name'),
                        "prompt_version": ecg_analysis.get('provenance', {}).get('prompt_version'),
                        "generated_at_utc": ecg_analysis.get('provenance', {}).get('generated_at_utc'),
                    },
                    "trace_step": {
                        "id": "chat_interaction",
                        "timestamp_utc": _utc_now_iso(),
                    },
                    "created_at": datetime.now(timezone.utc),
                }
                mongo_db.ecg_conversations.insert_one(conversation_doc)
            except Exception as db_err:
                print(f"Warning: Could not save conversation to DB: {db_err}")

        return jsonify({"response": ai_response}), 200

    except Exception as e:
        print(f"ECG chat error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"error": "Chat failed", "message": str(e)}), 500


# ── ECG Record Storage ─────────────────────────────────────────────────────

@app.route('/api/ecg/records', methods=['POST'])
def save_ecg_record():
    """
    Save ECG analysis data to MongoDB in a separate collection.
    This stores the full analysis result linked to a patient and session.

    Expected JSON payload:
    {
        "patient_id": "string",
        "session_id": "string (optional)",
        "analysis": { ... full ECG analysis ... },
        "patient_context": "string (optional)",
        "segments_count": number,
        "doctor_notes": "string (optional)"
    }
    """
    if not MONGO_AVAILABLE or mongo_db is None:
        return jsonify({"error": "Database not available"}), 503

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        patient_id = data.get('patient_id')
        if not patient_id:
            return jsonify({"error": "patient_id is required"}), 400

        analysis = data.get('analysis', {})
        if not isinstance(analysis, dict):
            return jsonify({"error": "analysis must be an object"}), 400

        provenance = data.get('provenance') or analysis.get('provenance', {})
        if not isinstance(provenance, dict):
            provenance = {}

        quality_control = data.get('quality_control') or analysis.get('quality_control', {})
        if not isinstance(quality_control, dict):
            quality_control = {}

        steps_trace = _build_session_step_trace(
            analysis=analysis,
            quality_control=quality_control,
            provenance=provenance,
            segments_count=data.get('segments_count', 0),
        )

        # Build ECG finding summary for patient history
        finding_summary = {
            "heart_rate": analysis.get('rhythm_analysis', {}).get('heart_rate'),
            "rhythm_type": analysis.get('rhythm_analysis', {}).get('rhythm_type'),
            "regularity": analysis.get('rhythm_analysis', {}).get('regularity'),
            "primary_diagnosis": analysis.get('diagnosis', {}).get('primary_diagnosis'),
            "severity": analysis.get('abnormalities', {}).get('severity'),
            "abnormalities": analysis.get('abnormalities', {}).get('abnormalities', []),
            "affected_leads": analysis.get('abnormalities', {}).get('affected_leads', []),
            "urgency": analysis.get('diagnosis', {}).get('urgency'),
            "recommendations": analysis.get('diagnosis', {}).get('recommendations', []),
        }

        ecg_record = {
            "patient_id": patient_id,
            "session_id": data.get('session_id'),
            "analysis": analysis,
            "finding_summary": finding_summary,
            "quality_control": quality_control,
            "provenance": {
                "pipeline_version": provenance.get("pipeline_version", PIPELINE_VERSION),
                "model_name": provenance.get("model_name", GEMINI_MODEL_NAME),
                "prompt_version": provenance.get("prompt_version", PROMPT_VERSION),
                "preprocessing_version": provenance.get("preprocessing_version", PREPROCESSING_VERSION),
                "generated_at_utc": provenance.get("generated_at_utc"),
                "saved_at_utc": _utc_now_iso(),
            },
            "session_technical_trace": steps_trace,
            "patient_context": data.get('patient_context', ''),
            "segments_count": data.get('segments_count', 0),
            "doctor_notes": data.get('doctor_notes', ''),
            "created_at": datetime.now(timezone.utc),
        }

        result = mongo_db.ecg_records.insert_one(ecg_record)

        # Also save finding summary to patient history collection
        history_entry = {
            "patient_id": patient_id,
            "type": "ECG",
            "summary": f"{finding_summary.get('rhythm_type', 'Unknown')} - "
                       f"{finding_summary.get('heart_rate', 'N/A')} BPM - "
                       f"{finding_summary.get('severity', 'N/A')} severity",
            "data": finding_summary,
            "quality": {
                "overall_score": quality_control.get("overall_score"),
                "overall_grade": quality_control.get("overall_grade"),
                "status": quality_control.get("status"),
            },
            "provenance": {
                "pipeline_version": provenance.get("pipeline_version", PIPELINE_VERSION),
                "model_name": provenance.get("model_name", GEMINI_MODEL_NAME),
                "prompt_version": provenance.get("prompt_version", PROMPT_VERSION),
            },
            "source": "ecg_analysis",
            "created_at": datetime.now(timezone.utc),
        }
        mongo_db.ecg_patient_history.insert_one(history_entry)

        return jsonify({
            "record_id": str(result.inserted_id),
            "message": "ECG record saved successfully",
            "finding_summary": finding_summary,
        }), 201

    except Exception as e:
        print(f"ECG record save error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({"error": "Failed to save ECG record", "message": str(e)}), 500


@app.route('/api/ecg/records/<patient_id>', methods=['GET'])
def get_ecg_records(patient_id):
    """
    Get all ECG records for a patient.
    """
    if not MONGO_AVAILABLE or mongo_db is None:
        return jsonify({"error": "Database not available"}), 503

    try:
        projection = request.args.get("projection", "doctor").lower()
        if projection not in {"doctor", "admin"}:
            return jsonify({"error": "projection must be 'doctor' or 'admin'"}), 400

        records = list(
            mongo_db.ecg_records.find(
                {"patient_id": patient_id},
                {"analysis.full_interpretation": 0}  # Exclude large text for listing
            ).sort("created_at", -1).limit(50)
        )

        projected_records = [_project_record(r, projection=projection) for r in records]

        return jsonify({"patient_id": patient_id, "projection": projection, "records": projected_records}), 200

    except Exception as e:
        print(f"ECG records fetch error: {str(e)}")
        return jsonify({"error": "Failed to fetch ECG records", "message": str(e)}), 500


@app.route('/api/ecg/conversations/<patient_id>', methods=['GET'])
def get_ecg_conversations(patient_id):
    """
    Get all ECG conversations for a patient (doctor's discussion history).
    """
    if not MONGO_AVAILABLE or mongo_db is None:
        return jsonify({"error": "Database not available"}), 503

    try:
        conversations = list(
            mongo_db.ecg_conversations.find(
                {"patient_id": patient_id}
            ).sort("created_at", -1).limit(100)
        )

        for c in conversations:
            c["_id"] = str(c["_id"])
            if c.get("created_at"):
                c["created_at"] = c["created_at"].isoformat()

        return jsonify({"patient_id": patient_id, "conversations": conversations}), 200

    except Exception as e:
        print(f"ECG conversations fetch error: {str(e)}")
        return jsonify({"error": "Failed to fetch conversations", "message": str(e)}), 500


@app.route('/api/ecg/sessions', methods=['GET'])
def list_ecg_sessions():
    """List ECG sessions across patients for admin monitoring."""
    if not MONGO_AVAILABLE or mongo_db is None:
        return jsonify({"error": "Database not available"}), 503

    try:
        projection = request.args.get("projection", "admin").lower()
        if projection not in {"doctor", "admin"}:
            return jsonify({"error": "projection must be 'doctor' or 'admin'"}), 400

        limit = int(request.args.get("limit", "100"))
        limit = max(1, min(limit, 300))

        records = list(
            mongo_db.ecg_records.find({}).sort("created_at", -1).limit(limit)
        )

        session_rows = []
        for record in records:
            projected = _project_record(record, projection=projection)
            session_rows.append(
                {
                    "record_id": projected.get("_id"),
                    "session_id": projected.get("session_id"),
                    "patient_id": projected.get("patient_id"),
                    "created_at": projected.get("created_at"),
                    "finding_summary": projected.get("finding_summary", {}),
                    "quality": (record.get("quality_control") or {}).get("overall_grade"),
                    "status": (record.get("quality_control") or {}).get("status"),
                    "projection": projection,
                }
            )

        return jsonify({"projection": projection, "sessions": session_rows}), 200

    except Exception as e:
        print(f"ECG sessions list error: {str(e)}")
        return jsonify({"error": "Failed to list ECG sessions", "message": str(e)}), 500


@app.route('/api/ecg/sessions/<session_id>', methods=['GET'])
def get_ecg_session_detail(session_id):
    """Return full per-session technical details for admin or projected doctor view."""
    if not MONGO_AVAILABLE or mongo_db is None:
        return jsonify({"error": "Database not available"}), 503

    try:
        projection = request.args.get("projection", "admin").lower()
        if projection not in {"doctor", "admin"}:
            return jsonify({"error": "projection must be 'doctor' or 'admin'"}), 400

        record = mongo_db.ecg_records.find_one({"session_id": session_id})
        if not record:
            return jsonify({"error": "Session not found"}), 404

        projected = _project_record(record, projection=projection)

        if projection == "admin":
            chat_count = mongo_db.ecg_conversations.count_documents({"session_id": session_id})
            trace = projected.get("session_technical_trace", [])
            trace = list(trace) if isinstance(trace, list) else []
            trace.append(
                {
                    "id": "chat_interactions",
                    "label": "Chat Interactions",
                    "status": "success",
                    "timestamp_utc": _utc_now_iso(),
                    "output": {"conversation_events": chat_count},
                }
            )
            projected["session_technical_trace"] = trace

        return jsonify({"projection": projection, "session": projected}), 200

    except Exception as e:
        print(f"ECG session detail error: {str(e)}")
        return jsonify({"error": "Failed to fetch ECG session", "message": str(e)}), 500


# Error handlers

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500


if __name__ == '__main__':
    print("=" * 70)
    print(" ECG Interpreter API with Google Gemini")
    print("=" * 70)

    if not GEMINI_AVAILABLE:
        print(" google-generativeai package not installed!")
        print("   Install with: pip install google-generativeai pillow")
        print("=" * 70)
        exit(1)

    # Check for API key
    if not os.getenv("GEMINI_API_KEY"):
        print("  GEMINI_API_KEY environment variable not set!")
        print("\n To get your FREE Gemini API key:")
        print("   1. Visit: https://makersuite.google.com/app/apikey")
        print("   2. Click 'Create API Key'")
        print("   3. Copy your key")
        print("   4. Set it: export GEMINI_API_KEY='your-key-here'")
        print("\n Gemini Free Tier Limits:")
        print("   • 15 requests per minute")
        print("   • 1,500 requests per day")
        print("   • 1 million tokens per minute")
        print("   • Completely FREE!")
        print("=" * 70)
        exit(1)

    print(" Gemini API Key: Configured")
    print(f" Model: {GEMINI_MODEL_NAME}")
    print(" Server starting on http://localhost:5000")
    print(" Health check: http://localhost:5000/health")
    print(" Analysis endpoint: http://localhost:5000/api/analyze")
    print(" File upload endpoint: http://localhost:5000/api/analyze-file")
    print("\n Cost: $0.00 (Free Tier)")
    print("⚡ Limits: 15 requests/min, 1,500 requests/day")
    print("=" * 70)

    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)