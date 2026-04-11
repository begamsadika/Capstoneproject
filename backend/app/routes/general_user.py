from fastapi import APIRouter, Depends, HTTPException, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import get_db
from ..models.general_user_profile import GeneralUserProfile
from ..models.user import User
from ..core.auth import get_current_user
import os, shutil, uuid

router = APIRouter(prefix="/api/vendor", tags=["Vendor"])


# ─── VENDOR ONBOARDING ───────────────────────────
@router.post("/onboarding")
def vendor_onboarding(
    businessName: str = Form(...),
    businessType: str = Form(...),
    serviceArea: str = Form(...),
    certificate: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.user_type != "vendor":
        raise HTTPException(status_code=403, detail="Not a vendor account")

    existing = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Onboarding already submitted")

    # Validate file
    allowed = ["application/pdf", "image/png", "image/jpeg"]
    if certificate.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only PDF, PNG, JPG allowed")

    # Save file
    ext = certificate.filename.split(".")[-1]
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(certificate.file, f)

    # Save profile
    profile = VendorProfile(
        user_id=current_user.id,
        business_name=businessName,
        business_type=businessType,
        service_area=serviceArea,
        certificate_filename=filename,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)

    # Create approval → 0 = Pending
    approval = VendorApproval(vendor_id=profile.id, is_approved=0)
    db.add(approval)
    db.commit()

    return {
        "message": "Onboarding submitted successfully!",
        "status": "PENDING",
        "is_approved": 0,
    }


