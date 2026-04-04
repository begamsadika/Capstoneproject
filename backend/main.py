from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routes.auth import router as auth_router

# Create all tables in database automatically
Base.metadata.create_all(bind=engine)

# Create FastAPI app
app = FastAPI(
    title="Wellora API",
    description="Backend API for Wellora Health App",
    version="1.0.0"
)

# Allow React frontend to talk to backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes
app.include_router(auth_router)

@app.get("/")
def root():
    return {"message": "Welcome to Wellora API 🌿"}