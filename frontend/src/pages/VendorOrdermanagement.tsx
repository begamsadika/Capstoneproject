import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Grid3x3,
  HelpCircle,
  MoreHorizontal,
  Printer,
  Search,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  getVendorOrders,
  getVendorOrderStats,
  updateOrderStatus,
  createVendorManualOrder,
  type VendorOrder,
  type VendorOrderStats,
} from "../api/orders";
import type { AppPage } from "../types/page";
import { getVendorMeals, type Meal } from "../api/meals";

interface OrderTab {
  label: string;
  apiStatus?: string;
}

const tabs: OrderTab[] = [
  { label: "All" },
  { label: "Pending", apiStatus: "pending" },
  { label: "Accepted", apiStatus: "confirmed" },
  { label: "Preparing", apiStatus: "confirmed" },
  { label: "Ready", apiStatus: "delivered" },
  { label: "Out for Delivery", apiStatus: "delivered" },
  { label: "Completed", apiStatus: "delivered" },
  { label: "Cancelled", apiStatus: "cancelled" },
  { label: "Refunded", apiStatus: "cancelled" },
];

interface VendorOrdermanagementProps {
  onNavigate: (page: AppPage) => void;
}

export function VendorOrdermanagement({ onNavigate }: VendorOrdermanagementProps) {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [stats, setStats] = useState<VendorOrderStats | null>(null);
  const [activeTab, setActiveTab] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [vendorMeals, setVendorMeals] = useState<Meal[]>([]);
  const [manualCustomerEmail, setManualCustomerEmail] = useState("");
  const [manualMealId, setManualMealId] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);

  const selectedTab = tabs.find((tab) => tab.label === activeTab) ?? tabs[0];

  useEffect(() => {
    loadOrdersAndStats();
  }, [selectedTab.apiStatus]);

  useEffect(() => {
    if (!manualOrderOpen) {
      return;
    }
    loadVendorMeals();
  }, [manualOrderOpen]);

  const loadOrdersAndStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [orderData, statData] = await Promise.all([
        getVendorOrders(selectedTab.apiStatus),
        getVendorOrderStats(),
      ]);
      setOrders(orderData);
      setStats(statData);
    } catch (err) {
      console.error("Failed to load vendor order management data:", err);
      setError("Unable to load order data. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadVendorMeals = async () => {
    try {
      const meals = await getVendorMeals();
      setVendorMeals(meals.filter((meal) => meal.available));
    } catch (err) {
      console.error("Failed to load vendor meals for manual order:", err);
      setManualMessage("Unable to load meals. Please try again.");
    }
  };

  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      return orders;
    }
    return orders.filter((order) => {
      return (
        `ord-${order.id}`.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.customer_email.toLowerCase().includes(query) ||
        order.meal_name.toLowerCase().includes(query)
      );
    });
  }, [orders, searchTerm]);

  const toTitleCase = (value: string) =>
    value
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

  const displayStatus = (status: string) => {
    if (status === "confirmed") {
      return "Accepted";
    }
    if (status === "delivered") {
      return "Completed";
    }
    return toTitleCase(status);
  };

  const statusClass = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === "pending") {
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200";
    }
    if (normalized === "confirmed") {
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200";
    }
    if (normalized === "delivered") {
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200";
    }
    if (normalized === "cancelled") {
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200";
    }
    return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  };

  const handleStatusUpdate = async (orderId: number, nextStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await updateOrderStatus(orderId, nextStatus);
      await loadOrdersAndStats();
    } catch (err) {
      console.error("Failed to update order status:", err);
      setError("Could not update order status. Please try again.");
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const resetManualForm = () => {
    setManualCustomerEmail("");
    setManualMealId("");
    setManualQuantity(1);
  };

  const handleManualOrderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!manualCustomerEmail || !manualMealId || manualQuantity < 1) {
      setManualMessage("Please fill all fields with valid values.");
      return;
    }

    setManualSubmitting(true);
    setManualMessage(null);
    try {
      await createVendorManualOrder({
        customer_email: manualCustomerEmail.trim(),
        meal_id: Number(manualMealId),
        quantity: manualQuantity,
      });
      setManualMessage("Manual order created successfully.");
      resetManualForm();
      await loadOrdersAndStats();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail || "Failed to create manual order. Please try again.";
      setManualMessage(String(message));
    } finally {
      setManualSubmitting(false);
    }
  };

  const completedToday = useMemo(() => {
    const today = new Date().toDateString();
    return orders.filter(
      (order) =>
        order.status.toLowerCase() === "delivered" &&
        new Date(order.created_at).toDateString() === today,
    ).length;
  }, [orders]);

  return (
    <div className="min-h-dvh bg-[#f4f7fb] text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto flex max-w-[1380px] gap-5 p-4 md:p-6">
        <section className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-cyan-50 p-2 text-cyan-600 dark:bg-cyan-900/40">
                <ShoppingBag className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-lg font-semibold text-cyan-600">
                  Wellora - Vendor Order Management
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex min-w-[260px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 focus-within:border-cyan-300 dark:border-slate-700 dark:bg-slate-800">
                <Search className="h-4 w-4" />
                <input
                  type="text"
                  placeholder="Search orders, user, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="p-5">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <button
                  type="button"
                  onClick={() => onNavigate("vendor-dashboard")}
                  className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Dashboard
                </button>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                  Orders
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage and track your customer fulfillments in real-time.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadOrdersAndStats}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Filter className="h-4 w-4" />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualOrderOpen(true);
                    setManualMessage(null);
                  }}
                  className="rounded-xl bg-wellora px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover"
                >
                  + Add Manual Order
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-5 border-b border-slate-200 pb-2 text-sm dark:border-slate-800">
              {tabs.map((tab, idx) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setActiveTab(tab.label)}
                  className={`pb-2 transition ${
                    activeTab === tab.label
                      ? "border-b-2 border-slate-900 font-semibold text-slate-900 dark:border-white dark:text-white"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-cyan-50 px-4 py-3 dark:border-slate-800 dark:bg-cyan-950/20">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Select All
                  </button>
                  <span className="text-xs text-slate-500">0 orders selected</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    className="font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300"
                  >
                    Bulk Update Status
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print Manifest
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/70">
                    <tr>
                      <th className="px-4 py-3">
                        <input type="checkbox" />
                      </th>
                      <th className="px-4 py-3">Order ID</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Items</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">ETA / Time</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {isLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          Loading orders...
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-rose-500">
                          {error}
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                          No orders found for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => (
                        <tr
                          key={order.id}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <td className="px-4 py-3">
                            <input type="checkbox" />
                          </td>
                          <td className="px-4 py-3 text-xs font-semibold text-cyan-600">
                            #ORD-{order.id}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 dark:text-slate-200">
                              {order.customer_name}
                            </p>
                            <p className="text-xs text-slate-500">{order.customer_email}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-500">{order.meal_name}</td>
                          <td className="px-4 py-3 font-semibold">
                            Rs {order.total_price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(order.status)}`}
                            >
                              {displayStatus(order.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <p className="font-semibold text-slate-700 dark:text-slate-200">
                              {new Date(order.created_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            <p className="text-slate-400">
                              {new Date(order.created_at).toLocaleDateString()}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              {order.status.toLowerCase() === "pending" && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(order.id, "confirmed")}
                                  disabled={updatingOrderId === order.id}
                                  className="rounded-lg bg-blue-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
                                >
                                  Accept
                                </button>
                              )}
                              {order.status.toLowerCase() === "confirmed" && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(order.id, "delivered")}
                                  disabled={updatingOrderId === order.id}
                                  className="rounded-lg bg-emerald-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                                >
                                  Complete
                                </button>
                              )}
                              {(order.status.toLowerCase() === "pending" ||
                                order.status.toLowerCase() === "confirmed") && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusUpdate(order.id, "cancelled")}
                                  disabled={updatingOrderId === order.id}
                                  className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/60 dark:hover:bg-rose-900/20"
                                >
                                  Cancel
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
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <p>
                Showing 1-{filteredOrders.length} of {filteredOrders.length} orders
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg bg-wellora text-xs font-semibold text-white"
                >
                  1
                </button>
                <button type="button" className="h-8 w-8 rounded-lg text-xs">
                  2
                </button>
                <button type="button" className="h-8 w-8 rounded-lg text-xs">
                  3
                </button>
                <span className="px-1">...</span>
                <button type="button" className="h-8 w-8 rounded-lg text-xs">
                  5
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside className="w-full max-w-[290px] shrink-0 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Quick Stats Today
            </h3>
            <div className="mt-3 space-y-3">
              <StatRow
                icon={<ShoppingBag className="h-4 w-4 text-cyan-600" />}
                title="Total Orders"
                value={String(stats?.total_orders ?? 0)}
                note="+12%"
              />
              <StatRow
                icon={<Truck className="h-4 w-4 text-violet-600" />}
                title="Active Fulfilling"
                value={String(stats?.confirmed ?? 0)}
              />
              <StatRow
                icon={<Clock3 className="h-4 w-4 text-amber-600" />}
                title="Awaiting Action"
                value={String(stats?.pending ?? 0)}
              />
              <StatRow
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                title="Completed Today"
                value={String(completedToday)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recent Alerts
              </h3>
              <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                3 Urgent
              </span>
            </div>
            <div className="space-y-2.5 text-xs">
              <AlertCard text="Order #ORD-9284 is exceeding ETA threshold." />
              <AlertCard text="Customer requested cancellation for #ORD-9261." />
              <AlertCard text="New pickup scheduled for 2:00 PM." />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Vendor Performance
              </h3>
              <span className="text-xs font-semibold text-cyan-600">98.2%</span>
            </div>
            <p className="mb-2 text-xs text-slate-500">Accuracy Score</p>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-2 w-[98.2%] rounded-full bg-cyan-500" />
            </div>
            <p className="mt-3 text-[11px] text-slate-500">
              You are in the top 5% of vendors this week. Keep it up!
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <span>Privacy Policy</span>
              <span>Terms</span>
              <span>Support</span>
              <Grid3x3 className="h-3.5 w-3.5" />
            </div>
            <p>© 2026 Wellora. All rights reserved.</p>
          </div>
        </aside>
      </div>

      {manualOrderOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                Add Manual Order
              </h3>
              <button
                type="button"
                onClick={() => {
                  setManualOrderOpen(false);
                  setManualMessage(null);
                }}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleManualOrderSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Customer Email
                </label>
                <input
                  type="email"
                  required
                  value={manualCustomerEmail}
                  onChange={(e) => setManualCustomerEmail(e.target.value)}
                  placeholder="customer@email.com"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-wellora dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Meal
                </label>
                <select
                  required
                  value={manualMealId}
                  onChange={(e) => setManualMealId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-wellora dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Select a meal</option>
                  {vendorMeals.map((meal) => (
                    <option key={meal.id} value={meal.id}>
                      {meal.name} (Rs {meal.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  required
                  value={manualQuantity}
                  onChange={(e) => setManualQuantity(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-wellora dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              {manualMessage && (
                <p className="text-sm text-slate-600 dark:text-slate-300">{manualMessage}</p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setManualOrderOpen(false);
                    setManualMessage(null);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manualSubmitting}
                  className="rounded-xl bg-wellora px-4 py-2 text-sm font-semibold text-white hover:bg-wellora-hover disabled:opacity-60"
                >
                  {manualSubmitting ? "Creating..." : "Create Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface StatRowProps {
  icon: ReactNode;
  title: string;
  value: string;
  note?: string;
}

function StatRow({ icon, title, value, note }: StatRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">{icon}</div>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-500">{title}</p>
        <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          {value}
          {note && (
            <span className="ml-1 text-xs font-medium text-emerald-600">{note}</span>
          )}
        </p>
      </div>
    </div>
  );
}

function AlertCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
      {text}
    </div>
  );
}

export default VendorOrdermanagement;
