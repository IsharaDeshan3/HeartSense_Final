"""
ORA_app.py — Output Refinement Agent (ORA) HuggingFace Space

Gradio app with:
    - openchat/openchat-3.5-0106 loaded on startup
    - API endpoint: refine_from_supabase(kra_output_id, experience_level)

Data flow:
  1. Local backend calls KRA Space → KRA output saved to Supabase `kra_outputs`
  2. Local backend calls THIS Space via Gradio 6.x SSE with the kra_output UUID
  3. This app fetches the KRA output row from Supabase using the UUID
  4. Runs ORA refinement inference tailored to the clinician experience level
  5. Returns JSON dict: {refined_output, disclaimer, status}

Supabase columns read from `kra_outputs`:
  - kra_output  (dict)  — parsed KRA JSON result
  - symptoms_text (str) — original patient symptoms description

HF Space Secrets required:
  - SUPABASE_URL         — e.g. https://xxxx.supabase.co
  - SUPABASE_SERVICE_KEY — service role key (bypasses RLS)

Gradio API (fn_index=0 → refine, fn_index=1 → refine_from_supabase):
  refine(kra_json, symptoms, experience_level) -> dict
  refine_from_supabase(kra_output_id, experience_level) -> dict
"""

import os
import json
import torch
import spaces
import gradio as gr
import requests
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig

# ======================================================================
# 1. Configuration
# ======================================================================
MODEL_NAME = "openchat/openchat-3.5-0106"

# Supabase credentials — add these as HF Space Secrets
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# Model globals
model = None
tokenizer = None


# ======================================================================
# 2. Model Loading
# ======================================================================
def load_model_and_tokenizer():
    global model, tokenizer
    if model is not None:
        return model, tokenizer

    print(f"Loading {MODEL_NAME}...")

    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16
    )

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        low_cpu_mem_usage=True
    )

    print(f"✓ {MODEL_NAME} loaded successfully")
    return model, tokenizer


# ======================================================================
# 3. Prompt Templates per Experience Level
# ======================================================================
ORA_PROMPT_TEMPLATES = {
    "NEWBIE": (
        "You are ORA (Output Refinement Agent). Reformat this for a JUNIOR clinician. "
        "KRA diagnostic output: {kra_json}. Patient symptoms: {symptoms}. "
        "Use plain language, numbered steps, and clearly highlight red flags. "
        "Avoid jargon. Explain each diagnosis briefly."
    ),
    "SEASONED": (
        "You are ORA. Refine this for an EXPERIENCED clinician. "
        "KRA diagnostic output: {kra_json}. Patient symptoms: {symptoms}. "
        "Use standard medical terminology. Rank differentials by probability. "
        "Include evidence-based recommendations."
    ),
    "EXPERT": (
        "You are ORA. Provide HIGH-SIGNAL, concise output for a SPECIALIST. "
        "KRA diagnostic output: {kra_json}. Patient symptoms: {symptoms}. "
        "Extremely concise. Focus only on critical action items and differentials. "
        "Use abbreviated clinical notation."
    ),
}


# ======================================================================
# 4. Disclaimer Templates
# ======================================================================
def get_disclaimer(level: str) -> str:
    disclaimers = {
        "NEWBIE": "[!] IMPORTANT: AI-assisted output. MUST be reviewed and confirmed by senior clinical staff before any action.",
        "SEASONED": "[!] DISCLAIMER: AI clinical decision support tool. Always verify findings clinically before acting.",
        "EXPERT": "[!] AI-generated. Verify decision-critical information independently.",
    }
    return disclaimers.get(level.upper(), "[!] AI-assisted output. Verify clinically.")


# ======================================================================
# 5. Supabase Integration
# ======================================================================
def _supabase_headers():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in Space Secrets. "
            "Go to Settings → Secrets and add them."
        )
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
    }


def fetch_kra_output_from_supabase(kra_output_id: str) -> dict:
    """Fetch a KRA output row from Supabase by its UUID."""
    clean_id = str(kra_output_id).strip()
    if not clean_id:
        raise ValueError("KRA output ID is required")

    url = SUPABASE_URL + "/rest/v1/kra_outputs?id=eq." + clean_id + "&select=*"
    resp = requests.get(url, headers=_supabase_headers(), timeout=30)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError(f"KRA output '{clean_id}' not found in Supabase")
    return data[0]


# ======================================================================
# 6. Core Inference Helper
# ======================================================================
def _refine_core(kra_json: str, symptoms: str, experience_level: str) -> dict:
    """Shared inference logic. Callers are responsible for @spaces.GPU allocation."""
    global model, tokenizer
    model, tokenizer = load_model_and_tokenizer()

    level = experience_level.upper()
    if level not in ORA_PROMPT_TEMPLATES:
        level = "SEASONED"

    try:
        kra_data = json.loads(kra_json) if isinstance(kra_json, str) else kra_json
    except Exception:
        kra_data = {"raw": str(kra_json)}

    template = ORA_PROMPT_TEMPLATES[level]
    prompt = template.format(
        kra_json=json.dumps(kra_data, ensure_ascii=False),
        symptoms=symptoms or "Not provided"
    )

    # OpenChat format
    end_of_turn = "<|end_of_turn|>"
    formatted_prompt = f"GPT4 Correct User: {prompt}{end_of_turn}GPT4 Correct Assistant:"

    inputs = tokenizer(formatted_prompt, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=800,
            temperature=0.3,
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id
        )

    response = tokenizer.decode(
        outputs[0][inputs["input_ids"].shape[1]:],
        skip_special_tokens=True
    )

    return {
        "refined_output": response.strip(),
        "disclaimer": get_disclaimer(level),
        "status": "success",
    }


