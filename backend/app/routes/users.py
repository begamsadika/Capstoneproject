from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user_profile import UserProfile
from ..models.user import User
from ..core.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.user_type != "general":
        raise HTTPException(status_code=403, detail="Not a general user account")

    # Check already submitted
    existing = (
        db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    )

    height_val = float(height)
    weight_val = float(weight)

    if existing:
        # Update existing profile
        existing.gender = gender
        existing.height = height_val
        existing.weight = weight_val
        existing.health_goal = healthGoal
        existing.dietary_preferences = dietaryPreferences
        existing.allergies = allergies
        db.commit()
        db.refresh(existing)
        profile = existing
    else:
        # Create new profile
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
        db.refresh(profile)

    bmi = calculate_bmi(height_val, weight_val)

    return {
        "message": "Onboarding completed successfully!",
        "bmi": bmi,
        "bmi_category": bmi_category(bmi),
        "calorie_goal": calorie_goal(healthGoal),
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
        "user_type": current_user.user_type,
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
