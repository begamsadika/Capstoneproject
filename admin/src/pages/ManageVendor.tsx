import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Search,
} from "lucide-react";
import { AdminLayout, type AdminPage } from "../layout/AdminLayout";

type VendorStatus = "Approved" | "Suspended" | "Applied";

interface ManagedVendor {
  id: string;
  businessName: string;
  email: string;
  status: VendorStatus;
  listedMeals: number;
}

const MOCK_VENDORS: ManagedVendor[] = [
  {
    id: "VEND001",
    businessName: "FreshEats",
    email: "contact@fresheats.com",
    status: "Approved",
    listedMeals: 37,
  },
  {
    id: "VEND002",
    businessName: "GreenPlate",
    email: "hello@greenplate.com",
    status: "Applied",
    listedMeals: 21,
  },
  {
    id: "VEND003",
    businessName: "Healthy Bites",
    email: "info@healthybites.com",
    status: "Approved",
    listedMeals: 189,
  },
  {
    id: "VEND004",
    businessName: "NutriKitchen",
    email: "support@nutrikitchen.com",
    status: "Suspended",
    listedMeals: 54,
  },
  {
    id: "VEND005",
    businessName: "Fresh Harvest Cafe",
    email: "orders@freshharvest.com",
    status: "Applied",
    listedMeals: 12,
  },
  {
    id: "VEND006",
    businessName: "Balanced Bowls",
    email: "team@balancedbowls.com",
    status: "Approved",
    listedMeals: 76,
  },
  {
    id: "VEND007",
    businessName: "Lean Meals Co.",
    email: "contact@leanmeals.com",
    status: "Suspended",
    listedMeals: 43,
  },
  {
    id: "VEND008",
    businessName: "VitalEats",
    email: "hello@vitaleats.com",
    status: "Approved",
    listedMeals: 98,
  },
];

const PAGE_SIZE = 8;

interface ManageVendorProps {
  onNavigate: (page: AdminPage) => void;
  onLogout?: () => void;
}

function StatusBadge({ status }: { status: VendorStatus }) {
  const styles = {
    Approved: "bg-wellora-soft text-wellora-dark",
    Applied: "bg-orange-50 text-orange-600",
    Suspended: "bg-red-50 text-red-600",
  };

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function matchesMealCount(count: number, filter: string) {
  if (filter === "All Meal Counts") return true;
  if (filter === "0-25") return count <= 25;
  if (filter === "26-50") return count >= 26 && count <= 50;
  if (filter === "51-100") return count >= 51 && count <= 100;
  if (filter === "100+") return count > 100;
  return true;
}

export function ManageVendor({ onNavigate, onLogout }: ManageVendorProps) {
  const [vendors, setVendors] = useState(MOCK_VENDORS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [mealCountFilter, setMealCountFilter] = useState("All Meal Counts");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const filteredVendors = useMemo(() => {
    return vendors.filter((vendor) => {
      const query = search.toLowerCase();
      const matchesSearch =
        search.trim() === "" ||
        vendor.businessName.toLowerCase().includes(query) ||
        vendor.email.toLowerCase().includes(query) ||
        vendor.id.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "All Statuses" || vendor.status === statusFilter;

      const matchesMeals = matchesMealCount(vendor.listedMeals, mealCountFilter);

      return matchesSearch && matchesStatus && matchesMeals;
    });
  }, [vendors, search, statusFilter, mealCountFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedVendors = filteredVendors.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const rangeStart =
    filteredVendors.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredVendors.length);

  const allOnPageSelected =
    paginatedVendors.length > 0 &&
    paginatedVendors.every((vendor) => selectedIds.has(vendor.id));

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        paginatedVendors.forEach((vendor) => next.delete(vendor.id));
      } else {
        paginatedVendors.forEach((vendor) => next.add(vendor.id));
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

  const updateVendorStatus = (id: string, status: VendorStatus) => {
    setVendors((prev) =>
      prev.map((vendor) =>
        vendor.id === id ? { ...vendor, status } : vendor,
      ),
    );
  };

  return (
    <AdminLayout
      activePage="manage-vendors"
      onNavigate={onNavigate}
      onLogout={onLogout}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Manage Vendors
          </h1>
          <p className="mt-1 text-base text-slate-500">
            Approve and manage healthy meal vendors on the Wellora platform.
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
                placeholder="Search vendors..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-base text-slate-900 outline-none transition focus:border-wellora focus:ring-2 focus:ring-wellora/20"
              />
            </div>

            {[
              {
                value: statusFilter,
                onChange: setStatusFilter,
                options: ["All Statuses", "Approved", "Applied", "Suspended"],
              },
              {
                value: mealCountFilter,
                onChange: setMealCountFilter,
                options: [
                  "All Meal Counts",
                  "0-25",
                  "26-50",
                  "51-100",
                  "100+",
                ],
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
            <table className="w-full min-w-[900px] text-left text-base">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="w-12 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-slate-300 text-wellora focus:ring-wellora"
                      aria-label="Select all vendors on this page"
                    />
                  </th>
                  {[
                    "Vendor ID",
                    "Business Name",
                    "Email",
                    "Status",
                    "Listed Meals",
                    "Actions",
                  ].map((column) => (
                    <th key={column} className="px-4 py-3.5 font-medium">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedVendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(vendor.id)}
                        onChange={() => toggleSelect(vendor.id)}
                        className="h-4 w-4 rounded border-slate-300 text-wellora focus:ring-wellora"
                        aria-label={`Select ${vendor.businessName}`}
                      />
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-800">
                      {vendor.id}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {vendor.businessName}
                    </td>
                    <td className="px-4 py-4 text-slate-600">{vendor.email}</td>
                    <td className="px-4 py-4">
                      <StatusBadge status={vendor.status} />
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {vendor.listedMeals}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                        {vendor.status === "Applied" && (
                          <button
                            type="button"
                            onClick={() =>
                              updateVendorStatus(vendor.id, "Approved")
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-wellora px-3 py-1.5 text-sm font-medium text-white transition hover:bg-wellora-hover"
                          >
                            <Check className="h-4 w-4" />
                            Approve
                          </button>
                        )}
                        {vendor.status === "Approved" && (
                          <button
                            type="button"
                            onClick={() =>
                              updateVendorStatus(vendor.id, "Suspended")
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-600"
                          >
                            Suspend
                          </button>
                        )}
                        {vendor.status === "Suspended" && (
                          <button
                            type="button"
                            onClick={() =>
                              updateVendorStatus(vendor.id, "Approved")
                            }
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
                {paginatedVendors.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-base text-slate-500"
                    >
                      No vendors match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-end gap-4 border-t border-slate-200 px-5 py-4">
            <span className="text-base text-slate-500">
              {rangeStart}-{rangeEnd} of {filteredVendors.length}
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
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
