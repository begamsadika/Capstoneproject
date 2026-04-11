from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base

class VendorProfile(Base):
    __tablename__ = "Wellora_VendorProfiles"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("Wellora_Users.id"), unique=True, nullable=False)
    business_name        = Column(String(200), nullable=False)
    business_type        = Column(String(100), nullable=False)
    service_area         = Column(String(200), nullable=False)
    certificate_filename = Column(String(300))
    submitted_at         = Column(DateTime, default=datetime.utcnow)

    approvals = relationship("VendorApproval", back_populates="vendor", lazy=True)