from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date
from ..database import get_db
from ..models.health_metric import HealthMetric
from ..models.daily_log import DailyLog
from ..models.user import User
from ..core.auth import get_current_user
from ..services.health_calculator import build_health_metrics
from ..services.nutrition_log import rebuild_daily_log

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
        "medical_conditions": metric.medical_conditions,
        "medications": metric.medications,
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

    # Pull macro targets from HealthMetric (source of truth for targets)
    protein_target  = round(metric.protein_target_g, 1) if metric and metric.protein_target_g else 0.0
    carbs_target    = round(metric.carbs_target_g,   1) if metric and metric.carbs_target_g   else 0.0
    fat_target      = round(metric.fat_target_g,     1) if metric and metric.fat_target_g     else 0.0
    calorie_target  = metric.target_calories if metric else 2000

    if not log:
        return {
            "log_date": str(today),
            "calories_consumed": 0,
            "calorie_target": calorie_target,
            "protein_consumed_g": 0.0,
            "carbs_consumed_g": 0.0,
            "fat_consumed_g": 0.0,
            "protein_target_g": protein_target,
            "carbs_target_g": carbs_target,
            "fat_target_g": fat_target,
            "meals_count": 0,
            "calorie_goal_met": False,
            "wellness_score": 0,
            "streak_day": 0,
        }

    return {
        "log_date": str(log.log_date),
        "calories_consumed": log.calories_consumed,
        "calorie_target": log.calorie_target or calorie_target,
        "protein_consumed_g": log.protein_consumed_g,
        "carbs_consumed_g": log.carbs_consumed_g,
        "fat_consumed_g": log.fat_consumed_g,
        "protein_target_g": protein_target,
        "carbs_target_g": carbs_target,
        "fat_target_g": fat_target,
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
    """Rebuild today's aggregate from orders and reported food intake."""
    today = date.today()
    log = rebuild_daily_log(db, current_user.id, today)
    db.commit()

    return {
        "message": "Daily log synced!",
        "calories_consumed": log.calories_consumed,
        "calorie_target": log.calorie_target,
        "wellness_score": log.wellness_score,
        "calorie_goal_met": log.calorie_goal_met,
        "streak_day": log.streak_day,
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
        "medical_conditions": metric.medical_conditions,
        "medications": metric.medications,
        "avg_calories_7d": round(avg_calories),
        "avg_wellness_score_7d": round(avg_wellness),
        "days_on_track_7d": days_on_track,
        "current_streak": current_streak,
    }
