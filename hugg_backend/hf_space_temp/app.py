from __future__ import annotations

import logging
import os
import time
from threading import Lock
from typing import Any

import gradio as gr
import spaces
import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("hf_space_temp")

MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-7B-Instruct")
DEFAULT_MAX_NEW_TOKENS = int(os.getenv("DEFAULT_MAX_NEW_TOKENS", "768"))
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "24000"))
DEFAULT_TEMPERATURE = float(os.getenv("DEFAULT_TEMPERATURE", "0.2"))
GPU_DURATION_SECONDS = int(os.getenv("GPU_DURATION_SECONDS", "90"))

_MODEL_LOCK = Lock()
_TOKENIZER = None
_MODEL = None


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    max_tokens: int = Field(default=DEFAULT_MAX_NEW_TOKENS, ge=64, le=2048)
    temperature: float = Field(default=DEFAULT_TEMPERATURE, ge=0.0, le=2.0)


def _resolve_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def _load_model() -> tuple[Any, Any]:
    global _TOKENIZER, _MODEL
    if _TOKENIZER is not None and _MODEL is not None:
        return _TOKENIZER, _MODEL

    with _MODEL_LOCK:
        if _TOKENIZER is not None and _MODEL is not None:
            return _TOKENIZER, _MODEL

        logger.info("Loading model %s", MODEL_ID)
        tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=os.getenv("HF_TOKEN"))
        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token

        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            token=os.getenv("HF_TOKEN"),
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
            low_cpu_mem_usage=True,
        )
        model.eval()

        if not torch.cuda.is_available():
            model.to("cpu")

        _TOKENIZER = tokenizer
        _MODEL = model
        logger.info("Model %s loaded on %s", MODEL_ID, _resolve_device())
        return _TOKENIZER, _MODEL


def _prepare_prompt(prompt: str, tokenizer: Any) -> tuple[str, int]:
    trimmed_prompt = prompt[-MAX_INPUT_CHARS:]
    if hasattr(tokenizer, "apply_chat_template"):
        rendered = tokenizer.apply_chat_template(
            [{"role": "user", "content": trimmed_prompt}],
            tokenize=False,
            add_generation_prompt=True,
        )
    else:
        rendered = trimmed_prompt
    return rendered, len(prompt) - len(trimmed_prompt)


@spaces.GPU(duration=GPU_DURATION_SECONDS)
def generate_text(prompt: str, max_tokens: int, temperature: float) -> str:
    tokenizer, model = _load_model()
    rendered_prompt, truncated_chars = _prepare_prompt(prompt, tokenizer)

    encoded = tokenizer(rendered_prompt, return_tensors="pt")
    input_ids = encoded["input_ids"]
    attention_mask = encoded.get("attention_mask")

    if torch.cuda.is_available():
        input_ids = input_ids.to("cuda")
        if attention_mask is not None:
            attention_mask = attention_mask.to("cuda")

    do_sample = temperature > 0
    start_time = time.time()
    with torch.inference_mode():
        output = model.generate(
            input_ids=input_ids,
            attention_mask=attention_mask,
            max_new_tokens=max_tokens,
            do_sample=do_sample,
            temperature=max(temperature, 1e-5),
            top_p=0.9,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
        )

    generated_tokens = output[0][input_ids.shape[-1]:]
    text = tokenizer.decode(generated_tokens, skip_special_tokens=True).strip()
    elapsed = time.time() - start_time
    logger.info(
        "Generated %d chars in %.2fs with %s (truncated_chars=%d)",
        len(text),
        elapsed,
        MODEL_ID,
        max(truncated_chars, 0),
    )
    return text


def run_generation(prompt: str, max_tokens: int, temperature: float) -> dict[str, Any]:
    if not prompt or not prompt.strip():
        raise ValueError("Prompt is required.")

    generated_text = generate_text(prompt.strip(), max_tokens, temperature)
    return {
        "generated_text": generated_text,
        "model_id": MODEL_ID,
        "accelerator": os.getenv("ACCELERATOR", "unknown"),
    }


def run_generation_for_ui(prompt: str, max_tokens: int, temperature: float) -> tuple[str, str]:
    result = run_generation(prompt, max_tokens, temperature)
    meta = (
        f"model={result['model_id']} | accelerator={result['accelerator']} | "
        f"output_chars={len(result['generated_text'])}"
    )
    return result["generated_text"], meta


with gr.Blocks(title="HeartSense KRA ZeroGPU", analytics_enabled=False) as demo:
    gr.Markdown(
        "# HeartSense KRA ZeroGPU\n"
        "Send a full KRA prompt and get back generated text. "
        "This Space is intended to be called by the local HeartSense backend."
    )

    with gr.Row():
        prompt_box = gr.Textbox(
            label="Prompt",
            lines=18,
            placeholder="Paste the full KRA prompt here...",
        )

    with gr.Row():
        max_tokens_box = gr.Slider(
            minimum=64,
            maximum=2048,
            value=DEFAULT_MAX_NEW_TOKENS,
            step=64,
            label="Max new tokens",
        )
        temperature_box = gr.Slider(
            minimum=0.0,
            maximum=1.5,
            value=DEFAULT_TEMPERATURE,
            step=0.05,
            label="Temperature",
        )

    run_button = gr.Button("Generate", variant="primary")
    output_box = gr.Textbox(label="Generated text", lines=18)
    meta_box = gr.Textbox(label="Run metadata", lines=2)

    run_button.click(
        fn=run_generation_for_ui,
        inputs=[prompt_box, max_tokens_box, temperature_box],
        outputs=[output_box, meta_box],
        api_name="generate",
        show_progress="full",
    )


api_app = FastAPI(title="HeartSense KRA ZeroGPU Adapter", version="1.0.0")


@api_app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "model_id": MODEL_ID,
        "accelerator": os.getenv("ACCELERATOR", "unknown"),
        "zerogpu": True,
    }


@api_app.post("/api/generate")
async def api_generate(req: GenerateRequest) -> dict[str, Any]:
    try:
        return run_generation(req.prompt, req.max_tokens, req.temperature)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Generation failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


app = gr.mount_gradio_app(api_app, demo, path="/")


if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("GRADIO_SERVER_PORT", "7860")))
    uvicorn.run(app, host="0.0.0.0", port=port)