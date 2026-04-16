from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.meal import Meal
from ..models.vendor_profile import VendorProfile
from ..models.user import User
from ..core.auth import get_current_user
import os
import shutil
import uuid

router = APIRouter(prefix="/api/vendor/meals", tags=["Meals"])

MEAL_UPLOAD_DIR = "uploads/meals"
os.makedirs(MEAL_UPLOAD_DIR, exist_ok=True)


def get_vendor_profile(current_user: User, db: Session) -> VendorProfile:
    profile = db.query(VendorProfile).filter(
        VendorProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor profile not found")
    return profile


def serialize_meal(meal: Meal):
    return {
        "id": meal.id,
        "name": meal.name,
        "category": meal.category,
        "calories": meal.calories,
        "dietary": meal.dietary,
        "price": meal.price,
        "available": meal.available,
        "description": meal.description,
        "image_url": meal.image_url,
    }


def parse_bool(value: str | None, default: bool = True) -> bool:
    if value is None:
        return default
    return value.lower() in {"true", "1", "yes", "on"}


def save_meal_image(image: UploadFile | None) -> str | None:
    if not image or not image.filename:
        return None

    allowed_types = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
    }
    if image.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only PNG, JPG, and WEBP meal images are allowed",
        )

    extension = allowed_types[image.content_type]
    filename = f"{uuid.uuid4()}.{extension}"
    filepath = os.path.join(MEAL_UPLOAD_DIR, filename)

    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(image.file, buffer)

    return f"/uploads/meals/{filename}"


@router.get("/")
def get_meals(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    meals = db.query(Meal).filter(Meal.vendor_id == profile.id).all()
    return [serialize_meal(m) for m in meals]


@router.post("/")
def add_meal(
    name: str = Form(...),
    category: str = Form(...),
    calories: int = Form(...),
    dietary: str = Form(...),
    price: float = Form(...),
    available: str = Form("true"),
    description: str = Form(""),
    image: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)

    meal = Meal(
        vendor_id=profile.id,
        name=name,
        category=category,
        calories=calories,
        dietary=dietary,
        price=price,
        available=parse_bool(available),
        description=description or None,
        image_url=save_meal_image(image),
    )
    db.add(meal)
    db.commit()
    db.refresh(meal)

    return {
        "message": "Meal added successfully!",
        "meal": serialize_meal(meal),
    }


@router.put("/{meal_id}")
def update_meal(
    meal_id: int,
    name: str | None = Form(None),
    category: str | None = Form(None),
    calories: int | None = Form(None),
    dietary: str | None = Form(None),
    price: float | None = Form(None),
    available: str | None = Form(None),
    description: str | None = Form(None),
    image: UploadFile | None = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    meal = db.query(Meal).filter(
        Meal.id == meal_id,
        Meal.vendor_id == profile.id
    ).first()

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
        meal.available = parse_bool(available, default=meal.available)
    if description is not None:
        meal.description = description or None

    new_image_url = save_meal_image(image)
    if new_image_url is not None:
        meal.image_url = new_image_url

    db.commit()
    db.refresh(meal)

    return {
        "message": "Meal updated!",
        "meal": serialize_meal(meal),
    }


@router.delete("/{meal_id}")
def delete_meal(
    meal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    meal = db.query(Meal).filter(
        Meal.id == meal_id,
        Meal.vendor_id == profile.id
    ).first()

    if not meal:
        raise HTTPException(status_code=404, detail="Meal not found")

    db.delete(meal)
    db.commit()

    return {"message": "Meal deleted successfully!"}


@router.get("/stats")
def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    profile = get_vendor_profile(current_user, db)
    total_meals = db.query(Meal).filter(Meal.vendor_id == profile.id).count()

    return {
        "total_meals": total_meals,
        "total_orders": 0,
        "total_revenue": 0.0,
        "rating": 0.0
    }
