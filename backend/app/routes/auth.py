from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel
import re
from ..database import get_db
from ..models.user import User
from ..models.user_profile import UserProfile
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

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
PASSWORD_RE = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).+$")
PHONE_RE = re.compile(r"^\+?[0-9\s()/-]{7,24}$")

def normalize_spaces(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())

def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()

def valid_name(value: str) -> bool:
    return all(ch.isalpha() or ch in " '.-" for ch in value)

def valid_organization(value: str) -> bool:
    return all(ch.isalnum() or ch in " '&,.-" for ch in value)

def validation_error(errors: dict[str, str]):
    raise HTTPException(
        status_code=422,
        detail={
            "success": False,
            "code": "VALIDATION_ERROR",
            "message": "Please correct the highlighted fields.",
            "errors": errors,
        },
    )

def validate_register_payload(data: RegisterRequest) -> tuple[dict, dict[str, str]]:
    errors: dict[str, str] = {}
    name = normalize_spaces(data.name)
    email = normalize_email(data.email)
    phone = normalize_spaces(data.phone)
    user_type = normalize_spaces(data.user_type or "general")
    partner_type = normalize_spaces(data.partner_type)
    organization_name = normalize_spaces(data.organization_name)
    tin_number = normalize_spaces(data.tin_number)
    company_registration_number = normalize_spaces(data.company_registration_number)
    address = normalize_spaces(data.address)

    if not name:
        errors["name"] = "Full name is required."
    elif len(name) < 2:
        errors["name"] = "Full name must contain at least 2 characters."
    elif len(name) > 100:
        errors["name"] = "Full name must not exceed 100 characters."
    elif not valid_name(name) or name[0] in "'.-" or name[-1] in "'.-" or not any(ch.isalpha() for ch in name):
        errors["name"] = "Enter a valid full name."

    if not email:
        errors["email"] = "Email address is required."
    elif len(email) > 254 or not EMAIL_RE.match(email):
        errors["email"] = "Enter a valid email address."

    if not data.password:
        errors["password"] = "Password is required."
    elif len(data.password) < 8:
        errors["password"] = "Password must contain at least 8 characters."
    elif len(data.password) > 64:
        errors["password"] = "Password must not exceed 64 characters."
    elif not PASSWORD_RE.match(data.password):
        errors["password"] = "Password must include an uppercase letter, a lowercase letter, and a special character."

    if user_type not in ["general", "vendor", "partner"]:
        errors["user_type"] = "The selected account type is invalid."

    if user_type == "partner" and partner_type not in ["hospital", "gym"]:
        errors["partner_type"] = "Select a partner type."

    if user_type in ["vendor", "partner"]:
        phone_digits = re.sub(r"\D", "", phone)
        if not phone:
            errors["phone"] = "Phone number is required."
        elif not PHONE_RE.match(phone) or len(phone_digits) < 7 or len(phone_digits) > 15:
            errors["phone"] = "Enter a valid phone number."
        if not organization_name:
            errors["organization_name"] = "Business or organisation name is required."
        elif len(organization_name) > 150:
            errors["organization_name"] = "Business or organisation name must not exceed 150 characters."
        elif len(organization_name) < 2 or not valid_organization(organization_name) or not any(ch.isalnum() for ch in organization_name):
            errors["organization_name"] = "Enter a valid business or organisation name."
        if not tin_number:
            errors["tin_number"] = "TIN number is required."
        if not company_registration_number:
            errors["company_registration_number"] = "Company registration number is required."
        if not address:
            errors["address"] = "Address is required."

    values = {
        "name": name,
        "email": email,
        "phone": phone,
        "user_type": user_type,
        "partner_type": partner_type,
        "organization_name": organization_name,
        "tin_number": tin_number,
        "company_registration_number": company_registration_number,
        "address": address,
    }
    return values, errors

@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    values, errors = validate_register_payload(data)
    if errors:
        validation_error(errors)

    if db.query(User).filter(func.lower(User.email) == values["email"]).first():
        raise HTTPException(
            status_code=409,
            detail={
                "success": False,
                "code": "EMAIL_ALREADY_REGISTERED",
                "message": "An account already exists with this email address.",
                "errors": {"email": "An account already exists with this email address."},
            },
        )

    user_type = values["user_type"]

    new_user = User(
        name          = values["name"],
        email         = values["email"],
        password_hash = hash_password(data.password),
        phone         = values["phone"],
        user_type     = user_type,
        partner_type  = values["partner_type"] if user_type == "partner" else None,
        organization_name=values["organization_name"] if user_type in ["vendor", "partner"] else None,
        tin_number=values["tin_number"] if user_type in ["vendor", "partner"] else None,
        company_registration_number=(
            values["company_registration_number"] if user_type in ["vendor", "partner"] else None
        ),
        address=values["address"] if user_type in ["vendor", "partner"] else None,
        registration_status="pending" if user_type in ["partner", "vendor"] else "approved",
        is_active     = False if user_type in ["partner", "vendor"] else True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token({"sub": str(new_user.id)})

    return {
        "message": (
            "Your vendor registration has been submitted successfully and is awaiting administrator approval."
            if user_type == "vendor"
            else "Your partner registration has been submitted successfully and is awaiting administrator approval."
            if user_type == "partner"
            else "Your account has been created successfully."
        ),
        "access_token": token,
        "token_type": "bearer",
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
    email = normalize_email(data.email)
    if not email or not EMAIL_RE.match(email):
        validation_error({"email": "Enter a valid email address."})
    if not data.password:
        validation_error({"password": "Password is required."})
    if len(data.password) > 64:
        validation_error({"password": "Enter a valid password."})

    user = db.query(User).filter(func.lower(User.email) == email).first()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={
                "success": False,
                "code": "INVALID_CREDENTIALS",
                "message": "Invalid email address or password.",
            },
        )
    if not user.is_active and user.user_type not in ["partner", "vendor"]:
        raise HTTPException(
            status_code=403,
            detail={
                "success": False,
                "code": "ACCOUNT_INACTIVE",
                "message": "Your account is currently inactive. Contact support for assistance.",
            },
        )

    token = create_access_token({"sub": str(user.id)})
    onboarding_done = None
    if user.user_type == "general":
        onboarding_done = (
            db.query(UserProfile.id)
            .filter(UserProfile.user_id == user.id)
            .first()
            is not None
        )

    return {
        "message":      "Signed in successfully.",
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
            "onboarding_done": onboarding_done,
        }
    }
