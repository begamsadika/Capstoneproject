from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database import get_db
from ..models.user import User
from ..core.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

class RegisterRequest(BaseModel):
    name:      str
    email:     str
    password:  str
    phone:     str = ""
    user_type: str = "general"
    partner_type: str | None = None
    organization_name: str | None = None
    tin_number: str | None = None
    company_registration_number: str | None = None
    address: str | None = None

class LoginRequest(BaseModel):
    email:    str
    password: str

@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user_type = data.user_type or "general"
    if user_type not in ["general", "vendor", "partner"]:
        raise HTTPException(status_code=400, detail="Invalid user type")

    if user_type == "partner" and data.partner_type not in ["hospital", "gym"]:
        raise HTTPException(status_code=400, detail="Partner type is required")

    if user_type in ["vendor", "partner"]:
        required_fields = {
            "organization_name": data.organization_name,
            "tin_number": data.tin_number,
            "company_registration_number": data.company_registration_number,
            "address": data.address,
        }
        missing = [name for name, value in required_fields.items() if not (value or "").strip()]
        if missing:
            raise HTTPException(status_code=400, detail="Business registration details are required")

    new_user = User(
        name          = data.name,
        email         = data.email,
        password_hash = hash_password(data.password),
        phone         = data.phone,
        user_type     = user_type,
        partner_type  = data.partner_type if user_type == "partner" else None,
        organization_name=data.organization_name if user_type in ["vendor", "partner"] else None,
        tin_number=data.tin_number if user_type in ["vendor", "partner"] else None,
        company_registration_number=(
            data.company_registration_number if user_type in ["vendor", "partner"] else None
        ),
        address=data.address if user_type in ["vendor", "partner"] else None,
        registration_status="pending" if user_type in ["partner", "vendor"] else "approved",
        is_active     = False if user_type in ["partner", "vendor"] else True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "Account created successfully!",
        "user": {
            "id":        new_user.id,
            "name":      new_user.name,
            "email":     new_user.email,
            "user_type": new_user.user_type,
            "partner_type": new_user.partner_type,
            "organization_name": new_user.organization_name,
            "tin_number": new_user.tin_number,
            "company_registration_number": new_user.company_registration_number,
            "address": new_user.address,
            "registration_status": new_user.registration_status,
            "is_active": new_user.is_active,
            "created_at": str(new_user.created_at),
        }
    }

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active and user.user_type not in ["partner", "vendor"]:
        raise HTTPException(
            status_code=403,
            detail="Please set your password using the invitation email first.",
        )

    token = create_access_token({"sub": str(user.id)})

    return {
        "message":      "Login successful!",
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":        user.id,
            "name":      user.name,
            "email":     user.email,
            "user_type": user.user_type,
            "partner_type": user.partner_type,
            "organization_name": user.organization_name,
            "tin_number": user.tin_number,
            "company_registration_number": user.company_registration_number,
            "address": user.address,
            "registration_status": user.registration_status,
            "approval_date": str(user.approval_date) if user.approval_date else None,
            "is_active": user.is_active,
            "created_at": str(user.created_at),
        }
    }
