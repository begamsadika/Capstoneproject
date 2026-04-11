import { useState } from "react";
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
import type { AppPage } from "./types/page";
import type { VendorStatus } from "./api/vendor";

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
  "partner-dashboard",
];

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(() => {
    const savedPage = localStorage.getItem("current-page") as Page | null;
    return savedPage && validPages.includes(savedPage) ? savedPage : "home";
  });
  const [verificationEmail, setVerificationEmail] =
    useState<string>("user@email.com");

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

  const handleLoginSuccess = (role: Role, status?: VendorStatus) => {
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
      const completed = getOnboardingComplete("user");
      if (!completed) {
        persistNavigation("onboarding-user", role);
        return;
      }
      persistNavigation("user-dashboard", role);
      return;
    }

    if (role === "partner") {
      const completed = getOnboardingComplete("partner");
      if (!completed) {
        persistNavigation("onboarding-partner", role);
        return;
      }
      const approved = getAdminApproved("partner");
      if (approved) {
        persistNavigation("partner-dashboard", role);
      } else {
        persistNavigation("pending-approval", role);
      }
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
        {currentPage === "partner-dashboard" && (
          <div>Partner Dashboard (Placeholder)</div>
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
