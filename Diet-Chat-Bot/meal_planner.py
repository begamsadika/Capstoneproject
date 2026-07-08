"""
meal_planner.py — Meal plan builder (single-day + weekly), formatters,
                  week-day query detection, and weight-change goal calculator.

ChromaDB hybrid integration
---------------------------
After pandas hard-filters the slot pool (diet type, allergies, GI, sodium),
ChromaDB semantically re-ranks candidates so that each of the 3 options is
biased toward a different flavour query (traditional / light / high-protein).
This replaces repeated random seeds as the variety mechanism.

Falls back silently to pure-pandas if ChromaDB is unavailable.
"""
import re as _re
import random
import pandas as pd

from food_db import _food_df, apply_allergy_filter, parse_allergy_string
from meal_logger import (
    _plan_cache, _persist_cache, _disliked_foods,
    _weekly_plan, _DAYS_OF_WEEK,
)

# Lazy import — don't fail startup if chroma is somehow missing
try:
    from chroma_food_db import diverse_foods_from_pool, build_option_queries
    _CHROMA_AVAILABLE = True
except Exception as _chroma_err:
    print(f"[WARN] ChromaDB not available, falling back to pandas only: {_chroma_err}")
    _CHROMA_AVAILABLE = False


# ── Single-day meal plan ──────────────────────────────────────────────────────

