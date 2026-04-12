from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from datetime import datetime
from ..database import get_db
from ..models.user_profile import UserProfile
from ..models.user import User
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/user", tags=["User"])


# ─── VENDOR ONBOARDING ───────────────────────────
@router.post("/onboarding")
def user_onboarding(
    gender: str = Form(...),
    height: float = Form(...),
    weight: float = Form(...),
    healthGoal: str = Form(...),
    dietaryPreferences: str = Form(None),
    allergies: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        # ─── 1. Check user type ─────────────────────────
        if current_user.user_type != "general":
            raise HTTPException(
                status_code=403,
                detail="Only general users can complete onboarding",
            )

        # ─── 2. Check if profile already exists ─────────
        existing_profile = (
            db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
        )

        if existing_profile:
            raise HTTPException(
                status_code=409,
                detail="User profile already exists",
            )

        # ─── 3. Validate input (basic validation) ───────
        if height <= 0 or weight <= 0:
            raise HTTPException(
                status_code=400,
                detail="Height and weight must be positive values",
            )

        # ─── 4. Create new profile ──────────────────────
        new_profile = UserProfile(
            user_id=current_user.id,
            gender=gender,
            height=height,
            weight=weight,
            health_goal=healthGoal,
            diet_preferance=dietaryPreferences,
            allergies=allergies,
            submitted_at=datetime.utcnow(),
        )

        # ─── 5. Save to database ────────────────────────
        db.add(new_profile)
        db.commit()
        db.refresh(new_profile)

        # ─── 6. Return response ─────────────────────────
        return {
            "message": "User onboarding completed successfully!",
            "profile": {
                "id": new_profile.id,
                "gender": new_profile.gender,
                "height": new_profile.height,
                "weight": new_profile.weight,
                "health_goal": new_profile.health_goal,
                "dietary_preferences": new_profile.diet_preferance,
                "allergies": new_profile.allergies,
                "submitted_at": str(new_profile.submitted_at),
            },
        }

    except HTTPException:
        raise

    except Exception as e:
        # ─── 7. Handle unexpected errors ────────────────
        raise HTTPException(
            status_code=500,
            detail=f"Something went wrong: {str(e)}",
        )
