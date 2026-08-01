from sqlalchemy import Column, Integer, String, DateTime, Boolean
from datetime import datetime
from sqlalchemy.orm import relationship
from ..database import Base


class User(Base):
    __tablename__ = "Wellora_Users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    phone = Column(String(20))
    user_type = Column(String(20), default="general")  # general/vendor/partner/admin
    partner_type = Column(String(20), nullable=True)  # hospital/gym for partner users
    organization_name = Column(String(200), nullable=True)
    tin_number = Column(String(80), nullable=True)
    company_registration_number = Column(String(100), nullable=True)
    address = Column(String(300), nullable=True)
    registration_status = Column(String(30), default="approved", nullable=False, server_default="approved")
    approval_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime, default=datetime.utcnow)

    # One-to-many: user can have many vendors
    # user_profile = relationship("UserProfile", back_populates="user")
