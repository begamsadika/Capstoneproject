import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";
import { AdminLayout, type AdminPage } from "../layout/AdminLayout";
import {
  approvePartner,
  getAdminPartners,
  rejectPartner,
  type ManagedPartner,
} from "../api/admin";

type PartnerStatus = "Approved" | "Pending" | "Rejected";

const PAGE_SIZE = 10;

interface ManagePartnersProps {
  onNavigate: (page: AdminPage) => void;
  onLogout?: () => void;
}

function StatusBadge({ status }: { status: PartnerStatus }) {
  const styles: Record<PartnerStatus, string> = {
    Approved: "bg-wellora-soft text-wellora-dark",
    Pending: "bg-orange-50 text-orange-600",
    Rejected: "bg-red-50 text-red-600",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${styles[status]}`}>
      {status}
    </span>
  );
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Not set";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ManagePartners({ onNavigate, onLogout }: ManagePartnersProps) {
  const [partners, setPartners] = useState<ManagedPartner[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAdminPartners(page, PAGE_SIZE, debouncedSearch || undefined, statusFilter)
      .then((data) => {
        setPartners(data.partners);
        setTotal(data.total);
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || "Failed to load partners.");
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const handleApprove = async (partner: ManagedPartner) => {
    try {
      await approvePartner(partner.id);
      setPartners((prev) =>
        prev.map((p) =>
          p.id === partner.id
            ? { ...p, status: "Approved", is_active: true, approval_date: new Date().toISOString() }
            : p,
        ),
      );
    } catch {
      alert("Failed to approve partner. Please try again.");
    }
  };

  const handleReject = async (partner: ManagedPartner) => {
    try {
      await rejectPartner(partner.id);
      setPartners((prev) =>
        prev.map((p) => (p.id === partner.id ? { ...p, status: "Rejected", is_active: false } : p)),
      );
    } catch {
      alert("Failed to reject partner. Please try again.");
    }
  };

  return (
    <AdminLayout activePage="manage-partners" onNavigate={onNavigate} onLogout={onLogout}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Manage Partners</h1>
          <p className="mt-1 text-base text-slate-500">
            Review hospital and gym partner registrations on the Wellora platform.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search partners..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-wellora focus:ring-2 focus:ring-wellora/20"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-base text-slate-700 outline-none transition focus:border-wellora focus:ring-2 focus:ring-wellora/20"
            >
              {["All Statuses", "Approved", "Pending", "Rejected"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <span className="ml-auto text-sm text-slate-500">{total} total</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-base">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  {[
                    "ID",
                    "Organization Name",
                    "Partner Type",
                    "Email",
                    "Phone",
                    "TIN",
                    "Company Reg. No.",
                    "Address",
                    "Registration Date",
                    "Status",
                    "Approval Date",
                    "Actions",
                  ].map((col) => (
                    <th key={col} className="px-4 py-3.5 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-wellora" />
                    </td>
                  </tr>
                ) : partners.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-12 text-center text-slate-500">
                      No partners match your filters.
                    </td>
                  </tr>
                ) : (
                  partners.map((partner) => (
                    <tr key={partner.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-4 font-medium text-slate-700">#{partner.id}</td>
                      <td className="px-4 py-4 font-medium text-slate-800">{partner.organization_name}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{partner.partner_type_label || "Not set"}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{partner.email}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{partner.phone || "Not set"}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{partner.tin_number || "Not set"}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{partner.company_registration_number || "Not set"}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{partner.address || "Not set"}</td>
                      <td className="px-4 py-4 text-sm text-slate-500">{formatDate(partner.submitted_at)}</td>
                      <td className="px-4 py-4"><StatusBadge status={partner.status} /></td>
                      <td className="px-4 py-4 text-sm text-slate-500">{formatDate(partner.approval_date)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          {partner.status !== "Approved" && (
                            <button
                              type="button"
                              onClick={() => handleApprove(partner)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-wellora px-3 py-1.5 text-sm font-medium text-white transition hover:bg-wellora-hover"
                            >
                              <Check className="h-4 w-4" /> Approve
                            </button>
                          )}
                          {partner.status !== "Rejected" && (
                            <button
                              type="button"
                              onClick={() => handleReject(partner)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-600"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-4 border-t border-slate-200 px-5 py-4">
            <span className="text-base text-slate-500">
              {rangeStart}-{rangeEnd} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-base font-medium text-slate-800">
                {page}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
