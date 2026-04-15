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
    created_at = Column(DateTime, default=datetime.utcnow)
