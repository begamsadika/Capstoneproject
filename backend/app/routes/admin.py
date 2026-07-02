from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
from typing import Optional

from ..database import get_db
from ..models.user import User
from ..models.vendor_profile import VendorProfile
from ..models.vendor_approval import VendorApproval
from ..models.order import Order
from ..core.auth import get_current_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])


# ─── HELPER: enforce admin role ───────────────────
def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.user_type != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# ─── STATS ────────────────────────────────────────
@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    total_users = db.query(func.count(User.id)).filter(User.user_type == "general").scalar() or 0
    total_vendors = db.query(func.count(User.id)).filter(User.user_type == "vendor").scalar() or 0
    total_partners = db.query(func.count(User.id)).filter(User.user_type == "partner").scalar() or 0

    today_start = datetime.combine(date.today(), datetime.min.time())
    orders_today = (
        db.query(func.count(Order.id))
        .filter(Order.created_at >= today_start)
        .scalar() or 0
    )

    return {
        "total_users": total_users,
        "total_vendors": total_vendors,
        "total_partners": total_partners,
        "orders_today": orders_today,
    }


# ─── LIST ALL USERS ───────────────────────────────
@router.get("/users")
def list_users(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,  # "active" | "disabled"
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = db.query(User).filter(User.user_type.in_(["general", "partner"]))

    if search:
        q = f"%{search}%"
        query = query.filter(
            User.name.ilike(q) | User.email.ilike(q)
        )

    if status_filter == "active":
        query = query.filter(User.is_active == True)
    elif status_filter == "disabled":
        query = query.filter(User.is_active == False)

    total = query.count()
    users = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "users": [
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "phone": u.phone,
                "user_type": u.user_type,
                "is_active": u.is_active,
                "created_at": str(u.created_at),
            }
            for u in users
        ],
    }


# ─── TOGGLE USER STATUS ───────────────────────────
@router.put("/users/{user_id}/toggle")
def toggle_user_status(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.user_type == "admin":
        raise HTTPException(status_code=400, detail="Cannot modify an admin account")

    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "name": user.name,
        "is_active": user.is_active,
        "message": f"User {'enabled' if user.is_active else 'disabled'} successfully",
    }


# ─── LIST ALL VENDORS ─────────────────────────────
@router.get("/vendors")
def list_vendors(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,  # "Approved" | "Pending" | "Rejected"
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Join VendorProfile → User to get email/name
    # and latest VendorApproval for each profile
    query = (
        db.query(VendorProfile, User)
        .join(User, VendorProfile.user_id == User.id)
    )

    if search:
        q = f"%{search}%"
        query = query.filter(
            VendorProfile.business_name.ilike(q) | User.email.ilike(q)
        )

    total = query.count()
    rows = (
        query.order_by(VendorProfile.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    result = []
    for profile, user in rows:
        latest_approval = (
            db.query(VendorApproval)
            .filter(VendorApproval.vendor_id == profile.id)
            .order_by(VendorApproval.created_at.desc())
            .first()
        )
        is_approved = latest_approval.is_approved if latest_approval else 0
        if is_approved == 1:
            approval_status = "Approved"
        elif is_approved == -1:
            approval_status = "Rejected"
        else:
            approval_status = "Pending"

        # Apply status filter after computing status
        if status_filter and approval_status != status_filter:
            continue

        result.append(
            {
                "id": profile.id,
                "user_id": user.id,
                "business_name": profile.business_name,
                "business_type": profile.business_type,
                "service_area": profile.service_area,
                "email": user.email,
                "owner_name": user.name,
                "is_approved": is_approved,
                "status": approval_status,
                "submitted_at": str(profile.submitted_at),
                "review_notes": latest_approval.review_notes if latest_approval else None,
            }
        )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "vendors": result,
    }


# ─── APPROVE VENDOR ───────────────────────────────
@router.put("/vendors/{vendor_id}/approve")
def approve_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    profile = db.query(VendorProfile).filter(VendorProfile.id == vendor_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor not found")

    latest = (
        db.query(VendorApproval)
        .filter(VendorApproval.vendor_id == vendor_id)
        .order_by(VendorApproval.created_at.desc())
        .first()
    )

    if latest:
        latest.is_approved = 1
        latest.reviewed_by = admin.name
        latest.reviewed_at = datetime.utcnow()
    else:
        approval = VendorApproval(
            vendor_id=vendor_id,
            is_approved=1,
            reviewed_by=admin.name,
            reviewed_at=datetime.utcnow(),
        )
        db.add(approval)

    db.commit()
    return {"message": "Vendor approved successfully", "vendor_id": vendor_id, "status": "Approved"}


# ─── SUSPEND / REJECT VENDOR ──────────────────────
@router.put("/vendors/{vendor_id}/suspend")
def suspend_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    profile = db.query(VendorProfile).filter(VendorProfile.id == vendor_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Vendor not found")

    latest = (
        db.query(VendorApproval)
        .filter(VendorApproval.vendor_id == vendor_id)
        .order_by(VendorApproval.created_at.desc())
        .first()
    )

    if latest:
        latest.is_approved = -1
        latest.reviewed_by = admin.name
        latest.reviewed_at = datetime.utcnow()
    else:
        approval = VendorApproval(
            vendor_id=vendor_id,
            is_approved=-1,
            reviewed_by=admin.name,
            reviewed_at=datetime.utcnow(),
        )
        db.add(approval)

    db.commit()
    return {"message": "Vendor suspended successfully", "vendor_id": vendor_id, "status": "Rejected"}
