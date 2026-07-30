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


def status_from_user(user: User) -> str:
    if user.registration_status == "approved" and user.is_active:
        return "Approved"
    if user.registration_status == "rejected":
        return "Rejected"
    if user.registration_status == "approved" and not user.is_active:
        return "Inactive"
    return "Pending"


def partner_type_label(value: Optional[str]) -> Optional[str]:
    if value == "gym":
        return "Gym"
    if value == "hospital":
        return "Hospital"
    return None


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
                "partner_type": u.partner_type,
                "organization_name": u.organization_name,
                "tin_number": u.tin_number,
                "company_registration_number": u.company_registration_number,
                "address": u.address,
                "registration_status": u.registration_status,
                "approval_date": str(u.approval_date) if u.approval_date else None,
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

    rows = (
        query.order_by(VendorProfile.submitted_at.desc())
        .all()
    )

    result = []
    profiled_user_ids = []
    for profile, user in rows:
        profiled_user_ids.append(user.id)
        latest_approval = (
            db.query(VendorApproval)
            .filter(VendorApproval.vendor_id == profile.id)
            .order_by(VendorApproval.created_at.desc())
            .first()
        )
        if latest_approval:
            is_approved = latest_approval.is_approved
        elif user.registration_status == "approved" or user.is_active:
            is_approved = 1
        elif user.registration_status == "rejected":
            is_approved = -1
        else:
            is_approved = 0

        if user.registration_status == "approved" and not user.is_active:
            approval_status = "Inactive"
        elif is_approved == 1:
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
                "tin_number": user.tin_number,
                "company_registration_number": user.company_registration_number,
                "address": user.address,
                "email": user.email,
                "owner_name": user.name,
                "is_approved": is_approved,
                "status": approval_status,
                "submitted_at": str(profile.submitted_at),
                "review_notes": latest_approval.review_notes if latest_approval else None,
            }
        )

    user_query = db.query(User).filter(User.user_type == "vendor")
    if profiled_user_ids:
        user_query = user_query.filter(~User.id.in_(profiled_user_ids))
    if search:
        q = f"%{search}%"
        user_query = user_query.filter(
            User.name.ilike(q) | User.email.ilike(q) | User.organization_name.ilike(q)
        )

    for user in user_query.order_by(User.created_at.desc()).all():
        approval_status = status_from_user(user)
        if status_filter and approval_status != status_filter:
            continue

        result.append(
            {
                "id": user.id,
                "user_id": user.id,
                "business_name": user.organization_name or user.name,
                "business_type": "Registration",
                "service_area": user.address or "",
                "tin_number": user.tin_number,
                "company_registration_number": user.company_registration_number,
                "address": user.address,
                "email": user.email,
                "owner_name": user.name,
                "is_approved": 1 if approval_status == "Approved" else -1 if approval_status == "Rejected" else 0,
                "status": approval_status,
                "submitted_at": str(user.created_at),
                "review_notes": None,
            }
        )

    total = len(result)
    result = result[(page - 1) * page_size : page * page_size]

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
        user = db.query(User).filter(User.id == vendor_id, User.user_type == "vendor").first()
        if not user:
            raise HTTPException(status_code=404, detail="Vendor not found")
        profile = VendorProfile(
            user_id=user.id,
            business_name=user.organization_name or user.name,
            business_type="Registered Vendor",
            service_area=user.address or "",
        )
        db.add(profile)
        db.flush()
        approval = VendorApproval(
            vendor_id=profile.id,
            is_approved=1,
            reviewed_by=admin.name,
            reviewed_at=datetime.utcnow(),
        )
        db.add(approval)
        user.is_active = True
        user.registration_status = "approved"
        user.approval_date = datetime.utcnow()
        db.commit()
        return {"message": "Vendor account approved successfully.", "vendor_id": profile.id, "status": "Approved"}

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

    user = db.query(User).filter(User.id == profile.user_id).first()
    if user:
        user.is_active = True
        user.registration_status = "approved"
        user.approval_date = datetime.utcnow()

    db.commit()
    return {"message": "Vendor account approved successfully.", "vendor_id": vendor_id, "status": "Approved"}


# ─── SUSPEND / REJECT VENDOR ──────────────────────
@router.put("/vendors/{vendor_id}/suspend")
def suspend_vendor(
    vendor_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    profile = db.query(VendorProfile).filter(VendorProfile.id == vendor_id).first()
    if not profile:
        user = db.query(User).filter(User.id == vendor_id, User.user_type == "vendor").first()
        if not user:
            raise HTTPException(status_code=404, detail="Vendor not found")
        user.is_active = False
        user.registration_status = "rejected"
        db.commit()
        return {"message": "Vendor account rejected successfully.", "vendor_id": vendor_id, "status": "Rejected"}

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

    user = db.query(User).filter(User.id == profile.user_id).first()
    if user:
        user.is_active = False
        user.registration_status = "rejected"

    db.commit()
    return {"message": "Vendor account rejected successfully.", "vendor_id": vendor_id, "status": "Rejected"}


@router.get("/partners")
def list_partners(
    page: int = 1,
    page_size: int = 20,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    query = db.query(User).filter(User.user_type == "partner")

    if search:
        q = f"%{search}%"
        query = query.filter(
            User.name.ilike(q) | User.email.ilike(q) | User.organization_name.ilike(q)
        )

    result = []
    for partner in query.order_by(User.created_at.desc()).all():
        approval_status = status_from_user(partner)
        if status_filter and approval_status != status_filter:
            continue
        result.append(
            {
                "id": partner.id,
                "organization_name": partner.organization_name or partner.name,
                "partner_type": partner.partner_type,
                "partner_type_label": partner_type_label(partner.partner_type),
                "email": partner.email,
                "phone": partner.phone,
                "address": partner.address,
                "tin_number": partner.tin_number,
                "company_registration_number": partner.company_registration_number,
                "status": approval_status,
                "is_active": partner.is_active,
                "submitted_at": str(partner.created_at),
                "approval_date": str(partner.approval_date) if partner.approval_date else None,
            }
        )

    total = len(result)
    result = result[(page - 1) * page_size : page * page_size]
    return {"total": total, "page": page, "page_size": page_size, "partners": result}


@router.put("/partners/{partner_id}/approve")
def approve_partner(
    partner_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    partner = db.query(User).filter(User.id == partner_id, User.user_type == "partner").first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    partner.is_active = True
    partner.registration_status = "approved"
    partner.approval_date = datetime.utcnow()
    db.commit()
    return {"message": "Partner account approved successfully.", "partner_id": partner_id, "status": "Approved"}


@router.put("/partners/{partner_id}/reject")
def reject_partner(
    partner_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    partner = db.query(User).filter(User.id == partner_id, User.user_type == "partner").first()
    if not partner:
        raise HTTPException(status_code=404, detail="Partner not found")
    partner.is_active = False
    partner.registration_status = "rejected"
    db.commit()
    return {"message": "Partner rejected successfully", "partner_id": partner_id, "status": "Rejected"}
