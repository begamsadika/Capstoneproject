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
import re as _re
import json
import copy
import datetime as _dt
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ── Module imports ────────────────────────────────────────────────────────────
from config import llm, OLLAMA_MODEL, drug_graph, condition_graph, API_PORT, strip_think
from models import ChatRequest, ChatResponse
from kg_queries import (
    detect_entities, retrieve_condition_foods, retrieve_drug_foods,
    DRUG_SUPPLEMENTAL_NOTES, _CONDITION_ALIAS, _CONDITION_DIET_NOTES,
)
from meal_logger import (
    _plan_cache, _weekly_plan, _disliked_foods,
    _persist_cache, _load_cache_from_disk, _save_disliked,
    detect_food_preference, fuzzy_match_food,
    detect_log_summary_request, detect_log_request,
    _log_option, _meal_log, _save_meal_log, _calories_for_food,
    detect_substitution_request, _pick_substitute,
    format_log_summary,
)
from meal_planner import (
    build_meal_plan, build_weekly_meal_plan,
    format_meal_plan_response, format_weekly_plan_response,
    format_week_day_detail, detect_week_day_query,
    detect_weight_change_goal, _format_option,
)
from bypass_handlers import (
    build_messages,
    get_time_greeting, is_greeting,
    format_weight_goal_answer,
    detect_time_to_goal_query, detect_goal_calorie_query,
    detect_ideal_weight_query, detect_weight_recommendation_query,
    detect_weight_assessment_query, detect_safe_timeline_query,
    is_meal_plan_request, is_weekly_plan_request,
    detect_prep_filter, detect_single_meal_slot,
    format_single_slot_response, resolve_calorie_target,
    detect_semantic_query,
)
from session_context import (
    extract_session_context,
    is_continuation_request,
    resolve_message_with_context,
)

