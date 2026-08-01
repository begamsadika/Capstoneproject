import {
  CheckCircle2,
  Circle,
  Clock3,
  Headphones,
  Home,
  LogOut,
  Mail,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

export interface PendingApprovalProps {
  applicationType: "Partner" | "Vendor";
  partnerType?: "hospital" | "gym" | "";
  organizationName: string;
  email: string;
  status: string;
  submittedDate: string;
  applicationId: string;
  onReturnHome: () => void;
  onLogout?: () => void;
  onRefreshStatus?: () => void;
  isRefreshing?: boolean;
  statusMessage?: string;
}

const formatPartnerType = (partnerType?: string) => {
  if (partnerType === "gym") return "Gym";
  if (partnerType === "hospital") return "Hospital";
  return "Not provided";
};

export function PendingApproval({
  applicationType,
  partnerType,
  organizationName,
  email,
  status,
  submittedDate,
  applicationId,
  onReturnHome,
  onLogout,
  onRefreshStatus,
  isRefreshing = false,
  statusMessage = "",
}: PendingApprovalProps) {
  const isPartner = applicationType === "Partner";
  const nameLabel = isPartner ? "Organization Name" : "Business Name";
  const timeline: { title: string; state: "done" | "current" | "next"; icon: LucideIcon }[] = [
    { title: "Registration Submitted", state: "done", icon: CheckCircle2 },
    { title: "Verification & Approval", state: "current", icon: Clock3 },
    { title: "Approval Email", state: "next", icon: Mail },
    { title: `${applicationType} Portal Activated`, state: "next", icon: Circle },
  ];
  const summary = [
    ["Application ID", applicationId],
    [nameLabel, organizationName],
    ...(isPartner ? [["Partner Type", formatPartnerType(partnerType)]] : []),
    ["Registered Email", email],
    ["Submitted Date", submittedDate],
    ["Current Status", status],
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-wellora-light via-white to-wellora-soft px-4 py-10 text-slate-900 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 dark:text-white">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center">
        <div className="w-full rounded-3xl border border-white/70 bg-white/90 p-6 shadow-2xl backdrop-blur-xl dark:border-gray-700/60 dark:bg-gray-900/85 sm:p-8">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-wellora-soft text-wellora-dark">
              <CheckCircle2 className="h-11 w-11" />
            </div>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Registration Submitted Successfully!
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 dark:text-slate-300">
              Thank you for registering as a Wellora {applicationType}. Your application has been received successfully.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Current Status</p>
              <div className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700">
                Pending Approval
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Our administration team is reviewing your organization details. Once approved you will receive an email notification and your {applicationType} Portal will become available.
              </p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Estimated Review Time</p>
              <p className="mt-3 text-3xl font-bold text-wellora-dark dark:text-wellora">1-2</p>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Business Days</p>
            </section>
          </div>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Application Summary</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summary.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Approval Timeline</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {timeline.map(({ title, state, icon: Icon }) => (
                <div key={title} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <Icon
                    className={`h-6 w-6 ${
                      state === "done"
                        ? "text-wellora"
                        : state === "current"
                          ? "text-amber-500"
                          : "text-slate-300"
                    }`}
                  />
                  <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                  {state === "current" && <p className="mt-1 text-xs text-amber-600">Current</p>}
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Prepare While You Wait</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                "Verify organization information",
                "Prepare your users list",
                "Review onboarding guide",
                "Check your email regularly",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <CheckCircle2 className="h-5 w-5 text-wellora" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            {statusMessage && (
              <div className="sm:basis-full">
                <p className="text-center text-sm font-medium text-slate-600 dark:text-slate-300">
                  {statusMessage}
                </p>
              </div>
            )}
            {onRefreshStatus && (
              <button
                type="button"
                onClick={onRefreshStatus}
                disabled={isRefreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-wellora/30 bg-wellora-light px-5 py-3 text-sm font-semibold text-wellora-dark transition hover:bg-wellora-soft disabled:cursor-not-allowed disabled:opacity-70 dark:border-wellora/40 dark:bg-wellora/10 dark:text-wellora"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Checking..." : "Refresh Status"}
              </button>
            )}
            <button
              type="button"
              onClick={onReturnHome}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-wellora px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-wellora-hover"
            >
              <Home className="h-4 w-4" /> Return Home
            </button>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Headphones className="h-4 w-4" /> Contact Support
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
