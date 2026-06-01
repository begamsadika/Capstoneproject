from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime, timedelta

from ..database import get_db
from ..models.health_metric import HealthMetric
from ..models.daily_log import DailyLog
from ..models.order import Order
from ..models.meal import Meal
from ..models.user import User
from ..core.auth import get_current_user
from ..services.ai_recommender import get_ai_recommendations

router = APIRouter(prefix="/api/ai", tags=["AI Recommendations"])


class AskAIRequest(BaseModel):
    message: Optional[str] = None


def _get_health_metric(user_id: int, db: Session) -> dict:
    m = db.query(HealthMetric).filter(HealthMetric.user_id == user_id).first()
    if not m:
        return {}
    return {
        "bmi": m.bmi,
        "bmi_category": m.bmi_category,
        "health_goal": m.health_goal,
        "target_calories": m.target_calories,
        "maintenance_calories": m.maintenance_calories,
        "protein_target_g": m.protein_target_g,
        "carbs_target_g": m.carbs_target_g,
        "fat_target_g": m.fat_target_g,
        "dietary_preference": m.dietary_preference or "",
        "allergies": m.allergies or "",
        "activity_level": m.activity_level or "moderate",
        "estimated_weeks_to_goal": m.estimated_weeks_to_goal,
        "weight_to_goal_kg": m.weight_to_goal_kg,
    }


def _get_today_log(user_id: int, db: Session) -> dict:
    today = date.today()
    log = (
        db.query(DailyLog)
        .filter(DailyLog.user_id == user_id, DailyLog.log_date == today)
        .first()
    )
    if not log:
        metric = db.query(HealthMetric).filter(HealthMetric.user_id == user_id).first()
        return {
            "calories_consumed": 0,
            "calorie_target": metric.target_calories if metric else 2000,
            "wellness_score": 0,
        }
    return {
        "calories_consumed": log.calories_consumed,
        "calorie_target": log.calorie_target,
        "protein_consumed_g": log.protein_consumed_g,
        "carbs_consumed_g": log.carbs_consumed_g,
        "fat_consumed_g": log.fat_consumed_g,
        "wellness_score": log.wellness_score,
        "meals_count": log.meals_count,
    }


def _get_recent_orders(user_id: int, db: Session) -> list:
    week_ago = datetime.utcnow() - timedelta(days=7)
    orders = (
        db.query(Order)
        .filter(
            Order.user_id == user_id,
            Order.created_at >= week_ago,
            Order.status != "cancelled",
        )
        .order_by(Order.created_at.desc())
        .limit(10)
        .all()
    )

    result = []
    for o in orders:
        meal = db.query(Meal).filter(Meal.id == o.meal_id).first()
        if meal:
            result.append(
                {
                    "meal_id": meal.id,
                    "meal_name": meal.name,
                    "calories": meal.calories,
                    "dietary": meal.dietary,
                }
            )
    return result


def _get_available_meals(db: Session) -> list:
    meals = db.query(Meal).filter(Meal.available == True).all()
    return [
        {
            "id": m.id,
            "name": m.name,
            "category": m.category,
            "calories": m.calories,
            "dietary": m.dietary,
            "price": m.price,
            "available": m.available,
            "image_url": (
                f"http://localhost:8000/uploads/meals/{m.image_filename}"
                if m.image_filename
                else ""
            ),
        }
        for m in meals
    ]


# ─── GET AI RECOMMENDATIONS ───────────────────────
@router.get("/recommendations")
def get_recommendations(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """
    Returns personalized meal recommendations powered by Claude AI.
    Uses user's health metrics, today's intake, and available meals.
    """
    health_metric = _get_health_metric(current_user.id, db)
    if not health_metric:
        raise HTTPException(
            status_code=404,
            detail="Health profile not found. Please complete onboarding first.",
        )

    today_log = _get_today_log(current_user.id, db)
    recent_orders = _get_recent_orders(current_user.id, db)
    available_meals = _get_available_meals(db)

    if not available_meals:
        raise HTTPException(
            status_code=404, detail="No meals available from vendors right now."
        )

    try:
        result = get_ai_recommendations(
            health_metric=health_metric,
            today_log=today_log,
            recent_orders=recent_orders,
            available_meals=available_meals,
        )

        # Enrich with full meal data from DB
        meal_map = {m["id"]: m for m in available_meals}
        enriched = []
        for rec in result.get("recommendations", []):
            meal_data = meal_map.get(rec["meal_id"], {})
            enriched.append(
                {
                    **rec,
                    "image_url": meal_data.get("image_url", ""),
                    "price": meal_data.get("price", 0),
                    "category": meal_data.get("category", ""),
                }
            )
        result["recommendations"] = enriched
        return result

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"AI recommendation failed: {str(e)}"
        )


# ─── ASK AI (custom message) ──────────────────────
@router.post("/ask")
def ask_ai(
    body: AskAIRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    User can ask a custom question like
    'What should I eat for dinner?' or 'I want something light'.
    """
    health_metric = _get_health_metric(current_user.id, db)
    if not health_metric:
        raise HTTPException(status_code=404, detail="Complete onboarding first.")

    today_log = _get_today_log(current_user.id, db)
    recent_orders = _get_recent_orders(current_user.id, db)
    available_meals = _get_available_meals(db)

    try:
        result = get_ai_recommendations(
            health_metric=health_metric,
            today_log=today_log,
            recent_orders=recent_orders,
            available_meals=available_meals,
            user_message=body.message,
        )
        meal_map = {m["id"]: m for m in available_meals}
        enriched = []
        for rec in result.get("recommendations", []):
            meal_data = meal_map.get(rec["meal_id"], {})
            enriched.append(
                {
                    **rec,
                    "image_url": meal_data.get("image_url", ""),
                    "price": meal_data.get("price", 0),
                    "category": meal_data.get("category", ""),
                }
            )
        result["recommendations"] = enriched
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI failed: {str(e)}")
