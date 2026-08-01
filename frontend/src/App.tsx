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
import { CheckoutResultPage } from "./pages/CheckoutResultPage";
import { VendorDashboardPage } from "./pages/VendorDashboardPage";
import { PartnerDashboardPage } from "./pages/PartnerDashboardPage";
import { PartnerGuidance } from "./pages/PartnerGuidance";
import { InvitationSetupPage } from "./pages/InvitationSetupPage";
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
type StoredUser = {
  user_type?: string;
  is_active?: boolean;
  registration_status?: string;
};

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
  "invitation-setup",
  "checkout-success",
  "checkout-cancel",
];

const generalPages: Page[] = [
  "onboarding-user",
  "user-dashboard",
  "user-menu-order",
  "user-meal-recommendations",
  "user-wellness",
  "user-settings",
];

const vendorPages: Page[] = [
  "onboarding-vendor",
  "vendor-dashboard",
  "vendor-order-management",
];

const partnerPages: Page[] = [
  "onboarding-partner",
  "partner-dashboard",
  "partner-guidance",
];

const publicPages = new Set<Page>([
  "home",
  "login",
  "register",
  "verification",
  "invitation-setup",
  "pending-approval",
  "checkout-success",
  "checkout-cancel",
]);

const pagePaths: Partial<Record<Page, string>> = {
  home: "/",
  login: "/login",
  register: "/register",
  "pending-approval": "/register/pending-approval",
  "checkout-success": "/checkout/success",
  "checkout-cancel": "/checkout/cancel",
};

const pageFromPath = (pathname: string): Page | null => {
  if (pathname === "/" || pathname === "") return "home";
  const match = Object.entries(pagePaths).find(([, path]) => path === pathname);
  return (match?.[0] as Page | undefined) ?? null;
};

const pathForPage = (page: Page) => pagePaths[page] ?? null;

const readStoredUser = (): StoredUser | null => {
  try {
    const raw = localStorage.getItem("wellora_user");
    return raw ? (JSON.parse(raw) as StoredUser) : null;
  } catch {
    return null;
  }
};

const isApprovedBusinessAccount = (user: StoredUser) =>
  user.is_active !== false && user.registration_status === "approved";

const guardedPage = (page: Page): Page => {
  const user = readStoredUser();

  if (page === "pending-approval") return page;
  if (![...generalPages, ...vendorPages, ...partnerPages].includes(page)) return page;

  const token = localStorage.getItem("wellora_token");
  if (!token || !user?.user_type) return "login";

  if (generalPages.includes(page)) {
    return user.user_type === "general" && user.is_active !== false ? page : "login";
  }

  if (vendorPages.includes(page)) {
    if (user.user_type !== "vendor") return "login";
    if (page === "onboarding-vendor") {
      return isApprovedBusinessAccount(user) ? "vendor-dashboard" : "pending-approval";
    }
    return isApprovedBusinessAccount(user) ? page : "pending-approval";
  }

  if (partnerPages.includes(page)) {
    if (user.user_type !== "partner") return "login";
    if (page === "onboarding-partner") {
      return isApprovedBusinessAccount(user) ? "partner-dashboard" : "pending-approval";
    }
    return isApprovedBusinessAccount(user) ? page : "pending-approval";
  }

  return page;
};

function resolveInitialPage(): Page {
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  if (inviteToken) return "invitation-setup";

  const pathPage = pageFromPath(window.location.pathname);
  const savedPage = localStorage.getItem("current-page") as Page | null;
  const initialPage =
    pathPage ?? (savedPage && validPages.includes(savedPage) ? savedPage : "home");

  if (publicPages.has(initialPage)) return initialPage;

  const token = localStorage.getItem("wellora_token");
  const expiryMs = getStoredSessionExpiryMs();
  if (!token || expiryMs === null || expiryMs <= Date.now()) {
    clearSessionForLogin(Boolean(token));
    return "login";
  }

  return guardedPage(initialPage);
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(resolveInitialPage);
  try {
    const user = JSON.parse(localStorage.getItem("wellora_user") || "{}") as {
      user_type?: string;
      is_active?: boolean;
    };
    if (
      user.is_active === false &&
      (user.user_type === "partner" || user.user_type === "vendor") &&
      restrictedPendingPages.includes(initialPage)
    ) {
      return "pending-approval";
    }
  } catch {
    // Keep the resolved page if local storage contains malformed user data.
  }

  return initialPage;
}