def build_meal_plan(target_calories: int, metrics: dict) -> dict:
    """
    Select foods from the DB for each meal slot and calculate EXACT macros
    from the CSV — no LLM estimation involved.
    Returns a structured dict with per-slot foods and totals.
    """
    df = _food_df.copy()

    # ── Dietary preference filter ────────────────────────────────────────
    pref = (metrics.get("dietary_preference") or "").lower()
    _is_nonveg = any(p in pref for p in ("non-veg", "nonveg", "non veg"))
    _is_vegan  = "vegan" in pref and not _is_nonveg
    _is_veg    = "veg" in pref and not _is_vegan and not _is_nonveg

    if "diet_type" in df.columns:
        if _is_vegan:
            _vf = df[df["diet_type"] == "vegan"]
            if len(_vf) >= 10:
                df = _vf
        elif _is_veg:
            _vf = df[df["diet_type"].isin(["vegan", "vegetarian"])]
            if len(_vf) >= 10:
                df = _vf
    else:
        if _is_vegan:
            df = df[~df["category"].str.contains("Poultry & Meat|Seafood|Dairy", case=False, na=False)]
        elif _is_veg:
            df = df[~df["category"].str.contains("Poultry & Meat|Seafood", case=False, na=False)]

    if "meal_type" in df.columns:
        df = df[df["meal_type"] != "condiment"]

    allergies = parse_allergy_string(metrics.get("allergies", "") or "")
    df = apply_allergy_filter(df, allergies)

    _prep_exclude = metrics.get("_prep_exclude") or []
    if _prep_exclude and "prep_method" in df.columns:
        filtered = df[~df["prep_method"].isin(_prep_exclude)]
        if len(filtered) >= 10:
            df = filtered

    if _disliked_foods:
        filtered_dl = df[~df["food_item"].isin(_disliked_foods)]
        if len(filtered_dl) >= 10:
            df = filtered_dl

    # ── Goal-aware calorie split ─────────────────────────────────────────
    _hgoal   = (metrics.get("health_goal") or "").lower()
    _is_lose = any(w in _hgoal for w in ("lose", "loss", "cut", "reduce"))
    _is_gain = any(w in _hgoal for w in ("gain", "muscle", "bulk", "increase"))

    if _is_lose:
        splits = {
            "Breakfast": round(target_calories * 0.25),
            "Lunch":     round(target_calories * 0.35),
            "Dinner":    round(target_calories * 0.25),
            "Snack":     round(target_calories * 0.15),
        }
        _sa_tolerance = 0
    elif _is_gain:
        splits = {
            "Breakfast": round(target_calories * 0.25),
            "Lunch":     round(target_calories * 0.35),
            "Dinner":    round(target_calories * 0.30),
            "Snack":     round(target_calories * 0.10),
        }
        _sa_tolerance = 150
    else:
        splits = {
            "Breakfast": round(target_calories * 0.25),
            "Lunch":     round(target_calories * 0.35),
            "Dinner":    round(target_calories * 0.30),
            "Snack":     round(target_calories * 0.10),
        }
        _sa_tolerance = 50

    N_OPTIONS = 3

    _protein_target = float(metrics.get("protein_target_g") or 0)

    def _protein_sample(df_pool, seed):
        """Sample one row, weighted by protein_g when a protein target is set."""
        if _protein_target > 80 and "protein_g" in df_pool.columns and len(df_pool) >= 3:
            weights = df_pool["protein_g"].clip(lower=0.1)
            return df_pool.sample(1, random_state=seed, weights=weights).iloc[0]
        return df_pool.sample(1, random_state=seed).iloc[0]

    def pick_option(slot_df, budget, seed):
        has_roles = "dish_role" in slot_df.columns
        if has_roles:
            main_df       = slot_df[slot_df["dish_role"] == "main"]
            side_df       = slot_df[slot_df["dish_role"] == "side"]
            standalone_df = slot_df[slot_df["dish_role"] == "standalone"]

            if len(main_df) > 0 and len(side_df) > 0:
                main_item = _protein_sample(main_df, seed)
                remaining = budget - int(main_item["calories"])
                fitting_sides = side_df[side_df["calories"] <= remaining + 80]
                if len(fitting_sides) > 0:
                    preferred_ids = set()
                    if "pairs_well_with" in main_item.index and pd.notna(main_item["pairs_well_with"]) and str(main_item["pairs_well_with"]).strip():
                        preferred_ids = set(str(main_item["pairs_well_with"]).split(","))
                    preferred = fitting_sides[fitting_sides["food_id"].isin(preferred_ids)]
                    side_item = (preferred if len(preferred) > 0 else fitting_sides).sample(1, random_state=seed + 7).iloc[0]
                    return [main_item, side_item]
                return [main_item]

            if len(standalone_df) > 0:
                _fit_sa = standalone_df[standalone_df["calories"] <= budget + _sa_tolerance]
                if len(_fit_sa) > 0:
                    return [_protein_sample(_fit_sa, seed)]

        shuffled = slot_df.sample(frac=1, random_state=seed).reset_index(drop=True)
        selected, used_categories, remaining = [], set(), budget
        for _, row in shuffled.iterrows():
            if len(selected) >= 2:
                break
            cat = str(row.get("category", "")).strip().lower()
            if selected and cat and cat in used_categories:
                continue
            if row["calories"] <= remaining + 50 or len(selected) == 0:
                selected.append(row)
                used_categories.add(cat)
                remaining -= row["calories"]
        return selected

    def pick_standalone_option(slot_df, budget, seed):
        if "dish_role" not in slot_df.columns:
            return []
        sa_df   = slot_df[slot_df["dish_role"] == "standalone"]
        fitting = sa_df[sa_df["calories"] <= budget + _sa_tolerance]
        if len(fitting) == 0:
            return []
        return [fitting.sample(1, random_state=seed).iloc[0]]

    plan = {}
    total_cal = total_protein = total_carbs = total_fat = 0.0
    _cross_slot_used: set = set()
    _week_mains_used: set = set(metrics.get("_week_used") or set())
    _week_sides_used: set = set(metrics.get("_week_sides_used") or set())

    conditions_lower = [c.lower() for c in (metrics.get("conditions") or [])]
    health_goal_lower = (metrics.get("health_goal") or "").lower()
    _restrict_gi = (
        any("pcos" in c or "pcod" in c or "polycystic" in c for c in conditions_lower) or
        any("hypothyroid" in c or "thyroid" in c for c in conditions_lower) or
        any("diabetes" in c for c in conditions_lower) or
        any("obesity" in c for c in conditions_lower) or
        "lose" in health_goal_lower or "loss" in health_goal_lower
    )
    _restrict_sodium = (
        any("hypertension" in c or "blood pressure" in c for c in conditions_lower) or
        any("heart" in c for c in conditions_lower)
    )

    for slot, budget in splits.items():
        if "meal_type" in df.columns:
            if slot in ("Lunch", "Dinner"):
                slot_df = df[df["meal_type"].isin(["lunch_dinner", "any"])].copy()
            elif slot == "Snack":
                _snack_pool = df[df["meal_type"] == "snack"]
                _any_snacks = df[
                    (df["meal_type"] == "any") &
                    (df["dish_role"].isin(["standalone", "side", "condiment"]))
                ]
                slot_df = pd.concat([_snack_pool, _any_snacks]).drop_duplicates().copy()
            else:
                slot_df = df[df["meal_type"].isin([slot.lower(), "any"])].copy()
        else:
            slot_df = df.copy()

        if _restrict_gi and "gi_category" in slot_df.columns:
            low_med = slot_df[slot_df["gi_category"].isin(["low", "medium"])]
            if len(low_med) >= 4:
                slot_df = low_med

        if _restrict_sodium and "sodium_category" in slot_df.columns:
            low_sod = slot_df[slot_df["sodium_category"].isin(["low", "medium"])]
            if len(low_sod) >= 4:
                slot_df = low_sod

        if _cross_slot_used and "dish_role" in slot_df.columns:
            _varied = slot_df[
                ~((slot_df["dish_role"].isin({"main", "standalone"})) &
                  (slot_df["food_item"].isin(_cross_slot_used)))
            ]
            if len(_varied) >= 6:
                slot_df = _varied

        if _week_mains_used and "dish_role" in slot_df.columns:
            _wk_varied = slot_df[
                ~((slot_df["dish_role"].isin({"main", "standalone"})) &
                  (slot_df["food_item"].isin(_week_mains_used)))
            ]
            if len(_wk_varied) >= 6:
                slot_df = _wk_varied

        if _week_sides_used and "dish_role" in slot_df.columns:
            _wk_side_varied = slot_df[
                ~((slot_df["dish_role"] == "side") &
                  (slot_df["food_item"].isin(_week_sides_used)))
            ]
            if len(_wk_side_varied) >= 6:
                slot_df = _wk_side_varied

        options = []
        used_names: set = set()
        base_seed = abs(hash(slot)) % 9999

        # ── ChromaDB diversity seeding ────────────────────────────────────────
        # Ask ChromaDB for 3 semantically different "headline" foods from the
        # already pandas-filtered pool. Each option will be biased to start
        # from a different part of the food flavour space.
        _chroma_seeds: list[str | None] = [None, None, None]
        if _CHROMA_AVAILABLE and len(slot_df) >= N_OPTIONS * 2:
            try:
                _pool_names  = list(slot_df["food_item"])
                _seed_names  = diverse_foods_from_pool(
                    slot, _pool_names,
                    goal=metrics.get("health_goal", ""),
                    n_options=N_OPTIONS,
                )
                for _si, _sn in enumerate(_seed_names[:N_OPTIONS]):
                    _chroma_seeds[_si] = _sn
            except Exception as _ce:
                print(f"[WARN] ChromaDB seed error ({slot}): {_ce}")

        # Build one option per seed, with fallback retries
        for opt_idx in range(N_OPTIONS):
            seed = (base_seed + opt_idx * 37) % 9999

            # Re-order slot_df so the ChromaDB seed food floats to the top.
            # pick_option samples with a fixed seed, so the seed food gets
            # high priority without hard-excluding other foods.
            seeded_df = slot_df
            _cseed = _chroma_seeds[opt_idx]
            if _cseed and _cseed in slot_df["food_item"].values:
                _seed_row   = slot_df[slot_df["food_item"] == _cseed]
                _other_rows = slot_df[slot_df["food_item"] != _cseed]
                seeded_df   = pd.concat([_seed_row, _other_rows]).reset_index(drop=True)

            inner = 0
            while inner < 15:
                _sv = (seed + inner * 7) % 9999
                selected = (
                    pick_standalone_option(seeded_df, budget, _sv) or pick_option(seeded_df, budget, _sv)
                    if opt_idx == N_OPTIONS - 1
                    else pick_option(seeded_df, budget, _sv)
                )
                names = frozenset(r["food_item"] for r in selected)
                if names and names not in used_names:
                    used_names.add(names)
                    cal     = sum(r["calories"]  for r in selected)
                    protein = sum(r["protein_g"] for r in selected)
                    carbs   = sum(r["carbs_g"]   for r in selected)
                    fat     = sum(r["fat_g"]     for r in selected)
                    options.append({
                        "actual_kcal": round(cal),
                        "protein_g":   round(protein, 1),
                        "carbs_g":     round(carbs,   1),
                        "fat_g":       round(fat,     1),
                        "foods": [
                            {
                                "name":            r["food_item"],
                                "serving_size_g":  int(r["serving_size_g"])  if "serving_size_g"  in r.index and not pd.isna(r["serving_size_g"])  else None,
                                "min_serving_g":   int(r["min_serving_g"])   if "min_serving_g"   in r.index and not pd.isna(r["min_serving_g"])   else None,
                                "max_serving_g":   int(r["max_serving_g"])   if "max_serving_g"   in r.index and not pd.isna(r["max_serving_g"])   else None,
                                "calories":        int(r["calories"]),
                                "protein_g":       round(float(r["protein_g"]), 1),
                                "carbs_g":         round(float(r["carbs_g"]),   1),
                                "fat_g":           round(float(r["fat_g"]),     1),
                                "gi":              int(r["gi"])            if "gi"            in r.index and not pd.isna(r["gi"])            else None,
                                "gl":              round(float(r["gl"]),1) if "gl"            in r.index and not pd.isna(r["gl"])            else None,
                                "gi_category":     str(r["gi_category"])   if "gi_category"   in r.index and not pd.isna(r["gi_category"])   else None,
                                "prep_method":     str(r["prep_method"])   if "prep_method"   in r.index and not pd.isna(r["prep_method"])   else None,
                                "sodium_mg":       int(r["sodium_mg"])     if "sodium_mg"     in r.index and not pd.isna(r["sodium_mg"])     else None,
                                "sodium_category": str(r["sodium_category"]) if "sodium_category" in r.index and not pd.isna(r["sodium_category"]) else None,
                                "fiber_g":         round(float(r["fiber_g"]),1) if "fiber_g"   in r.index and not pd.isna(r["fiber_g"])      else None,
                            }
                            for r in selected
                        ],
                    })
                    break
                inner += 1

        _main_roles = {"main", "standalone"}
        for _opt in options:
            for _fd in _opt["foods"]:
                _role_rows = slot_df[slot_df["food_item"] == _fd["name"]]
                if not _role_rows.empty:
                    _role = _role_rows.iloc[0].get("dish_role", "")
                    if _role in _main_roles:
                        _cross_slot_used.add(_fd["name"])

        first = options[0] if options else {"actual_kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0}
        plan[slot] = {
            "target_kcal": budget,
            "options":     options,
            "actual_kcal": first["actual_kcal"],
            "protein_g":   first["protein_g"],
            "carbs_g":     first["carbs_g"],
            "fat_g":       first["fat_g"],
        }
        total_cal     += first["actual_kcal"]
        total_protein += first["protein_g"]
        total_carbs   += first["carbs_g"]
        total_fat     += first["fat_g"]

    plan["totals"] = {
        "target_kcal": target_calories,
        "actual_kcal": round(total_cal),
        "protein_g":   round(total_protein, 1),
        "carbs_g":     round(total_carbs,   1),
        "fat_g":       round(total_fat,     1),
    }
    _plan_cache.clear()
    _plan_cache.update(plan)
    _persist_cache()
    return plan


# ── Formatters ────────────────────────────────────────────────────────────────

def _format_option(opt: dict, label: str, conditions: list = None) -> list:
    conditions = conditions or []
    gi_cats = [f.get("gi_category") for f in opt["foods"] if f.get("gi_category")]
    gi_rank = {"high": 2, "medium": 1, "low": 0}
    opt_gi  = max(gi_cats, key=lambda g: gi_rank.get(g, 0)) if gi_cats else None
    gi_tag  = f" | GI: {opt_gi}" if opt_gi else ""

    lines = [f"  *{label}* — {opt['actual_kcal']} kcal | P: {opt['protein_g']}g | C: {opt['carbs_g']}g | F: {opt['fat_g']}g{gi_tag}"]
    for f in opt["foods"]:
        if f.get("min_serving_g") and f.get("max_serving_g"):
            portion = f" ({f['min_serving_g']}–{f['max_serving_g']}g)"
        elif f.get("serving_size_g"):
            portion = f" ({f['serving_size_g']}g)"
        else:
            portion = ""
        lines.append(f"    • {f['name']}{portion} — {f['calories']} cal | P: {f['protein_g']}g | C: {f['carbs_g']}g | F: {f['fat_g']}g")

    has_fried = any(f.get("prep_method") == "deep_fried" for f in opt["foods"])
    warn_conditions = {"diabetes", "heart disease", "hypertension", "obesity"}
    if has_fried and (not conditions or warn_conditions.intersection(set(conditions))):
        lines.append("    ⚠️ *Contains deep-fried item — enjoy in moderation.*")

    has_high_sod = any(f.get("sodium_category") == "high" for f in opt["foods"])
    heart_hyp = {"heart disease", "hypertension"}
    if has_high_sod and conditions and heart_hyp.intersection(set(c.lower() for c in conditions)):
        lines.append("    ⚠️ *Contains high-sodium item — limit portions or request a low-sodium plan.*")

    return lines


def format_meal_plan_response(plan: dict, conditions: list = None,
                               prep_exclude: list = None, goal: str = "",
                               target_cal: int = 0, metrics: dict = None) -> str:
    lines = []
    _g = (goal or "").lower()
    if _g or target_cal:
        _goal_emoji = {"lose": "🔻", "gain": "📈", "maintain": "⚖️"}
        _gkey = ("lose" if any(w in _g for w in ("lose","loss","cut")) else
                 "gain" if any(w in _g for w in ("gain","muscle","bulk")) else "maintain")
        _gem  = _goal_emoji.get(_gkey, "🎯")
        _goal_label = {"lose": "Weight Loss", "gain": "Weight Gain",
                       "maintain": "Maintain Weight"}.get(_gkey, goal.title())
        _banner_parts = []
        if _goal_label:
            _banner_parts.append(f"{_gem} **Goal: {_goal_label}**")
        if target_cal:
            _banner_parts.append(f"🔥 **Target: {target_cal:,} kcal/day**")
        if _gkey == "lose":
            _banner_parts.append("📋 *Dinner reduced to 25% — snack increased to 15% for satiety*")
        elif _gkey == "gain":
            _banner_parts.append("📋 *Calorie surplus included — choose calorie-dense options*")
        if _banner_parts:
            lines.append("  |  ".join(_banner_parts[:2]))
            if len(_banner_parts) > 2:
                lines.append(_banner_parts[2])
            lines.append("")

    if prep_exclude:
        _excl_readable = {
            "deep_fried": "deep-fried",
            "shallow_fried": "shallow-fried",
            "stir_fried": "stir-fried",
        }
        _excl_str = ", ".join(_excl_readable.get(p, p.replace("_", "-")) for p in prep_exclude)
        lines.append(f"*🥗 Filtering out {_excl_str} foods as requested.*\n")

    for slot in ["Breakfast", "Lunch", "Dinner", "Snack"]:
        s = plan[slot]
        lines.append(f"**{slot}** (~{s['target_kcal']} kcal)")
        for i, opt in enumerate(s.get("options", []), 1):
            lines.extend(_format_option(opt, f"Option {i}", conditions=conditions))
            lines.append("")

    t = plan["totals"]
    lines.append(f"**Daily Total (Option 1): {t['actual_kcal']} kcal** (target {t['target_kcal']} kcal)")
    lines.append(f"Protein: {t['protein_g']}g | Carbs: {t['carbs_g']}g | Fat: {t['fat_g']}g")

    # ── Protein gap warning ──────────────────────────────────────────────────
    _prot_target = float((metrics or {}).get("protein_target_g") or 0)
    if _prot_target > 0 and t["protein_g"] < _prot_target * 0.6:
        _gap = round(_prot_target - t["protein_g"], 1)
        lines.append(
            f"\n⚠️ *Protein gap: {t['protein_g']}g delivered vs {round(_prot_target)}g target "
            f"({_gap}g short). Add dhal, chickpeas, low-fat curd, or tofu to boost protein.*"
        )

    lines.append("\n*All values from the food database. Mix and match options to suit your taste!*")
    return "\n".join(lines)


# ── Weekly plan builder ───────────────────────────────────────────────────────

def build_weekly_meal_plan(target_calories: int, metrics: dict) -> dict:
    """Build a 7-day meal plan with cross-day variety."""
    week: dict = {}
    _week_used: set      = set()
    _week_sides_used: set = set()
    for i, day_name in enumerate(_DAYS_OF_WEEK, 1):
        day_metrics = dict(metrics)
        day_metrics["_week_used"]       = _week_used
        day_metrics["_week_sides_used"] = _week_sides_used
        day_plan = build_meal_plan(target_calories, day_metrics)
        _day_slot_df = _food_df[["food_item", "dish_role"]] if not _food_df.empty else None
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            s    = day_plan.get(slot, {})
            opts = s.get("options", [])
            if opts:
                for fd in opts[0].get("foods", []):
                    fname = fd["name"]
                    if _day_slot_df is not None:
                        _rows = _day_slot_df[_day_slot_df["food_item"] == fname]
                        _role = _rows.iloc[0]["dish_role"] if not _rows.empty else "main"
                    else:
                        _role = "main"
                    if _role in ("main", "standalone"):
                        _week_used.add(fname)
                    elif _role == "side":
                        _week_sides_used.add(fname)
        if len(_week_sides_used) > 8:
            _week_sides_used = set(list(_week_sides_used)[-4:])
        week[f"Day {i}"] = day_plan
    return week


def _slot_emoji(slot: str) -> str:
    return {"Breakfast": "🌅", "Lunch": "☀️ ", "Dinner": "🌙", "Snack": "🍎"}.get(slot, "🍽️")


def format_weekly_plan_response(weekly_plan: dict, conditions: list = None,
                                 goal: str = "", target_cal: int = 0) -> str:
    conditions = conditions or []
    _wg = (goal or "").lower()
    _wgkey = ("lose" if any(w in _wg for w in ("lose","loss","cut")) else
              "gain" if any(w in _wg for w in ("gain","muscle","bulk")) else
              "maintain" if "maintain" in _wg else "")
    _wglabel = {"lose": "🔻 Weight Loss", "gain": "📈 Weight Gain",
               "maintain": "⚖️ Maintain Weight"}.get(_wgkey, "")
    _w_banner = []
    if _wglabel:   _w_banner.append(_wglabel)
    if target_cal: _w_banner.append(f"🔥 Target: {target_cal:,} kcal/day")
    lines = ["📅 **Your 7-Day Sri Lankan Meal Plan**"]
    if _w_banner: lines.append("  |  ".join(_w_banner))
    lines += ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━", ""]
    for i, day_name in enumerate(_DAYS_OF_WEEK, 1):
        day_key  = f"Day {i}"
        day_plan = weekly_plan.get(day_key, {})
        if not day_plan:
            continue
        lines.append(f"**{day_key} — {day_name}**")
        day_kcal = 0
        for slot in ("Breakfast", "Lunch", "Dinner", "Snack"):
            s    = day_plan.get(slot, {})
            opts = s.get("options", [])
            if not opts:
                continue
            opt1     = opts[0]
            foods    = ", ".join(f["name"] for f in opt1["foods"])
            kcal     = opt1.get("actual_kcal", 0)
            day_kcal += kcal
            lines.append(f"  {_slot_emoji(slot)} {slot}: {foods} ({kcal} kcal)")
        lines.append(f"  📊 *Daily total: ~{day_kcal} kcal*")
        lines.append("")
    lines.append("─────────────────────────────────────────")
    lines.append("💡 *Say **\"Day 3 details\"** or **\"Wednesday plan\"** to see all options + full nutrition for any day.*")
    lines.append("💡 *Say **\"new weekly plan\"** to regenerate with fresh variety.*")
    return "\n".join(lines)


def format_week_day_detail(day_key: str, day_plan: dict, conditions: list = None) -> str:
    conditions = conditions or []
    try:
        day_num  = int(day_key.split()[-1]) - 1
        day_name = _DAYS_OF_WEEK[day_num] if 0 <= day_num < 7 else ""
    except (ValueError, IndexError):
        day_name = ""
    header = f"📅 **{day_key}" + (f" — {day_name}" if day_name else "") + "**\n"
    return header + format_meal_plan_response(day_plan, conditions=conditions)


def detect_week_day_query(message: str, weekly_plan: dict):
    """Return 'Day N' if message asks for a specific day's detail, else None."""
    if not weekly_plan:
        return None
    msg = message.lower().strip()
    m = _re.search(r"\bday\s*([1-7])\b", msg)
    if m:
        return f"Day {m.group(1)}"
    for i, name in enumerate(_DAYS_OF_WEEK, 1):
        if name.lower() in msg:
            return f"Day {i}"
    return None


# ── Weight-change goal calculator ─────────────────────────────────────────────

def detect_weight_change_goal(message: str, metrics: dict) -> str:
    """
    Detect 'gain/lose X kg in Y weeks' and return pre-calculated calorie target
    so the LLM doesn't have to do the math.
    """
    msg = message.lower()
    pattern = (
        r'(gain|lose)\s+'
        r'(\d+(?:\.\d+)?)\s*(kg|g|lbs?|pounds?)'
        r'.*?'
        r'(?:in|within|over|by)\s+'
        r'(\d+(?:\.\d+)?)\s*(days?|weeks?|months?|years?)'
    )
    match = _re.search(pattern, msg)
    if not match:
        return ""

    direction   = match.group(1)
    weight_val  = float(match.group(2))
    weight_unit = match.group(3)
    time_val    = float(match.group(4))
    time_unit   = match.group(5)

    # Normalise weight → kg
    if weight_unit.startswith("g") and not weight_unit.startswith("ga"):
        kg = weight_val / 1000
    elif weight_unit.startswith("lb") or weight_unit.startswith("pound"):
        kg = weight_val * 0.453592
    else:
        kg = weight_val

    # Normalise time → days
    if time_unit.startswith("day"):
        days = int(time_val)
    elif time_unit.startswith("week"):
        days = int(time_val * 7)
    elif time_unit.startswith("month"):
        days = int(time_val * 30)
    elif time_unit.startswith("year"):
        days = int(time_val * 365)
    else:
        days = int(time_val * 7)

    weeks = round(days / 7, 1)
    daily_adjustment = round((kg * 7700) / days)
    maintenance      = int(metrics.get("maintenance_calories") or 2000)

    if direction == "gain":
        new_target = maintenance + daily_adjustment
        label = f"+{daily_adjustment} cal/day surplus"
    else:
        new_target = maintenance - daily_adjustment
        label = f"-{daily_adjustment} cal/day deficit"

    SAFE_SURPLUS_MAX = 500
    SAFE_DEFICIT_MAX = 1000
    MIN_CALORIES     = 1200

    if direction == "gain" and daily_adjustment > SAFE_SURPLUS_MAX:
        safe_days  = round((kg * 7700) / SAFE_SURPLUS_MAX)
        safe_weeks = round(safe_days / 7, 1)
        feasible = "no"
        safe_timeline = f"{safe_days} days ({safe_weeks} weeks)"
    elif direction == "lose" and (daily_adjustment > SAFE_DEFICIT_MAX or new_target < MIN_CALORIES):
        safe_days  = round((kg * 7700) / SAFE_DEFICIT_MAX)
        safe_weeks = round(safe_days / 7, 1)
        feasible = "no"
        safe_timeline = f"{safe_days} days ({safe_weeks} weeks)"
    else:
        feasible = "yes"
        safe_timeline = ""

    kg_display = round(kg, 3)
    return (
        f"[Pre-calculated Goal — USE THESE EXACT NUMBERS, DO NOT RECALCULATE]\n"
        f"Goal: {direction} {kg_display} kg in {days} days ({weeks} weeks)\n"
        f"Required daily calorie adjustment: {label}\n"
        f"Maintenance calories: {maintenance} cal/day\n"
        f"New daily calorie target: {new_target} cal/day\n"
        f"Formula used: {kg_display} kg × 7,700 kcal ÷ {days} days = {daily_adjustment} cal/day\n"
        f"Feasible: {feasible}\n"
        f"Safe timeline: {safe_timeline}"
    )