# ── App setup ─────────────────────────────────────────────────────────────────
app = FastAPI(title="Wellora Diet Chat API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": OLLAMA_MODEL,
        "drug_graph":      {"nodes": len(drug_graph.nodes),     "edges": len(drug_graph.edges)},
        "condition_graph": {"nodes": len(condition_graph.nodes), "edges": len(condition_graph.edges)},
    }


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        msgs = build_messages(req)
        response = llm.invoke(msgs)
        return ChatResponse(reply=strip_think(response.content))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Server-Sent Events streaming endpoint with 16 bypass tiers."""
    metrics = req.user_metrics or {}

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
    goal_cal = detect_goal_calorie_query(req.message, metrics)
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
    _prep_exclude = detect_prep_filter(req.message, req.history)
    _prep_in_msg  = detect_prep_filter(req.message, [])
    if _prep_exclude:
        metrics = dict(metrics)
        metrics["_prep_exclude"] = _prep_exclude
        if _prep_in_msg and not is_meal_plan_request(req.message) and not detect_single_meal_slot(req.message):
            _target_cal_p = resolve_calorie_target(req, metrics)
            _prep_plan    = build_meal_plan(_target_cal_p, metrics)
            _plan_cache.update(_prep_plan)
            _persist_cache()
            _p_ans = format_meal_plan_response(_prep_plan, conditions=metrics.get("conditions") or [], prep_exclude=_prep_exclude)
            async def _s():
                for ch in _p_ans:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Food preference memory (dislike / like) ─────────────────────────
    _pref_action, _pref_food = detect_food_preference(req.message)
    if _pref_action and _pref_food:
        if _pref_action == "dislike":
            _disliked_foods.add(_pref_food)
            _save_disliked()
            _pref_reply = (f"Got it! I'll avoid **{_pref_food}** in all your future meal suggestions. 🙅\n\n"
                           f"*You can say \"I like {_pref_food}\" any time to add it back.*")
        else:
            _disliked_foods.discard(_pref_food)
            _save_disliked()
            _pref_reply = f"Great! I've added **{_pref_food}** back to your meal options. ✅"
        async def _s():
            for ch in _pref_reply:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Meal log summary ─────────────────────────────────────────────────
    if detect_log_summary_request(req.message):
        _log_reply = format_log_summary()
        async def _s():
            for ch in _log_reply:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Meal log entry ───────────────────────────────────────────────────
    _log_item, _log_slot = detect_log_request(req.message)
    if _log_item:
        today = _dt.date.today().isoformat()
        _opt_log_m = _re.search(r"option\s*([123])", _log_item)
        if _opt_log_m:
            _logged = _log_option(int(_opt_log_m.group(1)), _log_slot)
            if _logged:
                _cal_total = sum(e["calories"] for e in _logged)
                _names     = ", ".join(e["food"] for e in _logged)
                _log_ack   = (f"📝 Logged **Option {_opt_log_m.group(1)}**"
                              + (f" for {_logged[0]['slot']}" if _logged else "") + ":\n"
                              + f"  {_names} ({_cal_total} kcal)")
            else:
                _log_ack = "Couldn't find that option in your plan. Generate a meal plan first!"
        else:
            _matched_food = fuzzy_match_food(_log_item)
            if _matched_food:
                _cal      = _calories_for_food(_matched_food)
                _slot_str = _log_slot or "Other"
                _meal_log.append({
                    "date": today, "slot": _slot_str,
                    "food": _matched_food, "calories": _cal or 0,
                    "logged_at": _dt.datetime.now().isoformat(timespec="minutes"),
                })
                _save_meal_log()
                _cal_str = f" ({_cal} kcal)" if _cal else ""
                _log_ack = (f"📝 Logged **{_matched_food}**{_cal_str}"
                            + (f" for {_slot_str}" if _log_slot else "") + ". ✅\n\n"
                            + "*Say \"show my food log\" to see today's total.*")
            else:
                _log_ack = f"I couldn't match \"{_log_item}\" to a food in my database. Try being more specific."
        _save_meal_log()
        async def _s():
            for ch in _log_ack:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Food substitution ────────────────────────────────────────────────
    _sub_food, _sub_opt_n = detect_substitution_request(req.message)
    if _sub_food:
        if not _plan_cache:
            _plan_cache.update(_load_cache_from_disk())
        if not _plan_cache:
            _sub_reply = "No meal plan yet — ask me for a plan first, then I can swap foods for you!"
        else:
            _sub_slot, _sub_idx = None, None
            for _sl, _sdata in _plan_cache.items():
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
                _orig_opt    = _plan_cache[_sub_slot]["options"][_sub_idx]
                _replacement = _pick_substitute(_sub_food, _sub_slot, _orig_opt, metrics)
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
                    _plan_cache[_sub_slot]["options"][_sub_idx] = _new_opt
                    _persist_cache()
                    _sub_label = f"Option {_sub_idx + 1}"
                    _sub_lines = [f"✅ Swapped **{_sub_food}** → **{_replacement['name']}** in {_sub_slot} {_sub_label}!\n"]
                    _sub_lines.extend(_format_option(_new_opt, _sub_label, metrics.get("conditions") or []))
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
        _new_week = build_weekly_meal_plan(_w_target, metrics)
        _weekly_plan.clear()
        _weekly_plan.update(_new_week)
        _w_ans = format_weekly_plan_response(
            _new_week,
            conditions=metrics.get("conditions") or [],
            goal=metrics.get("health_goal") or "",
            target_cal=_w_target,
        )
        async def _s():
            for ch in _w_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass W2: specific day detail from weekly plan ─────────────────
    _week_day_key = detect_week_day_query(req.message, _weekly_plan)
    if _week_day_key:
        _wd_plan = _weekly_plan.get(_week_day_key, {})
        _wd_ans  = format_week_day_detail(_week_day_key, _wd_plan, conditions=metrics.get("conditions") or [])
        async def _s():
            for ch in _wd_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Bypass 2: full day meal plan ─────────────────────────────────────
    if is_meal_plan_request(req.message):
        target_cal = resolve_calorie_target(req, metrics)
        plan       = build_meal_plan(target_cal, metrics)
        answer     = format_meal_plan_response(
            plan,
            conditions=metrics.get("conditions") or [],
            prep_exclude=_prep_exclude,
            goal=metrics.get("health_goal") or "",
            target_cal=target_cal,
            metrics=metrics,
        )
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
    if _detail_request and not _plan_cache:
        _plan_cache.update(_load_cache_from_disk())
    if _detail_request and _plan_cache:
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
        if _conf_n and _conf_slot and _conf_slot in _plan_cache:
            _opts = _plan_cache[_conf_slot].get("options", [])
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
    _single_slot = detect_single_meal_slot(req.message)
    if _single_slot:
        target_cal  = resolve_calorie_target(req, metrics)
        _prep_excl3 = detect_prep_filter(req.message, req.history)
        if _prep_excl3:
            metrics = dict(metrics)
            metrics["_prep_exclude"] = _prep_excl3
        slot_plan   = build_meal_plan(target_cal, metrics)
        slot_answer = format_single_slot_response(_single_slot, slot_plan)
        if _prep_excl3:
            _excl_rd  = {"deep_fried": "deep-fried", "shallow_fried": "shallow-fried", "stir_fried": "stir-fried"}
            _excl_str = ", ".join(_excl_rd.get(p, p.replace("_", "-")) for p in _prep_excl3)
            slot_answer = f"*🥗 Filtering out {_excl_str} foods as requested.*\n\n" + slot_answer
        _plan_cache.update(slot_plan)
        _persist_cache()
        async def _s():
            for ch in slot_answer:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Knowledge graph bypasses ─────────────────────────────────────────
    _cond_entities, _drug_entities, _ = detect_entities(req.message)

    _is_cond_q = any(p in req.message.lower() for p in [
        "what food", "what should i eat", "what can i eat", "what to eat",
        "what should i avoid", "what to avoid", "foods for", "food for",
        "foods to eat", "avoid with", "should avoid", "what not to eat",
        "good for", "recommend", "dietary advice", "diet advice", "diet for",
    ])
    if _cond_entities and _is_cond_q:
        _cond_lines = []
        for _cond in _cond_entities:
            _canonical = _CONDITION_ALIAS.get(_cond.lower(), _cond.title())
            _rec, _avd = retrieve_condition_foods(_cond)
            _diet_note = _CONDITION_DIET_NOTES.get(_canonical, "")
            _cond_lines.append(f"**{_canonical} — Dietary Guidance**\n")
            if _rec:
                _cond_lines.append(f"✅ **Recommended:** {', '.join(_rec[:12])}\n")
            if _avd:
                _cond_lines.append(f"🚫 **Avoid:** {', '.join(_avd[:12])}\n")
            if _diet_note:
                _cond_lines.append(f"\n📋 **Evidence-based guidance:** {_diet_note}")
        if _cond_lines:
            _cond_answer = "\n".join(_cond_lines)
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
        _drug_lines = []
        for _drug in _drug_entities:
            _avd_foods, _drug_notes = retrieve_drug_foods(_drug)
            _supp = DRUG_SUPPLEMENTAL_NOTES.get(_drug, "")
            _drug_lines.append(f"**{_drug} — Food Interactions**\n")
            if _avd_foods:
                _drug_lines.append(f"🚫 **Avoid:** {', '.join(_avd_foods[:12])}\n")
            if _supp:
                _drug_lines.append(f"📋 **Clinical guidance:** {_supp}\n")
            elif _drug_notes:
                _drug_lines.append(f"📋 **Notes:** {' | '.join(list(_drug_notes)[:4])}\n")
            _drug_lines.append("\n⚠️ Always consult your doctor or pharmacist about drug-food interactions.")
        if _drug_lines:
            _drug_answer = "\n".join(_drug_lines)
            async def _s():
                for ch in _drug_answer:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Nutrition FAQ bypass ─────────────────────────────────────────────
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

    # ── Session context extraction ────────────────────────────────────────
    _sess_ctx = extract_session_context(req.history)

    # ── Continuation bypass (session memory) ─────────────────────────────
    # Handles: "show me more", "something similar", "more like that", etc.
    if is_continuation_request(req.message):
        _cont_query = resolve_message_with_context(req.message, _sess_ctx)
        # Exclude foods already shown this session so results are fresh
        _exclude    = _sess_ctx["shown_foods_all"]
        _cont_ans   = detect_semantic_query(_cont_query, metrics, exclude_names=_exclude)
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
        _ref_ans = detect_semantic_query(_resolved_msg, metrics)
        if _ref_ans:
            async def _s():
                for ch in _ref_ans:
                    yield f"data: {json.dumps({'token': ch})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(_s(), media_type="text/event-stream")

    # ── Semantic food query bypass (ChromaDB) ────────────────────────────
    _semantic_ans = detect_semantic_query(req.message, metrics)
    if _semantic_ans:
        async def _s():
            for ch in _semantic_ans:
                yield f"data: {json.dumps({'token': ch})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_s(), media_type="text/event-stream")

    # ── LLM fallback ─────────────────────────────────────────────────────
    msgs = build_messages(req)

    async def stream_llm() -> AsyncGenerator[str, None]:
        _THINK_OPEN, _THINK_CLOSE = "<think>", "</think>"
        mode = "detect"
        buf  = ""
        try:
            async for chunk in llm.astream(msgs):
                text = chunk.content or ""
                if not text:
                    continue
                if mode == "stream":
                    yield f"data: {json.dumps({'token': text})}\n\n"
                    continue
                buf += text
                if mode == "detect":
                    head = buf.lstrip()
                    if head.startswith(_THINK_OPEN):
                        mode = "think"
                    elif _THINK_OPEN.startswith(head[:len(_THINK_OPEN)]):
                        continue
                    else:
                        mode = "stream"
                        yield f"data: {json.dumps({'token': buf})}\n\n"
                        buf = ""
                        continue
                if mode == "think":
                    end = buf.find(_THINK_CLOSE)
                    if end != -1:
                        rest = buf[end + len(_THINK_CLOSE):].lstrip("\n")
                        mode = "stream"
                        buf  = ""
                        if rest:
                            yield f"data: {json.dumps({'token': rest})}\n\n"
            if buf and mode == "detect":
                yield f"data: {json.dumps({'token': buf})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_llm(), media_type="text/event-stream")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api_new:app", host="0.0.0.0", port=API_PORT, reload=True)
