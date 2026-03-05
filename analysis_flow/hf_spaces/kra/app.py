"""
KRA_app.py — Cardiology AI Agent (KRA) HuggingFace Space

Gradio app with:
    - Phi-3-mini-4k-instruct loaded on startup
    - API endpoint: analyze_from_supabase(payload_id, temperature, show_reasoning)

Data flow:
  1. Local backend saves patient data to Supabase `analysis_payloads` table
  2. Local backend calls THIS Space via Gradio 6.x SSE with the payload UUID
  3. This app fetches the row from Supabase using the UUID
  4. Runs inference on the clinical data
  5. Returns Markdown diagnostic report

Supabase columns read from `analysis_payloads`:
  - symptoms_json  (dict)
  - history_json   (dict, may be empty)
  - ecg_json       (dict, may be empty)
  - labs_json      (dict, may be empty)
  - context_text   (str, FAISS-retrieved context)
  - quality_json   (dict, retrieval quality metrics)

HF Space Secrets required:
  - SUPABASE_URL         — e.g. https://xxxx.supabase.co
  - SUPABASE_SERVICE_KEY — service role key (bypasses RLS)

Gradio API (fn_index=0):
  analyze_from_supabase(payload_id, temperature, show_reasoning) -> str (Markdown)
"""

import json
import os
import time

import gradio as gr
import requests
import spaces
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig


# ===================================================================== #
#  Configuration                                                         #
# ===================================================================== #

MODEL = {
    "name": "Phi-3-mini-4k-instruct",
    "repo": "microsoft/Phi-3-mini-4k-instruct",
    "description": "Efficient 3.8B parameter model optimized for instruction following",
}
DEFAULT_MODEL = MODEL["name"]

# Supabase credentials — MUST be set in Space Secrets
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

# Model cache — holds the currently loaded model
_CACHED = {"name": None, "tokenizer": None, "model": None}


# ===================================================================== #
#  Supabase helpers                                                      #
# ===================================================================== #

