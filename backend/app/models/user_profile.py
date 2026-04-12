from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class UserProfile(Base):
    __tablename__ = "Wellora_UserProfiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("Wellora_Users.id"), unique=True, nullable=False
    )
    gender = Column(String(200), nullable=False)
    height = Column(float, nullable=False)
    weight = Column(float, nullable=False)
    health_goal = Column(String(300), nullable=False)
    diet_preferance = Column(String(300))
    allergies = Column(String(300))
    submitted_at = Column(DateTime, default=datetime.utcnow)
