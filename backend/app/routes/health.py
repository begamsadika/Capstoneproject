from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime
from ..database import get_db
from ..models.health_metric import HealthMetric
from ..models.daily_log import DailyLog
from ..models.order import Order
from ..models.meal import Meal
from ..models.user import User
from ..core.auth import get_current_user
from ..services.health_calculator import build_health_metrics, calculate_wellness_score

router = APIRouter(prefix="/api/health", tags=["Health Metrics"])


# ─── GET FULL HEALTH METRICS ─────────────────────
@router.get("/metrics")
def get_health_metrics(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    metric = (
        db.query(HealthMetric).filter(HealthMetric.user_id == current_user.id).first()
    )

    if not metric:
        raise HTTPException(
            status_code=404,
            detail="Health metrics not found. Complete onboarding first.",
        )

    return {
        "user_id": metric.user_id,
        "height_cm": metric.height_cm,
        "weight_kg": metric.weight_kg,
        "bmi": metric.bmi,
        "bmi_category": metric.bmi_category,
        "bmr": metric.bmr,
        "maintenance_calories": metric.maintenance_calories,
        "target_calories": metric.target_calories,
        "protein_target_g": metric.protein_target_g,
        "carbs_target_g": metric.carbs_target_g,
        "fat_target_g": metric.fat_target_g,
        "health_goal": metric.health_goal,
        "activity_level": metric.activity_level,
        "dietary_preference": metric.dietary_preference,
        "allergies": metric.allergies,
        "ideal_weight_kg": metric.ideal_weight_kg,
        "weight_to_goal_kg": metric.weight_to_goal_kg,
        "estimated_weeks_to_goal": metric.estimated_weeks_to_goal,
        "calorie_deficit_surplus": metric.calorie_deficit_surplus,
        "calculated_at": str(metric.calculated_at),
    }


# ─── GET TODAY'S LOG ─────────────────────────────
@router.get("/daily-log/today")
def get_today_log(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    today = date.today()
    log = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == current_user.id, DailyLog.log_date == today)
        .first()
    )

    metric = (
        db.query(HealthMetric).filter(HealthMetric.user_id == current_user.id).first()
    )

    if not log:
        return {
            "log_date": str(today),
            "calories_consumed": 0,
            "calorie_target": metric.target_calories if metric else 2000,
            "protein_consumed_g": 0,
            "carbs_consumed_g": 0,
            "fat_consumed_g": 0,
            "meals_count": 0,
            "calorie_goal_met": False,
            "wellness_score": 0,
            "streak_day": 0,
        }

    return {
        "log_date": str(log.log_date),
        "calories_consumed": log.calories_consumed,
        "calorie_target": log.calorie_target,
        "protein_consumed_g": log.protein_consumed_g,
        "carbs_consumed_g": log.carbs_consumed_g,
        "fat_consumed_g": log.fat_consumed_g,
        "meals_count": log.meals_count,
        "calorie_goal_met": log.calorie_goal_met,
        "wellness_score": log.wellness_score,
        "streak_day": log.streak_day,
        "notes": log.notes,
    }


# ─── GET LOG HISTORY (last 30 days) ──────────────
@router.get("/daily-log/history")
def get_log_history(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    logs = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == current_user.id)
        .order_by(DailyLog.log_date.desc())
        .limit(30)
        .all()
    )

    return [
        {
            "log_date": str(l.log_date),
            "calories_consumed": l.calories_consumed,
            "calorie_target": l.calorie_target,
            "wellness_score": l.wellness_score,
            "calorie_goal_met": l.calorie_goal_met,
            "streak_day": l.streak_day,
        }
        for l in logs
    ]


