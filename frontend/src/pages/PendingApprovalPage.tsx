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
  const application = getPendingApplication();
  return <PendingApproval {...application} onReturnHome={() => onNavigate("home")} />;
}
