from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from datetime import datetime
from ..database import Base

class UserProfile(Base):
    __tablename__ = "Wellora_UserProfiles"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("Wellora_Users.id"), unique=True, nullable=False)
    gender               = Column(String(10))
    height               = Column(Float)        # cm
    weight               = Column(Float)        # kg
    health_goal          = Column(String(20))   # lose/maintain/gain
    dietary_preferences  = Column(String(200))
    allergies            = Column(String(200))
    created_at           = Column(DateTime, default=datetime.utcnow)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)