from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user_profile import UserProfile
from ..models.user import User
from ..core.auth import get_current_user
from pydantic import BaseModel
from typing import Optional
from ..models.health_metric import HealthMetric
from ..models.daily_log import DailyLog
from ..services.health_calculator import build_health_metrics


router = APIRouter(prefix="/api/users", tags=["Users"])


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    health_goal: Optional[str] = None
    dietary_preferences: Optional[str] = None
    allergies: Optional[str] = None


# ─── HELPER: calculate BMI ────────────────────────
def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    if height_cm <= 0:
        return 0.0
    height_m = height_cm / 100
    return round(weight_kg / (height_m**2), 1)


def bmi_category(bmi: float) -> str:
    if bmi < 18.5:
        return "Underweight"
    if bmi < 25.0:
        return "Normal weight"
    if bmi < 30.0:
        return "Overweight"
    return "Obese"


def calorie_goal(health_goal: str) -> int:
    if health_goal == "lose":
        return 1500
    if health_goal == "gain":
        return 2500
    return 2000  # maintain


# ─── SUBMIT USER ONBOARDING ───────────────────────
@router.post("/onboarding")
def user_onboarding(
    gender: str = Form(...),
    height: str = Form(...),
    weight: str = Form(...),
    healthGoal: str = Form(...),
    dietaryPreferences: str = Form(""),
    allergies: str = Form(""),
    activityLevel: str = Form("moderate"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.user_type != "general":
        raise HTTPException(status_code=403, detail="Not a general user account")

    height_val = float(height)
    weight_val = float(weight)

    # Save/update UserProfile
    from ..models.user_profile import UserProfile

    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )

    if profile:
        profile.gender = gender
        profile.height = height_val
        profile.weight = weight_val
        profile.health_goal = healthGoal
        profile.dietary_preferences = dietaryPreferences
        profile.allergies = allergies
    else:
        profile = UserProfile(
            user_id=current_user.id,
            gender=gender,
            height=height_val,
            weight=weight_val,
            health_goal=healthGoal,
            dietary_preferences=dietaryPreferences,
            allergies=allergies,
        )
        db.add(profile)

    db.commit()

    # ✅ Calculate and save health metrics
    metrics_data = build_health_metrics(
        user_id=current_user.id,
        gender=gender,
        height_cm=height_val,
        weight_kg=weight_val,
        health_goal=healthGoal,
        activity_level=activityLevel,
        age=30,  # default age
        dietary_pref=dietaryPreferences,
        allergies=allergies,
    )

    existing_metric = (
        db.query(HealthMetric).filter(HealthMetric.user_id == current_user.id).first()
    )

    if existing_metric:
        for key, val in metrics_data.items():
            setattr(existing_metric, key, val)
    else:
        metric = HealthMetric(**metrics_data)
        db.add(metric)

    db.commit()

    return {
        "message": "Onboarding completed!",
        "bmi": metrics_data["bmi"],
        "bmi_category": metrics_data["bmi_category"],
        "calorie_goal": metrics_data["target_calories"],
        "maintenance_calories": metrics_data["maintenance_calories"],
        "protein_target_g": metrics_data["protein_target_g"],
        "carbs_target_g": metrics_data["carbs_target_g"],
        "fat_target_g": metrics_data["fat_target_g"],
    }


# ─── GET USER PROFILE ─────────────────────────────
@router.get("/profile")
def get_user_profile(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )

    if not profile:
        return {
            "name": current_user.name,
            "email": current_user.email,
            "onboarding_done": False,
            "bmi": None,
            "bmi_category": None,
            "calorie_goal": 2000,
            "health_goal": None,
            "dietary_preferences": None,
            "allergies": None,
        }

    bmi = calculate_bmi(profile.height, profile.weight)

    return {
        "name": current_user.name,
        "email": current_user.email,
        "onboarding_done": True,
        "gender": profile.gender,
        "height": profile.height,
        "weight": profile.weight,
        "bmi": bmi,
        "bmi_category": bmi_category(bmi),
        "calorie_goal": calorie_goal(profile.health_goal),
        "health_goal": profile.health_goal,
        "dietary_preferences": profile.dietary_preferences,
        "allergies": profile.allergies,
    }


# ─── GET CURRENT USER (me) ────────────────────────
@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "user_type": current_user.user_type,
        "partner_type": current_user.partner_type,
        "organization_name": current_user.organization_name,
        "tin_number": current_user.tin_number,
        "company_registration_number": current_user.company_registration_number,
        "address": current_user.address,
        "registration_status": current_user.registration_status,
        "approval_date": str(current_user.approval_date) if current_user.approval_date else None,
        "is_active": current_user.is_active,
        "created_at": str(current_user.created_at),
    }


# ─── UPDATE USER PROFILE ──────────────────────────
@router.put("/profile")
def update_user_profile(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Update user name/phone
    if data.name:
        current_user.name = data.name
    if data.phone:
        current_user.phone = data.phone
    db.commit()

    # Update health profile
    profile = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )

    if profile:
        if data.gender is not None:
            profile.gender = data.gender
        if data.height is not None:
            profile.height = data.height
        if data.weight is not None:
            profile.weight = data.weight
        if data.health_goal is not None:
            profile.health_goal = data.health_goal
        if data.dietary_preferences is not None:
            profile.dietary_preferences = data.dietary_preferences
        if data.allergies is not None:
            profile.allergies = data.allergies
        db.commit()
        db.refresh(profile)

    return {"message": "Profile updated successfully!"}
