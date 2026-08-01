from datetime import datetime, date

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint

from ..database import Base


class MealLogEntry(Base):
    """One food the user reported consuming.

    DailyLog remains the fast dashboard aggregate; these rows are the auditable
    source records that allow totals to be rebuilt without losing meal detail.
    """

    __tablename__ = "Wellora_MealLogEntries"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "source",
            "source_reference",
            name="uq_wellora_meal_log_source",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("Wellora_Users.id"), nullable=False, index=True)
    log_date = Column(Date, default=date.today, nullable=False, index=True)
    meal_type = Column(String(30), default="Other", nullable=False)
    food_name = Column(String(200), nullable=False)
    quantity = Column(Float, default=1.0, nullable=False)
    serving_size_g = Column(Float, nullable=True)
    calories = Column(Integer, default=0, nullable=False)
    protein_g = Column(Float, default=0.0, nullable=False)
    carbs_g = Column(Float, default=0.0, nullable=False)
    fat_g = Column(Float, default=0.0, nullable=False)
    source = Column(String(40), nullable=False)
    source_reference = Column(String(100), nullable=False)
    logged_at = Column(DateTime, default=datetime.utcnow, nullable=False)

