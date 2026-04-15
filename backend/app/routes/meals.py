from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from ..database import get_db
from ..models.meal import Meal
from ..models.vendor_profile import VendorProfile
from ..models.user import User
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/vendor/meals", tags=["Meals"])

# ─── SCHEMAS ─────────────────────────────────────
class MealCreate(BaseModel):
    name:      str
    category:  str
    calories:  int
    dietary:   str
    price:     float
    available: bool = True

class MealUpdate(BaseModel):
    name:      Optional[str] = None
    category:  Optional[str] = None
    calories:  Optional[int] = None
    dietary:   Optional[str] = None
    price:     Optional[float] = None
    available: Optional[bool] = None

# ─── HELPER: get vendor profile ──────────────────
def get_vendor_profile(current_user: User, db: Session) -> VendorProfile:
    profile = db.query(VendorProfile).filter(
        VendorProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    return profile

# ─── GET ALL MEALS ────────────────────────────────
@router.get("/")
def get_meals(
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    meals   = db.query(Meal).filter(Meal.vendor_id == profile.id).all()

    return [
        {
            "id":        m.id,
            "name":      m.name,
            "category":  m.category,
            "calories":  m.calories,
            "dietary":   m.dietary,
            "price":     m.price,
            "available": m.available,
        }
        for m in meals
    ]

# ─── ADD MEAL ─────────────────────────────────────
@router.post("/")
def add_meal(
    data: MealCreate,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)

    meal = Meal(
        vendor_id = profile.id,
        name      = data.name,
        category  = data.category,
        calories  = data.calories,
        dietary   = data.dietary,
        price     = data.price,
        available = data.available,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    return {
        "message": "Meal added successfully!",
        "meal": {
            "id":        meal.id,
            "name":      meal.name,
            "category":  meal.category,
            "calories":  meal.calories,
            "dietary":   meal.dietary,
            "price":     meal.price,
            "available": meal.available,
        }
    }

# ─── UPDATE MEAL ──────────────────────────────────
@router.put("/{meal_id}")
def update_meal(
    meal_id: int,
    data: MealUpdate,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    meal    = db.query(Meal).filter(
        Meal.id == meal_id,
        Meal.vendor_id == profile.id
    ).first()

    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")

    if data.name      is not None: meal.name      = data.name
    if data.category  is not None: meal.category  = data.category
    if data.calories  is not None: meal.calories  = data.calories
    if data.dietary   is not None: meal.dietary   = data.dietary
    if data.price     is not None: meal.price     = data.price
    if data.available is not None: meal.available = data.available

    db.commit()
    db.refresh(meal)

    return {"message": "Meal updated!", "meal": {
        "id":        meal.id,
        "name":      meal.name,
        "category":  meal.category,
        "calories":  meal.calories,
        "dietary":   meal.dietary,
        "price":     meal.price,
        "available": meal.available,
    }}

# ─── DELETE MEAL ──────────────────────────────────
@router.delete("/{meal_id}")
def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    meal    = db.query(Meal).filter(
        Meal.id == meal_id,
        Meal.vendor_id == profile.id
    ).first()

    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")

    db.delete(meal)
    db.commit()

    return {"message": "Meal deleted successfully!"}

# ─── GET STATS ────────────────────────────────────
@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db)
):
    profile    = get_vendor_profile(current_user, db)
    total_meals = db.query(Meal).filter(Meal.vendor_id == profile.id).count()

    return {
        "total_meals":   total_meals,
        "total_orders":  0,
        "total_revenue": 0.0,
        "rating":        0.0
    }