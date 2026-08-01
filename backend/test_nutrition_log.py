import unittest
from datetime import date

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models.daily_log import DailyLog
from app.models.health_metric import HealthMetric
from app.models.meal import Meal
from app.models.meal_log_entry import MealLogEntry
from app.models.order import Order
from app.models.user import User
from app.models.vendor_profile import VendorProfile
from app.models.vendor_approval import VendorApproval
from app.services.nutrition_log import add_diet_ai_entries


class NutritionLogTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(
            self.engine,
            tables=[
                User.__table__,
                VendorProfile.__table__,
                VendorApproval.__table__,
                HealthMetric.__table__,
                DailyLog.__table__,
                Meal.__table__,
                Order.__table__,
                MealLogEntry.__table__,
            ],
        )
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(
            User(
                id=5,
                name="Test User",
                email="nutrition@example.com",
                password_hash="test",
            )
        )
        self.db.add(
            HealthMetric(
                user_id=5,
                target_calories=2000,
                protein_target_g=150,
                carbs_target_g=200,
                fat_target_g=67,
            )
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_diet_ai_entry_updates_daily_aggregate_idempotently(self):
        entry = {
            "entry_id": "chat-entry-1",
            "date": date.today().isoformat(),
            "slot": "Breakfast",
            "food": "Boiled Egg",
            "serving_size_g": 60,
            "calories": 78,
            "protein_g": 6.3,
            "carbs_g": 0.6,
            "fat_g": 5.3,
            "logged_at": "2026-07-31T08:30",
        }

        self.assertEqual(add_diet_ai_entries(self.db, 5, [entry]), 1)
        self.db.commit()
        log = self.db.query(DailyLog).filter(DailyLog.user_id == 5).one()
        self.assertEqual(log.calories_consumed, 78)
        self.assertEqual(log.protein_consumed_g, 6.3)
        self.assertEqual(log.meals_count, 1)

        self.assertEqual(add_diet_ai_entries(self.db, 5, [entry]), 0)
        self.db.commit()
        self.assertEqual(self.db.query(MealLogEntry).count(), 1)
        self.assertEqual(log.calories_consumed, 78)


if __name__ == "__main__":
    unittest.main()
