from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class UserProfile(Base):
    __tablename__ = "Wellora_UserProfiles"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer, ForeignKey("Wellora_Users.id"), unique=True, nullable=False
    )

    gender = Column(String(10), nullable=False)
    height = Column(Float, nullable=False)
    weight = Column(Float, nullable=False)
    health_goal = Column(String(20), nullable=False)

    dietary_preferences = Column(String(300))
    allergies = Column(String(300))

    submitted_at = Column(DateTime, default=datetime.utcnow)

    # Optional relationship
    user = relationship("User", back_populates="user_profile")
