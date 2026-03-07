"""Quick test: health check non-blocking before model load."""
import sys, os
sys.path.insert(0, ".")
sys.path.insert(0, "backend")
os.environ["LOCAL_MODE"] = "true"

from core.llm_engine import LLMEngine

# Before load — should return immediately
kra, ora = LLMEngine.is_loaded()
print(f"Before load: kra={kra}, ora={ora}")
assert not kra and not ora, "Should be False before loading"

# Now load
engine = LLMEngine.instance()
kra, ora = LLMEngine.is_loaded()
print(f"After load: kra={kra}, ora={ora}")
assert kra and ora, "Should be True after loading"

h = engine.health()
print(f"Runtime: {h['kra_runtime']}")
print(f"Shared model: {h['shared_model']}")
print("Health check test: PASS")
