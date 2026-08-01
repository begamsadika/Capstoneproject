"""
api_new.py — FastAPI application: /health, /chat, /chat/stream routes only.

All business logic lives in the helper modules:
  config.py           — env vars, KG loading, LLM, SYSTEM_PROMPT
  models.py           — Pydantic request/response models
  kg_queries.py       — Knowledge Graph retrieval and entity detection
  food_db.py          — Food database, allergy filtering, metrics context
  meal_logger.py      — Plan cache, disliked foods, meal log, substitution
  meal_planner.py     — Meal plan builder and formatters
  bypass_handlers.py  — Bypass detectors, build_messages
"""
import asyncio
import logging
import re as _re
import json
import copy
import datetime as _dt
from contextvars import ContextVar
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse as _FastAPIStreamingResponse

# ── Module imports ────────────────────────────────────────────────────────────
from config import (
    llm, OLLAMA_MODEL, drug_graph, condition_graph,
    API_HOST, API_PORT, strip_think,
    OLLAMA_REQUEST_TIMEOUT_SECONDS,
    OLLAMA_FIRST_RESPONSE_TIMEOUT_SECONDS,
    OLLAMA_STREAM_IDLE_TIMEOUT_SECONDS,
    OLLAMA_TOTAL_RESPONSE_TIMEOUT_SECONDS,
    OLLAMA_WARMUP_ENABLED,
    OLLAMA_WARMUP_TIMEOUT_SECONDS,
    LLM_PROVIDER_MODE,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    GEMINI_TIMEOUT_SECONDS,
    ONLINE_FAILURE_COOLDOWN_SECONDS,
    MEDICAL_RAG_ENABLED,
    MEDICAL_RAG_TOP_K,
    MEDICAL_RAG_MAX_CONTEXT_CHARS,
    MEDICAL_RAG_MAX_DISTANCE,
)
from hybrid_llm import HybridLLM
from models import (
    ChatRequest,
    ChatResponse,
    ConversationSummaryRequest,
    ConversationSummaryResponse,
)
from kg_queries import (
    detect_entities, retrieve_drug_foods,
)
from medication_rules import medication_guidance, resolve_active_medications
from meal_logger import (
    get_user_state, persist_user_state,
    detect_food_preference, fuzzy_match_food,
    detect_log_summary_request, detect_log_request,
    detect_combined_log_and_request,
    _log_option, get_daily_progress, is_meal_slot_completed, log_food,
    detect_substitution_request, _pick_substitute,
    format_log_summary,
)
from food_db import parse_medical_conditions
from meal_planner import (
    build_meal_plan, build_remaining_day_plan, build_weekly_meal_plan,
    format_meal_plan_response, format_weekly_plan_response,
    format_week_day_detail, detect_week_day_query,
    detect_weight_change_goal, _format_option,
)
from bypass_handlers import (
    build_messages,
    get_time_greeting, is_greeting, detect_profile_fact_query, detect_bmi_faq_query,
    format_weight_goal_answer,
    detect_time_to_goal_query, detect_goal_calorie_query,
    detect_ideal_weight_query, detect_weight_recommendation_query,
    detect_weight_assessment_query, detect_safe_timeline_query,
    is_meal_plan_request, is_remaining_day_plan_request, is_weekly_plan_request,
    detect_prep_filter, detect_single_meal_slot, detect_low_calorie_slot_query,
    format_single_slot_response, resolve_calorie_target,
    detect_semantic_query,
    detect_food_info_query,
    detect_profile_condition_food_query,
    format_profile_medical_food_guidance,
)
from session_context import (
    extract_session_context,
    is_continuation_request,
    resolve_message_with_context,
)
from llm_resilience import (
    LLMEmptyResponse,
    LLMStreamTimeout,
    build_llm_fallback,
    stream_visible_chunks,
)
from medical_rag import (
    build_medical_direct_answer,
    build_medical_extractive_fallback,
    build_medical_first_aid_answer,
    build_medical_messages,
    format_medical_sources,
    is_medical_rag_query,
    medical_index_status,
    retrieve_medical_context,
)
from medical_rag.answering import medical_abstention

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Wellora Diet Chat API")
logger = logging.getLogger(__name__)
hybrid_llm = HybridLLM(
    llm,
    mode=LLM_PROVIDER_MODE,
    gemini_api_key=GEMINI_API_KEY,
    gemini_model=GEMINI_MODEL,
    gemini_timeout_seconds=GEMINI_TIMEOUT_SECONDS,
    failure_cooldown_seconds=ONLINE_FAILURE_COOLDOWN_SECONDS,
)
_meal_log_events: ContextVar[tuple[dict, ...]] = ContextVar(
    "meal_log_events",
    default=(),
)
_answer_source: ContextVar[str] = ContextVar("answer_source", default="bypass")
_answer_sources: ContextVar[tuple[str, ...]] = ContextVar(
    "answer_sources",
    default=(),
)


def StreamingResponse(content, *args, **kwargs):
    """Attach answer-source and intake events without changing visible tokens."""
    events = _meal_log_events.get()
    source = _answer_source.get()
    sources = _answer_sources.get()

    async def with_events():
        if sources:
            yield f"data: {json.dumps({'answer_sources': list(sources)})}\n\n"
        elif source:
            yield f"data: {json.dumps({'answer_source': source})}\n\n"
        if events:
            yield f"data: {json.dumps({'meal_log_entries': list(events)})}\n\n"
        async for chunk in content:
            yield chunk

    return _FastAPIStreamingResponse(with_events(), *args, **kwargs)


