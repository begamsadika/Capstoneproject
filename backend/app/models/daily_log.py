from sqlalchemy import Column, Integer, Float, String, Date, DateTime, ForeignKey, Boolean
from datetime import datetime, date
from ..database import Base

class DailyLog(Base):
    """
    Daily tracking log per user.
    One record per day per user.
    Tracks actual intake vs targets.
    Used for progress tracking and AI training data.
    """
    __tablename__ = "Wellora_DailyLogs"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False)
    log_date             = Column(Date, default=date.today, nullable=False)

    # ─── Actual Intake ────────────────────────────
    calories_consumed    = Column(Integer, default=0)
    protein_consumed_g   = Column(Float,   default=0.0)
    carbs_consumed_g     = Column(Float,   default=0.0)
    fat_consumed_g       = Column(Float,   default=0.0)
    meals_count          = Column(Integer, default=0)

    # ─── Targets (snapshot from HealthMetric) ─────
    calorie_target       = Column(Integer, default=2000)
    protein_target_g     = Column(Float,   default=0.0)
    carbs_target_g       = Column(Float,   default=0.0)
    fat_target_g         = Column(Float,   default=0.0)

    # ─── Achievement ──────────────────────────────
    calorie_goal_met     = Column(Boolean, default=False)
    # True if within 10% of target
    streak_day           = Column(Integer, default=0)
    # How many consecutive days goal was met

    # ─── Wellness Scores (for AI) ─────────────────
    wellness_score       = Column(Integer, default=0)
    # 0-100 score based on goal achievement
    notes                = Column(String(500), nullable=True)

    # ─── Timestamps ───────────────────────────────
    created_at           = Column(DateTime, default=datetime.utcnow)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)