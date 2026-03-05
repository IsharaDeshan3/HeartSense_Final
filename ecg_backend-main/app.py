
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import base64
import traceback
import numpy as np
from io import BytesIO
from PIL import Image
from processing.filtering import apply_filters
from processing.features import extract_features

app = Flask(__name__)
CORS(app)

# env config
from dotenv import load_dotenv
load_dotenv()

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