@app.on_event("startup")
async def warm_ollama_model() -> None:
    """Preload local retrieval and the configured LLM before the first chat."""
    if MEDICAL_RAG_ENABLED and medical_index_status()["ready"]:
        try:
            await asyncio.to_thread(
                retrieve_medical_context,
                "general health information",
                top_k=1,
                max_distance=MEDICAL_RAG_MAX_DISTANCE,
            )
            logger.info("Offline medical RAG embedding model is warm.")
        except Exception as exc:
            logger.warning("Medical RAG warm-up skipped: %s", exc)

    if not OLLAMA_WARMUP_ENABLED:
        logger.info("Ollama model warm-up is disabled.")
        return

    try:
        await asyncio.wait_for(
            llm.ainvoke("Reply with only the word OK."),
            timeout=OLLAMA_WARMUP_TIMEOUT_SECONDS,
        )
        logger.info(
            "Ollama model %s is warm and will remain loaded.",
            OLLAMA_MODEL,
        )
    except Exception as exc:
        # The API must still start so fast database/profile bypasses remain
        # available even when Ollama is temporarily offline.
        logger.warning("Ollama model warm-up skipped: %s", exc)


def _record_meal_log(
    state,
    item: str,
    slot: str | None,
    metrics: dict,
    target_calories: int,
) -> tuple[str, bool, list[dict]]:
    """Return the acknowledgement, change flag, and newly created intake rows."""
    option_match = _re.search(r"option\s*([123])", item, _re.IGNORECASE)
    changed = False
    new_entries: list[dict] = []
    if option_match:
        option_number = int(option_match.group(1))
        logged = _log_option(state, option_number, slot)
        if logged:
            changed = True
            new_entries = logged
            calories = sum(entry["calories"] for entry in logged)
            protein = round(sum(entry.get("protein_g", 0) for entry in logged), 1)
            carbs = round(sum(entry.get("carbs_g", 0) for entry in logged), 1)
            fat = round(sum(entry.get("fat_g", 0) for entry in logged), 1)
            names = ", ".join(entry["food"] for entry in logged)
            acknowledgement = (
                f"Logged **Option {option_number}** for {logged[0]['slot']}:\n"
                f"  {names} ({calories} kcal | P: {protein}g | C: {carbs}g | F: {fat}g)"
            )
        else:
            today = _dt.date.today().isoformat()
            duplicate = any(
                entry.get("date") == today
                and entry.get("option_number") == option_number
                and (slot is None or entry.get("slot") == slot)
                for entry in state.meal_log
            )
            if duplicate or (slot and is_meal_slot_completed(state, slot)):
                slot_label = f" for {slot}" if slot else ""
                acknowledgement = (
                    f"ℹ️ **Option {option_number}{slot_label} is already logged today.** "
                    "I did not add it again."
                )
            else:
                acknowledgement = (
                    "Couldn't find that option in your current plan. "
                    "Generate a meal plan first!"
                )
    else:
        matched_food = fuzzy_match_food(item)
        if not matched_food:
            current_progress = get_daily_progress(
                state,
                metrics,
                target_calories=target_calories,
            )
            remaining = current_progress["remaining"]
            return (
                f"I couldn't match \"{item}\" to a food in my database. "
                "Nothing was logged, and your existing totals have not changed."
                f"\n\n**Remaining today:** {remaining['calories']} kcal | "
                f"Protein: {remaining['protein_g']}g | "
                f"Carbs: {remaining['carbs_g']}g | Fat: {remaining['fat_g']}g",
                False,
                [],
            )
        entry, duplicate = log_food(state, matched_food, slot)
        if duplicate:
            slot_label = f" for {slot}" if slot else ""
            acknowledgement = (
                f"ℹ️ **{matched_food}{slot_label} is already logged today.** "
                "I did not add it again."
            )
        elif entry:
            changed = True
            new_entries = [entry]
            slot_label = f" for {entry['slot']}" if slot else ""
            acknowledgement = (
                f"Logged **{matched_food}**{slot_label}: "
                f"{entry['calories']} kcal | P: {entry['protein_g']}g | "
                f"C: {entry['carbs_g']}g | F: {entry['fat_g']}g."
            )
        else:
            acknowledgement = f"I couldn't log **{matched_food}**. Please try again."

    if changed:
        progress = get_daily_progress(
            state,
            metrics,
            target_calories=target_calories,
        )
        remaining = progress["remaining"]
        acknowledgement += (
            f"\n\n**Remaining today:** {remaining['calories']} kcal | "
            f"Protein: {remaining['protein_g']}g | Carbs: {remaining['carbs_g']}g | "
            f"Fat: {remaining['fat_g']}g"
        )
    return acknowledgement, changed, new_entries


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": OLLAMA_MODEL,
        "drug_graph":      {"nodes": len(drug_graph.nodes),     "edges": len(drug_graph.edges)},
        "condition_graph": {"nodes": len(condition_graph.nodes), "edges": len(condition_graph.edges)},
        "llm_router": hybrid_llm.status(),
        "medical_rag": {
            "enabled": MEDICAL_RAG_ENABLED,
            **medical_index_status(),
        },
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    try:
        msgs = build_messages(req)
        response = await asyncio.wait_for(
            hybrid_llm.ainvoke(msgs),
            timeout=OLLAMA_REQUEST_TIMEOUT_SECONDS,
        )
        return ChatResponse(reply=strip_think(response.content))
    except Exception:
        logger.exception("Hybrid LLM non-streaming request failed")
        return ChatResponse(reply=build_llm_fallback(req.user_metrics))


