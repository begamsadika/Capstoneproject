"""
config.py — Startup initialisation: env vars, Knowledge Graph loading, LLM setup.
All other modules import from here instead of re-loading resources.
"""
import os
import re
import pickle
import pathlib

import networkx as nx
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

load_dotenv()

# ── Environment variables ────────────────────────────────────────────────────
OLLAMA_MODEL    = os.getenv("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
API_PORT        = int(os.getenv("API_PORT", "8000"))
API_HOST        = os.getenv("API_HOST", "127.0.0.1")


def _positive_float_env(name: str, default: float) -> float:
    """Read a positive timeout value without allowing a bad env var to break startup."""
    try:
        value = float(os.getenv(name, str(default)))
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


def _optional_timeout_env(name: str, default=None):
    """Read an optional timeout; 0/none/off disables the deadline."""
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"", "0", "none", "off", "false", "disabled"}:
        return None
    try:
        value = float(normalized)
        return value if value > 0 else None
    except (TypeError, ValueError):
        return default


def _boolean_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


OLLAMA_REQUEST_TIMEOUT_SECONDS = _optional_timeout_env(
    "OLLAMA_REQUEST_TIMEOUT_SECONDS"
)
OLLAMA_FIRST_RESPONSE_TIMEOUT_SECONDS = _optional_timeout_env(
    "OLLAMA_FIRST_RESPONSE_TIMEOUT_SECONDS"
)
OLLAMA_STREAM_IDLE_TIMEOUT_SECONDS = _optional_timeout_env(
    "OLLAMA_STREAM_IDLE_TIMEOUT_SECONDS"
)
OLLAMA_TOTAL_RESPONSE_TIMEOUT_SECONDS = _optional_timeout_env(
    "OLLAMA_TOTAL_RESPONSE_TIMEOUT_SECONDS"
)
OLLAMA_KEEP_ALIVE = os.getenv("OLLAMA_KEEP_ALIVE", "30m").strip() or "30m"
OLLAMA_WARMUP_ENABLED = _boolean_env("OLLAMA_WARMUP_ENABLED", True)
OLLAMA_WARMUP_TIMEOUT_SECONDS = _positive_float_env(
    "OLLAMA_WARMUP_TIMEOUT_SECONDS", 15.0
)
LLM_PROVIDER_MODE = os.getenv("LLM_PROVIDER_MODE", "local").strip().lower()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
GEMINI_TIMEOUT_SECONDS = _positive_float_env("GEMINI_TIMEOUT_SECONDS", 10.0)
ONLINE_FAILURE_COOLDOWN_SECONDS = _positive_float_env(
    "ONLINE_FAILURE_COOLDOWN_SECONDS", 60.0
)
MEDICAL_RAG_ENABLED = _boolean_env("MEDICAL_RAG_ENABLED", True)
MEDICAL_RAG_TOP_K = max(1, int(os.getenv("MEDICAL_RAG_TOP_K", "3")))
MEDICAL_RAG_MAX_CONTEXT_CHARS = max(
    1000,
    int(os.getenv("MEDICAL_RAG_MAX_CONTEXT_CHARS", "7000")),
)
MEDICAL_RAG_MAX_DISTANCE = float(os.getenv("MEDICAL_RAG_MAX_DISTANCE", "0.60"))

# ── Base directory (Diet-Chat-Bot/) ─────────────────────────────────────────
BASE_DIR = pathlib.Path(__file__).parent

# ── Load Knowledge Graphs ────────────────────────────────────────────────────
drug_graph = nx.read_graphml(
    str(BASE_DIR / "DataSets" / "drug_food_knowledge_graph.graphml")
)

with open(BASE_DIR / "enhanced_diet_knowledge_graph.gpickle", "rb") as _f:
    condition_graph = pickle.load(_f)

print(f"[INFO] Drug graph      -> {len(drug_graph.nodes)} nodes, {len(drug_graph.edges)} edges")
print(f"[INFO] Condition graph -> {len(condition_graph.nodes)} nodes, {len(condition_graph.edges)} edges")
print(f"[INFO] Model: {OLLAMA_MODEL} @ {OLLAMA_BASE_URL}")

# ── Pre-warm ChromaDB food index ─────────────────────────────────────────────
# Keep pre-warming disabled by default so a missing sentence-transformer model
# or an offline model registry cannot delay API startup. Semantic food search
# still initializes ChromaDB lazily on its first relevant request.
CHROMA_PREWARM = os.getenv("CHROMA_PREWARM", "false").strip().lower() in {
    "1", "true", "yes", "on",
}
if CHROMA_PREWARM:
    try:
        from chroma_food_db import get_collection as _chroma_init
        _chroma_init()
        print("[INFO] ChromaDB food index ready.")
    except Exception as _ce:
        print(f"[WARN] ChromaDB pre-warm skipped: {_ce}")