# ─── SYNC TODAY'S LOG FROM ORDERS ────────────────
@router.post("/daily-log/sync")
def sync_daily_log(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Syncs today's orders into the daily log.
    Call this after placing an order or once per day.
    """
    today = date.today()
    metric = (
        db.query(HealthMetric).filter(HealthMetric.user_id == current_user.id).first()
    )

    target_cal = metric.target_calories if metric else 2000
    protein_t = metric.protein_target_g if metric else 0
    carbs_t = metric.carbs_target_g if metric else 0
    fat_t = metric.fat_target_g if metric else 0

    # Get today's orders
    orders = (
        db.query(Order)
        .filter(
            Order.user_id == current_user.id,
            Order.created_at >= datetime.combine(today, datetime.min.time()),
            Order.status != "cancelled",
        )
        .all()
    )

    total_cal = 0
    total_protein = 0.0
    total_carbs = 0.0
    total_fat = 0.0
    meals_count = len(orders)

    for o in orders:
        meal = db.query(Meal).filter(Meal.id == o.meal_id).first()
        if meal:
            total_cal += meal.calories * o.quantity
            # Estimate macros from calories if not stored
            total_protein += (meal.calories * 0.30 / 4) * o.quantity
            total_carbs += (meal.calories * 0.40 / 4) * o.quantity
            total_fat += (meal.calories * 0.30 / 9) * o.quantity

    # Calculate goal achievement
    goal_met = abs(total_cal - target_cal) / max(target_cal, 1) <= 0.1
    wellness = calculate_wellness_score(total_cal, target_cal, meals_count)

    # Get previous day streak
    from datetime import timedelta

    yesterday = today - timedelta(days=1)
    prev_log = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == current_user.id, DailyLog.log_date == yesterday)
        .first()
    )
    streak = (
        (prev_log.streak_day + 1)
        if (prev_log and prev_log.calorie_goal_met)
        else (1 if goal_met else 0)
    )

    # Upsert daily log
    log = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == current_user.id, DailyLog.log_date == today)
        .first()
    )

    if log:
        log.calories_consumed = total_cal
        log.protein_consumed_g = round(total_protein, 1)
        log.carbs_consumed_g = round(total_carbs, 1)
        log.fat_consumed_g = round(total_fat, 1)
        log.meals_count = meals_count
        log.calorie_goal_met = goal_met
        log.wellness_score = wellness
        log.streak_day = streak
        log.calorie_target = target_cal
    else:
        log = DailyLog(
            user_id=current_user.id,
            log_date=today,
            calories_consumed=total_cal,
            protein_consumed_g=round(total_protein, 1),
            carbs_consumed_g=round(total_carbs, 1),
            fat_consumed_g=round(total_fat, 1),
            meals_count=meals_count,
            calorie_goal_met=goal_met,
            wellness_score=wellness,
            streak_day=streak,
            calorie_target=target_cal,
            protein_target_g=protein_t,
            carbs_target_g=carbs_t,
            fat_target_g=fat_t,
        )
        db.add(log)

    db.commit()

    return {
        "message": "Daily log synced!",
        "calories_consumed": total_cal,
        "calorie_target": target_cal,
        "wellness_score": wellness,
        "calorie_goal_met": goal_met,
        "streak_day": streak,
    }


# ─── GET PROGRESS SUMMARY (for AI) ───────────────
@router.get("/progress")
def get_progress_summary(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Full user health snapshot for AI recommendation engine.
    """
    metric = (
        db.query(HealthMetric).filter(HealthMetric.user_id == current_user.id).first()
    )

    if not metric:
        raise HTTPException(status_code=404, detail="Complete onboarding first")

    # Get last 7 days logs
    logs = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == current_user.id)
        .order_by(DailyLog.log_date.desc())
        .limit(7)
        .all()
    )

    avg_calories = sum(l.calories_consumed for l in logs) / max(len(logs), 1)
    avg_wellness = sum(l.wellness_score for l in logs) / max(len(logs), 1)
    days_on_track = sum(1 for l in logs if l.calorie_goal_met)
    current_streak = logs[0].streak_day if logs else 0

    return {
        "user_id": metric.user_id,
        "bmi": metric.bmi,
        "bmi_category": metric.bmi_category,
        "health_goal": metric.health_goal,
        "target_calories": metric.target_calories,
        "maintenance_calories": metric.maintenance_calories,
        "calorie_deficit_surplus": metric.calorie_deficit_surplus,
        "protein_target_g": metric.protein_target_g,
        "carbs_target_g": metric.carbs_target_g,
        "fat_target_g": metric.fat_target_g,
        "ideal_weight_kg": metric.ideal_weight_kg,
        "weight_to_goal_kg": metric.weight_to_goal_kg,
        "estimated_weeks_to_goal": metric.estimated_weeks_to_goal,
        "dietary_preference": metric.dietary_preference,
        "allergies": metric.allergies,
        "avg_calories_7d": round(avg_calories),
        "avg_wellness_score_7d": round(avg_wellness),
        "days_on_track_7d": days_on_track,
        "current_streak": current_streak,
    }
