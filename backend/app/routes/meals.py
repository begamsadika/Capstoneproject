from fastapi import APIRouter, Depends, HTTPException, Form, UploadFile, File
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
import os, shutil, uuid
from ..database import get_db
from ..models.meal import Meal
from ..models.order import Order
from ..models.meal_rating import MealRating
from ..models.vendor_profile import VendorProfile
from ..models.user import User
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/vendor/meals", tags=["Meals"])

UPLOAD_DIR = "uploads/meals"
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_MB = 5

os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── HELPER: get vendor profile ──────────────────
def get_vendor_profile(current_user: User, db: Session) -> VendorProfile:
    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    return profile


def meal_to_dict(m: Meal, base_url: str = "http://localhost:8000") -> dict:
    image_url = (
        f"{base_url}/uploads/meals/{m.image_filename}" if m.image_filename else ""
    )
    return {
        "id": m.id,
        "name": m.name,
        "category": m.category,
        "calories": m.calories,
        "dietary": m.dietary,
        "price": m.price,
        "available": m.available,
        "description": m.description or "",
        "image_url": image_url,
    }


def save_image(file: UploadFile) -> str:
    """Save uploaded image, return filename."""
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400, detail="Only JPEG, PNG, or WebP images allowed"
        )
    content = file.file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400, detail=f"Image must be under {MAX_SIZE_MB}MB"
        )
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(UPLOAD_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)
    return filename


def delete_image(filename: Optional[str]):
    """Delete old image file from disk."""
    if filename:
        path = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(path):
            os.remove(path)


# ─── GET ALL MEALS ────────────────────────────────
@router.get("/")
def get_meals(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    meals = (
        db.query(Meal)
        .filter(Meal.vendor_id == profile.id)
        .order_by(Meal.created_at.desc())
        .all()
    )
    return [meal_to_dict(m) for m in meals]


# ─── ADD MEAL (multipart/form-data) ──────────────
@router.post("/")
def add_meal(
    name: str = Form(...),
    category: str = Form(...),
    calories: int = Form(...),
    dietary: str = Form(...),
    price: float = Form(...),
    available: bool = Form(True),
    description: str = Form(""),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_vendor_profile(current_user, db)
    filename = save_image(image) if (image and image.filename) else None

    meal = Meal(
        vendor_id=profile.id,
        name=name,
        category=category,
        calories=calories,
        dietary=dietary,
        price=price,
        available=available,
        description=description,
        image_filename=filename,
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal_to_dict(meal)


# ─── UPDATE MEAL (multipart/form-data) ───────────
@router.put("/{meal_id}")
def update_meal(
    meal_id: int,
    name: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    calories: Optional[int] = Form(None),
    dietary: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    available: Optional[bool] = Form(None),
    description: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_vendor_profile(current_user, db)
    meal = (
        db.query(Meal).filter(Meal.id == meal_id, Meal.vendor_id == profile.id).first()
    )
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")

    if name is not None:
        meal.name = name
    if category is not None:
        meal.category = category
    if calories is not None:
        meal.calories = calories
    if dietary is not None:
        meal.dietary = dietary
    if price is not None:
        meal.price = price
    if available is not None:
        meal.available = available
    if description is not None:
        meal.description = description

    # Replace image if new one uploaded
    if image and image.filename:
        delete_image(meal.image_filename)
        meal.image_filename = save_image(image)

    db.commit()
    db.refresh(meal)
    return meal_to_dict(meal)


# ─── DELETE MEAL ──────────────────────────────────
@router.delete("/{meal_id}")
def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = get_vendor_profile(current_user, db)
    meal = (
        db.query(Meal).filter(Meal.id == meal_id, Meal.vendor_id == profile.id).first()
    )
    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")

    delete_image(meal.image_filename)
    db.delete(meal)
    db.commit()
    return {"message": "Meal deleted successfully!"}


# ─── GET STATS ────────────────────────────────────
@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    total_meals = db.query(Meal).filter(Meal.vendor_id == profile.id).count()

    orders = (
        db.query(Order)
        .filter(Order.vendor_id == profile.id, Order.status != "cancelled")
        .all()
    )

    total_revenue = round(sum(o.total_price for o in orders), 2)
    total_orders = len(orders)

    avg_rating = (
        db.query(func.avg(MealRating.rating))
        .filter(MealRating.vendor_id == profile.id)
        .scalar()
    )

    top_meals = (
        db.query(
            Meal.id,
            Meal.name,
            Meal.category,
            Meal.price,
            func.sum(Order.quantity).label("total_sold"),
            func.sum(Order.total_price).label("revenue"),
        )
        .join(Order, Order.meal_id == Meal.id)
        .filter(Order.vendor_id == profile.id, Order.status != "cancelled")
        .group_by(Meal.id, Meal.name, Meal.category, Meal.price)
        .order_by(func.sum(Order.quantity).desc())
        .limit(5)
        .all()
    )

    from datetime import date, timedelta

    today = date.today()
    weekly = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_orders = (
            db.query(Order)
            .filter(
                Order.vendor_id == profile.id,
                Order.created_at >= f"{day} 00:00:00",
                Order.created_at <= f"{day} 23:59:59",
                Order.status != "cancelled",
            )
            .all()
        )
        weekly.append(
            {
                "label": day.strftime("%a"),
                "date": str(day),
                "revenue": round(sum(o.total_price for o in day_orders), 2),
                "orders": len(day_orders),
            }
        )

    return {
        "total_meals": total_meals,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "avg_rating": round(float(avg_rating), 1) if avg_rating else 0.0,
        "top_meals": [
            {
                "id": r.id,
                "name": r.name,
                "category": r.category,
                "price": r.price,
                "total_sold": int(r.total_sold),
                "revenue": round(float(r.revenue), 2),
            }
            for r in top_meals
        ],
        "weekly_revenue": weekly,
    }
