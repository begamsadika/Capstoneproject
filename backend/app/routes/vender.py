from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import text
from ..database import get_db
from ..models.vendor_profile import VendorProfile
from ..models.vendor_approval import VendorApproval
from ..models.user import User
from ..core.auth import get_current_user
import os, shutil, uuid

router = APIRouter(prefix="/api/vendor", tags=["Vendor"])

UPLOAD_DIR = "uploads/certificates"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ─── HELPER ──────────────────────────────────────
def approval_to_status(is_approved: int) -> str:
    if is_approved == 1:
        return "APPROVED"
    if is_approved == -1:
        return "REJECTED"
    return "PENDING"


# ─── GET VENDOR STATUS ────────────────────────────
@router.get("/status")
def get_vendor_status(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if current_user.user_type != "vendor":
        raise HTTPException(status_code=403, detail="Not a vendor account")

    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )

    if not profile:
        return {"status": "NEW", "is_approved": None}

    latest = (
        db.query(VendorApproval)
        .filter(VendorApproval.vendor_id == profile.id)
        .order_by(VendorApproval.created_at.desc())
        .first()
    )

    if not latest:
        return {"status": "PENDING", "is_approved": 0}

    return {
        "status": approval_to_status(latest.is_approved),
        "is_approved": latest.is_approved,
    }


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


# ─── GET VENDOR PROFILE ──────────────────────────
@router.get("/profile")
def get_vendor_profile(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    profile = (
        db.query(VendorProfile).filter(VendorProfile.user_id == current_user.id).first()
    )

    if not profile:
        raise HTTPException(status_code=404, detail="Vendor profile not found")

    latest = (
        db.query(VendorApproval)
        .filter(VendorApproval.vendor_id == profile.id)
        .order_by(VendorApproval.created_at.desc())
        .first()
    )

    is_approved = latest.is_approved if latest else 0

    return {
        "id": profile.id,
        "business_name": profile.business_name,
        "business_type": profile.business_type,
        "service_area": profile.service_area,
        "submitted_at": str(profile.submitted_at),
        "is_approved": is_approved,
        "status": approval_to_status(is_approved),
        "review_notes": latest.review_notes if latest else None,
    }


# ─── GET ALL ACTIVE VENDORS ───────────────────────
@router.get("/active")
def get_active_vendors(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT * FROM Wellora_ActiveVendors"))
    rows = result.fetchall()
    keys = result.keys()
    return [dict(zip(keys, row)) for row in rows]
