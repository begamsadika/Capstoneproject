from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from datetime import datetime
from ..database import Base


class PartnerMealRecommendation(Base):
    __tablename__ = "Wellora_PartnerMealRecommendations"

    id = Column(Integer, primary_key=True, index=True)
    partner_user_id = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False)
    client_user_id = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False)
    meal_id = Column(Integer, ForeignKey("Wellora_Meals.id"), nullable=False)
    note = Column(String(1000), default="")
    status = Column(String(30), default="sent")
    created_at = Column(DateTime, default=datetime.utcnow)
