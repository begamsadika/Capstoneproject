import { useEffect, useState } from "react";
import { getCurrentUser } from "../api/auth";
import { PendingApproval } from "../components/PendingApproval";
import type { AppPage } from "../types/page";

interface PendingApplication {
  applicationType: "Partner" | "Vendor";
  partnerType?: "hospital" | "gym" | "";
  organizationName: string;
  email: string;
  status: string;
  submittedDate: string;
  applicationId: string;
}

interface PendingApprovalPageProps {
  onNavigate: (page: AppPage) => void;
}

const fallbackApplication: PendingApplication = {
  applicationType: "Partner",
  partnerType: "hospital",
  organizationName: "Wellora Partner",
  email: "partner@wellora.com",
  status: "Pending Approval",
  submittedDate: new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }),
  applicationId: "APP-PENDING",
};

function getPendingApplication(): PendingApplication {
  const saved = localStorage.getItem("pending-approval-application");
  if (!saved) return fallbackApplication;

  try {
    return { ...fallbackApplication, ...(JSON.parse(saved) as Partial<PendingApplication>) };
  } catch {
    return fallbackApplication;
  }
}

export function PendingApprovalPage({ onNavigate }: PendingApprovalPageProps) {
  const [application, setApplication] = useState<PendingApplication>(() => getPendingApplication());
  const [notice, setNotice] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const updateFromCurrentUser = async (showPendingMessage = false) => {
    const token = localStorage.getItem("wellora_token");
    if (!token) {
      if (showPendingMessage) setStatusMessage("Sign in to refresh your application status.");
      return;
    }

    setIsRefreshing(true);
    setStatusMessage("");
    try {
      const user = await getCurrentUser();
      localStorage.setItem("wellora_user", JSON.stringify(user));
      const applicationType = user.user_type === "vendor" ? "Vendor" : "Partner";
      const nextApplication: PendingApplication = {
        applicationType,
        partnerType: user.partner_type ?? "",
        organizationName: user.organization_name || user.name,
        email: user.email,
        status:
          user.registration_status === "approved" && user.is_active
            ? "Approved"
            : user.registration_status === "rejected"
              ? "Rejected"
              : user.registration_status === "approved" && !user.is_active
                ? "Inactive"
                : "Pending Approval",
        submittedDate: new Date(user.created_at || Date.now()).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        applicationId: `${applicationType.slice(0, 3).toUpperCase()}-${user.id}`,
      };
      setApplication(nextApplication);
      localStorage.setItem("pending-approval-application", JSON.stringify(nextApplication));

      if (nextApplication.status === "Approved") {
        setNotice("Your account has been approved. Redirecting...");
        window.setTimeout(
          () => onNavigate(user.user_type === "vendor" ? "vendor-dashboard" : "partner-dashboard"),
          900,
        );
        return;
      }
      if (nextApplication.status === "Rejected") {
        setStatusMessage(
          user.user_type === "vendor"
            ? "Your vendor registration was not approved. Contact support for further information."
            : "Your partner registration was not approved. Contact support for further information.",
        );
        return;
      }
      if (nextApplication.status === "Inactive") {
        setStatusMessage("Your account is currently inactive. Contact support for assistance.");
        return;
      }
      if (showPendingMessage) {
        setStatusMessage(
          user.user_type === "vendor"
            ? "Your vendor account is awaiting administrator approval."
            : "Your partner account is awaiting administrator approval.",
        );
      }
    } catch {
      if (showPendingMessage) {
        setStatusMessage("We could not verify your account status. Please try again.");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    updateFromCurrentUser(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("wellora_token");
    localStorage.removeItem("wellora_user");
    localStorage.removeItem("current-role");
    localStorage.removeItem("pending-approval-application");
    onNavigate("home");
  };

  if (notice) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-wellora-light via-white to-wellora-soft p-6 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="rounded-3xl border border-white/70 bg-white/90 p-8 text-center shadow-2xl dark:border-gray-700 dark:bg-gray-900">
          <p className="text-lg font-semibold text-wellora">{notice}</p>
        </div>
      </div>
    );
  }

  return (
    <PendingApproval
      {...application}
      onReturnHome={() => onNavigate("home")}
      onLogout={handleLogout}
      onRefreshStatus={() => updateFromCurrentUser(true)}
      isRefreshing={isRefreshing}
      statusMessage={statusMessage}
    />
  );
}
