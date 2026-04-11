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

class LoginRequest(BaseModel):
    email:    str
    password: str

@router.post("/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    new_user = User(
        name          = data.name,
        email         = data.email,
        password_hash = hash_password(data.password),
        phone         = data.phone,
        user_type     = data.user_type
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
            "user_type": new_user.user_type
        }
    }

@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user.id)})

    return {
        "message":      "Login successful!",
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":        user.id,
            "name":      user.name,
            "email":     user.email,
            "user_type": user.user_type
        }
    }