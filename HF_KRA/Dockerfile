FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/home/user/.cache/huggingface \
    TRANSFORMERS_CACHE=/data/.huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    git \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Docker Spaces run as uid 1000.
RUN useradd -m -u 1000 user

ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR /home/user/app

RUN mkdir -p /home/user/.cache/huggingface && chown -R user:user /home/user

# Ensure /data/.huggingface exists and is owned by the app user
RUN mkdir -p /data/.huggingface && chown -R user:user /data

COPY --chown=user:user requirements.txt ./
RUN python3 -m pip install --upgrade pip && python3 -m pip install -r requirements.txt

COPY --chown=user:user . .

USER user

EXPOSE 7860

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