function App() {
  const [invitationToken] = useState(
    () => new URLSearchParams(window.location.search).get("invite") ?? "",
  );
  const [verificationEmail, setVerificationEmail] =
    useState<string>("user@email.com");

  useEffect(() => {
    const handlePopState = () => {
      const page = pageFromPath(window.location.pathname);
      if (page) setCurrentPage(guardedPage(page));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

  const persistNavigation = (requestedPage: Page, role: Role | null = null) => {
    const page = guardedPage(requestedPage);
    setCurrentPage(page);
    localStorage.setItem("current-page", page);

    const nextPath = pathForPage(page);
    if (nextPath && window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }

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

      try {
        const { getUserProfile } = await import("./api/user");
        const profile = await getUserProfile();
        persistNavigation(
          profile && profile.onboarding_done ? "user-dashboard" : "onboarding-user",
          role,
        );
      } catch {
        if (!localStorage.getItem("wellora_token")) return;
        persistNavigation("onboarding-user", role);
      }
      return;
    }

    if (role === "partner") {
      persistNavigation("partner-dashboard", role);
    }
  };

  return (
    <ThemeProvider>
      <div className="transition-colors duration-500">
        {currentPage === "home" && <HomePage onNavigate={handleNavigate} />}
        {currentPage === "login" && (
          <LoginPage
            onNavigate={handleNavigate}
            onLoginSuccess={handleLoginSuccess}
          />
        )}
        {currentPage === "register" && (
          <RegisterPage onNavigate={handleNavigate} />
        )}
        {currentPage === "verification" && (
          <VerificationPage
            email={verificationEmail}
            onNavigate={handleNavigate}
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
          <PendingPage onNavigate={handleNavigate} />
        )}
        {currentPage === "pending-approval" && (
          <PendingApprovalPage onNavigate={handleNavigate} />
        )}
        {currentPage === "user-dashboard" && (
          <UserDashboardPage onNavigate={handleNavigate} />
        )}
        {currentPage === "user-menu-order" && (
          <MenuOrderPage onNavigate={handleNavigate} />
        )}
        {currentPage === "user-meal-recommendations" && (
          <MealRecommendationsPage onNavigate={handleNavigate} />
        )}
        {currentPage === "user-wellness" && (
          <WellnessPage onNavigate={handleNavigate} />
        )}
        {currentPage === "user-settings" && (
          <SettingsPage onNavigate={handleNavigate} />
        )}
        {currentPage === "vendor-dashboard" && (
          <VendorDashboardPage onNavigate={handleNavigate} />
        )}
        {currentPage === "vendor-order-management" && (
          <VendorDashboardPage
            onNavigate={handleNavigate}
            initialSection="orders"
          />
        )}
        {currentPage === "partner-dashboard" && (
          <PartnerDashboardPage onNavigate={handleNavigate} />
        )}
        {currentPage === "partner-guidance" && (
          <PartnerGuidance onNavigate={handleNavigate} />
        )}
        {currentPage === "invitation-setup" && (
          <InvitationSetupPage
            token={invitationToken}
            onNavigate={handleNavigate}
          />
        )}
        {currentPage === "checkout-success" && (
          <CheckoutResultPage type="success" onNavigate={handleNavigate} />
        )}
        {currentPage === "checkout-cancel" && (
          <CheckoutResultPage type="cancel" onNavigate={handleNavigate} />
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
