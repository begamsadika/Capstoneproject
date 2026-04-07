# backend/app/models/vendor.py
from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Vendor(Base):
    __tablename__ = "Wellora_Vendors"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False)
    business_name = Column(String, nullable=False)
    business_type = Column(String, nullable=False)
    service_area = Column(String, nullable=False)
    certificate_filename = Column(String, nullable=True)  # store uploaded certificate file name

    user_id = Column(Integer, ForeignKey("Wellora_Users.id"))
    user = relationship("User", back_populates="vendors")