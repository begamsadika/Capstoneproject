from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import os
import secrets
import smtplib
from email.message import EmailMessage

from ..core.auth import get_current_user
from ..core.security import create_access_token, hash_password
from ..database import get_db
from ..models.meal import Meal
from ..models.partner_client import PartnerClient
from ..models.partner_meal_recommendation import PartnerMealRecommendation
from ..models.user import User

router = APIRouter(prefix="/api/partner", tags=["Partner Portal"])


class CreatePartnerClientRequest(BaseModel):
    full_name: str
    email: str
    gender: str = ""
    age: int | None = None
    fitness_goal: str = ""
    dietary_preference: str = ""
    notes: str = ""


class SetInvitationPasswordRequest(BaseModel):
    password: str


class RecommendMealsRequest(BaseModel):
    meal_ids: list[int]
    note: str = ""


def require_partner(user: User) -> None:
    if user.user_type != "partner":
        raise HTTPException(status_code=403, detail="Partner access required")


def invitation_link(token: str) -> str:
    base_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return f"{base_url}/?invite={token}"


def send_invitation_email(to_email: str, full_name: str, link: str) -> None:
    subject = "You're invited to Wellora"
    body = (
        f"Hi {full_name},\n\n"
        "Your Wellora partner has created an account for you.\n"
        f"Set your password and sign in here: {link}\n\n"
        "After setting your password, you can complete your profile inside Wellora."
    )

    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", smtp_user or "no-reply@wellora.local")

    if not smtp_host:
        print(f"[Wellora invitation email]\nTo: {to_email}\nSubject: {subject}\n{body}")
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_from
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(smtp_host, smtp_port) as smtp:
        smtp.starttls()
        if smtp_user and smtp_password:
            smtp.login(smtp_user, smtp_password)
        smtp.send_message(message)


def client_to_dict(client: PartnerClient, user: User) -> dict:
    return {
        "id": client.id,
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "gender": client.gender or "",
        "age": client.age,
        "fitness_goal": client.fitness_goal or "",
        "dietary_preference": client.dietary_preference or "",
        "notes": client.notes or "",
        "status": client.status,
        "assigned_date": client.invited_at.strftime("%Y-%m-%d"),
        "invitation_status": client.invitation_status,
        "is_active": user.is_active,
    }


@router.get("/users")
def get_partner_clients(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    require_partner(current_user)
    rows = (
        db.query(PartnerClient, User)
        .join(User, User.id == PartnerClient.user_id)
        .filter(PartnerClient.partner_user_id == current_user.id)
        .order_by(PartnerClient.invited_at.desc())
        .all()
    )
    return [client_to_dict(client, user) for client, user in rows]


@router.post("/users")
def create_partner_client(
    data: CreatePartnerClientRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_partner(current_user)
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        if db.query(PartnerClient).filter(PartnerClient.user_id == existing.id).first():
            raise HTTPException(status_code=409, detail="User is already assigned")
        user = existing
    else:
        user = User(
            name=data.full_name.strip(),
            email=data.email.lower().strip(),
            password_hash=hash_password(secrets.token_urlsafe(32)),
            user_type="general",
            is_active=False,
        )
        db.add(user)
        db.flush()

    token = secrets.token_urlsafe(32)
    client = PartnerClient(
        partner_user_id=current_user.id,
        user_id=user.id,
        gender=data.gender,
        age=data.age,
        fitness_goal=data.fitness_goal,
        dietary_preference=data.dietary_preference,
        notes=data.notes,
        status="Active",
        invitation_token=token,
        invitation_status="sent",
    )
    db.add(client)
    db.commit()
    db.refresh(client)

    link = invitation_link(token)
    send_invitation_email(user.email, user.name, link)
    return {**client_to_dict(client, user), "invitation_link": link}


@router.post("/invitations/{token}/set-password")
def set_invitation_password(
    token: str,
    data: SetInvitationPasswordRequest,
    db: Session = Depends(get_db),
):
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    client = db.query(PartnerClient).filter(PartnerClient.invitation_token == token).first()
    if not client:
        raise HTTPException(status_code=404, detail="Invitation not found or already used")

    user = db.query(User).filter(User.id == client.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(data.password)
    user.is_active = True
    client.invitation_token = None
    client.invitation_status = "accepted"
    client.accepted_at = datetime.utcnow()
    db.commit()

    access_token = create_access_token({"sub": str(user.id)})
    return {
        "message": "Password set successfully",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "user_type": user.user_type,
        },
    }


@router.post("/users/{client_id}/recommend-meals")
def recommend_meals(
    client_id: int,
    data: RecommendMealsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_partner(current_user)
    if not data.meal_ids:
        raise HTTPException(status_code=400, detail="Select at least one meal")

    client = (
        db.query(PartnerClient)
        .filter(
            PartnerClient.id == client_id,
            PartnerClient.partner_user_id == current_user.id,
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    meals = db.query(Meal).filter(Meal.id.in_(data.meal_ids), Meal.available == True).all()
    if len(meals) != len(set(data.meal_ids)):
        raise HTTPException(status_code=400, detail="One or more meals are unavailable")

    for meal in meals:
        db.add(
            PartnerMealRecommendation(
                partner_user_id=current_user.id,
                client_user_id=client.user_id,
                meal_id=meal.id,
                note=data.note,
                status="sent",
            )
        )
    db.commit()
    return {"message": "Recommended meals sent", "count": len(meals)}


@router.get("/users/{client_id}/recommended-meals")
def get_recommended_meals(
    client_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_partner(current_user)
    client = (
        db.query(PartnerClient)
        .filter(
            PartnerClient.id == client_id,
            PartnerClient.partner_user_id == current_user.id,
        )
        .first()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    rows = (
        db.query(PartnerMealRecommendation, Meal)
        .join(Meal, Meal.id == PartnerMealRecommendation.meal_id)
        .filter(PartnerMealRecommendation.client_user_id == client.user_id)
        .order_by(PartnerMealRecommendation.created_at.desc())
        .all()
    )
    return [
        {
            "id": rec.id,
            "meal_id": meal.id,
            "meal_name": meal.name,
            "category": meal.category,
            "calories": meal.calories,
            "price": meal.price,
            "note": rec.note or "",
            "status": rec.status,
            "created_at": rec.created_at.strftime("%Y-%m-%d"),
        }
        for rec, meal in rows
    ]


@router.get("/my-recommended-meals")
def get_my_partner_recommended_meals(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    rows = (
        db.query(PartnerMealRecommendation, Meal, User)
        .join(Meal, Meal.id == PartnerMealRecommendation.meal_id)
        .join(User, User.id == PartnerMealRecommendation.partner_user_id)
        .filter(PartnerMealRecommendation.client_user_id == current_user.id)
        .order_by(PartnerMealRecommendation.created_at.desc())
        .all()
    )
    return [
        {
            "id": rec.id,
            "meal_id": meal.id,
            "meal_name": meal.name,
            "category": meal.category,
            "calories": meal.calories,
            "price": meal.price,
            "dietary": meal.dietary,
            "partner_name": partner.name,
            "note": rec.note or "",
            "status": rec.status,
            "created_at": rec.created_at.strftime("%Y-%m-%d"),
        }
        for rec, meal, partner in rows
    ]