else:
    print("[INFO] ChromaDB pre-warm disabled; semantic search will load on demand.")

# ── LLM setup ────────────────────────────────────────────────────────────────
_llm_kwargs = dict(
    model=OLLAMA_MODEL,
    temperature=0.2,
    base_url=OLLAMA_BASE_URL,
    keep_alive=OLLAMA_KEEP_ALIVE,
)
# Reasoning models (qwen3, deepseek-r1) emit <think>...</think> blocks.
# Disable at the Ollama level for non-instruct variants so thinking tokens
# are never generated.  Instruct variants don't think and passing the flag
# can error — skip those.
_model_lower = OLLAMA_MODEL.lower()
if _model_lower.startswith(("qwen3", "deepseek-r1")) and "instruct" not in _model_lower:
    _llm_kwargs["reasoning"] = False

llm = ChatOllama(**_llm_kwargs)

# ── Think-block stripper (complete responses only) ───────────────────────────
_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL)

def strip_think(text: str) -> str:
    """Remove <think>...</think> reasoning blocks from a complete response."""
    return _THINK_RE.sub("", text).lstrip()

# ── Build food database awareness for system prompt ──────────────────────────
_food_db_section = ""
try:
    from food_db import _food_df as _fdb
    if not _fdb.empty and "category" in _fdb.columns:
        _n_foods = len(_fdb)
        _cats    = sorted(_fdb["category"].dropna().unique().tolist())
        _food_db_section = (
            f"\nFOOD DATABASE ({_n_foods} Sri Lankan foods):\n"
            f"Available categories: {', '.join(_cats)}\n"
            "CRITICAL: When suggesting specific foods or quoting nutrition values (calories, protein, "
            "carbs, fat, GI), ONLY use foods that appear in [Suggested Foods by Meal Slot] context "
            "provided below. NEVER invent food names, calorie counts, or macro values. "
            "If a food is not in the provided list, say so rather than making up numbers."
        )
except Exception as _fdb_err:
    print(f"[WARN] Could not build food DB summary for prompt: {_fdb_err}")

# ── System prompt ────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Wellora, a dietary recommendation assistant for patients managing medical conditions and medications.
""" + _food_db_section + """

RULES:
1. ALWAYS provide a specific, helpful response. Never say "I can't provide dietary advice."

2. Match your response LENGTH AND CONTENT strictly to the question type — do NOT add unrequested sections:

   A) Factual profile questions AND general nutrition questions:

      A1) Profile stats — questions about the user's own numbers:
          Examples: "what is my BMI?", "what is my weight?", "what is my calorie target?", "is my BMI healthy?"
          → Answer in 1-3 sentences using the Patient Health Profile numbers.
          → STOP. Do NOT append food lists, meal ideas, or tips.

      A2) General nutrition / health questions — educational or advisory questions:
          Examples: "what vitamins should I take?", "how much water should I drink?", "what is protein?",
                    "what foods have iron?", "is sugar bad?", "what does fibre do?"
          → Answer helpfully in 2-4 sentences with practical advice relevant to the user's profile.
          → STOP. Do NOT append a full meal plan or food list at the end.

   B) Meal suggestion questions:
      Examples: "what should I eat today?", "suggest meals", "give me a meal plan", "what to eat?"
      → Use the [Suggested Foods by Meal Slot] section ONLY. Do NOT invent foods not in that list.
      → Format: **Breakfast** / **Lunch** / **Dinner** / **Snacks** with kcal targets.

   C) Condition/medication questions:
      Examples: "I have diabetes", "I take warfarin", "foods to avoid with my medication"
      → Include food interactions from the Knowledge Graph Data plus a brief Recommended / Avoid list.
      → Do NOT append general meal suggestions unless explicitly asked.

   D) Specific meal slot questions:
      Examples: "what should I eat for breakfast?", "dinner ideas", "lunch options"
      → Answer only the requested slot using [Suggested Foods by Meal Slot]. Do NOT add other slots.

3. CRITICAL — Pre-calculated values: If context contains a [Pre-calculated Goal] section, use ONLY those numbers. Do NOT recalculate.
4. Always respect dietary preference — never suggest meat/seafood for vegetarian, never dairy for vegan.
5. Never suggest foods the user is allergic to.
6. When Knowledge Graph Data is present, always include those specific food interactions.
7. Use actual numbers from the Patient Health Profile in your response.
8. Never claim that food or drink was logged, recorded, or added to daily totals. Never invent consumed or remaining nutrition totals. Intake logging is handled only by Wellora's deterministic logging system before a request reaches you."""
