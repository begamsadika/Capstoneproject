from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from datetime import datetime
from ..database import Base


class PartnerClient(Base):
    __tablename__ = "Wellora_PartnerClients"

    id = Column(Integer, primary_key=True, index=True)
    partner_user_id = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("Wellora_Users.id"), unique=True, nullable=False)
    gender = Column(String(20))
    age = Column(Integer)
    fitness_goal = Column(String(100))
    dietary_preference = Column(String(100))
    notes = Column(String(1000))
    status = Column(String(30), default="Active")
    invitation_token = Column(String(120), unique=True, nullable=True)
    invitation_status = Column(String(30), default="sent")
    invited_at = Column(DateTime, default=datetime.utcnow)
    accepted_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)

