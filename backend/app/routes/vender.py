from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.user import User
from ..models.vender import Vendor
from ..core.auth import get_current_user
import os

router = APIRouter(prefix="/api/vendor", tags=["Vendor"])

UPLOAD_DIR = "uploads/certificates"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── Onboarding ──────────────────────────────
@router.post("/onboarding")
async def vendor_onboarding(
    businessName: str = Form(...),
    businessType: str = Form(...),
    serviceArea: str = Form(...),
    certificate: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check file type
    if certificate.content_type not in ["application/pdf", "image/jpeg", "image/png"]:
        raise HTTPException(status_code=400, detail="Invalid file type")

    # Check file size (max 2 MB)
    contents = await certificate.read()
    if len(contents) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 2 MB")

    # Save file
    file_location = f"{UPLOAD_DIR}/{current_user.id}_{certificate.filename}"
    with open(file_location, "wb") as f:
        f.write(contents)

    # Check if vendor profile already exists
    existing_vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if existing_vendor:
        raise HTTPException(status_code=409, detail="Vendor profile already exists")

    # Save vendor info
    vendor = Vendor(
        user_id=current_user.id,
        business_name=businessName,
        business_type=businessType,
        service_area=serviceArea,
        certificate_path=file_location,
        status="PENDING"
    )
    db.add(vendor)
    db.commit()
    db.refresh(vendor)

    return {"status": vendor.status}


# ─── Get current vendor info ─────────────────
@router.get("/me")
def get_current_vendor(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    vendor = db.query(Vendor).filter(Vendor.user_id == current_user.id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor profile not found")

    return {
        "businessName": vendor.business_name,
        "businessType": vendor.business_type,
        "serviceArea": vendor.service_area,
        "certificatePath": vendor.certificate_path,
        "status": vendor.status
    }