import { useMemo, useState } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Download,
  Eye,
  Search,
} from "lucide-react";
import { AdminLayout, type AdminPage } from "../layout/AdminLayout";

interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: "User" | "Partner User";
  linkedPartner: string;
  status: "Active" | "Disabled";
}

const MOCK_USERS: ManagedUser[] = [
  {
    id: "USER001",
    name: "Alicia Johnson",
    email: "alicia@example.com",
    role: "User",
    linkedPartner: "No",
    status: "Active",
  },
  {
    id: "USER002",
    name: "Brian Smith",
    email: "brian@example.com",
    role: "Partner User",
    linkedPartner: "City Gym",
    status: "Active",
  },
  {
    id: "USER003",
    name: "Charlie Davis",
    email: "charlie@example.com",
    role: "User",
    linkedPartner: "No",
    status: "Disabled",
  },
  {
    id: "USER004",
    name: "Diana Miller",
    email: "diana@example.com",
    role: "Partner User",
    linkedPartner: "City Hospital",
    status: "Active",
  },
  {
    id: "USER005",
    name: "Ethan Wilson",
    email: "ethan@example.com",
    role: "User",
    linkedPartner: "No",
    status: "Active",
  },
  {
    id: "USER006",
    name: "Fiona Clark",
    email: "fiona@example.com",
    role: "Partner User",
    linkedPartner: "Metro Fitness Club",
    status: "Disabled",
  },
  {
    id: "USER007",
    name: "George Lee",
    email: "george@example.com",
    role: "User",
    linkedPartner: "No",
    status: "Active",
  },
  {
    id: "USER008",
    name: "Hannah Brooks",
    email: "hannah@example.com",
    role: "Partner User",
    linkedPartner: "Wellness Center East",
    status: "Active",
  },
];

const PAGE_SIZE = 5;

interface ManageUsersProps {
  onNavigate: (page: AdminPage) => void;
  onLogout?: () => void;
}

function StatusText({ status }: { status: ManagedUser["status"] }) {
  if (status === "Active") {
    return <span className="font-medium text-wellora">Active</span>;
  }
  return <span className="font-medium text-red-600">Disabled</span>;
}

export function ManageUsers({ onNavigate, onLogout }: ManageUsersProps) {
  const [users, setUsers] = useState(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All Roles");
  const [partnerFilter, setPartnerFilter] = useState("All Partners");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        search.trim() === "" ||
        user.name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase()) ||
        user.id.toLowerCase().includes(search.toLowerCase());

      const matchesRole =
        roleFilter === "All Roles" || user.role === roleFilter;

      const matchesPartner =
        partnerFilter === "All Partners" ||
        (partnerFilter === "No Partner" && user.linkedPartner === "No") ||
        user.linkedPartner === partnerFilter;

      const matchesStatus =
        statusFilter === "All Statuses" || user.status === statusFilter;

      return matchesSearch && matchesRole && matchesPartner && matchesStatus;
    });
  }, [users, search, roleFilter, partnerFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const rangeStart =
    filteredUsers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredUsers.length);

  const allOnPageSelected =
    paginatedUsers.length > 0 &&
    paginatedUsers.every((user) => selectedIds.has(user.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        paginatedUsers.forEach((user) => next.delete(user.id));
      } else {
        paginatedUsers.forEach((user) => next.add(user.id));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleUserStatus = (id: string) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === id
          ? {
              ...user,
              status: user.status === "Active" ? "Disabled" : "Active",
            }
          : user,
      ),
    );
  };

  const partnerOptions = [
    "All Partners",
    "No Partner",
    ...Array.from(
      new Set(
        MOCK_USERS.map((user) => user.linkedPartner).filter((p) => p !== "No"),
      ),
    ),
  ];

  return (
    <AdminLayout
      activePage="manage-users"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Manage Users
          </h1>
          <p className="mt-1 text-base text-slate-500">
            View and manage user accounts on the Wellora platform.
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search users..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-wellora focus:ring-2 focus:ring-wellora/20"
              />
            </div>

            {[
              {
                value: roleFilter,
                onChange: setRoleFilter,
                options: ["All Roles", "User", "Partner User"],
              },
              {
                value: partnerFilter,
                onChange: setPartnerFilter,
                options: partnerOptions,
              },
              {
                value: statusFilter,
                onChange: setStatusFilter,
                options: ["All Statuses", "Active", "Disabled"],
              },
            ].map((filter, index) => (
              <div key={index} className="relative">
                <select
                  value={filter.value}
                  onChange={(e) => {
                    filter.onChange(e.target.value);
                    setPage(1);
                  }}
                  className="appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-4 pr-10 text-base text-slate-700 outline-none transition focus:border-wellora focus:ring-2 focus:ring-wellora/20"
                >
                  {filter.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            ))}
          </div>

          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-wellora px-5 py-2.5 text-base font-medium text-white transition hover:bg-wellora-hover"
          >
            <Download className="h-5 w-5" />
            Export Data
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-base">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="w-12 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-wellora focus:ring-wellora"
                      aria-label="Select all users on this page"
                    />
                  </th>
                  {[
                    "User ID",
                    "Name",
                    "Email",
                    "Role",
                    "Linked Partner",
                    "Status",
                    "Actions",
                  ].map((column) => (
                    <th key={column} className="px-4 py-3.5 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={() => toggleSelect(user.id)}
                        className="h-4 w-4 rounded border-slate-300 text-wellora focus:ring-wellora"
                        aria-label={`Select ${user.name}`}
                      />
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-800">
                      {user.id}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{user.name}</td>
                    <td className="px-4 py-4 text-slate-600">{user.email}</td>
                    <td className="px-4 py-4 text-slate-700">{user.role}</td>
                    <td className="px-4 py-4 text-slate-600">
                      {user.linkedPartner}
                    </td>
                    <td className="px-4 py-4">
                      <StatusText status={user.status} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-sky-600 transition hover:bg-sky-50"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                        {user.status === "Active" ? (
                          <button
                            type="button"
                            onClick={() => toggleUserStatus(user.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
                          >
                            <Ban className="h-4 w-4" />
                            Disable
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleUserStatus(user.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-wellora px-3 py-1.5 text-sm font-medium text-white transition hover:bg-wellora-hover"
                          >
                            <Check className="h-4 w-4" />
                            Enable
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-base text-slate-500"
                    >
                      No users match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-4 border-t border-slate-200 px-5 py-4">
            <span className="text-base text-slate-500">
              {rangeStart}-{rangeEnd} of {filteredUsers.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-slate-100 px-3 text-base font-medium text-slate-800">
                {currentPage}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Last page"
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