# ======================================================================
# 7. Manual Entry Point (fn_index=0)
# ======================================================================
@spaces.GPU(duration=120)
def refine(kra_json: str, symptoms: str, experience_level: str) -> dict:
    """Manual UI entry point — takes raw strings, runs ORA inference."""
    try:
        return _refine_core(kra_json, symptoms, experience_level)
    except Exception as e:
        return {
            "refined_output": f"Error: {type(e).__name__}: {e}",
            "disclaimer": get_disclaimer("SEASONED"),
            "status": "error",
        }


# ======================================================================
# 8. Supabase-Aware Entry Point (fn_index=1)
# ======================================================================
@spaces.GPU(duration=120)
def refine_from_supabase(kra_output_id: str, experience_level: str) -> dict:
    """
    API entry point used by the local FastAPI backend (fn_index=1).
    1. Fetches KRA output from Supabase using the row ID.
    2. Extracts kra_output JSON and symptoms_text.
    3. Runs ORA inference at the requested experience level.

    Returns:
        dict with keys: refined_output (str), disclaimer (str), status (str)
    """
    try:
        row = fetch_kra_output_from_supabase(kra_output_id)
        kra_output = row.get("kra_output", row.get("parsed_json", {}))
        kra_json_str = json.dumps(kra_output) if isinstance(kra_output, dict) else str(kra_output)
        symptoms_str = row.get("symptoms_text", "")
        return _refine_core(
            kra_json=kra_json_str,
            symptoms=symptoms_str,
            experience_level=experience_level
        )
    except ValueError as ve:
        return {
            "refined_output": f"Request Failed: {ve}",
            "disclaimer": get_disclaimer("SEASONED"),
            "status": "error",
        }
    except requests.HTTPError as he:
        return {
            "refined_output": f"Supabase Error: {he.response.status_code} — {he.response.text[:300]}",
            "disclaimer": get_disclaimer("SEASONED"),
            "status": "error",
        }
    except Exception as e:
        return {
            "refined_output": f"ORA Failed: {type(e).__name__}: {e}",
            "disclaimer": get_disclaimer("SEASONED"),
            "status": "error",
        }


# ======================================================================
# 9. Gradio UI
# ======================================================================
with gr.Blocks(theme=gr.themes.Soft(), title="ORA - Output Refinement Agent") as demo:
    gr.Markdown("# 🩺 Output Refinement Agent (ORA)")
    gr.Markdown(
        "Refines KRA diagnostic output for clinicians using **OpenChat-3.5**. "
        "Supports three experience levels: Newbie, Seasoned, Expert."
    )

    with gr.Tabs():

        # ---- Tab 1: Manual UI (fn_index=0 → refine) ----
        with gr.Tab("🖊️ Manual Mode"):
            gr.Markdown("### Manual Refinement")
            gr.Markdown("Paste KRA output and symptoms directly for testing.")
            with gr.Row():
                with gr.Column():
                    kra_input = gr.Textbox(
                        label="KRA JSON Input",
                        value='{"diagnoses": [{"condition": "Acute Coronary Syndrome", "confidence": 0.85, "severity": "HIGH"}]}',
                        lines=6,
                    )
                    symptoms_input = gr.Textbox(
                        label="Patient Symptoms",
                        value="Chest pain radiating to left arm, 55yo male, diaphoresis",
                        lines=3,
                    )
                    level_input = gr.Dropdown(
                        choices=["NEWBIE", "SEASONED", "EXPERT"],
                        value="SEASONED",
                        label="Experience Level",
                    )
                    btn = gr.Button("🔬 Refine Output", variant="primary")

                with gr.Column():
                    output_display = gr.JSON(label="Refined Clinical Output")

            btn.click(
                fn=refine,
                inputs=[kra_input, symptoms_input, level_input],
                outputs=output_display,
                api_name="refine",
            )

        # ---- Tab 2: API Mode (fn_index=1 → refine_from_supabase) ----
        with gr.Tab("🔌 API Mode"):
            gr.Markdown("### Backend API Integration")
            gr.Markdown(
                "This endpoint (`fn_index=1`) is called programmatically by the local FastAPI backend. "
                "It fetches KRA output from Supabase using the row UUID."
            )
            ora_payload_id = gr.Textbox(
                label="Supabase KRA Output ID (UUID)",
                placeholder="e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890",
            )
            ora_level = gr.Dropdown(
                choices=["NEWBIE", "SEASONED", "EXPERT"],
                value="SEASONED",
                label="Experience Level",
            )
            ora_btn = gr.Button("▶️ Run ORA (API)", variant="primary")
            ora_output = gr.JSON(label="ORA Refined Output")
            ora_btn.click(
                fn=refine_from_supabase,
                inputs=[ora_payload_id, ora_level],
                outputs=ora_output,
                api_name="refine_from_supabase",
            )


if __name__ == "__main__":
    demo.launch(theme=gr.themes.Soft())
