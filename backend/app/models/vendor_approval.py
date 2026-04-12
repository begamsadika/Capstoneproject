from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, SmallInteger
from sqlalchemy.orm import relationship
from datetime import datetime
from ..database import Base


class VendorApproval(Base):
    __tablename__ = "Wellora_VendorApprovals"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(Integer, ForeignKey("Wellora_VendorProfiles.id"), nullable=False)
    is_approved = Column(SmallInteger, default=0)
    # 0 = Pending
    # 1 = Approved
    # -1 = Rejected
    reviewed_by = Column(String(100), nullable=True)
    review_notes = Column(String(500), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("VendorProfile", back_populates="approvals")
