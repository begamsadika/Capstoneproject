import os
import sys
import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.core.security import hash_password
from app.database import Base, get_db
from app.models.daily_log import DailyLog
from app.models.health_metric import HealthMetric
from app.models.meal import Meal
from app.models.meal_rating import MealRating
from app.models.order import Order
from app.models.partner_client import PartnerClient
from app.models.partner_meal_recommendation import PartnerMealRecommendation
from app.models.user import User
from app.models.user_profile import UserProfile
from app.models.vendor_approval import VendorApproval
from app.models.vendor_profile import VendorProfile
from app.routes.admin import router as admin_router
from app.routes.auth import router as auth_router
from app.routes.partner import router as partner_router
from app.routes.users import router as users_router
from app.routes.vender import router as vendor_router


class AuthApprovalWorkflowTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)

        app = FastAPI()

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        app.include_router(auth_router)
        app.include_router(users_router)
        app.include_router(vendor_router)
        app.include_router(admin_router)
        app.include_router(partner_router)
        self.client = TestClient(app)

        self.admin_password = "AdminPass!1"
        with self.SessionLocal() as db:
            db.add(
                User(
                    name="Admin User",
                    email="admin@example.test",
                    password_hash=hash_password(self.admin_password),
                    user_type="admin",
                    registration_status="approved",
                    is_active=True,
                )
            )
            db.commit()

    def register_payload(self, email, user_type="general", partner_type=None):
        payload = {
            "name": "Test User",
            "email": email,
            "password": "ValidPass!",
            "phone": "+94712345678",
            "user_type": user_type,
        }
        if user_type in {"vendor", "partner"}:
            payload.update(
                {
                    "organization_name": f"{user_type.title()} Org",
                    "tin_number": "TIN-12345",
                    "company_registration_number": "REG-12345",
                    "address": "123 Test Street",
                }
            )
        if partner_type is not None:
            payload["partner_type"] = partner_type
        return payload

    def login(self, email, password="ValidPass!"):
        response = self.client.post("/api/auth/login", json={"email": email, "password": password})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()["access_token"]

    def auth_headers(self, token):
        return {"Authorization": f"Bearer {token}"}

    def admin_token(self):
        return self.login("admin@example.test", self.admin_password)

    def test_general_registration_is_approved_and_authenticated(self):
        response = self.client.post(
            "/api/auth/register",
            json=self.register_payload("general.user@example.test"),
        )
        self.assertEqual(response.status_code, 200, response.text)
        data = response.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["user"]["user_type"], "general")
        self.assertEqual(data["user"]["registration_status"], "approved")
        self.assertTrue(data["user"]["is_active"])

        me = self.client.get("/api/users/me", headers=self.auth_headers(data["access_token"]))
        self.assertEqual(me.status_code, 200, me.text)
        self.assertEqual(me.json()["email"], "general.user@example.test")

    def test_admin_role_cannot_be_publicly_registered(self):
        response = self.client.post(
            "/api/auth/register",
            json=self.register_payload("attacker@example.test", user_type="admin"),
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.json()["detail"]["errors"]["user_type"], "The selected account type is invalid.")

    def test_duplicate_email_is_case_insensitive(self):
        first = self.client.post(
            "/api/auth/register",
            json=self.register_payload("duplicate@example.test"),
        )
        self.assertEqual(first.status_code, 200, first.text)

        duplicate = self.client.post(
            "/api/auth/register",
            json=self.register_payload("  DUPLICATE@example.test  "),
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(
            duplicate.json()["detail"]["message"],
            "An account already exists with this email address.",
        )

    def test_pending_vendor_is_limited_until_admin_approval(self):
        response = self.client.post(
            "/api/auth/register",
            json=self.register_payload("vendor@example.test", user_type="vendor"),
        )
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["access_token"]
        self.assertEqual(response.json()["user"]["registration_status"], "pending")
        self.assertFalse(response.json()["user"]["is_active"])

        status_response = self.client.get("/api/vendor/status", headers=self.auth_headers(token))
        self.assertEqual(status_response.status_code, 200, status_response.text)
        self.assertEqual(status_response.json()["status"], "PENDING")

        protected_response = self.client.get("/api/vendor/profile", headers=self.auth_headers(token))
        self.assertEqual(protected_response.status_code, 403)
        self.assertEqual(protected_response.json()["detail"]["code"], "ACCOUNT_PENDING_APPROVAL")
        self.assertEqual(
            protected_response.json()["detail"]["message"],
            "Your vendor account is awaiting administrator approval.",
        )

        admin_headers = self.auth_headers(self.admin_token())
        vendors = self.client.get("/api/admin/vendors?status_filter=Pending", headers=admin_headers)
        self.assertEqual(vendors.status_code, 200, vendors.text)
        self.assertEqual(vendors.json()["total"], 1)
        vendor_id = vendors.json()["vendors"][0]["id"]

        approval = self.client.put(f"/api/admin/vendors/{vendor_id}/approve", headers=admin_headers)
        self.assertEqual(approval.status_code, 200, approval.text)
        self.assertEqual(approval.json()["message"], "Vendor account approved successfully.")

        refreshed = self.client.get("/api/vendor/status", headers=self.auth_headers(token))
        self.assertEqual(refreshed.status_code, 200, refreshed.text)
        self.assertEqual(refreshed.json()["status"], "APPROVED")

    def test_pending_partner_is_blocked_until_admin_approval(self):
        response = self.client.post(
            "/api/auth/register",
            json=self.register_payload(
                "partner@example.test",
                user_type="partner",
                partner_type="gym",
            ),
        )
        self.assertEqual(response.status_code, 200, response.text)
        token = response.json()["access_token"]
        self.assertEqual(response.json()["user"]["partner_type"], "gym")
        self.assertEqual(response.json()["user"]["registration_status"], "pending")

        blocked = self.client.get("/api/partner/users", headers=self.auth_headers(token))
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["detail"]["code"], "ACCOUNT_PENDING_APPROVAL")
        self.assertEqual(
            blocked.json()["detail"]["message"],
            "Your partner account is awaiting administrator approval.",
        )

        admin_headers = self.auth_headers(self.admin_token())
        partners = self.client.get("/api/admin/partners?status_filter=Pending", headers=admin_headers)
        self.assertEqual(partners.status_code, 200, partners.text)
        self.assertEqual(partners.json()["total"], 1)
        partner_id = partners.json()["partners"][0]["id"]

        approval = self.client.put(f"/api/admin/partners/{partner_id}/approve", headers=admin_headers)
        self.assertEqual(approval.status_code, 200, approval.text)
        self.assertEqual(approval.json()["message"], "Partner account approved successfully.")

        allowed = self.client.get("/api/partner/users", headers=self.auth_headers(token))
        self.assertEqual(allowed.status_code, 200, allowed.text)

    def test_non_admin_cannot_approve_accounts(self):
        general = self.client.post(
            "/api/auth/register",
            json=self.register_payload("plain@example.test"),
        )
        self.assertEqual(general.status_code, 200, general.text)

        blocked = self.client.put(
            "/api/admin/partners/999/approve",
            headers=self.auth_headers(general.json()["access_token"]),
        )
        self.assertEqual(blocked.status_code, 403)

    def test_rejected_vendor_keeps_protected_access_blocked(self):
        registered = self.client.post(
            "/api/auth/register",
            json=self.register_payload("rejected.vendor@example.test", user_type="vendor"),
        )
        self.assertEqual(registered.status_code, 200, registered.text)
        token = registered.json()["access_token"]

        admin_headers = self.auth_headers(self.admin_token())
        vendors = self.client.get("/api/admin/vendors?status_filter=Pending", headers=admin_headers)
        vendor_id = vendors.json()["vendors"][0]["id"]
        rejected = self.client.put(f"/api/admin/vendors/{vendor_id}/suspend", headers=admin_headers)
        self.assertEqual(rejected.status_code, 200, rejected.text)

        status_response = self.client.get("/api/vendor/status", headers=self.auth_headers(token))
        self.assertEqual(status_response.status_code, 200, status_response.text)
        self.assertEqual(status_response.json()["status"], "REJECTED")

        protected = self.client.get("/api/vendor/profile", headers=self.auth_headers(token))
        self.assertEqual(protected.status_code, 403)
        self.assertEqual(protected.json()["detail"]["code"], "ACCOUNT_REJECTED")


if __name__ == "__main__":
    unittest.main()