@app.post("/chat/summarize", response_model=ConversationSummaryResponse)
async def summarize_conversation(req: ConversationSummaryRequest):
    """Compress older chat turns without affecting the main streaming path."""
    prior = (req.current_summary or "").strip()
    transcript = "\n".join(
        f"{item.role.title()}: {item.content.strip()}"
        for item in req.messages
        if item.content.strip()
    )
    prompt = (
        "Create a compact memory for a diet assistant. Preserve only facts useful "
        "for future follow-up questions: the user's goals, dietary preferences, "
        "allergies, disliked foods, medical conditions, medications, calorie or "
        "macro decisions, meals discussed, substitutions, and choices the user "
        "accepted or rejected. Preserve exact food and medicine names. Never infer "
        "or invent facts. Treat only user statements as personal facts; assistant "
        "content may be retained only as a previous suggestion or calculation. "
        "Prefer short bullet points and stay under 450 words.\n\n"
        f"Existing memory:\n{prior or '(none)'}\n\n"
        f"New older messages:\n{transcript}"
    )
    try:
        response = await asyncio.wait_for(
            llm.ainvoke(prompt),
            timeout=OLLAMA_REQUEST_TIMEOUT_SECONDS,
        )
        summary = strip_think(response.content or "").strip()
        if not summary:
            raise ValueError("The model returned an empty summary.")
        return ConversationSummaryResponse(summary=summary[:8000])
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Unable to update conversation memory.") from exc


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Server-Sent Events streaming endpoint with 16 bypass tiers."""
    _meal_log_events.set(())
    _answer_source.set("bypass")
    _answer_sources.set(())
    # Resolve medication context before any bypass (especially meal planning).
    # This is request-scoped: chat text is not written into the saved profile.
    metrics = dict(req.user_metrics or {})
    _active_medications = resolve_active_medications(
        metrics,
        req.message,
        req.history,
        req.conversation_summary,
    )
    if _active_medications:
        metrics["medications"] = ", ".join(_active_medications)
    state = get_user_state(req.user_id)
    _response_prefix = ""

    # ── Bypass 0: greeting ──────────────────────────────────────────────
    if is_greeting(req.message):
        time_greet  = get_time_greeting()
        name_part   = f", {req.user_name.split()[0]}" if req.user_name else ""
        _raw_goal   = (metrics.get("health_goal") or "").lower().replace("_", " ").strip()
        _goal_map   = {"lose": "weight loss", "gain": "weight gain", "maintain": "maintaining a healthy weight"}
        goal_phrase = _goal_map.get(_raw_goal, _raw_goal)
        answer = (
            f"{time_greet}{name_part}! 👋 Hi, I'm your Diet AI. "
            + (f"You're currently focused on **{goal_phrase}**. " if goal_phrase else "")
            + "Ask me about your diet, foods to eat or avoid, meal suggestions, or calorie targets!"
        )
        async def _s():
            for ch in answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 1: weight change goal math ───────────────────────────────
    profile_fact = detect_profile_fact_query(req.message, metrics)
    if profile_fact:
        async def _s():
            for ch in profile_fact:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    bmi_faq = detect_bmi_faq_query(req.message)
    if bmi_faq:
        async def _s():
            for ch in bmi_faq:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    goal_calc = detect_weight_change_goal(req.message, metrics)
    if goal_calc:
        answer = format_weight_goal_answer(goal_calc, metrics)
        async def _s():
            for ch in answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 1a: time to goal ─────────────────────────────────────────
    ttg = detect_time_to_goal_query(req.message, metrics)
    if ttg:
        async def _s():
            for ch in ttg:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 1b: goal calorie query ───────────────────────────────────
    goal_cal = detect_goal_calorie_query(req.message, metrics, req.history)
    if goal_cal:
        async def _s():
            for ch in goal_cal:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 1c: ideal weight query ───────────────────────────────────
    ideal_wt = detect_ideal_weight_query(req.message, metrics)
    if ideal_wt:
        async def _s():
            for ch in ideal_wt:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 1d: weight loss vs gain recommendation ───────────────────
    weight_rec = detect_weight_recommendation_query(req.message, metrics)
    if weight_rec:
        async def _s():
            for ch in weight_rec:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 1e: health assessment (is it safe to gain/lose X kg) ─────
    weight_assessment = detect_weight_assessment_query(req.message, metrics)
    if weight_assessment:
        async def _s():
            for ch in weight_assessment:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 1f: safe timeline (how long to gain/lose X kg) ──────────
    safe_tl = detect_safe_timeline_query(req.message, metrics)
    if safe_tl:
        async def _s():
            for ch in safe_tl:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Prep method preference detection ───────────────────────────────
    _answer_source.set("meal_planner")
    _prep_exclude = detect_prep_filter(req.message, req.history)
    _prep_in_msg  = detect_prep_filter(req.message, [])
    if _prep_exclude:
        metrics = dict(metrics)
        metrics["_prep_exclude"] = _prep_exclude
        if (
            _prep_in_msg
            and not is_meal_plan_request(req.message)
            and not is_remaining_day_plan_request(req.message)
            and not detect_single_meal_slot(req.message)
        ):
            _target_cal_p = resolve_calorie_target(req, metrics)
            _prep_plan    = build_meal_plan(_target_cal_p, metrics, state)
            _p_ans = format_meal_plan_response(
                _prep_plan,
                conditions=parse_medical_conditions(metrics),
                prep_exclude=_prep_exclude,
                metrics=metrics,
            )
            async def _s():
                for ch in _p_ans:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Food preference memory (dislike / like) ─────────────────────────
    _pref_action, _pref_food = detect_food_preference(req.message)
    if _pref_action and _pref_food:
        if _pref_action == "dislike":
            state.disliked_foods.add(_pref_food)
            persist_user_state(state)
            _pref_reply = (f"Got it! I'll avoid **{_pref_food}** in all your future meal suggestions. 🙅\n\n"
                           f"*You can say \"I like {_pref_food}\" any time to add it back.*")
        else:
            state.disliked_foods.discard(_pref_food)
            persist_user_state(state)
            _pref_reply = f"Great! I've added **{_pref_food}** back to your meal options. ✅"
        async def _s():
            for ch in _pref_reply:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # Log-and-recommend requests, e.g. "I ate option 1. Suggest lunch."
    _combined_item, _combined_slot, _combined_follow_up = (
        detect_combined_log_and_request(req.message)
    )
    if _combined_item and _combined_follow_up:
        _daily_target = resolve_calorie_target(req, metrics)
        _combined_ack, _combined_changed, _combined_entries = _record_meal_log(
            state,
            _combined_item,
            _combined_slot,
            metrics,
            _daily_target,
        )
        if _combined_changed:
            persist_user_state(state)
            _meal_log_events.set(tuple(_combined_entries))
        _response_prefix = _combined_ack + "\n\n"
        req = req.model_copy(update={"message": _combined_follow_up})

    # ── Meal log summary ─────────────────────────────────────────────────
    if detect_log_summary_request(req.message):
        _log_reply = _response_prefix + format_log_summary(
            state,
            metrics,
            target_calories=resolve_calorie_target(req, metrics),
        )
        async def _s():
            for ch in _log_reply:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Meal log entry ───────────────────────────────────────────────────
    _log_item, _log_slot = detect_log_request(req.message)
    if _log_item:
        _target_calories = resolve_calorie_target(req, metrics)
        _log_ack, _log_changed, _log_entries = _record_meal_log(
            state,
            _log_item,
            _log_slot,
            metrics,
            _target_calories,
        )
        if _log_changed:
            persist_user_state(state)
            _meal_log_events.set(tuple(_log_entries))
        async def _s():
            for ch in _log_ack:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Food substitution ────────────────────────────────────────────────
    _sub_food, _sub_opt_n = detect_substitution_request(req.message)
    if _sub_food:
        if not state.plan_cache:
            _sub_reply = "No meal plan yet — ask me for a plan first, then I can swap foods for you!"
        else:
            _sub_slot, _sub_idx = None, None
            for _sl, _sdata in state.plan_cache.items():
                if not isinstance(_sdata, dict) or "options" not in _sdata:
                    continue
                for _oi, _opt in enumerate(_sdata["options"]):
                    if _sub_opt_n and (_oi + 1) != _sub_opt_n:
                        continue
                    if any(f["name"] == _sub_food for f in _opt["foods"]):
                        _sub_slot, _sub_idx = _sl, _oi
                        break
                if _sub_slot:
                    break
            if _sub_slot is not None:
                _orig_opt    = state.plan_cache[_sub_slot]["options"][_sub_idx]
                _replacement = _pick_substitute(
                    state, _sub_food, _sub_slot, _orig_opt, metrics
                )
                if _replacement:
                    _new_opt = copy.deepcopy(_orig_opt)
                    for _fi in _new_opt["foods"]:
                        if _fi["name"] == _sub_food:
                            _fi.update(_replacement)
                            _fi["name"] = _replacement["name"]
                            break
                    _new_opt["actual_kcal"] = round(sum(f["calories"] for f in _new_opt["foods"]))
                    _new_opt["protein_g"]   = round(sum(f["protein_g"] for f in _new_opt["foods"]), 1)
                    _new_opt["carbs_g"]     = round(sum(f["carbs_g"]   for f in _new_opt["foods"]), 1)
                    _new_opt["fat_g"]       = round(sum(f["fat_g"]     for f in _new_opt["foods"]), 1)
                    state.plan_cache[_sub_slot]["options"][_sub_idx] = _new_opt
                    persist_user_state(state)
                    _sub_label = f"Option {_sub_idx + 1}"
                    _sub_lines = [f"✅ Swapped **{_sub_food}** → **{_replacement['name']}** in {_sub_slot} {_sub_label}!\n"]
                    _sub_lines.extend(_format_option(_new_opt, _sub_label, parse_medical_conditions(metrics)))
                    _sub_reply = "\n".join(_sub_lines)
                else:
                    _sub_reply = f"Sorry, I couldn't find a suitable replacement for **{_sub_food}** right now. Try a fresh meal plan!"
            else:
                _sub_reply = (f"Couldn't find **{_sub_food}** in your current meal plan. "
                              "Generate a fresh plan first, then ask me to swap it!")
        async def _s():
            for ch in _sub_reply:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass W1: 7-day weekly plan ────────────────────────────────────
    if is_weekly_plan_request(req.message):
        _w_target = resolve_calorie_target(req, metrics)
        _new_week = build_weekly_meal_plan(_w_target, metrics, state)
        state.weekly_plan.clear()
        state.weekly_plan.update(_new_week)
        persist_user_state(state)
        _w_ans = format_weekly_plan_response(
            _new_week,
            conditions=parse_medical_conditions(metrics),
            goal=metrics.get("health_goal") or "",
            target_cal=_w_target,
            metrics=metrics,
        )
        async def _s():
            for ch in _w_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass W2: specific day detail from weekly plan ─────────────────
    _week_day_key = detect_week_day_query(req.message, state.weekly_plan)
    if _week_day_key:
        _wd_plan = state.weekly_plan.get(_week_day_key, {})
        _wd_ans = format_week_day_detail(
            _week_day_key,
            _wd_plan,
            conditions=parse_medical_conditions(metrics),
            metrics=metrics,
        )
        async def _s():
            for ch in _wd_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Progress-aware plan for the unlogged part of today ───────────────
    if (
        is_remaining_day_plan_request(req.message)
        and not detect_single_meal_slot(req.message)
    ):
        _daily_target = resolve_calorie_target(req, metrics)
        _remaining_plan = build_remaining_day_plan(
            _daily_target,
            metrics,
            state,
        )
        if _remaining_plan:
            _remaining_answer = format_meal_plan_response(
                _remaining_plan,
                conditions=parse_medical_conditions(metrics),
                prep_exclude=_prep_exclude,
                goal=metrics.get("health_goal") or "",
                target_cal=_daily_target,
                metrics=metrics,
            )
        else:
            _remaining_answer = (
                format_log_summary(state, metrics, target_calories=_daily_target)
                + "\n\nThere is no remaining calorie budget or every meal slot is already "
                "logged for today."
            )
        _remaining_answer = _response_prefix + _remaining_answer
        async def _s():
            for ch in _remaining_answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 2: full day meal plan ─────────────────────────────────────
    if is_meal_plan_request(req.message):
        target_cal = resolve_calorie_target(req, metrics)
        _progress = get_daily_progress(
            state,
            metrics,
            target_calories=target_cal,
        )
        plan = (
            build_remaining_day_plan(target_cal, metrics, state)
            if _progress["entry_count"]
            else build_meal_plan(target_cal, metrics, state)
        )
        if plan:
            answer = format_meal_plan_response(
                plan,
                conditions=parse_medical_conditions(metrics),
                prep_exclude=_prep_exclude,
                goal=metrics.get("health_goal") or "",
                target_cal=target_cal,
                metrics=metrics,
            )
        else:
            answer = (
                format_log_summary(state, metrics, target_calories=target_cal)
                + "\n\nThere is no remaining calorie budget or every meal slot is already "
                "logged for today."
            )
        answer = _response_prefix + answer
        async def _s():
            for ch in answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 2b: option selection ──────────────────────────────────────
    _opt_match      = _re.search(r"\boption\s*([123])\b", req.message.strip().lower())
    _detail_request = any(w in req.message.lower() for w in (
        "detail", "more", "about", "tell me", "explain", "what is", "what are",
        "info", "information", "describe", "show me", "ingredients",
    ))
    if _opt_match and not _detail_request:
        _n    = _opt_match.group(1)
        _slot = ""
        for _h in reversed(req.history):
            if _h.role == "assistant":
                for _s_name in ("Breakfast", "Lunch", "Dinner", "Snack"):
                    if _s_name.lower() in _h.content.lower():
                        _slot = _s_name
                        break
                break
        _slot_str   = f" for **{_slot}**" if _slot else ""
        _opt_answer = (f"✅ Great choice! You've selected **Option {_n}**{_slot_str}. Enjoy your meal! 🍽\n\n"
                       "*Ask me about your next meal slot, or anything else about your diet!*")
        async def _s():
            for ch in _opt_answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 2c: option detail ─────────────────────────────────────────
    if _detail_request and state.plan_cache:
        _conf_n, _conf_slot = None, None
        if _opt_match:
            _conf_n = int(_opt_match.group(1))
            for _h in reversed(req.history):
                if _h.role == "assistant":
                    for _s_name in ("Breakfast", "Lunch", "Dinner", "Snack"):
                        if _s_name.lower() in _h.content.lower():
                            _conf_slot = _s_name
                            break
                    if _conf_slot:
                        break
        if not _conf_n:
            for _h in reversed(req.history):
                if _h.role == "assistant":
                    _cm = _re.search(r"You've selected \*\*Option (\d)\*\*(?: for \*\*(\w+)\*\*)?", _h.content)
                    if _cm:
                        _conf_n    = int(_cm.group(1))
                        _conf_slot = _cm.group(2) or ""
                        break
        if _conf_n and _conf_slot and _conf_slot in state.plan_cache:
            _opts = state.plan_cache[_conf_slot].get("options", [])
            if _conf_n <= len(_opts):
                _opt = _opts[_conf_n - 1]
                _det_lines = [
                    f"**{_conf_slot} — Option {_conf_n}** "
                    f"({_opt['actual_kcal']} kcal | P: {_opt['protein_g']}g | C: {_opt['carbs_g']}g | F: {_opt['fat_g']}g)\n"
                ]
                for _fi in _opt["foods"]:
                    if _fi.get("min_serving_g") and _fi.get("max_serving_g"):
                        _srv = (f" ({_fi['min_serving_g']}–{_fi['max_serving_g']}g, "
                                f"typical {_fi.get('serving_size_g','?')}g)")
                    elif _fi.get("serving_size_g"):
                        _srv = f" ({_fi['serving_size_g']}g)"
                    else:
                        _srv = ""
                    _gi   = f"GI: {_fi['gi']} ({_fi['gi_category']})" if _fi.get("gi") is not None else ""
                    _gl   = f"GL: {_fi['gl']}" if _fi.get("gl") is not None else ""
                    _prep = f"Prep: {_fi['prep_method'].replace('_',' ')}" if _fi.get("prep_method") else ""
                    _sod  = f"Sodium: {_fi['sodium_mg']}mg" if _fi.get("sodium_mg") is not None else ""
                    _fib  = f"Fiber: {_fi['fiber_g']}g" if _fi.get("fiber_g") is not None else ""
                    _meta = "  |  ".join(x for x in [_gi, _gl, _sod, _fib, _prep] if x)
                    _det_lines.append(
                        f"• **{_fi['name']}**{_srv}\n"
                        f"  Calories: {_fi['calories']} kcal  |  Protein: {_fi['protein_g']}g  |  "
                        f"Carbs: {_fi['carbs_g']}g  |  Fat: {_fi['fat_g']}g"
                        + (f"\n  {_meta}" if _meta else "")
                    )
                _det_answer = "\n".join(_det_lines)
                async def _s():
                    for ch in _det_answer:
                        yield f"data: {json.dumps({'token': ch})}\n\n"
                    yield "data: [DONE]\n\n"
                return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 3: single meal slot ───────────────────────────────────────
    # Handle a meal request and a medical-food question in the same message
    # before either single-intent route can return early.
    _multi_slot = detect_single_meal_slot(req.message)
    _multi_conditions, _multi_drugs, _ = detect_entities(req.message)
    _medical_food_intent = any(
        phrase in req.message.lower()
        for phrase in (
            "interaction",
            "avoid",
            "food",
            "eat",
            "diet",
            "recommend",
            "suitable",
            "safe",
            "take",
        )
    )
    if (
        _multi_slot
        and (_multi_conditions or _multi_drugs)
        and _medical_food_intent
    ):
        _multi_target = resolve_calorie_target(req, metrics)
        _multi_progress = get_daily_progress(
            state,
            metrics,
            target_calories=_multi_target,
        )
        _multi_plan = (
            build_remaining_day_plan(_multi_target, metrics, state)
            if _multi_progress["entry_count"]
            else build_meal_plan(_multi_target, metrics, state)
        )
        if _multi_plan and _multi_slot in _multi_plan:
            _multi_meal_answer = format_single_slot_response(
                _multi_slot,
                _multi_plan,
            )
        else:
            _multi_meal_answer = (
                format_log_summary(
                    state,
                    metrics,
                    target_calories=_multi_target,
                )
                + "\n\nThere is no remaining nutrition budget available for another meal."
            )

        _multi_medical_answer = format_profile_medical_food_guidance(
            _multi_conditions,
            _multi_drugs,
            metrics,
        )
        _multi_answer = (
            f"## {_multi_slot} Suggestions\n\n"
            f"{_multi_meal_answer}\n\n"
            "---\n\n"
            "## Medical and Food Guidance\n\n"
            f"{_multi_medical_answer}"
        )
        _answer_source.set("")
        _answer_sources.set(("meal_planner", "knowledge_graph"))

        async def _s():
            for ch in _multi_answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(_s(), media_type="text/event-stream")

    # Explicit constraints override the normal meal-slot calorie allocation.
    _low_calorie_answer = detect_low_calorie_slot_query(
        req.message,
        metrics,
        disliked_foods=state.disliked_foods,
    )
    if _low_calorie_answer:
        async def _s():
            for ch in _low_calorie_answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    _single_slot = detect_single_meal_slot(req.message)
    if _single_slot:
        target_cal  = resolve_calorie_target(req, metrics)
        _prep_excl3 = detect_prep_filter(req.message, req.history)
        if _prep_excl3:
            metrics = dict(metrics)
            metrics["_prep_exclude"] = _prep_excl3
        _slot_progress = get_daily_progress(
            state,
            metrics,
            target_calories=target_cal,
        )
        if _slot_progress["entry_count"] and is_meal_slot_completed(state, _single_slot):
            slot_answer = (
                format_log_summary(state, metrics, target_calories=target_cal)
                + f"\n\nℹ️ **{_single_slot} is already logged today.** "
                "Ask for the rest-of-day plan or choose a meal slot that is not completed."
            )
        else:
            slot_plan = (
                build_remaining_day_plan(target_cal, metrics, state)
                if _slot_progress["entry_count"]
                else build_meal_plan(target_cal, metrics, state)
            )
            if slot_plan and _single_slot in slot_plan:
                slot_answer = format_single_slot_response(_single_slot, slot_plan)
            else:
                slot_answer = (
                    format_log_summary(state, metrics, target_calories=target_cal)
                    + "\n\nThere is no remaining nutrition budget available for another meal."
                )
        slot_answer = _response_prefix + slot_answer
        if _prep_excl3:
            _excl_rd  = {"deep_fried": "deep-fried", "shallow_fried": "shallow-fried", "stir_fried": "stir-fried"}
            _excl_str = ", ".join(_excl_rd.get(p, p.replace("_", "-")) for p in _prep_excl3)
            slot_answer = f"*🥗 Filtering out {_excl_str} foods as requested.*\n\n" + slot_answer
        async def _s():
            for ch in slot_answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # Offline medical RAG: authoritative local retrieval with grounded generation.
    if MEDICAL_RAG_ENABLED and is_medical_rag_query(req.message):
        _medical_status = medical_index_status()
        if _medical_status["ready"]:
            _medical_hits = retrieve_medical_context(
                req.message,
                top_k=MEDICAL_RAG_TOP_K,
                max_distance=MEDICAL_RAG_MAX_DISTANCE,
            )
            if not _medical_hits:
                _answer_source.set("medical_rag")
                _answer_sources.set(())
                _medical_reply = medical_abstention()

                async def _s():
                    yield f"data: {json.dumps({'token': _medical_reply})}\n\n"
                    yield "data: [DONE]\n\n"

                return StreamingResponse(_s(), media_type="text/event-stream")

            _medical_direct_answer = build_medical_direct_answer(
                req.message, _medical_hits
            )
            if _medical_direct_answer:
                _answer_source.set("medical_rag")
                _answer_sources.set(())
                _medical_direct_reply = (
                    _medical_direct_answer + format_medical_sources(_medical_hits)
                )

                async def _s():
                    yield f"data: {json.dumps({'token': _medical_direct_reply})}\n\n"
                    yield "data: [DONE]\n\n"

                return StreamingResponse(_s(), media_type="text/event-stream")

            _medical_first_aid_answer = build_medical_first_aid_answer(
                req.message, _medical_hits
            )
            if _medical_first_aid_answer:
                _answer_source.set("medical_rag")
                _answer_sources.set(())
                _medical_first_aid_reply = (
                    _medical_first_aid_answer + format_medical_sources(_medical_hits)
                )

                async def _s():
                    yield f"data: {json.dumps({'token': _medical_first_aid_reply})}\n\n"
                    yield "data: [DONE]\n\n"

                return StreamingResponse(_s(), media_type="text/event-stream")

            _medical_router_status = hybrid_llm.status()
            _medical_initial_provider = (
                "gemini"
                if _medical_router_status["online_configured"]
                and not _medical_router_status["cooldown_remaining_seconds"]
                else "ollama"
            )
            _answer_source.set("")
            _answer_sources.set(("medical_rag", _medical_initial_provider))
            _medical_messages = build_medical_messages(
                req.message,
                _medical_hits,
                metrics,
                max_context_chars=MEDICAL_RAG_MAX_CONTEXT_CHARS,
            )

            async def stream_medical_rag() -> AsyncGenerator[str, None]:
                emitted_visible = False
                reported_provider = _medical_initial_provider
                try:
                    async for text in stream_visible_chunks(
                        hybrid_llm.astream(_medical_messages),
                        first_response_timeout=OLLAMA_FIRST_RESPONSE_TIMEOUT_SECONDS,
                        idle_timeout=OLLAMA_STREAM_IDLE_TIMEOUT_SECONDS,
                        total_timeout=OLLAMA_TOTAL_RESPONSE_TIMEOUT_SECONDS,
                    ):
                        actual_provider = hybrid_llm.status()["last_provider"]
                        if (
                            actual_provider in {"gemini", "ollama"}
                            and actual_provider != reported_provider
                        ):
                            reported_provider = actual_provider
                            provider_event = {
                                "answer_sources": ["medical_rag", actual_provider]
                            }
                            yield f"data: {json.dumps(provider_event)}\n\n"
                        emitted_visible = True
                        yield f"data: {json.dumps({'token': text})}\n\n"
                except (LLMStreamTimeout, LLMEmptyResponse):
                    logger.warning("Medical RAG generation timed out or returned empty")
                    if emitted_visible:
                        warning = (
                            "\n\n⚠️ The generated explanation stopped before completion. "
                            "Use the cited evidence with a healthcare professional."
                        )
                        yield f"data: {json.dumps({'token': warning})}\n\n"
                    else:
                        fallback = build_medical_extractive_fallback(
                            req.message, _medical_hits
                        )
                        yield f"data: {json.dumps({'token': fallback})}\n\n"
                except Exception:
                    logger.exception("Medical RAG generation failed")
                    fallback = build_medical_extractive_fallback(
                        req.message, _medical_hits
                    )
                    yield f"data: {json.dumps({'token': fallback})}\n\n"
                sources = format_medical_sources(_medical_hits)
                yield f"data: {json.dumps({'token': sources})}\n\n"
                yield "data: [DONE]\n\n"

            return StreamingResponse(
                stream_medical_rag(),
                media_type="text/event-stream",
            )

    # ── Knowledge graph bypasses ─────────────────────────────────────────
    _answer_source.set("knowledge_graph")
    _profile_condition_answer = detect_profile_condition_food_query(
        req.message,
        metrics,
        req.conversation_summary,
    )
    if _profile_condition_answer:
        async def _s():
            yield f"data: {json.dumps({'token': _profile_condition_answer})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    _entity_text = req.message
    if req.conversation_summary:
        _entity_text += "\n" + req.conversation_summary
    _entity_text += "\n" + str(metrics.get("medical_conditions") or "")
    _entity_text += "\n" + str(metrics.get("medications") or "")
    _cond_entities, _drug_entities, _ = detect_entities(_entity_text)

    _is_cond_q = any(p in req.message.lower() for p in [
        "what food", "what should i eat", "what can i eat", "what to eat",
        "what should i avoid", "what to avoid", "foods for", "food for",
        "foods to eat", "foods to avoid", "food to avoid", "avoid with",
        "should avoid", "what not to eat",
        "good for", "recommend", "dietary advice", "diet advice", "diet for",
    ])
    if _cond_entities and _is_cond_q:
        _cond_answer = format_profile_medical_food_guidance(
            _cond_entities,
            _drug_entities,
            metrics,
        )
        if _cond_answer:
            async def _s():
                for ch in _cond_answer:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    _is_drug_q = any(p in req.message.lower() for p in [
        "what should i avoid", "food restriction", "any food", "what food",
        "can i eat", "should not eat", "avoid", "take", "interaction",
        "food", "eat", "diet", "restriction", "on metformin", "on warfarin",
    ])
    if _drug_entities and _is_drug_q:
        _needs_food_suggestions = any(phrase in req.message.lower() for phrase in [
            "suitable", "recommend", "foods for my medication",
            "food for my medication", "what can i eat",
        ])
        if _needs_food_suggestions:
            _drug_answer = format_profile_medical_food_guidance(
                [],
                _drug_entities,
                metrics,
            )
        else:
            _drug_lines = []
            for _drug in _drug_entities:
                _avd_foods, _drug_notes = retrieve_drug_foods(_drug)
                _guidance = medication_guidance({"medications": [_drug]})[0]
                _drug_lines.append(f"**{_drug} — Food Interactions**\n")
                if _guidance["verified"]:
                    for _guidance_type, _message in _guidance["guidance"]:
                        _drug_lines.append(
                            f"📋 **{_guidance_type.title()}:** {_message}\n"
                        )
                    if _guidance["excluded_terms"]:
                        _drug_lines.append(
                            "🚫 **Automatically excluded:** "
                            + ", ".join(_guidance["excluded_terms"])
                            + "\n"
                        )
                    _drug_lines.append(f"📚 **Rule source:** {_guidance['source']}\n")
                elif _avd_foods or _drug_notes:
                    _references = (_avd_foods + _drug_notes)[:6]
                    _drug_lines.append(
                        "📋 **Knowledge-graph reference (not automatically enforced):** "
                        + "; ".join(_references)
                        + "\n"
                    )
                _drug_lines.append(
                    "\n⚠️ Always consult your doctor or pharmacist about drug-food interactions."
                )
            _drug_answer = "\n".join(_drug_lines)
        if _drug_answer:
            async def _s():
                for ch in _drug_answer:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Nutrition FAQ bypass ─────────────────────────────────────────────
    _answer_source.set("bypass")
    _msg_faq = req.message.lower()
    _faq_ans = None
    if _re.search(r"glycemic\s+index|what\s+is\s+gi\b|explain\s+gi\b|gi\s+mean", _msg_faq):
        _faq_ans = (
            "**Glycemic Index (GI)** measures how quickly foods raise blood sugar (0–100 scale).\n\n"
            "• **Low GI (≤55):** Oats, lentils, legumes, most fruits — slow, steady blood sugar rise\n"
            "• **Medium GI (56–69):** Basmati rice, whole wheat, sweet potato\n"
            "• **High GI (≥70):** White rice, white bread, sugary drinks — rapid spike\n\n"
            "Low-GI foods support blood sugar control, weight management, PCOS, and diabetes."
        )
    elif _re.search(r"how\s+much\s+protein|protein\s+(?:per|each|a|every)\s+day|daily\s+protein|protein\s+(?:need|require|target|intake)", _msg_faq):
        _pt = metrics.get("protein_target_g", 0)
        _wt = metrics.get("weight_kg", 0)
        _faq_ans = (
            "**Daily Protein Needs**\n\n"
            + (f"Your target (from your profile): **{_pt}g/day**\n\n" if _pt else "")
            + "General guideline: **0.8–1.2g per kg of body weight** for most adults.\n"
            + "For weight loss or muscle building: **1.5–2.0g/kg**.\n"
            + (f"Based on your weight ({_wt}kg): {round(_wt*1.5)}–{round(_wt*2.0)}g/day recommended.\n\n" if _wt else "\n")
            + "Good Sri Lankan protein sources: dhal, chickpeas, tempe, eggs, fish, Greek yogurt."
        )
    elif _re.search(r"coconut\s+oil|is\s+coconut\s+(?:oil\s+)?(?:healthy|good|bad)|coconut\s+fat", _msg_faq):
        _faq_ans = (
            "**Coconut Oil** — Is it healthy?\n\n"
            "Coconut oil is high in saturated fat (~90%) and medium-chain triglycerides (MCTs).\n\n"
            "• MCTs are metabolised quickly and may support energy\n"
            "• Raises both HDL (good) and LDL (bad) cholesterol — moderation is key\n"
            "• Better than trans fats or hydrogenated oils\n"
            "• Limit to **1–2 tsp/day** as part of a balanced diet\n\n"
            "Traditional in Sri Lankan cooking — moderate amounts are fine in a healthy diet."
        )
    if _faq_ans:
        async def _s():
            for ch in _faq_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Food info bypass ("why X", "tell me about X", "what is X") ──────────
    _food_info_ans = detect_food_info_query(req.message)
    if _food_info_ans:
        async def _s():
            for ch in _food_info_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Session context extraction ────────────────────────────────────────
    _answer_source.set("chromadb")
    _sess_ctx = extract_session_context(req.history)

    # ── Continuation bypass (session memory) ─────────────────────────────
    # Handles: "show me more", "something similar", "more like that", etc.
    if is_continuation_request(req.message):
        _cont_query = resolve_message_with_context(req.message, _sess_ctx)
        # Exclude foods already shown this session so results are fresh
        _exclude    = _sess_ctx["shown_foods_all"]
        _cont_ans   = detect_semantic_query(
            _cont_query,
            metrics,
            exclude_names=_exclude,
            disliked_foods=state.disliked_foods,
        )
        if _cont_ans:
            async def _s():
                for ch in _cont_ans:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Reference-resolved semantic bypass ───────────────────────────────
    # Handles: "something like that dish", "the first one but lower calorie", etc.
    _resolved_msg = resolve_message_with_context(req.message, _sess_ctx)
    if _resolved_msg != req.message:
        _ref_ans = detect_semantic_query(
            _resolved_msg,
            metrics,
            disliked_foods=state.disliked_foods,
        )
        if _ref_ans:
            async def _s():
                for ch in _ref_ans:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Semantic food query bypass (ChromaDB) ────────────────────────────
    _semantic_ans = detect_semantic_query(
        req.message,
        metrics,
        disliked_foods=state.disliked_foods,
    )
    if _semantic_ans:
        async def _s():
            for ch in _semantic_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── LLM fallback ─────────────────────────────────────────────────────
    _router_status = hybrid_llm.status()
    _initial_llm_provider = (
        "gemini"
        if _router_status["online_configured"]
        and not _router_status["cooldown_remaining_seconds"]
        else "ollama"
    )
    _answer_source.set(_initial_llm_provider)
    msgs = build_messages(req)

    async def stream_llm() -> AsyncGenerator[str, None]:
        emitted_visible = False
        reported_provider = _initial_llm_provider
        try:
            async for text in stream_visible_chunks(
                hybrid_llm.astream(msgs),
                first_response_timeout=OLLAMA_FIRST_RESPONSE_TIMEOUT_SECONDS,
                idle_timeout=OLLAMA_STREAM_IDLE_TIMEOUT_SECONDS,
                total_timeout=OLLAMA_TOTAL_RESPONSE_TIMEOUT_SECONDS,
            ):
                actual_provider = hybrid_llm.status()["last_provider"]
                if (
                    actual_provider in {"gemini", "ollama"}
                    and actual_provider != reported_provider
                ):
                    reported_provider = actual_provider
                    yield f"data: {json.dumps({'answer_source': actual_provider})}\n\n"
                emitted_visible = True
                yield f"data: {json.dumps({'token': text})}\n\n"
        except LLMStreamTimeout as exc:
            logger.warning("Hybrid LLM stream timed out during %s", exc.phase)
            fallback = build_llm_fallback(metrics, partial=emitted_visible)
            yield f"data: {json.dumps({'token': fallback})}\n\n"
        except LLMEmptyResponse:
            logger.warning("Hybrid LLM stream returned no visible response")
            fallback = build_llm_fallback(metrics, partial=emitted_visible)
            yield f"data: {json.dumps({'token': fallback})}\n\n"
        except Exception:
            logger.exception("Hybrid LLM streaming request failed")
            fallback = build_llm_fallback(metrics, partial=emitted_visible)
            yield f"data: {json.dumps({'token': fallback})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_llm(), media_type="text/event-stream")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_new:app", host=API_HOST, port=API_PORT, reload=True)
