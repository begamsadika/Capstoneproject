from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.database import engine, Base
import os

# ⚠️ Import ALL models before create_all
from app.models.user import User
from app.models.vendor_profile import VendorProfile
from app.models.vendor_approval import VendorApproval

from app.routes.auth import router as auth_router
from app.routes.vender import router as vendor_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Wellora API",
    description="Backend API for Wellora Health App",
    version="1.0.0"
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

@app.get("/")
def root():
    return {"message": "Welcome to Wellora API 🌿"}