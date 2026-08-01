import json
import subprocess
import sys
from datetime import datetime, timezone

from component_tests.common import OUTPUT_DIR, ROOT

EVALUATORS = [
    ("bypass", "evaluate_bypass", "bypass_results.json"),
    ("knowledge_graph", "evaluate_knowledge_graph", "knowledge_graph_results.json"),
    ("chromadb", "evaluate_chromadb", "chromadb_results.json"),
    ("meal_planner_logger", "evaluate_meal_system", "meal_system_results.json"),
    ("llm_fallback", "evaluate_llm_fallback", "llm_fallback_results.json"),
]

process_results = []
for component, module, output_file in EVALUATORS:
    print(f"\nRunning {component} evaluation...")
    completed = subprocess.run(
        [sys.executable, "-m", f"component_tests.{module}"],
        cwd=ROOT,
        check=False,
    )
    process_results.append({
        "component": component,
        "exit_code": completed.returncode,
        "output_file": output_file,
    })

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
summaries = {}
for component, _, output_file in EVALUATORS:
    path = OUTPUT_DIR / output_file
    if path.exists():
        summaries[component] = json.loads(path.read_text(encoding="utf-8"))["summary"]

combined = {
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "process_results": process_results,
    "component_summaries": summaries,
}
(OUTPUT_DIR / "combined_summary.json").write_text(
    json.dumps(combined, indent=2, ensure_ascii=False), encoding="utf-8"
)

failures = [item for item in process_results if item["exit_code"] != 0]
print(f"\nCombined summary saved to {OUTPUT_DIR / 'combined_summary.json'}")
raise SystemExit(1 if failures else 0)
