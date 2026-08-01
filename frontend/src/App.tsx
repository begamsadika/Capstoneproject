import { useEffect, useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { VerificationPage } from "./pages/VerificationPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { PendingPage } from "./pages/PendingPage";
import { UserDashboardPage } from "./pages/UserDashboardPage";
import { MenuOrderPage } from "./pages/MenuOrderPage";
import { MealRecommendationsPage } from "./pages/MealRecommendationsPage";
import { WellnessPage } from "./pages/WellnessPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VendorDashboardPage } from "./pages/VendorDashboardPage";
import { PartnerDashboardPage } from "./pages/PartnerDashboardPage";
import { PartnerGuidance } from "./pages/PartnerGuidance";
import type { AppPage } from "./types/page";
import type { VendorStatus } from "./api/vendor";
import {
  clearSessionForLogin,
  expireUserSession,
  getStoredSessionExpiryMs,
  SESSION_EXPIRED_EVENT,
} from "./auth/session";

type Page = AppPage;

type Role = "user" | "vendor" | "partner";

const validPages: Page[] = [
  "home",
  "login",
  "register",
  "verification",
  "onboarding-user",
  "onboarding-vendor",
  "onboarding-partner",
  "pending",
  "pending-approval",
  "user-dashboard",
  "user-menu-order",
  "user-meal-recommendations",
  "user-wellness",
  "user-settings",
  "vendor-dashboard",
  "vendor-order-management",
  "partner-dashboard",
  "partner-guidance",
];

const publicPages = new Set<Page>([
  "home",
  "login",
  "register",
  "verification",
]);

function resolveInitialPage(): Page {
  const savedPage = localStorage.getItem("current-page") as Page | null;
  const initialPage = savedPage && validPages.includes(savedPage) ? savedPage : "home";

  if (publicPages.has(initialPage)) return initialPage;

  const token = localStorage.getItem("wellora_token");
  const expiryMs = getStoredSessionExpiryMs();
  if (!token || expiryMs === null || expiryMs <= Date.now()) {
    clearSessionForLogin(Boolean(token));
    return "login";
  }

  return initialPage;
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(resolveInitialPage);
  const [verificationEmail, setVerificationEmail] =
    useState<string>("user@email.com");

  useEffect(() => {
    const handleSessionExpired = () => setCurrentPage("login");
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "wellora_token" && event.oldValue && !event.newValue) {
        localStorage.setItem("current-page", "login");
        setCurrentPage("login");
      }
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (publicPages.has(currentPage)) return;

    const expiryMs = getStoredSessionExpiryMs();
    if (expiryMs === null || expiryMs <= Date.now()) {
      expireUserSession();
      return;
    }

    const expiryTimer = window.setTimeout(
      expireUserSession,
      Math.min(expiryMs - Date.now(), 2_147_483_647),
    );
    return () => window.clearTimeout(expiryTimer);
  }, [currentPage]);

  const persistNavigation = (page: Page, role: Role | null = null) => {
    setCurrentPage(page);
    localStorage.setItem("current-page", page);

    if (role) {
      localStorage.setItem("current-role", role);
    } else if (page === "home" || page === "login" || page === "register") {
      localStorage.removeItem("current-role");
    }
  };

  const handleNavigate = (page: Page, email?: string) => {
    if (email) {
      setVerificationEmail(email);
    }
    persistNavigation(page);
  };

  const getOnboardingComplete = (role: Role) => {
    return localStorage.getItem(`${role}-onboarding-complete`) === "true";
  };

  const getAdminApproved = (role: "vendor" | "partner") => {
    return localStorage.getItem(`${role}-admin-approved`) === "true";
  };

  const persistVendorStatus = (status: VendorStatus) => {
    localStorage.setItem("vendor-status", status);
  };

  const handleLoginSuccess = async (
    role: Role,
    status?: VendorStatus,
    onboardingDone?: boolean | null,
  ) => {
    if (role === "vendor") {
      const currentStatus = (status ?? "NEW").toUpperCase() as VendorStatus;
      persistVendorStatus(currentStatus);

      if (currentStatus === "NEW") {
        persistNavigation("onboarding-vendor", role);
        return;
      }
      if (currentStatus === "PENDING") {
        persistNavigation("pending", role);
        return;
      }
      if (currentStatus === "APPROVED") {
        persistNavigation("vendor-dashboard", role);
        return;
      }
      persistNavigation("onboarding-vendor", role);
      return;
    }

    if (role === "user") {
      if (typeof onboardingDone === "boolean") {
        persistNavigation(
          onboardingDone ? "user-dashboard" : "onboarding-user",
          role,
        );
        return;
      }

      // ✅ Check backend if onboarding is done
      try {
        const { getUserProfile } = await import("./api/user");
        const profile = await getUserProfile();
        if (profile && profile.onboarding_done) {
          persistNavigation("user-dashboard", role);
        } else {
          persistNavigation("onboarding-user", role);
        }
      } catch {
        if (!localStorage.getItem("wellora_token")) return;
        persistNavigation("onboarding-user", role);
      }
      return;
    }

    if (role === "partner") {
      persistNavigation("partner-dashboard", role);
      return;
    }
  };
  return (
    <ThemeProvider>
      <div className="transition-colors duration-500">
        {currentPage === "home" && <HomePage onNavigate={setCurrentPage} />}
        {currentPage === "login" && (
          <LoginPage
            onNavigate={setCurrentPage}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
        {currentPage === "register" && (
          <RegisterPage onNavigate={handleNavigate} />
        )}
        {currentPage === "verification" && (
          <VerificationPage
            email={verificationEmail}
            onNavigate={setCurrentPage}
          />
        )}
        {currentPage === "onboarding-user" && (
          <OnboardingPage role="user" onNavigate={handleNavigate} />
        )}
        {currentPage === "onboarding-vendor" && (
          <OnboardingPage role="vendor" onNavigate={handleNavigate} />
        )}
        {currentPage === "onboarding-partner" && (
          <OnboardingPage role="partner" onNavigate={handleNavigate} />
        )}
        {currentPage === "pending" && (
          <PendingPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "pending-approval" && (
          <PendingApprovalPage onNavigate={handleNavigate} />
        )}
        {currentPage === "user-dashboard" && (
          <UserDashboardPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "user-menu-order" && (
          <MenuOrderPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "user-meal-recommendations" && (
          <MealRecommendationsPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "user-wellness" && (
          <WellnessPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "user-settings" && (
          <SettingsPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "vendor-dashboard" && (
          <VendorDashboardPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "vendor-order-management" && (
          <VendorDashboardPage
            onNavigate={setCurrentPage}
            initialSection="orders"
          />
        )}
        {currentPage === "partner-dashboard" && (
          <PartnerDashboardPage onNavigate={setCurrentPage} />
        )}
        {currentPage === "partner-guidance" && (
          <PartnerGuidance onNavigate={setCurrentPage} />
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
