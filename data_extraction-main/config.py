import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_API_KEY_2 = os.getenv("GEMINI_API_KEY_2")

# Build list of available keys for rotation
GEMINI_API_KEYS = [k for k in [GEMINI_API_KEY, GEMINI_API_KEY_2] if k]

if not GEMINI_API_KEYS:
    raise RuntimeError("At least one GEMINI_API_KEY must be set")
