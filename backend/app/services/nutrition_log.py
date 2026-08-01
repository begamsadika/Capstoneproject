from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from ..models.daily_log import DailyLog
from ..models.health_metric import HealthMetric
from ..models.meal import Meal
from ..models.meal_log_entry import MealLogEntry
from ..models.order import Order
from .health_calculator import calculate_wellness_score


def _number(value, default=0.0) -> float:
    try:
        return float(value if value is not None else default)
    except (TypeError, ValueError):
        return float(default)


def add_diet_ai_entries(
    db: Session,
    user_id: int,
    entries: list[dict],
) -> int:
    """Persist new Diet AI intake events idempotently and refresh daily totals."""
    affected_dates: set[date] = set()
    added = 0
    for payload in entries:
        reference = str(payload.get("entry_id") or "").strip()
        food_name = str(payload.get("food") or "").strip()
        if not reference or not food_name:
            continue
        source = "diet_ai"
        exists = (
            db.query(MealLogEntry.id)
            .filter(
                MealLogEntry.user_id == user_id,
                MealLogEntry.source == source,
                MealLogEntry.source_reference == reference,
            )
            .first()
        )
        if exists:
            continue
        try:
            log_date = date.fromisoformat(str(payload.get("date")))
        except (TypeError, ValueError):
            log_date = date.today()
        try:
            logged_at = datetime.fromisoformat(str(payload.get("logged_at")))
        except (TypeError, ValueError):
            logged_at = datetime.utcnow()
        db.add(
            MealLogEntry(
                user_id=user_id,
                log_date=log_date,
                meal_type=str(payload.get("slot") or "Other")[:30],
                food_name=food_name[:200],
                quantity=1.0,
                serving_size_g=(
                    _number(payload.get("serving_size_g"))
                    if payload.get("serving_size_g") is not None
                    else None
                ),
                calories=round(_number(payload.get("calories"))),
                protein_g=round(_number(payload.get("protein_g")), 1),
                carbs_g=round(_number(payload.get("carbs_g")), 1),
                fat_g=round(_number(payload.get("fat_g")), 1),
                source=source,
                source_reference=reference[:100],
                logged_at=logged_at,
            )
        )
        affected_dates.add(log_date)
        added += 1

    db.flush()
    for log_date in affected_dates:
        rebuild_daily_log(db, user_id, log_date)
    return added


def rebuild_daily_log(db: Session, user_id: int, log_date: date) -> DailyLog:
    """Rebuild one daily aggregate from orders plus reported intake entries."""
    metric = db.query(HealthMetric).filter(HealthMetric.user_id == user_id).first()
    target_cal = metric.target_calories if metric else 2000
    protein_t = metric.protein_target_g if metric else 0.0
    carbs_t = metric.carbs_target_g if metric else 0.0
    fat_t = metric.fat_target_g if metric else 0.0

    start = datetime.combine(log_date, datetime.min.time())
    end = datetime.combine(log_date, datetime.max.time())
    orders = (
        db.query(Order)
        .filter(
            Order.user_id == user_id,
            Order.created_at >= start,
            Order.created_at <= end,
            Order.status != "cancelled",
        )
        .all()
    )
    total_cal = 0
    total_protein = total_carbs = total_fat = 0.0
    for order in orders:
        meal = db.query(Meal).filter(Meal.id == order.meal_id).first()
        if not meal:
            continue
        calories = _number(meal.calories) * order.quantity
        total_cal += round(calories)
        # Existing meals currently expose calories only. Preserve the existing
        # estimate until real meal macros are introduced in the next enhancement.
        total_protein += calories * 0.30 / 4
        total_carbs += calories * 0.40 / 4
        total_fat += calories * 0.30 / 9

    intake_entries = (
        db.query(MealLogEntry)
        .filter(
            MealLogEntry.user_id == user_id,
            MealLogEntry.log_date == log_date,
        )
        .all()
    )
    total_cal += sum(entry.calories for entry in intake_entries)
    total_protein += sum(entry.protein_g for entry in intake_entries)
    total_carbs += sum(entry.carbs_g for entry in intake_entries)
    total_fat += sum(entry.fat_g for entry in intake_entries)
    meals_count = len(orders) + len(intake_entries)

    goal_met = abs(total_cal - target_cal) / max(target_cal, 1) <= 0.1
    wellness = calculate_wellness_score(total_cal, target_cal, meals_count)
    previous = (
        db.query(DailyLog)
        .filter(
            DailyLog.user_id == user_id,
            DailyLog.log_date == log_date - timedelta(days=1),
        )
        .first()
    )
    streak = (
        (previous.streak_day + 1)
        if previous and previous.calorie_goal_met
        else (1 if goal_met else 0)
    )
    log = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == user_id, DailyLog.log_date == log_date)
        .first()
    )
    if not log:
        log = DailyLog(user_id=user_id, log_date=log_date)
        db.add(log)
    log.calories_consumed = total_cal
    log.protein_consumed_g = round(total_protein, 1)
    log.carbs_consumed_g = round(total_carbs, 1)
    log.fat_consumed_g = round(total_fat, 1)
    log.meals_count = meals_count
    log.calorie_goal_met = goal_met
    log.wellness_score = wellness
    log.streak_day = streak
    log.calorie_target = target_cal
    log.protein_target_g = protein_t
    log.carbs_target_g = carbs_t
    log.fat_target_g = fat_t
    return log
