from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base
import os

# Import ALL models
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.vendor_profile import VendorProfile
from app.models.vendor_approval import VendorApproval
from app.models.meal import Meal
from app.models.order import Order
from app.models.health_metric import HealthMetric
from app.models.daily_log import DailyLog

# Import routes
from app.routes.auth import router as auth_router
from app.routes.vender import router as vendor_router
from app.routes.meals import router as meals_router
from app.routes.users import router as users_router
from app.routes.orders import router as orders_router
from app.routes.health import router as health_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Wellora API",
    description="Backend API for Wellora Health App",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads/certificates", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth_router)
app.include_router(vendor_router)
app.include_router(meals_router)
app.include_router(users_router)
app.include_router(orders_router)
app.include_router(health_router)


@app.get("/")
def root():
    return {"message": "Welcome to Wellora API 🌿"}
