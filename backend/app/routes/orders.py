from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
import hashlib
import hmac
import json
import time
import urllib.parse
import urllib.request
import uuid
from ..database import get_db
from ..models.order import Order
from ..models.meal import Meal
from ..models.user import User
from ..models.vendor_profile import VendorProfile
from ..core.auth import get_current_user
from ..core.config import (
    FRONTEND_CANCEL_URL,
    FRONTEND_SUCCESS_URL,
    STRIPE_CURRENCY,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
)

router = APIRouter(prefix="/api/orders", tags=["Orders"])


# ─── SCHEMAS ─────────────────────────────────────
class OrderItem(BaseModel):
    meal_id: int
    quantity: int


class PlaceOrderRequest(BaseModel):
    items: List[OrderItem]
    delivery: Optional[dict] = None


class UpdateOrderStatus(BaseModel):
    status: str  # pending / confirmed / delivered / cancelled


class ManualOrderRequest(BaseModel):
    customer_email: str
    meal_id: int
    quantity: int = 1


class DeliveryDetails(BaseModel):
    recipient_name: str
    phone: str
    address: str
    city: str
    postal_code: str = ""
    notes: str = ""


class CreateCheckoutSessionRequest(BaseModel):
    items: List[OrderItem]
    delivery: DeliveryDetails


def safe_text(value: str, max_length: int) -> str:
    return (value or "").strip()[:max_length]


