from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime
from ..database import Base


class Order(Base):
    __tablename__ = "Wellora_Orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False)
    meal_id = Column(Integer, ForeignKey("Wellora_Meals.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("Wellora_VendorProfiles.id"), nullable=False)
    quantity = Column(Integer, default=1)
    unit_price = Column(Float, nullable=False)
    total_price = Column(Float, nullable=False)
    status = Column(String(20), default="pending")
    # pending / confirmed / delivered / cancelled
    payment_status = Column(String(20), default="paid", nullable=False, server_default="paid")
    order_status = Column(String(30), default="placed", nullable=False, server_default="placed")
    stripe_session_id = Column(String(255), nullable=True, index=True)
    checkout_reference = Column(String(80), nullable=True, index=True)
    recipient_name = Column(String(100), nullable=True)
    recipient_phone = Column(String(30), nullable=True)
    delivery_address = Column(String(500), nullable=True)
    delivery_city = Column(String(100), nullable=True)
    delivery_postal_code = Column(String(30), nullable=True)
    delivery_notes = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
