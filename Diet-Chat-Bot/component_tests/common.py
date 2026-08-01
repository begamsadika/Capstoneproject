import json
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "evaluation_outputs"


def keyword_score(value, expected):
    text = json.dumps(value, ensure_ascii=False, default=str).lower()
    matched = [item for item in expected if item.lower() in text]
    return (len(matched) / len(expected) if expected else 1.0), matched


def timed(call):
    started = time.perf_counter()
    try:
        value = call()
        return value, None, round((time.perf_counter() - started) * 1000, 2)
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}", round((time.perf_counter() - started) * 1000, 2)


def show_case(result, output, label="Output"):
    """Print one test result immediately while preserving full data in JSON."""
    print(f"\n[{result['id']:02d}/50] {result['question']}")
    print("-" * 78)
    print(f"{label}:\n{output if output not in (None, '') else '[no output]'}")
    print(
        f"Status: {result['status']} | Score: {result.get('score', 0):.0%} "
        f"| Time: {result.get('elapsed_ms', 0)} ms"
    )
    if result.get("error"):
        print(f"Error: {result['error']}")


def save(component, results, filename):
    if len(results) != 50:
        raise ValueError(f"{component} must contain exactly 50 results; got {len(results)}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    passed = sum(r["status"] == "PASS" for r in results)
    payload = {
        "component": component,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total": len(results),
            "passed": passed,
            "failed": len(results) - passed,
            "accuracy_percent": round(passed * 100 / len(results), 2),
            "average_latency_ms": round(sum(r.get("elapsed_ms", 0) for r in results) / len(results), 2),
        },
        "results": results,
    }
    path = OUTPUT_DIR / filename
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"{component}: {passed}/50 passed; saved to {path}")
    return payload