def _check_supabase_env():
    """Fail-fast if Supabase credentials are missing."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in Space Secrets. "
            "Go to Settings → Secrets and add them."
        )


def _supabase_headers():
    """Standard Supabase PostgREST headers."""
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }


def fetch_payload(payload_id: str) -> dict:
    """
    Fetch a single row from `analysis_payloads` by UUID.
    Returns the full row dict.
    """
    _check_supabase_env()

    clean_id = str(payload_id).strip()
    if not clean_id:
        raise ValueError("Payload ID is required")

    url = f"{SUPABASE_URL}/rest/v1/analysis_payloads?id=eq.{clean_id}&select=*"
    resp = requests.get(url, headers=_supabase_headers(), timeout=30)
    resp.raise_for_status()

    rows = resp.json()
    if not rows:
        raise ValueError(
            f"Payload '{clean_id}' not found in Supabase. "
            "Make sure the local app saved it first."
        )
    return rows[0]


# ===================================================================== #
#  JSON / context helpers                                                #
# ===================================================================== #

def _to_text(value) -> str:
    """Convert a dict/list/None to a readable text string."""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    if value is None:
        return "{}"
    return str(value)


def _extract_context(payload: dict) -> str:
    """Extract the FAISS-retrieved context from the payload."""
    if payload.get("context_text"):
        return str(payload["context_text"])

    for key in ("retrieved_chunks", "retrieved_context", "rag_context", "context"):
        val = payload.get(key)
        if val is not None:
            return _to_text(val)

    return "No external research context provided."


# ===================================================================== #
#  Model loading                                                         #
# ===================================================================== #

def _load_model():
    """Load and cache the model + tokenizer. Uses 4-bit quantization."""
    if _CACHED["name"] == DEFAULT_MODEL and _CACHED["tokenizer"] and _CACHED["model"]:
        return _CACHED["tokenizer"], _CACHED["model"]

    # Free previous model from GPU memory
    if _CACHED["model"] is not None:
        del _CACHED["model"]
        _CACHED["model"] = None
        torch.cuda.empty_cache()

    model_id = MODEL["repo"]
    print(f"\n{'='*60}")
    print(f"  Loading model: {DEFAULT_MODEL}")
    print(f"  Repo: {model_id}")
    print(f"{'='*60}\n")

    tokenizer = AutoTokenizer.from_pretrained(model_id)

    # Ensure pad token exists
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    quant_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
    )

    try:
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            quantization_config=quant_config,
            device_map="auto",
        )
    except Exception as e:
        # Fallback: load in fp16 if quantization fails
        if "frozenset" in str(e) or "bitsandbytes" in str(e).lower():
            model = AutoModelForCausalLM.from_pretrained(
                model_id,
                torch_dtype=torch.float16,
                device_map="auto",
            )
        else:
            raise

    _CACHED["name"] = DEFAULT_MODEL
    _CACHED["tokenizer"] = tokenizer
    _CACHED["model"] = model
    print(f"  ✓ {DEFAULT_MODEL} loaded successfully\n")
    return tokenizer, model


def get_loaded_model_name() -> str:
    """Return the name of the currently cached model."""
    return _CACHED["name"] or "None"


# ===================================================================== #
#  Prompt builder                                                        #
# ===================================================================== #

def _build_phi3_prompt(clinical_data, context, quality):
    """Build a plain instruction prompt compatible with Phi-3 Instruct."""
    return (
        "You are a Senior Consultant Cardiologist specializing in evidence-based diagnostics.\n\n"
        "Analyze the patient data and provide a structured diagnostic report using:\n"
        "1. Clinical Synthesis\n"
        "2. Differential Diagnosis Flow (ranked)\n"
        "3. Primary Diagnostic Hypothesis\n"
        "4. Recommended Interventions\n"
        "5. Red Flags\n\n"
        f"## Patient Clinical Data\n{clinical_data}\n\n"
        f"## Retrieval Quality\n{quality}\n\n"
        f"## Retrieved Research Context\n{context}\n"
    )


# ===================================================================== #
#  Core inference                                                        #
# ===================================================================== #

def _run_inference(
    symptoms: str,
    history: str,
    ecg: str,
    labs: str,
    context: str,
    quality: str,
    temperature: float,
    show_reasoning: bool,
) -> str:
    """
    Build the clinical prompt and run inference.
    Returns Markdown-formatted diagnostic report.
    """
    tokenizer, model = _load_model()

    # Build clinical data block
    clinical_data = (
        f"SYMPTOMS:\n{symptoms}\n\n"
        f"HISTORY:\n{history}\n\n"
        f"ECG FINDINGS:\n{ecg}\n\n"
        f"LAB RESULTS:\n{labs}"
    )

    prompt = _build_phi3_prompt(clinical_data, context, quality)

    device = next(model.parameters()).device
    inputs = tokenizer(prompt, return_tensors="pt").to(device)

    with torch.no_grad():
        output_tokens = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=max(temperature, 0.01),
            do_sample=True,
            pad_token_id=tokenizer.eos_token_id,
        )

    full_output = tokenizer.decode(output_tokens[0], skip_special_tokens=True)

    if show_reasoning:
        return full_output.strip()

    return full_output.strip()


# ===================================================================== #
#  Model management functions                                            #
# ===================================================================== #

@spaces.GPU(duration=300)
def load_model_action() -> str:
    """Load a model explicitly via UI button. Returns status message."""
    try:
        start = time.time()
        _load_model()
        elapsed = time.time() - start
        return (
            f"✅ **{DEFAULT_MODEL}** loaded successfully in {elapsed:.1f}s\n\n"
            f"- Repo: `{MODEL['repo']}`\n"
            f"- Type: {MODEL['description']}\n"
            f"- Quantization: 4-bit NF4"
        )
    except Exception as e:
        return f"❌ Failed to load {DEFAULT_MODEL}: {type(e).__name__}: {e}"


def get_model_status() -> str:
    """Return current model status for the UI."""
    name = _CACHED["name"]
    if name:
        return (
            f"🟢 **Active Model:** {name}\n\n"
            f"- Repo: `{MODEL['repo']}`\n"
            f"- Type: {MODEL['description']}"
        )
    return "🔴 **No model loaded.** Click the button below to load Phi-3-mini-4k-instruct."


# ===================================================================== #
#  Main API function — analyze_from_supabase  (fn_index=0)             #
# ===================================================================== #

@spaces.GPU(duration=300)
def analyze_from_supabase(
    payload_id: str,
    temperature: float = 0.6,
    show_reasoning: bool = False,
) -> str:
    """
    Fetch patient data from Supabase and run diagnostic analysis.

    Args:
        payload_id:     UUID of the `analysis_payloads` row
        temperature:    Sampling temperature (0.1–1.0), default 0.6
        show_reasoning: Include chain-of-thought reasoning, default False

    Returns:
        Markdown-formatted diagnostic report string
    """
    try:
        payload = fetch_payload(payload_id)

        symptoms = _to_text(payload.get("symptoms_json", {}))
        history = _to_text(payload.get("history_json", {}))
        ecg = _to_text(payload.get("ecg_json", {}))
        labs = _to_text(payload.get("labs_json", {}))
        context = _extract_context(payload)
        quality = _to_text(payload.get("quality_json", {}))

        return _run_inference(
            symptoms=symptoms,
            history=history,
            ecg=ecg,
            labs=labs,
            context=context,
            quality=quality,
            temperature=temperature,
            show_reasoning=show_reasoning,
        )

    except ValueError as ve:
        return f"Request Failed: {ve}"
    except requests.HTTPError as he:
        return f"Supabase Error: {he.response.status_code} — {he.response.text[:300]}"
    except Exception as e:
        return f"Analysis Failed: {type(e).__name__}: {e}"


# ===================================================================== #
#  Gradio UI                                                             #
# ===================================================================== #

with gr.Blocks(theme=gr.themes.Soft(), title="KRA — Cardiology AI Agent") as demo:
    gr.Markdown("# 🫀 Cardiology AI Agent (KRA)")
    gr.Markdown(
        "Cardiac diagnostic reasoning powered by **Phi-3-mini-4k-instruct**. "
        "API mode for backend integration + manual UI for testing."
    )

    with gr.Tabs():
        # ── Tab 1: Model Management ──────────────────────────────────
        with gr.Tab("🔧 Model Manager"):
            gr.Markdown("### Model Status")
            gr.Markdown(
                "This Space uses a single fixed model: **Phi-3-mini-4k-instruct**. "
                "The model is pre-loaded on Space startup."
            )

            model_status = gr.Markdown(value=get_model_status())

            gr.Markdown(f"#### {DEFAULT_MODEL}")
            gr.Markdown(MODEL["description"])
            load_model_btn = gr.Button(
                "⚡ Load Phi-3-mini-4k-instruct",
                variant="primary",
                size="lg",
            )

            load_result = gr.Markdown("Click the button above to load the model.")

            load_model_btn.click(
                fn=load_model_action,
                inputs=[],
                outputs=load_result,
            ).then(fn=get_model_status, outputs=model_status)

        # ── Tab 2: API Mode (fn_index=0, used by local backend) ──────
        with gr.Tab("🔌 API Mode"):
            gr.Markdown("### Backend API Integration")
            gr.Markdown(
                "This endpoint (`fn_index=0`) is called programmatically by the local FastAPI backend. "
                "It fetches patient data from Supabase by payload ID and runs analysis."
            )

            with gr.Column():
                inp_payload_id = gr.Textbox(
                    label="Supabase Payload ID (UUID)",
                    placeholder="e.g. 9133fd9f-38e2-48ff-a3d5-4577c57fc745",
                )
                inp_temp = gr.Slider(
                    minimum=0.1, maximum=1.0, value=0.6, step=0.01,
                    label="Temperature",
                )
                inp_reasoning = gr.Checkbox(label="Show Reasoning", value=False)

            btn = gr.Button("Run Analysis", variant="primary", size="lg")
            out_md = gr.Markdown("Analysis output will appear here.")

            btn.click(
                fn=analyze_from_supabase,
                inputs=[inp_payload_id, inp_temp, inp_reasoning],
                outputs=out_md,
                api_name="analyze_from_supabase",
            )

        # ── Tab 3: Manual Test ────────────────────────────────────────
        with gr.Tab("🧪 Manual Test"):
            gr.Markdown("### Quick Test with Raw Input")
            gr.Markdown("Paste clinical data directly to test inference without Supabase.")

            with gr.Row():
                with gr.Column():
                    test_symptoms = gr.Textbox(
                        label="Symptoms",
                        placeholder="e.g. Chest pain, shortness of breath, diaphoresis",
                        lines=3,
                    )
                    test_history = gr.Textbox(
                        label="History",
                        placeholder="e.g. 55yo male, hypertension, diabetes",
                        lines=2,
                    )
                    test_ecg = gr.Textbox(
                        label="ECG Findings",
                        placeholder="e.g. ST elevation in leads II, III, aVF",
                        lines=2,
                    )
                    test_labs = gr.Textbox(
                        label="Lab Results",
                        placeholder="e.g. Troponin I: 2.5 ng/mL, BNP: 450 pg/mL",
                        lines=2,
                    )

                with gr.Column():
                    test_temp = gr.Slider(
                        minimum=0.1, maximum=1.0, value=0.6, step=0.01,
                        label="Temperature",
                    )
                    test_reasoning = gr.Checkbox(label="Show Reasoning", value=False)
                    test_btn = gr.Button("🔬 Run Manual Analysis", variant="primary")

            test_output = gr.Markdown("Manual test output will appear here.")

            @spaces.GPU(duration=300)
            def run_manual_test(symptoms, history, ecg, labs, temp, reasoning):
                """Run inference with manually entered clinical data."""
                try:
                    return _run_inference(
                        symptoms=symptoms or "Not provided",
                        history=history or "Not provided",
                        ecg=ecg or "Not provided",
                        labs=labs or "Not provided",
                        context="No external research context (manual test mode).",
                        quality="N/A — manual input",
                        temperature=temp,
                        show_reasoning=reasoning,
                    )
                except Exception as e:
                    return f"❌ Error: {type(e).__name__}: {e}"

            test_btn.click(
                fn=run_manual_test,
                inputs=[test_symptoms, test_history, test_ecg, test_labs, test_temp, test_reasoning],
                outputs=test_output,
            )


# ===================================================================== #
#  Startup: Pre-load default model                                       #
# ===================================================================== #

print(f"\n{'='*60}")
print(f"  KRA Agent starting — pre-loading {DEFAULT_MODEL}")
print(f"{'='*60}\n")

_load_model()
print(f"  ✓ Default model ready: {DEFAULT_MODEL}\n")


if __name__ == "__main__":
    demo.launch(ssr_mode=False)
