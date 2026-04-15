from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from datetime import datetime
from ..database import Base


class Meal(Base):
    __tablename__ = "Wellora_Meals"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("Wellora_VendorProfiles.id"), nullable=False)
    name = Column(String(200), nullable=False)
    category = Column(String(50))  # Breakfast/Lunch/Dinner
    calories = Column(Integer)
    dietary = Column(String(50))  # Vegetarian/Vegan/etc
    price = Column(Float)
    available = Column(Boolean, default=True)
    description = Column(String(500), nullable=True)
    image_url = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
