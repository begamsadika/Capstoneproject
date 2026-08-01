from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import Base, engine, run_database_operation_with_retry
from app.db_migrations import (
    ensure_meal_image_filename_column,
    ensure_meal_ingredients_column,
    ensure_partner_portal_tables,
    ensure_order_checkout_columns,
    ensure_user_registration_review_columns,
    ensure_user_partner_type_column,
    ensure_user_is_active_column,
    ensure_diet_chat_summary_columns,
    ensure_user_medical_profile_columns,
)
import os

# ─── Import ALL models (so tables are created) ───
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.vendor_profile import VendorProfile
from app.models.vendor_approval import VendorApproval
from app.models.meal import Meal
from app.models.meal_rating import MealRating
from app.models.order import Order
from app.models.health_metric import HealthMetric
from app.models.daily_log import DailyLog
from app.models.partner_client import PartnerClient
from app.models.partner_meal_recommendation import PartnerMealRecommendation
from app.models.meal_log_entry import MealLogEntry
from app.models.diet_chat import DietChatConversation, DietChatMessage

# ─── Import ALL routes ────────────────────────────
from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.vender import router as vendor_router
from app.routes.meals import router as meals_router
from app.routes.orders import router as orders_router
from app.routes.health import router as health_router
from app.routes.ai import router as ai_router
from app.routes.admin import router as admin_router
from app.routes.ingredients import router as ingredients_router
from app.routes.partner import router as partner_router

# ─── Create all tables + apply lightweight schema patches ─
ensure_meal_image_filename_column()
ensure_meal_ingredients_column()
ensure_user_is_active_column()
ensure_user_partner_type_column()
ensure_user_registration_review_columns()
ensure_partner_portal_tables()
ensure_order_checkout_columns()
Base.metadata.create_all(bind=engine)
from app.routes.diet_chat import router as diet_chat_router

# ─── Create all tables + apply lightweight schema patches ─
def _initialize_database_schema() -> None:
    """Apply idempotent schema setup once SQL Server accepts connections."""
    ensure_meal_image_filename_column()
    ensure_meal_ingredients_column()
    ensure_user_is_active_column()
    ensure_diet_chat_summary_columns()
    ensure_user_medical_profile_columns()
    Base.metadata.create_all(bind=engine)


run_database_operation_with_retry(
    _initialize_database_schema,
    operation_name="Wellora schema initialization",
)

app = FastAPI(
    title="Wellora API",
    description="Backend API for Wellora Health App",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Conversation-Id"],
)

os.makedirs("uploads/certificates", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ─── Register ALL routers ─────────────────────────
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(vendor_router)
app.include_router(meals_router)
app.include_router(orders_router)
app.include_router(health_router)
app.include_router(ai_router)
app.include_router(admin_router)
app.include_router(ingredients_router)
app.include_router(partner_router)
app.include_router(diet_chat_router)


@app.get("/")
def root():
    return {"message": "Welcome to Wellora API 🌿"}
