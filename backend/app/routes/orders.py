from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
from ..database import get_db
from ..models.order import Order
from ..models.meal import Meal
from ..models.user import User
from ..models.vendor_profile import VendorProfile
from ..models.meal_rating import MealRating
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/orders", tags=["Orders"])


# ─── SCHEMAS ─────────────────────────────────────
class OrderItem(BaseModel):
    meal_id: int
    quantity: int


class PlaceOrderRequest(BaseModel):
    items: List[OrderItem]


class UpdateOrderStatus(BaseModel):
    status: str  # pending / confirmed / delivered / cancelled


# ─── GET ALL PUBLIC MEALS ─────────────────────────
@router.get("/meals")
def get_public_meals(db: Session = Depends(get_db)):
    meals = db.query(Meal).filter(Meal.available == True).all()
    return [
        {
            "id": m.id,
            "name": m.name,
            "category": m.category,
            "calories": m.calories,
            "dietary": m.dietary,
            "price": m.price,
            "vendor_id": m.vendor_id,
            "description": getattr(m, "description", "") or "",
            "image_url": getattr(m, "image_url", "") or "",
        }
        for m in meals
    ]


# ─── PLACE ORDER ─────────────────────────────────
@router.post("/")
def place_order(
    data: PlaceOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not data.items:
        raise HTTPException(status_code=400, detail="No items in order")

    orders = []
    for item in data.items:
        meal = db.query(Meal).filter(Meal.id == item.meal_id).first()
        if not meal:
            raise HTTPException(
                status_code=404, detail=f"Meal {item.meal_id} not found"
            )
        if not meal.available:
            raise HTTPException(status_code=400, detail=f"{meal.name} is not available")

        order = Order(
            user_id=current_user.id,
            meal_id=meal.id,
            vendor_id=meal.vendor_id,
            quantity=item.quantity,
            unit_price=meal.price,
            total_price=meal.price * item.quantity,
            status="pending",
        )
        db.add(order)
        orders.append(order)

    db.commit()
    return {
        "message": "Order placed successfully!",
        "order_count": len(orders),
        "total": sum(o.total_price for o in orders),
    }


# ─── GET USER ORDERS (with meal name) ────────────
@router.get("/my-orders")
def get_my_orders(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
        .all()
    )

    result = []
    for o in orders:
        meal = db.query(Meal).filter(Meal.id == o.meal_id).first()
        result.append(
            {
                "id": o.id,
                "meal_id": o.meal_id,
                "meal_name": meal.name if meal else "Unknown",
                "meal_image": getattr(meal, "image_url", "") if meal else "",
                "quantity": o.quantity,
                "unit_price": o.unit_price,
                "total_price": o.total_price,
                "status": o.status,
                "created_at": str(o.created_at),
            }
        )
    return result


# ─── CANCEL ORDER (user) ─────────────────────────
@router.put("/{order_id}/cancel")
def cancel_order(
    order_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == current_user.id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "pending":
        raise HTTPException(
            status_code=400, detail="Only pending orders can be cancelled"
        )

    order.status = "cancelled"
    db.commit()
    return {"message": "Order cancelled successfully"}


# ─── TODAY SUMMARY (for wellness page) ───────────
@router.get("/today-summary")
def get_today_summary(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    today = date.today()
    orders = (
        db.query(Order)
        .filter(
            Order.user_id == current_user.id,
            Order.created_at >= datetime.combine(today, datetime.min.time()),
            Order.status != "cancelled",
        )
        .all()
    )

    total_calories = 0
    meal_log = []

    for o in orders:
        meal = db.query(Meal).filter(Meal.id == o.meal_id).first()
        if meal:
            calories = meal.calories * o.quantity
            total_calories += calories
            meal_log.append(
                {
                    "name": meal.name,
                    "calories": calories,
                    "quantity": o.quantity,
                    "category": meal.category,
                    "time": o.created_at.strftime("%I:%M %p"),
                    "image_url": getattr(meal, "image_url", "") or "",
                }
            )

    return {
        "total_calories": total_calories,
        "meal_log": meal_log,
        "order_count": len(orders),
    }


# ════════════════════════════════════════════════
# VENDOR ORDER MANAGEMENT
# ════════════════════════════════════════════════


# ─── GET VENDOR ORDERS ────────────────────────────
@router.get("/vendor/all")
def get_vendor_orders(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.user_type != "vendor":
        raise HTTPException(status_code=403, detail="Not a vendor account")

    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor profile not found")

    query = db.query(Order).filter(Order.vendor_id == profile.id)
    if status:
        query = query.filter(Order.status == status)

    orders = query.order_by(Order.created_at.desc()).all()

    result = []
    for o in orders:
        meal = db.query(Meal).filter(Meal.id == o.meal_id).first()
        user = db.query(User).filter(User.id == o.user_id).first()
        result.append(
            {
                "id": o.id,
                "meal_id": o.meal_id,
                "meal_name": meal.name if meal else "Unknown",
                "meal_image": getattr(meal, "image_url", "") if meal else "",
                "customer_name": user.name if user else "Unknown",
                "customer_email": user.email if user else "",
                "quantity": o.quantity,
                "unit_price": o.unit_price,
                "total_price": o.total_price,
                "status": o.status,
                "created_at": str(o.created_at),
            }
        )
    return result


# ─── UPDATE ORDER STATUS (vendor) ────────────────
@router.put("/vendor/{order_id}/status")
def update_order_status(
    order_id: int,
    data: UpdateOrderStatus,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.user_type != "vendor":
        raise HTTPException(status_code=403, detail="Not a vendor account")

    allowed = ["pending", "confirmed", "delivered", "cancelled"]
    if data.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {allowed}")

    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )

    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.vendor_id == profile.id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.status = data.status
    db.commit()

    return {"message": f"Order status updated to {data.status}"}


# ─── VENDOR ORDER STATS ───────────────────────────
@router.get("/vendor/stats")
def get_vendor_order_stats(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if current_user.user_type != "vendor":
        raise HTTPException(status_code=403, detail="Not a vendor account")

    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )
    if not profile:
        return {"total_orders": 0, "total_revenue": 0, "pending": 0, "delivered": 0}

    orders = (
        db.query(Order)
        .filter(Order.vendor_id == profile.id, Order.status != "cancelled")
        .all()
    )

    total_revenue = sum(o.total_price for o in orders)
    pending = sum(1 for o in orders if o.status == "pending")
    confirmed = sum(1 for o in orders if o.status == "confirmed")
    delivered = sum(1 for o in orders if o.status == "delivered")

    return {
        "total_orders": len(orders),
        "total_revenue": round(total_revenue, 2),
        "pending": pending,
        "confirmed": confirmed,
        "delivered": delivered,
    }


class SubmitRatingRequest(BaseModel):
    order_id: int
    rating: int  # 1-5
    review: Optional[str] = None


# ─── SUBMIT RATING (user) ────────────────────────
@router.post("/rate")
def submit_rating(
    data: SubmitRatingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not 1 <= data.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be 1-5")

    order = (
        db.query(Order)
        .filter(Order.id == data.order_id, Order.user_id == current_user.id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "delivered":
        raise HTTPException(status_code=400, detail="Can only rate delivered orders")

    existing = db.query(MealRating).filter(MealRating.order_id == data.order_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already rated this order")

    rating = MealRating(
        order_id=data.order_id,
        meal_id=order.meal_id,
        user_id=current_user.id,
        vendor_id=order.vendor_id,
        rating=data.rating,
        review=data.review,
    )
    db.add(rating)
    db.commit()

    return {"message": "Rating submitted! Thank you."}


# ─── GET VENDOR RATINGS ───────────────────────────
@router.get("/vendor/ratings")
def get_vendor_ratings(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if current_user.user_type != "vendor":
        raise HTTPException(status_code=403, detail="Not a vendor account")

    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )

    ratings = (
        db.query(MealRating)
        .filter(MealRating.vendor_id == profile.id)
        .order_by(MealRating.created_at.desc())
        .all()
    )

    result = []
    for r in ratings:
        meal = db.query(Meal).filter(Meal.id == r.meal_id).first()
        user = db.query(User).filter(User.id == r.user_id).first()
        result.append(
            {
                "id": r.id,
                "meal_name": meal.name if meal else "Unknown",
                "customer_name": user.name if user else "Unknown",
                "rating": r.rating,
                "review": r.review or "",
                "created_at": str(r.created_at),
            }
        )

    avg = sum(r["rating"] for r in result) / max(len(result), 1)
    return {
        "ratings": result,
        "avg_rating": round(avg, 1),
        "total": len(result),
    }
