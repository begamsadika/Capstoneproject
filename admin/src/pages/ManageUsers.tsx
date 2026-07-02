import { useEffect, useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Loader2,
  Search,
} from "lucide-react";
import { AdminLayout, type AdminPage } from "../layout/AdminLayout";
import { getAdminUsers, toggleUserStatus, type ManagedUser } from "../api/admin";

const PAGE_SIZE = 10;

interface ManageUsersProps {
  onNavigate: (page: AdminPage) => void;
  onLogout?: () => void;
}

function StatusText({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="font-medium text-wellora">Active</span>
  ) : (
    <span className="font-medium text-red-600">Disabled</span>
  );
}

export function ManageUsers({ onNavigate, onLogout }: ManageUsersProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [page, setPage] = useState(1);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch users
  useEffect(() => {
    setLoading(true);
    setError(null);
    getAdminUsers(page, PAGE_SIZE, debouncedSearch || undefined, statusFilter)
      .then((data) => {
        setUsers(data.users);
        setTotal(data.total);
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || "Failed to load users.");
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, statusFilter]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const handleToggle = async (user: ManagedUser) => {
    try {
      const result = await toggleUserStatus(user.id);
      setUsers((prev) =>
        prev.map((u) => u.id === user.id ? { ...u, is_active: result.is_active } : u),
      );
    } catch {
      alert("Failed to update user status. Please try again.");
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });

  return (
    <AdminLayout activePage="manage-users" onNavigate={onNavigate} onLogout={onLogout}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Manage Users</h1>
          <p className="mt-1 text-base text-slate-500">
            View and manage user accounts on the Wellora platform.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-wellora focus:ring-2 focus:ring-wellora/20"
            />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-base text-slate-700 outline-none transition focus:border-wellora focus:ring-2 focus:ring-wellora/20"
            >
              {["All Statuses", "Active", "Disabled"].map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
          <span className="ml-auto text-sm text-slate-500">{total} total</span>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {error && (
            <div className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-base">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  {["ID", "Name", "Email", "Type", "Status", "Joined", "Actions"].map((col) => (
                    <th key={col} className="px-4 py-3.5 font-medium">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-wellora" />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      No users match your filters.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-4 font-medium text-slate-700">#{user.id}</td>
                      <td className="px-4 py-4 text-slate-800">{user.name}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{user.email}</td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600 capitalize">
                          {user.user_type}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <StatusText isActive={user.is_active} />
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-500">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-4">
                        {user.is_active ? (
                          <button
                            type="button"
                            onClick={() => handleToggle(user)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
                          >
                            <Ban className="h-4 w-4" /> Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggle(user)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-wellora px-3 py-1.5 text-sm font-medium text-white transition hover:bg-wellora-hover"
                          >
                            <Check className="h-4 w-4" /> Enable
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-end gap-4 border-t border-slate-200 px-5 py-4">
            <span className="text-base text-slate-500">
              {rangeStart}–{rangeEnd} of {total}
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
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronsRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
