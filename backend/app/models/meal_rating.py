from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime
from ..database import Base


class MealRating(Base):
    __tablename__ = "Wellora_MealRatings"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(
        Integer, ForeignKey("Wellora_Orders.id"), nullable=False, unique=True
    )
    meal_id = Column(Integer, ForeignKey("Wellora_Meals.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False)
    vendor_id = Column(Integer, ForeignKey("Wellora_VendorProfiles.id"), nullable=False)
    rating = Column(Integer, nullable=False)  # 1-5
    review = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
