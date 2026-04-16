from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from ..database import get_db
from ..models.order import Order
from ..models.meal import Meal
from ..models.user import User
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/orders", tags=["Orders"])


class OrderItem(BaseModel):
    meal_id: int
    quantity: int


class PlaceOrderRequest(BaseModel):
    items: List[OrderItem]


# ─── GET ALL PUBLIC MEALS (for menu page) ────────
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
            "description": getattr(m, "description", ""),
            "image_url": getattr(m, "image_url", ""),
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


# ─── GET USER ORDERS ──────────────────────────────
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

    return [
        {
            "id": o.id,
            "meal_id": o.meal_id,
            "quantity": o.quantity,
            "total_price": o.total_price,
            "status": o.status,
            "created_at": str(o.created_at),
        }
        for o in orders
    ]
    

# ─── GET TODAY'S CALORIE SUMMARY ─────────────────
@router.get("/today-summary")
def get_today_summary(
    current_user: User = Depends(get_current_user),
    db: Session        = Depends(get_db)
):
    today = date.today()
    orders = db.query(Order).filter(
        Order.user_id   == current_user.id,
        Order.created_at >= today
    ).all()

    total_calories = 0
    meal_log = []

    for order in orders:
        meal = db.query(Meal).filter(Meal.id == order.meal_id).first()
        if meal:
            calories = meal.calories * order.quantity
            total_calories += calories
            meal_log.append({
                "name":      meal.name,
                "calories":  calories,
                "quantity":  order.quantity,
                "category":  meal.category,
                "time":      str(order.created_at.strftime("%I:%M %p")),
            })

    return {
        "total_calories": total_calories,
        "meal_log":       meal_log,
        "order_count":    len(orders),
    }