def get_vendor_status(db: Session, vendor_id: int) -> tuple[VendorProfile, User]:
    profile = db.query(VendorProfile).filter(VendorProfile.id == vendor_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor not found")
    owner = db.query(User).filter(User.id == profile.user_id).first()
    if not owner or not owner.is_active or owner.registration_status != "approved":
        raise HTTPException(status_code=400, detail=f"{profile.business_name} is not available for ordering")
    return profile, owner


def validate_order_items(items: List[OrderItem], db: Session):
    if not items:
        raise HTTPException(status_code=400, detail="No items in order")
    meals = db.query(Meal).filter(Meal.id.in_([item.meal_id for item in items])).all()
    meal_map = {meal.id: meal for meal in meals}
    validated = []
    vendor_id = None
    for item in items:
        if item.quantity <= 0 or item.quantity > 99:
            raise HTTPException(status_code=400, detail="Quantities must be between 1 and 99")
        meal = meal_map.get(item.meal_id)
        if not meal:
            raise HTTPException(status_code=404, detail=f"Meal {item.meal_id} not found")
        if not meal.available:
            raise HTTPException(status_code=400, detail=f"{meal.name} is not available")
        if vendor_id is None:
            vendor_id = meal.vendor_id
        elif meal.vendor_id != vendor_id:
            raise HTTPException(status_code=400, detail="All meals in one order must come from the same vendor")
        validated.append((meal, item.quantity))
    profile, _owner = get_vendor_status(db, vendor_id)
    return validated, profile


def order_to_dict(order: Order, db: Session):
    meal = db.query(Meal).filter(Meal.id == order.meal_id).first()
    vendor = db.query(VendorProfile).filter(VendorProfile.id == order.vendor_id).first()
    user = db.query(User).filter(User.id == order.user_id).first()
    return {
        "id": order.id,
        "meal_id": order.meal_id,
        "meal_name": meal.name if meal else "Unknown",
        "meal_image": getattr(meal, "image_url", "") if meal else "",
        "vendor_id": order.vendor_id,
        "vendor_name": vendor.business_name if vendor else "Unknown Vendor",
        "customer_name": user.name if user else "Unknown",
        "customer_email": user.email if user else "",
        "quantity": order.quantity,
        "unit_price": order.unit_price,
        "total_price": order.total_price,
        "status": order.status,
        "order_status": order.order_status,
        "payment_status": order.payment_status,
        "checkout_reference": order.checkout_reference,
        "recipient_name": order.recipient_name,
        "recipient_phone": order.recipient_phone,
        "delivery_address": order.delivery_address,
        "delivery_city": order.delivery_city,
        "delivery_postal_code": order.delivery_postal_code,
        "delivery_notes": order.delivery_notes,
        "created_at": str(order.created_at),
    }


def grouped_order_payload(orders: List[Order], db: Session):
    if not orders:
        raise HTTPException(status_code=404, detail="Order not found")
    first = orders[0]
    vendor = db.query(VendorProfile).filter(VendorProfile.id == first.vendor_id).first()
    return {
        "order_number": first.checkout_reference or str(first.id),
        "vendor_id": first.vendor_id,
        "vendor_name": vendor.business_name if vendor else "Unknown Vendor",
        "amount_paid": round(sum(order.total_price for order in orders), 2),
        "payment_status": first.payment_status,
        "order_status": first.order_status,
        "status": first.status,
        "items": [order_to_dict(order, db) for order in orders],
        "created_at": str(first.created_at),
    }


def fetch_stripe_session(session_id: str) -> dict:
    if not STRIPE_SECRET_KEY:
        return {}
    request = urllib.request.Request(
        f"https://api.stripe.com/v1/checkout/sessions/{urllib.parse.quote(session_id)}",
        headers={"Authorization": f"Bearer {STRIPE_SECRET_KEY}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return {}


def apply_stripe_session_status(orders: List[Order], session: dict, db: Session) -> None:
    if not orders or not session:
        return
    payment_status = session.get("payment_status")
    session_status = session.get("status")
    if payment_status == "paid":
        for order in orders:
            order.payment_status = "paid"
            order.order_status = "placed"
            order.status = "pending"
        db.commit()
    elif session_status in {"expired", "canceled"}:
        for order in orders:
            if order.payment_status != "paid":
                order.payment_status = "failed"
                order.order_status = "cancelled"
                order.status = "cancelled"
        db.commit()


# ─── GET ALL PUBLIC MEALS ─────────────────────────
@router.get("/meals")
def get_public_meals(db: Session = Depends(get_db)):
    rows = (
        db.query(Meal, VendorProfile, User)
        .join(VendorProfile, Meal.vendor_id == VendorProfile.id)
        .join(User, VendorProfile.user_id == User.id)
        .filter(User.is_active == True, User.registration_status == "approved")
        .all()
    )
    return [
        {
            "id": m.id,
            "name": m.name,
            "category": m.category,
            "calories": m.calories,
            "dietary": m.dietary,
            "price": m.price,
            "vendor_id": m.vendor_id,
            "vendor_name": vendor.business_name,
            "available": m.available,
            "description": getattr(m, "description", "") or "",
            "ingredients": getattr(m, "ingredients", "") or "",
            "image_url": getattr(m, "image_url", "") or "",
        }
        for m, vendor, _owner in rows
    ]


# ─── PLACE ORDER ─────────────────────────────────
@router.post("/")
def place_order(
    data: PlaceOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    validated, _profile = validate_order_items(data.items, db)
    delivery = data.delivery or {}
    delivery_name = safe_text(delivery.get("recipient_name", current_user.name), 100)
    delivery_phone = safe_text(delivery.get("phone", current_user.phone or ""), 30)
    delivery_address = safe_text(delivery.get("address", ""), 500)
    delivery_city = safe_text(delivery.get("city", ""), 100)
    delivery_postal_code = safe_text(delivery.get("postal_code", ""), 30)
    delivery_notes = safe_text(delivery.get("notes", ""), 500)
    if data.delivery and (not delivery_name or not delivery_phone or not delivery_address or not delivery_city):
        raise HTTPException(status_code=400, detail="Delivery name, phone, address, and city are required")
    orders = []
    checkout_reference = f"WO-{uuid.uuid4().hex[:10].upper()}"
    for meal, quantity in validated:
        order = Order(
            user_id=current_user.id,
            meal_id=meal.id,
            vendor_id=meal.vendor_id,
            quantity=quantity,
            unit_price=meal.price,
            total_price=meal.price * quantity,
            status="pending",
            order_status="placed",
            payment_status="paid",
            checkout_reference=checkout_reference,
            recipient_name=delivery_name,
            recipient_phone=delivery_phone,
            delivery_address=delivery_address,
            delivery_city=delivery_city,
            delivery_postal_code=delivery_postal_code,
            delivery_notes=delivery_notes,
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
@router.post("/checkout/create-session")
def create_checkout_session(
    data: CreateCheckoutSessionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.user_type not in ["general", "user"]:
        raise HTTPException(status_code=403, detail="Only users can place meal orders")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe test checkout is not configured")

    delivery_name = safe_text(data.delivery.recipient_name, 100)
    delivery_phone = safe_text(data.delivery.phone, 30)
    delivery_address = safe_text(data.delivery.address, 500)
    delivery_city = safe_text(data.delivery.city, 100)
    delivery_postal_code = safe_text(data.delivery.postal_code, 30)
    delivery_notes = safe_text(data.delivery.notes, 500)
    if not delivery_name or not delivery_phone or not delivery_address or not delivery_city:
        raise HTTPException(status_code=400, detail="Delivery name, phone, address, and city are required")

    validated, profile = validate_order_items(data.items, db)
    checkout_reference = f"WO-{uuid.uuid4().hex[:10].upper()}"
    orders = []
    for meal, quantity in validated:
        order = Order(
            user_id=current_user.id,
            meal_id=meal.id,
            vendor_id=meal.vendor_id,
            quantity=quantity,
            unit_price=meal.price,
            total_price=round(meal.price * quantity, 2),
            status="pending",
            order_status="pending_payment",
            payment_status="pending",
            checkout_reference=checkout_reference,
            recipient_name=delivery_name,
            recipient_phone=delivery_phone,
            delivery_address=delivery_address,
            delivery_city=delivery_city,
            delivery_postal_code=delivery_postal_code,
            delivery_notes=delivery_notes,
        )
        db.add(order)
        orders.append(order)
    db.commit()

    params = {
        "mode": "payment",
        "automatic_payment_methods[enabled]": "true",
        "success_url": f"{FRONTEND_SUCCESS_URL}?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": FRONTEND_CANCEL_URL,
        "client_reference_id": checkout_reference,
        "metadata[checkout_reference]": checkout_reference,
        "metadata[user_id]": str(current_user.id),
        "metadata[vendor_id]": str(profile.id),
    }
    for index, (meal, quantity) in enumerate(validated):
        params[f"line_items[{index}][quantity]"] = str(quantity)
        params[f"line_items[{index}][price_data][currency]"] = STRIPE_CURRENCY
        params[f"line_items[{index}][price_data][unit_amount]"] = str(int(round(meal.price * 100)))
        params[f"line_items[{index}][price_data][product_data][name]"] = meal.name

    stripe_request = urllib.request.Request(
        "https://api.stripe.com/v1/checkout/sessions",
        data=urllib.parse.urlencode(params).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {STRIPE_SECRET_KEY}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(stripe_request, timeout=20) as response:
            session = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        for order in orders:
            order.payment_status = "failed"
            order.order_status = "cancelled"
            order.status = "cancelled"
        db.commit()
        raise HTTPException(status_code=502, detail="Unable to start Stripe checkout. Please try again.") from exc

    session_id = session.get("id")
    checkout_url = session.get("url")
    if not session_id or not checkout_url:
        raise HTTPException(status_code=502, detail="Stripe checkout did not return a redirect URL")

    for order in orders:
        order.stripe_session_id = session_id
    db.commit()

    return {
        "checkout_url": checkout_url,
        "session_id": session_id,
        "checkout_reference": checkout_reference,
        "total": round(sum(order.total_price for order in orders), 2),
        "vendor_name": profile.business_name,
    }


def verify_stripe_signature(payload: bytes, signature_header: str | None) -> None:
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Stripe webhook is not configured")
    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing Stripe signature")

    parts = dict(item.split("=", 1) for item in signature_header.split(",") if "=" in item)
    timestamp = parts.get("t")
    signature = parts.get("v1")
    if not timestamp or not signature:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")
    try:
        timestamp_value = int(timestamp)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe signature") from exc
    if abs(time.time() - timestamp_value) > 300:
        raise HTTPException(status_code=400, detail="Expired Stripe signature")

    signed_payload = f"{timestamp}.{payload.decode('utf-8')}".encode("utf-8")
    expected = hmac.new(
        STRIPE_WEBHOOK_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")


@router.post("/checkout/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    verify_stripe_signature(payload, request.headers.get("stripe-signature"))
    event = json.loads(payload.decode("utf-8"))
    event_type = event.get("type")
    session = event.get("data", {}).get("object", {})
    session_id = session.get("id")
    checkout_reference = session.get("client_reference_id") or session.get("metadata", {}).get("checkout_reference")
    if not session_id and not checkout_reference:
        return {"received": True}

    query = db.query(Order)
    if session_id:
        query = query.filter(Order.stripe_session_id == session_id)
    else:
        query = query.filter(Order.checkout_reference == checkout_reference)
    orders = query.all()

    if event_type == "checkout.session.completed":
        for order in orders:
            order.payment_status = "paid"
            order.order_status = "placed"
            order.status = "pending"
    elif event_type in {"checkout.session.expired", "payment_intent.payment_failed"}:
        for order in orders:
            if order.payment_status != "paid":
                order.payment_status = "failed"
                order.order_status = "cancelled"
                order.status = "cancelled"
    db.commit()
    return {"received": True}


@router.get("/checkout/session/{session_id}")
def get_checkout_session_order(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .filter(Order.stripe_session_id == session_id, Order.user_id == current_user.id)
        .order_by(Order.created_at.asc())
        .all()
    )
    if orders and orders[0].payment_status == "pending":
        apply_stripe_session_status(orders, fetch_stripe_session(session_id), db)
    return grouped_order_payload(orders, db)


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

    return [order_to_dict(order, db) for order in orders]


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
            Order.payment_status == "paid",
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

    query = db.query(Order).filter(Order.vendor_id == profile.id, Order.payment_status == "paid")
    if status:
        query = query.filter(Order.status == status)

    orders = query.order_by(Order.created_at.desc()).all()

    return [order_to_dict(order, db) for order in orders]


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

    allowed = [
        "pending", "accepted", "confirmed",
        "preparing", "ready", "out_for_delivery",
        "delivered", "cancelled", "refunded",
    ]
    if data.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {allowed}")

    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )

    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.vendor_id == profile.id, Order.payment_status == "paid")
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
        return {
            "total_orders": 0, "total_revenue": 0,
            "pending": 0, "accepted": 0, "confirmed": 0,
            "preparing": 0, "ready": 0, "delivered": 0,
        }

    orders = (
        db.query(Order)
        .filter(
            Order.vendor_id == profile.id,
            Order.payment_status == "paid",
            Order.status.notin_(["cancelled", "refunded"]),
        )
        .all()
    )

    # "in progress" = all non-terminal, non-pending statuses
    in_progress_statuses = {"accepted", "confirmed", "preparing", "ready", "out_for_delivery"}

    total_revenue = sum(o.total_price for o in orders)
    pending = sum(1 for o in orders if o.status == "pending")
    accepted = sum(1 for o in orders if o.status in in_progress_statuses)
    delivered = sum(1 for o in orders if o.status == "delivered")

    return {
        "total_orders": len(orders),
        "total_revenue": round(total_revenue, 2),
        "pending": pending,
        "accepted": accepted,
        "confirmed": accepted,   # kept for backward compat
        "delivered": delivered,
    }


# ─── CREATE MANUAL ORDER (vendor) ─────────────────
@router.post("/vendor/manual")
def create_manual_vendor_order(
    data: ManualOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.user_type != "vendor":
        raise HTTPException(status_code=403, detail="Not a vendor account")

    if data.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor profile not found")

    customer = db.query(User).filter(User.email == data.customer_email).first()
    if not customer:
        raise HTTPException(
            status_code=404,
            detail="Customer email not found. Customer must register first.",
        )

    meal = (
        db.query(Meal)
        .filter(Meal.id == data.meal_id, Meal.vendor_id == profile.id, Meal.available == True)
        .first()
    )
    if not meal:
        raise HTTPException(
            status_code=404,
            detail="Meal not found for this vendor or unavailable.",
        )

    order = Order(
        user_id=customer.id,
        meal_id=meal.id,
        vendor_id=profile.id,
        quantity=data.quantity,
        unit_price=meal.price,
        total_price=meal.price * data.quantity,
        status="pending",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        "message": "Manual order created successfully",
        "order_id": order.id,
        "customer_name": customer.name,
        "customer_email": customer.email,
        "meal_name": meal.name,
        "quantity": order.quantity,
        "total_price": order.total_price,
        "status": order.status,
        "created_at": str(order.created_at),
    }
