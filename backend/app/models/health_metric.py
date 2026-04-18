from sqlalchemy import Column, Integer, Float, String, Date, DateTime, ForeignKey, Boolean
from datetime import datetime, date
from ..database import Base

class HealthMetric(Base):
    """
    Stores calculated health metrics per user.
    Updated whenever user profile changes or daily log is completed.
    Used for AI recommendations.
    """
    __tablename__ = "Wellora_HealthMetrics"

    id                        = Column(Integer, primary_key=True, index=True)
    user_id                   = Column(Integer, ForeignKey("Wellora_Users.id"), unique=True, nullable=False)

    # ─── Body Metrics ─────────────────────────────
    height_cm                 = Column(Float)
    weight_kg                 = Column(Float)
    bmi                       = Column(Float)
    bmi_category              = Column(String(30))
    # Underweight / Normal weight / Overweight / Obese

    # ─── Calorie Targets ──────────────────────────
    bmr                       = Column(Float)
    # Basal Metabolic Rate — calories burned at rest
    maintenance_calories      = Column(Integer)
    # BMR × activity factor
    target_calories           = Column(Integer)
    # Based on health goal (lose/maintain/gain)
    protein_target_g          = Column(Float)
    carbs_target_g            = Column(Float)
    fat_target_g              = Column(Float)

    # ─── Health Goal ──────────────────────────────
    health_goal               = Column(String(20))
    # lose / maintain / gain
    activity_level            = Column(String(20), default="moderate")
    # sedentary / light / moderate / active / very_active
    dietary_preference        = Column(String(100))
    allergies                 = Column(String(200))

    # ─── AI Features (for future ML model) ────────
    ideal_weight_kg           = Column(Float)
    weight_to_goal_kg         = Column(Float)
    estimated_weeks_to_goal   = Column(Integer)
    calorie_deficit_surplus   = Column(Integer)
    # negative = deficit (loss), positive = surplus (gain)

    # ─── Timestamps ───────────────────────────────
    calculated_at             = Column(DateTime, default=datetime.utcnow)
    updated_at                = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)