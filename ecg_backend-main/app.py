
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


def get_gemini_client():
    """Initialize Gemini client"""
    if not GEMINI_AVAILABLE:
        return None

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    genai.configure(api_key=api_key)
    # Use the correct model name for the free tier
    return genai.GenerativeModel('gemini-2.5-flash')  # Free tier model


def parse_gemini_response(response_text):
    """
    Parse Gemini's text response into structured format
    """
    try:
        # Try to extract JSON if Gemini returns it
        if '{' in response_text and '}' in response_text:
            # Find JSON blocks
            start = response_text.find('{')
            end = response_text.rfind('}') + 1
            json_str = response_text[start:end]
            return json.loads(json_str)
    except:
        pass

    # If no JSON, parse from text (fallback)
    lines = response_text.split('\n')

    # Initialize default structure
    result = {
        "rhythm_analysis": {
            "heart_rate": 75,
            "rhythm_type": "Sinus Rhythm",
            "regularity": "regular"
        },
        "abnormalities": {
            "abnormalities": [],
            "severity": "normal",
            "affected_leads": []
        },
        "diagnosis": {
            "primary_diagnosis": "Pending detailed analysis",
            "differential_diagnoses": [],
            "recommendations": [],
            "urgency": "routine"
        },
        "full_interpretation": response_text,
        "source": "gemini"
    }

    # Simple text parsing
    text_lower = response_text.lower()

    # Extract heart rate
    import re
    hr_match = re.search(r'(\d{2,3})\s*(bpm|beats)', text_lower)
    if hr_match:
        result["rhythm_analysis"]["heart_rate"] = int(hr_match.group(1))

    # Detect rhythm type
    if 'tachycardia' in text_lower:
        result["rhythm_analysis"]["rhythm_type"] = "Sinus Tachycardia"
    elif 'bradycardia' in text_lower:
        result["rhythm_analysis"]["rhythm_type"] = "Sinus Bradycardia"
    elif 'fibrillation' in text_lower:
        result["rhythm_analysis"]["rhythm_type"] = "Atrial Fibrillation"
        result["rhythm_analysis"]["regularity"] = "irregular"
    elif 'flutter' in text_lower:
        result["rhythm_analysis"]["rhythm_type"] = "Atrial Flutter"

    # Detect severity
    if any(word in text_lower for word in ['critical', 'severe', 'emergency', 'stemi', 'acute mi']):
        result["abnormalities"]["severity"] = "severe"
        result["diagnosis"]["urgency"] = "emergent"
    elif any(word in text_lower for word in ['moderate', 'significant']):
        result["abnormalities"]["severity"] = "moderate"
        result["diagnosis"]["urgency"] = "urgent"
    elif any(word in text_lower for word in ['mild', 'minor']):
        result["abnormalities"]["severity"] = "mild"

    # Extract abnormalities (look for common ECG findings)
    abnormality_keywords = [
        'st elevation', 'st depression', 'q wave', 't wave inversion',
        'qt prolongation', 'bundle branch block', 'lvh', 'rvh',
        'ischemia', 'infarction', 'pericarditis'
    ]

    for keyword in abnormality_keywords:
        if keyword in text_lower:
            result["abnormalities"]["abnormalities"].append(keyword.title())

    if not result["abnormalities"]["abnormalities"]:
        if result["abnormalities"]["severity"] == "normal":
            result["abnormalities"]["abnormalities"] = ["No significant abnormalities detected"]
        else:
            result["abnormalities"]["abnormalities"] = ["See detailed interpretation below"]

    return result


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
        
        for i, b64 in enumerate(base64_images):
            # Decode image
            image_data = base64.b64decode(b64)
            img = Image.open(BytesIO(image_data))
            content_parts.append(img)
            
            # Simplified deterministic signal extraction for EACH segment
            gray_image = img.convert('L')
            projected_signal = np.mean(np.array(gray_image), axis=1)
            filtered_signal = apply_filters(projected_signal)
            features = extract_features(filtered_signal)
            features["segment_id"] = i + 1
            all_features.append(features)

        # Enhance prompt with segment-specific findings
        prompt_update = "\n--- Deterministic Signal Scan Results ---"
        for feat in all_features:
            if feat.get("status") == "success":
                prompt_update += f"\nSegment {feat['segment_id']}: {feat['heart_rate_avg']:.1f} BPM, {feat['peak_count']} R-peaks detected."
        
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
        "model": "gemini-1.5-flash-latest",
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

        if not base64_images:
            return jsonify({"error": "No images provided"}), 400

        # Pre-process base64 strings
        processed_images = []
        for b64 in base64_images:
            if ',' in b64:
                b64 = b64.split(',')[1]
            processed_images.append(b64)

        # Perform analysis with Gemini
        print(f"Starting Panoramic ECG analysis with {len(processed_images)} segments...")
        results = analyze_ecg_with_gemini(processed_images, patient_context, leads_mapping)

        print(" Analysis complete!")
        print(f"   Diagnosis: {results.get('diagnosis', {}).get('primary_diagnosis', 'N/A')}")
        print(f"   Heart Rate: {results.get('rhythm_analysis', {}).get('heart_rate', 'N/A')} bpm")

        return jsonify(results), 200

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

        # Perform analysis
        print(f"Starting ECG analysis for file: {file.filename}")
        results = analyze_ecg_with_gemini(base64_image, patient_context)
        print("Analysis complete!")

        # Return results
        return jsonify(results), 200

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

        if not base64_images:
            return jsonify({"error": "No images provided"}), 400

        segments = []
        seg_counter = 0
        for i, b64 in enumerate(base64_images):
            # Strip data-URL prefix if present
            if ',' in b64:
                b64 = b64.split(',')[1]

            image_data = base64.b64decode(b64)
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
        records = list(
            mongo_db.ecg_records.find(
                {"patient_id": patient_id},
                {"analysis.full_interpretation": 0}  # Exclude large text for listing
            ).sort("created_at", -1).limit(50)
        )

        for r in records:
            r["_id"] = str(r["_id"])
            if r.get("created_at"):
                r["created_at"] = r["created_at"].isoformat()

        return jsonify({"patient_id": patient_id, "records": records}), 200

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
    print(" Model: gemini-1.5-flash-latest (FREE)")
    print(" Server starting on http://localhost:5000")
    print(" Health check: http://localhost:5000/health")
    print(" Analysis endpoint: http://localhost:5000/api/analyze")
    print(" File upload endpoint: http://localhost:5000/api/analyze-file")
    print("\n Cost: $0.00 (Free Tier)")
    print("⚡ Limits: 15 requests/min, 1,500 requests/day")
    print("=" * 70)

    # Run the Flask app
    app.run(debug=True, host='0.0.0.0', port=5000)