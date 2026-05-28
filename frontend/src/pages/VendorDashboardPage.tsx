import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  Filter,
  LayoutGrid,
  Layers,
  Lightbulb,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Package,
  Phone,
  Plus,
  ShoppingCart,
  Sun,
  Star,
  Store,
  Search,
  TrendingUp,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { resolveImageUrl } from "../api/client";
import {
  getVendorOrders,
  placeOrder,
  updateOrderStatus,
  getVendorOrderStats,
  type VendorOrder,
  type VendorOrderStats,
} from "../api/orders";
import { getVendorMeals, getVendorStats } from "../api/meals";
import MealManagement from "./MealManagement";

interface VendorDashboardPageProps {
  onNavigate: (page: AppPage) => void;
  initialSection?: VendorSection;
}

interface VendorStats {
  total_meals: number;
  total_orders: number;
  total_revenue: number;
  rating: number;
}

const PROFILE_IMG =
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=120&h=120&q=80";

const WEEKLY_REVENUE = [
  { label: "Mon", value: 3200 },
  { label: "Tue", value: 4100 },
  { label: "Wed", value: 3800 },
  { label: "Thu", value: 5200 },
  { label: "Fri", value: 6100 },
  { label: "Sat", value: 4800 },
  { label: "Sun", value: 3900 },
];

const VENDOR_HERO_IMAGE =
  "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=960&q=85";

type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";
type VendorSection = "dashboard" | "meals" | "orders" | "menu";

function VendorOrdersSection() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [stats, setStats] = useState<VendorOrderStats | null>(null);
  const [activeTab, setActiveTab] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [manualOrderOpen, setManualOrderOpen] = useState(false);
  const [manualMealId, setManualMealId] = useState("");
  const [manualQty, setManualQty] = useState(1);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualMessage, setManualMessage] = useState<string | null>(null);
  const [manualMeals, setManualMeals] = useState<any[]>([]);
  const [cancelModalOrder, setCancelModalOrder] = useState<VendorOrder | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [etaModal, setEtaModal] = useState<{
    order: VendorOrder;
    nextStatus: "preparing" | "ready";
  } | null>(null);
  const [etaMinutes, setEtaMinutes] = useState(20);
  const [publicEtaMessage, setPublicEtaMessage] = useState("");
  const [internalTeamNote, setInternalTeamNote] = useState("");
  const [notifyCustomerSms, setNotifyCustomerSms] = useState(true);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState("confirmed");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkFulfillmentNote, setBulkFulfillmentNote] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [appliedStatusFilters, setAppliedStatusFilters] = useState<string[]>([]);
  const [draftStatusFilters, setDraftStatusFilters] = useState<string[]>([]);
  const [appliedDeliveryOnly, setAppliedDeliveryOnly] = useState(false);
  const [draftDeliveryOnly, setDraftDeliveryOnly] = useState(false);

  const ETA_INCREMENTS = [10, 20, 30, 45, 60] as const;

  /** Values must match `PUT /vendor/{id}/status` allowed list in the API. */
  const BULK_STATUS_OPTIONS = [
    { value: "pending", label: "Pending" },
    { value: "confirmed", label: "Confirmed" },
    { value: "delivered", label: "Ready for Pickup" },
    { value: "cancelled", label: "Cancelled" },
  ];

  const STATUS_TABS: Array<{ label: string; apiStatus?: string }> = [
    { label: "All" },
    { label: "Pending", apiStatus: "pending" },
    { label: "Accepted", apiStatus: "accepted" },
    { label: "Preparing", apiStatus: "preparing" },
    { label: "Ready", apiStatus: "ready" },
    { label: "Out for Delivery", apiStatus: "out_for_delivery" },
    { label: "Completed", apiStatus: "delivered" },
    { label: "Cancelled", apiStatus: "cancelled" },
    { label: "Refunded", apiStatus: "cancelled" },
  ];

  const ORDER_STATUS_FILTER_OPTIONS = [
    "pending",
    "accepted",
    "preparing",
    "ready",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "refunded",
  ];

  const STATUS_COLORS: Record<string, string> = {
    pending:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    accepted:
      "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    confirmed:
      "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    preparing:
      "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
    ready: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200",
    out_for_delivery:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200",
    delivered:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  };

  const NEXT_STATUS: Record<string, string> = {
    pending: "accepted",
    accepted: "preparing",
    preparing: "ready",
    ready: "delivered",
  };

  const NEXT_STATUS_LABEL: Record<string, string> = {
    pending: "Confirm Order",
    accepted: "Start Preparing",
    preparing: "Mark as Ready",
    ready: "Mark as Delivered",
  };

  const displayStatus = (status: string) => {
    const normalized = status.replace(/_/g, " ");
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  };

  const openFiltersPanel = () => {
    setDraftStatusFilters(appliedStatusFilters);
    setDraftDeliveryOnly(appliedDeliveryOnly);
    setFiltersOpen(true);
  };

  const closeFiltersPanel = () => {
    setFiltersOpen(false);
  };

  const clearDraftFilters = () => {
    setDraftStatusFilters([]);
    setDraftDeliveryOnly(false);
  };

  const toggleDraftStatusFilter = (status: string) => {
    setDraftStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const applyFilters = () => {
    setAppliedStatusFilters(draftStatusFilters);
    setAppliedDeliveryOnly(draftDeliveryOnly);
    setFiltersOpen(false);
  };
  const appliedFilterCount =
    appliedStatusFilters.length + (appliedDeliveryOnly ? 1 : 0);
  const draftFilterCount = draftStatusFilters.length + (draftDeliveryOnly ? 1 : 0);

  const selectedTab = STATUS_TABS.find((tab) => tab.label === activeTab) ?? STATUS_TABS[0];

  useEffect(() => {
    loadData();
  }, [selectedTab.apiStatus]);

  useEffect(() => {
    setBulkSelectedIds([]);
  }, [activeTab]);

  useEffect(() => {
    if (!manualOrderOpen) return;
    loadManualMeals();
  }, [manualOrderOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersData, statsData] = await Promise.all([
        getVendorOrders(selectedTab.apiStatus),
        getVendorOrderStats(),
      ]);
      setOrders(ordersData);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: number, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      await loadData();
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const closeCancelModal = () => {
    setCancelModalOrder(null);
    setCancelReason("");
    setCancelNotes("");
  };

  const confirmCancelOrder = async () => {
    if (!cancelModalOrder || !cancelReason) {
      return;
    }

    setUpdatingId(cancelModalOrder.id);
    try {
      await updateOrderStatus(cancelModalOrder.id, "cancelled");
      await loadData();
      closeCancelModal();
    } catch (err) {
      console.error("Failed to cancel order:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const openEtaModal = (order: VendorOrder, nextStatus: "preparing" | "ready") => {
    setEtaModal({ order, nextStatus });
    setEtaMinutes(20);
    setPublicEtaMessage("");
    setInternalTeamNote("");
    setNotifyCustomerSms(true);
  };

  const closeEtaModal = () => setEtaModal(null);

  const saveEtaModal = async () => {
    if (!etaModal) return;
    setUpdatingId(etaModal.order.id);
    try {
      await updateOrderStatus(etaModal.order.id, etaModal.nextStatus);
      await loadData();
      closeEtaModal();
    } catch (err) {
      console.error("Failed to update status from ETA modal:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  const appendPublicEtaTag = (tag: string) => {
    setPublicEtaMessage((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  const etaTimes = useMemo(() => {
    if (!etaModal) {
      return { currentEta: null as Date | null, newEta: null as Date | null };
    }
    const bumpMinutes = (d: Date, minutes: number) => {
      const x = new Date(d);
      x.setMinutes(x.getMinutes() + minutes);
      return x;
    };
    const placed = new Date(etaModal.order.created_at);
    const currentEta = bumpMinutes(placed, 45);
    const newEta = bumpMinutes(currentEta, etaMinutes);
    return { currentEta, newEta };
  }, [etaModal, etaMinutes]);

  const loadManualMeals = async () => {
    try {
      const meals = await getVendorMeals();
      setManualMeals(meals.filter((meal: any) => meal.available));
    } catch (err) {
      console.error("Failed to load meals for manual order:", err);
      setManualMessage("Unable to load meals.");
    }
  };

  const handleManualOrderSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!manualMealId || manualQty < 1) {
      setManualMessage("Please select a meal and valid quantity.");
      return;
    }

    setManualSubmitting(true);
    setManualMessage(null);
    try {
      await placeOrder([{ meal_id: Number(manualMealId), quantity: manualQty }]);
      setManualMessage("Manual order created successfully.");
      setManualMealId("");
      setManualQty(1);
      await loadData();
    } catch (err: any) {
      const message =
        err?.response?.data?.detail || "Failed to create manual order.";
      setManualMessage(String(message));
    } finally {
      setManualSubmitting(false);
    }
  };

  const filteredOrders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
      const statusMatch =
        appliedStatusFilters.length === 0 ||
        appliedStatusFilters.includes(order.status.toLowerCase());
      const fulfillmentMatch =
        !appliedDeliveryOnly || order.status.toLowerCase() === "out_for_delivery";
      const searchMatch =
        !query ||
        `#${order.id}`.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.customer_email.toLowerCase().includes(query) ||
        order.meal_name.toLowerCase().includes(query);

      return statusMatch && fulfillmentMatch && searchMatch;
    });
  }, [orders, searchTerm, appliedStatusFilters, appliedDeliveryOnly]);

  const toggleBulkSelect = (orderId: number) => {
    setBulkSelectedIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId],
    );
  };

  const toggleSelectAllFiltered = () => {
    const ids = filteredOrders.map((o) => o.id);
    const allSelected = ids.length > 0 && ids.every((id) => bulkSelectedIds.includes(id));
    if (allSelected) {
      setBulkSelectedIds([]);
    } else {
      setBulkSelectedIds(ids);
    }
  };

  const closeBulkModal = () => {
    if (bulkUpdating) return;
    setBulkUpdateOpen(false);
    setBulkFulfillmentNote("");
  };

  const applyBulkStatusUpdate = async () => {
    if (bulkSelectedIds.length === 0) return;
    setBulkUpdating(true);
    try {
      await Promise.all(
        bulkSelectedIds.map((id) => updateOrderStatus(id, bulkNewStatus)),
      );
      await loadData();
      setBulkSelectedIds([]);
      setBulkUpdateOpen(false);
      setBulkFulfillmentNote("");
    } catch (err) {
      console.error("Bulk status update failed:", err);
    } finally {
      setBulkUpdating(false);
    }
  };

  const recentAlerts = useMemo(() => {
    const now = Date.now();
    const alerts: Array<{ id: string; text: string; urgent: boolean; createdAt: number }> = [];

    for (const order of orders) {
      const createdAt = new Date(order.created_at).getTime();
      const ageMinutes = Math.floor((now - createdAt) / (1000 * 60));

      if (order.status === "pending" && ageMinutes >= 30) {
        alerts.push({
          id: `pending-${order.id}`,
          text: `Order #ORD-${order.id} is awaiting action for ${ageMinutes} mins.`,
          urgent: true,
          createdAt,
        });
      }

      if (order.status === "cancelled") {
        alerts.push({
          id: `cancelled-${order.id}`,
          text: `Customer cancellation recorded for #ORD-${order.id}.`,
          urgent: false,
          createdAt,
        });
      }

      if (order.status === "confirmed" && ageMinutes >= 20) {
        alerts.push({
          id: `confirmed-${order.id}`,
          text: `Order #ORD-${order.id} is active and nearing dispatch.`,
          urgent: false,
          createdAt,
        });
      }
    }

    if (alerts.length === 0) {
      alerts.push({
        id: "fallback-1",
        text: "No critical alerts right now. Operations look healthy.",
        urgent: false,
        createdAt: now,
      });
    }

    return alerts
      .sort((a, b) => {
        if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
        return b.createdAt - a.createdAt;
      })
      .slice(0, 3);
  }, [orders]);

  const urgentAlertCount = recentAlerts.filter((a) => a.urgent).length;

  const selectedOrder =
    filteredOrders.find((order) => order.id === selectedOrderId) ??
    filteredOrders[0] ??
    null;

  const timelineSteps = (status: string) => {
    const rank: Record<string, number> = {
      pending: 1,
      confirmed: 2,
      delivered: 4,
      cancelled: 0,
    };
    const currentRank = rank[status] ?? 1;
    const steps = [
      { key: "pending", label: "Order Placed" },
      { key: "confirmed", label: "Awaiting Vendor Acceptance" },
      { key: "packed", label: "Food Preparation" },
      { key: "delivered", label: "Delivery In-Progress" },
    ];
    return steps.map((step, idx) => ({
      ...step,
      done: idx < currentRank,
      active:
        (status === "cancelled" && idx === 0) ||
        (status !== "cancelled" && idx === Math.max(0, currentRank - 1)),
    }));
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Orders
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage all customer orders
          </p>
        </div>
        <button
          type="button"
          onClick={openFiltersPanel}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Filter className="h-4 w-4" />
          Filters
          {appliedFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-[11px] font-bold text-white">
              {appliedFilterCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search orders, user, meal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setManualOrderOpen(true);
            setManualMessage(null);
          }}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover"
        >
          + Add Manual Order
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Total Orders",
              value: stats.total_orders,
              color: "text-slate-900 dark:text-white",
            },
            {
              label: "Total Revenue",
              value: `Rs ${stats.total_revenue.toFixed(2)}`,
              color: "text-wellora",
            },
            { label: "Pending", value: stats.pending, color: "text-amber-600" },
            {
              label: "Delivered",
              value: stats.delivered,
              color: "text-emerald-600",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {s.label}
              </p>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${s.color}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => setActiveTab(tab.label)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.label
                ? "bg-wellora text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={loadData}
          className="ml-auto rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Orders table + right details panel */}
      <div
        className={`grid gap-5 ${
          activeTab === "Pending" ||
          activeTab === "Preparing" ||
          activeTab === "Completed" ||
          activeTab === "All"
            ? "xl:grid-cols-[minmax(0,1fr)_340px]"
            : ""
        }`}
      >
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!isLoading && orders.length > 0 && bulkSelectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-emerald-50/60 px-4 py-3 dark:border-slate-800 dark:bg-emerald-950/20">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {bulkSelectedIds.length} order{bulkSelectedIds.length === 1 ? "" : "s"} selected
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkSelectedIds([])}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                >
                  Clear selection
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBulkFulfillmentNote("");
                    setBulkUpdateOpen(true);
                  }}
                  className="rounded-lg bg-wellora px-3 py-1.5 text-xs font-semibold text-white hover:bg-wellora-hover"
                >
                  Bulk Update Status
                </button>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-wellora border-t-transparent" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-slate-500">No orders found.</p>
            {activeTab !== "All" && (
                <button
                  type="button"
                onClick={() => setActiveTab("All")}
                  className="mt-3 text-sm text-wellora hover:underline"
                >
                  View all orders
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                    <th className="w-12 px-3 py-3 font-semibold">
                      <input
                        type="checkbox"
                        checked={
                          filteredOrders.length > 0 &&
                          filteredOrders.every((o) => bulkSelectedIds.includes(o.id))
                        }
                        onChange={toggleSelectAllFiltered}
                        className="h-4 w-4 rounded border-slate-300 text-wellora focus:ring-wellora"
                        aria-label="Select all orders"
                      />
                    </th>
                    <th className="px-5 py-3 font-semibold">Order ID</th>
                    <th className="px-5 py-3 font-semibold">Meal</th>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Qty</th>
                    <th className="px-5 py-3 font-semibold">Total</th>
                    <th className="px-5 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 font-semibold">Date</th>
                    <th className="px-5 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {filteredOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrderId(order.id)}
                      className={`cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/50 ${
                        selectedOrder?.id === order.id
                          ? "bg-cyan-50/60 dark:bg-cyan-950/20"
                          : ""
                      }`}
                    >
                      <td
                        className="px-3 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={bulkSelectedIds.includes(order.id)}
                          onChange={() => toggleBulkSelect(order.id)}
                          className="h-4 w-4 rounded border-slate-300 text-wellora focus:ring-wellora"
                          aria-label={`Select order ${order.id}`}
                        />
                      </td>
                      <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">
                        #{order.id}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {order.meal_image && (
                            <img
                              src={order.meal_image}
                              alt=""
                              className="h-9 w-9 rounded-lg object-cover shrink-0"
                            />
                          )}
                          <span className="font-medium text-slate-900 dark:text-white">
                            {order.meal_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {order.customer_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {order.customer_email}
                        </p>
                      </td>
                      <td className="px-5 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                        ×{order.quantity}
                      </td>
                      <td className="px-5 py-3 font-semibold tabular-nums text-slate-900 dark:text-white">
                        Rs {order.total_price.toFixed(2)}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-700"}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {new Date(order.created_at).toLocaleDateString()}
                        <br />
                        {new Date(order.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                    <td className="px-5 py-3">
                      {(() => {
                        const normalizedStatus = order.status.toLowerCase();

                        if (normalizedStatus === "pending") {
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={updatingId === order.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusUpdate(order.id, NEXT_STATUS[normalizedStatus]);
                                }}
                                className="rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-600 disabled:opacity-50"
                              >
                                {updatingId === order.id
                                  ? "..."
                                  : NEXT_STATUS_LABEL[normalizedStatus]}
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === order.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusUpdate(order.id, "cancelled");
                                }}
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                              >
                                Cancel Order
                              </button>
                            </div>
                          );
                        }

                        if (normalizedStatus === "accepted") {
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={updatingId === order.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEtaModal(order, "preparing");
                                }}
                                className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-600 disabled:opacity-50"
                              >
                                Start Preparing
                              </button>
                              <button
                                type="button"
                                disabled={updatingId === order.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusUpdate(order.id, "cancelled");
                                }}
                                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                              >
                                Cancel Order
                              </button>
                            </div>
                          );
                        }

                        if (normalizedStatus === "preparing") {
                          return (
                            <button
                              type="button"
                              disabled={updatingId === order.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEtaModal(order, "ready");
                              }}
                              className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-50"
                            >
                              Mark as Ready
                            </button>
                          );
                        }

                        if (normalizedStatus === "ready") {
                          return (
                            <button
                              type="button"
                              disabled={updatingId === order.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusUpdate(order.id, NEXT_STATUS[normalizedStatus]);
                              }}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
                            >
                              {updatingId === order.id
                                ? "..."
                                : NEXT_STATUS_LABEL[normalizedStatus]}
                            </button>
                          );
                        }

                        if (
                          normalizedStatus === "delivered" ||
                          normalizedStatus === "completed"
                        ) {
                          return (
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrderId(order.id);
                                }}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                View Details
                              </button>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                Download Invoice
                              </button>
                            </div>
                          );
                        }

                        if (
                          normalizedStatus === "cancelled" ||
                          normalizedStatus === "refunded"
                        ) {
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOrderId(order.id);
                              }}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              View Details
                            </button>
                          );
                        }

                        return <span className="text-xs text-slate-400">—</span>;
                      })()}
                    </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {activeTab === "Pending" && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {selectedOrder ? (
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Details
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">
                    Order #WL-{selectedOrder.id}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Placed {new Date(selectedOrder.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer
                  </p>
                  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {selectedOrder.customer_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {selectedOrder.customer_email}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Phone className="h-3.5 w-3.5" /> +94 77 123 4567
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="h-3.5 w-3.5" /> Delivery address pending
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Summary
                  </p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Meal</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      {selectedOrder.meal_name}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Quantity</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      ×{selectedOrder.quantity}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Unit Price</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">
                      Rs {selectedOrder.unit_price.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm dark:border-slate-700">
                    <span className="font-medium text-slate-600 dark:text-slate-200">
                      Total
                    </span>
                    <span className="font-bold text-wellora">
                      Rs {selectedOrder.total_price.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Timeline
                  </p>
                  <ul className="space-y-2.5">
                    {timelineSteps(selectedOrder.status).map((step) => (
                      <li key={step.key} className="flex items-center gap-2 text-sm">
                        {step.done ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : step.active ? (
                          <Circle className="h-4 w-4 text-wellora" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        )}
                        <span
                          className={
                            step.active
                              ? "font-medium text-slate-900 dark:text-white"
                              : "text-slate-500"
                          }
                        >
                          {step.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Select an order to view details.
              </div>
            )}
          </aside>
        )}

        {activeTab === "Preparing" && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {selectedOrder ? (
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      ORD-{selectedOrder.id}
                    </h3>
                    <span className="inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                      Preparing
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Placed {new Date(selectedOrder.created_at).toLocaleString()}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Progress
                  </p>
                  <ul className="space-y-2.5">
                    {[
                      { key: "accepted", label: "Order Accepted", done: true },
                      { key: "prep", label: "Preparing in Kitchen", done: true, active: true },
                      { key: "pickup", label: "Ready for Pickup", done: false },
                      { key: "delivery", label: "Out for Delivery", done: false },
                    ].map((step) => (
                      <li key={step.key} className="flex items-center gap-2 text-sm">
                        {step.done ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : step.active ? (
                          <Circle className="h-4 w-4 text-wellora" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                        )}
                        <span
                          className={
                            step.active
                              ? "font-medium text-slate-900 dark:text-white"
                              : "text-slate-500"
                          }
                        >
                          {step.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Items
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-300">
                      {selectedOrder.quantity}x {selectedOrder.meal_name}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      Rs {selectedOrder.total_price.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t border-slate-200 pt-2 text-xs text-slate-500 dark:border-slate-700">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>Rs {selectedOrder.total_price.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span>Delivery Fee</span>
                      <span>Rs 0.00</span>
                    </div>
                    <div className="mt-2 flex justify-between text-sm font-semibold text-wellora">
                      <span>Grand Total</span>
                      <span>Rs {selectedOrder.total_price.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Customer & Delivery
                  </p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {selectedOrder.customer_name}
                  </p>
                  <p className="text-xs text-slate-500">{selectedOrder.customer_email}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Phone className="h-3.5 w-3.5" /> +94 77 123 4567
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <MapPin className="h-3.5 w-3.5" /> Delivery address pending
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatusUpdate(selectedOrder.id, "delivered")}
                    disabled={updatingId === selectedOrder.id}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {updatingId === selectedOrder.id ? "Updating..." : "Ready for Pickup"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelModalOrder(selectedOrder)}
                    disabled={updatingId === selectedOrder.id}
                    className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900/60 dark:hover:bg-rose-900/20"
                  >
                    Cancel Order
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Select an order to view details.
              </div>
            )}
          </aside>
        )}

        {activeTab === "All" && (
          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Quick Stats Today
              </h3>
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="rounded-lg bg-cyan-50 p-2 text-cyan-600 dark:bg-cyan-900/30">
                    <Package className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Total Orders
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {stats?.total_orders ?? 0}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="rounded-lg bg-violet-50 p-2 text-violet-600 dark:bg-violet-900/30">
                    <Store className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Active Fulfilling
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {stats?.confirmed ?? 0}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="rounded-lg bg-amber-50 p-2 text-amber-600 dark:bg-amber-900/30">
                    <Circle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Awaiting Action
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {stats?.pending ?? 0}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-900/30">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Completed Today
                    </p>
                    <p className="text-lg font-semibold text-slate-900 dark:text-white">
                      {stats?.delivered ?? 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Recent Alerts
                </h3>
                {urgentAlertCount > 0 && (
                  <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                    {urgentAlertCount} Urgent
                  </span>
                )}
              </div>
              <div className="space-y-2.5 text-xs">
                {recentAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`rounded-xl border px-3 py-2 ${
                      alert.urgent
                        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300"
                        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                    }`}
                  >
                    {alert.text}
                  </div>
                ))}
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
          </aside>
        )}

        {activeTab === "Completed" && (
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {selectedOrder ? (
              <div className="space-y-4">
                <div className="border-b border-slate-200 pb-3 dark:border-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                      ORD-{selectedOrder.id}
                    </h3>
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                      Completed
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Delivered on{" "}
                    {new Date(selectedOrder.created_at).toLocaleDateString()} at{" "}
                    {new Date(selectedOrder.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {selectedOrder.customer_name}
                  </p>
                  <p className="text-xs text-slate-500">Regular Customer · 12 Orders</p>
                  <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                    <p className="font-semibold uppercase tracking-wide text-slate-500">
                      Contact Information
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">+94 77 123 4567</p>
                    <p className="text-slate-600 dark:text-slate-300">
                      {selectedOrder.customer_email}
                    </p>
                  </div>
                  <div className="mt-3 border-t border-slate-200 pt-3 text-xs dark:border-slate-700">
                    <p className="font-semibold uppercase tracking-wide text-slate-500">
                      Delivery Address
                    </p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      123 Philosophy Way, Athens
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Journey
                  </p>
                  <ul className="space-y-2.5">
                    {[
                      "Order Placed",
                      "Accepted & Preparing",
                      "Ready for Pickup",
                      "Out for Delivery",
                      "Completed",
                    ].map((step) => (
                      <li key={step} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Vendor Internal Notes
                  </p>
                  <div className="mt-2 rounded-lg bg-cyan-50 p-3 text-xs text-slate-600 dark:bg-cyan-950/20 dark:text-slate-300">
                    Customer requested extra dressing on the side. Included 2 packets as
                    requested. Driver confirmed hand-off at front door.
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Final Invoice
                  </p>
                  <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>Rs {selectedOrder.total_price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimated Tax</span>
                      <span>Rs 0.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Delivery Fee</span>
                      <span>Rs 0.00</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:text-white">
                      <span>Total Paid</span>
                      <span>Rs {selectedOrder.total_price.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Export PDF
                  </button>
                </div>
                <button
                  type="button"
                  className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
                >
                  Close Details
                </button>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Select a completed order to view details.
              </div>
            )}
          </aside>
        )}
      </div>

      {filtersOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/40"
            onClick={closeFiltersPanel}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-cyan-500" />
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Filters</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearDraftFilters}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={closeFiltersPanel}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  aria-label="Close filters panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Time Period
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {["Today", "Last 24h", "This Week", "Custom Range"].map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-xl border px-3 py-2 text-left text-xs font-medium ${
                        idx === 0
                          ? "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-700/70 dark:bg-cyan-950/40 dark:text-cyan-300"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-violet-300 p-3 dark:border-violet-700">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Order Status
                  </p>
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                    {draftStatusFilters.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {ORDER_STATUS_FILTER_OPTIONS.map((status) => (
                    <label
                      key={status}
                      className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {displayStatus(status)}
                      </span>
                      <input
                        type="checkbox"
                        checked={draftStatusFilters.includes(status)}
                        onChange={() => toggleDraftStatusFilter(status)}
                        className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Fulfillment
                  </p>
                  <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300">
                    {draftDeliveryOnly ? 1 : 0}
                  </span>
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                  <span className="text-sm text-slate-700 dark:text-slate-200">Delivery</span>
                  <input
                    type="checkbox"
                    checked={draftDeliveryOnly}
                    onChange={(e) => setDraftDeliveryOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-500 focus:ring-cyan-500"
                  />
                </label>
              </section>
            </div>

            <div className="space-y-2 border-t border-slate-200 p-4 dark:border-slate-700">
              <button
                type="button"
                onClick={applyFilters}
                className="w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600"
              >
                Apply {draftFilterCount} Filter{draftFilterCount === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Save Filter Set
              </button>
            </div>
          </aside>
        </>
      )}

      {manualOrderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
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
                  Meal
                </label>
                <select
                  required
                  value={manualMealId}
                  onChange={(e) => setManualMealId(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-wellora dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Select meal</option>
                  {manualMeals.map((meal) => (
                    <option key={meal.id} value={meal.id}>
                      {meal.name} (Rs {Number(meal.price).toFixed(2)})
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
                  value={manualQty}
                  onChange={(e) => setManualQty(Number(e.target.value))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-wellora dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              {manualMessage && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {manualMessage}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setManualOrderOpen(false)}
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

      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="flex items-start gap-2">
                <div className="pt-0.5 text-red-500">△</div>
                <div>
                  <h3 className="text-lg font-semibold text-red-500">
                    Confirm cancel order
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    You are about to cancel order `#WL-{cancelModalOrder.id}`. This action
                    notifies the customer and triggers a refund.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-5 px-5 py-4">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {cancelModalOrder.customer_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {cancelModalOrder.quantity} items · Rs {cancelModalOrder.total_price.toFixed(2)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {displayStatus(cancelModalOrder.status)}
                </span>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Reason for Cancellation
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-wellora dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  <option value="">Select a reason...</option>
                  <option value="customer_request">Customer requested cancellation</option>
                  <option value="item_unavailable">Item unavailable</option>
                  <option value="kitchen_delay">Kitchen delay</option>
                  <option value="delivery_issue">Delivery issue</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Additional internal notes (optional)
                </label>
                <textarea
                  rows={4}
                  value={cancelNotes}
                  onChange={(e) => setCancelNotes(e.target.value)}
                  placeholder="e.g. Spoke with customer, they requested cancellation due to long wait time..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-wellora dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <p className="mt-1 text-xs italic text-slate-400">
                  These notes are only visible to your team.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeCancelModal}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={confirmCancelOrder}
                disabled={!cancelReason || updatingId === cancelModalOrder.id}
                className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {updatingId === cancelModalOrder.id ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {etaModal && etaTimes.currentEta && etaTimes.newEta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="max-h-[min(100dvh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <span className="rounded-lg bg-cyan-50 p-2 text-cyan-600 dark:bg-cyan-900/40">
                  <Clock className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Update ETA &amp; Notes
                </h3>
              </div>
              <button
                type="button"
                onClick={closeEtaModal}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-slate-700 dark:bg-slate-800/50">
              <div>
                <p className="font-semibold uppercase tracking-wide text-slate-500">Order ID</p>
                <p className="mt-0.5 font-mono font-medium text-slate-900 dark:text-white">
                  #{etaModal.order.id}
                </p>
              </div>
              <div className="min-w-0">
                <p className="font-semibold uppercase tracking-wide text-slate-500">Customer</p>
                <p className="mt-0.5 truncate font-medium text-slate-900 dark:text-white">
                  {etaModal.order.customer_name}
                </p>
              </div>
              <div>
                <p className="font-semibold uppercase tracking-wide text-slate-500">Current ETA</p>
                <p className="mt-0.5 flex items-center gap-1 font-medium text-slate-900 dark:text-white">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  {etaTimes.currentEta.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-5 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Set New Preparation Time
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">Adjust based on kitchen capacity</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ETA_INCREMENTS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setEtaMinutes(m)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        etaMinutes === m
                          ? "bg-cyan-500 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      }`}
                    >
                      +{m === 60 ? "1 hour" : `${m} min`}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-slate-700">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {etaTimes.newEta.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-slate-500" />
                    <label className="text-sm font-semibold text-slate-900 dark:text-white">
                      Public ETA Message
                    </label>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Visible to Customer
                  </span>
                </div>
                <textarea
                  rows={3}
                  value={publicEtaMessage}
                  onChange={(e) => setPublicEtaMessage(e.target.value)}
                  placeholder="E.g., We are experiencing high order volume. Your healthy meal is being prepared with extra care!"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-wellora dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {["Busy kitchen", "Rainy weather", "Ingredient prep", "Quality check"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => appendPublicEtaTag(t)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      + {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-500" />
                    <label className="text-sm font-semibold text-slate-900 dark:text-white">
                      Internal Team Note
                    </label>
                  </div>
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-slate-700">
                    STAFF ONLY
                  </span>
                </div>
                <input
                  type="text"
                  value={internalTeamNote}
                  onChange={(e) => setInternalTeamNote(e.target.value)}
                  placeholder="Add a private note for staff (e.g., Sarah requested extra sauce)"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-wellora dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-100 bg-cyan-50/80 p-3 dark:border-cyan-900/40 dark:bg-cyan-950/20">
                <input
                  type="checkbox"
                  checked={notifyCustomerSms}
                  onChange={(e) => setNotifyCustomerSms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-wellora focus:ring-wellora"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                    <Bell className="h-4 w-4 text-cyan-600" />
                    Notify customer via SMS
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Sending a real-time update improves customer satisfaction scores.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeEtaModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEtaModal}
                disabled={updatingId === etaModal.order.id}
                className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-60"
              >
                {updatingId === etaModal.order.id ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkUpdateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={closeBulkModal}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-update-title"
          >
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-600 dark:bg-cyan-950/60 dark:text-cyan-400">
                    <Layers className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="bulk-update-title"
                      className="text-lg font-bold tracking-tight text-slate-900 dark:text-white"
                    >
                      Bulk Update Status
                    </h2>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                      Modify multiple orders simultaneously
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeBulkModal}
                  disabled={bulkUpdating}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Selected orders ({bulkSelectedIds.length})
                </p>
                <div className="mt-2 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                  {[...bulkSelectedIds]
                    .sort((a, b) => a - b)
                    .map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                      >
                        #WL-{id}
                      </span>
                    ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor="bulk-target-status"
                  className="mb-1.5 block text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Target Status
                </label>
                <select
                  id="bulk-target-status"
                  value={bulkNewStatus}
                  onChange={(e) => setBulkNewStatus(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  {BULK_STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-2 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Lightbulb
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
                    aria-hidden
                  />
                  <span>
                    This will update the fulfillment stage for all{" "}
                    {bulkSelectedIds.length} selected item
                    {bulkSelectedIds.length === 1 ? "" : "s"}.
                  </span>
                </p>
              </div>

              <div>
                <label
                  htmlFor="bulk-fulfillment-note"
                  className="mb-1.5 block text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Fulfillment Note (Optional)
                </label>
                <textarea
                  id="bulk-fulfillment-note"
                  rows={4}
                  value={bulkFulfillmentNote}
                  onChange={(e) => setBulkFulfillmentNote(e.target.value)}
                  placeholder="Add a note to be appended to all selected orders..."
                  className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeBulkModal}
                disabled={bulkUpdating}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBulkStatusUpdate}
                disabled={bulkUpdating || bulkSelectedIds.length === 0}
                className="rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bulkUpdating
                  ? "Applying…"
                  : `Apply to ${bulkSelectedIds.length} Order${bulkSelectedIds.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export function VendorDashboardPage({
  onNavigate,
  initialSection = "dashboard",
}: VendorDashboardPageProps) {
  const [vendorSection, setVendorSection] =
    useState<VendorSection>(initialSection);
  const [meals, setMeals] = useState<any[]>([]); // Only for dashboard stats and menu
  const [vendorOrders, setVendorOrders] = useState<VendorOrder[]>([]);
  const [stats, setStats] = useState<VendorStats>({
    total_meals: 0,
    total_orders: 0,
    total_revenue: 0,
    rating: 4.8,
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("wellora-theme");
    if (saved === "light" || saved === "dark") {
      setThemeMode(saved);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeMode(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
    localStorage.setItem("wellora-theme", themeMode);
  }, [themeMode]);

  // ─── Load meals + stats from backend ───────────
  useEffect(() => {
    loadMeals();
    loadOrders();
    loadStats();
  }, []);

  const loadMeals = async () => {
    try {
      const data = await getVendorMeals();
      setMeals(data);
    } catch (err) {
      console.error("Failed to load meals:", err);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getVendorStats();
      setStats((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await getVendorOrders();
      setVendorOrders(data);
    } catch (err) {
      console.error("Failed to load vendor orders:", err);
    }
  };



  // ─── Click outside profile menu ────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const chartMax = Math.max(...WEEKLY_REVENUE.map((d) => d.value));
  const recentOrders = vendorOrders.slice(0, 5);

  const orderStatusClass = (s: OrderStatus) => {
    switch (s) {
      case "pending":
        return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
      case "confirmed":
        return "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200";
      case "delivered":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
      default:
        return "bg-slate-200 text-slate-700";
    }
  };

  const navItemClass = (active: boolean) =>
    active
      ? "flex w-full items-center gap-3 rounded-2xl border border-transparent bg-wellora px-4 py-3 text-left text-sm font-medium text-white shadow-sm transition hover:bg-wellora-hover"
      : "flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900";

  const topSelling = meals.slice(0, 3).map((m, i) => ({
    rank: i + 1,
    mealName: m.name,
    orders: Math.floor(Math.random() * 100) + 50,
  }));

  // ─── LOGOUT ────────────────────────────────────
  const handleLogout = () => {
    localStorage.clear();
    onNavigate("login");
  };

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-900 transition-colors duration-500 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,134,0.14),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(20,184,134,0.08),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(12,138,106,0.1),_transparent_26%)]"></div>
      <div className="relative flex min-h-screen gap-6 px-4 py-6 sm:px-6">
      {/* Sidebar */}
      <aside className="flex w-72 shrink-0 flex-col rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
        <div className="mb-6 inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <WelloraLogoMark size="md" />
          <span className="text-lg font-semibold tracking-tight text-wellora">Wellora</span>
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
          Navigation
        </p>
        <nav className="mt-5 flex flex-1 flex-col gap-2">
          <button
            type="button"
            onClick={() => setVendorSection("dashboard")}
            className={navItemClass(vendorSection === "dashboard")}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" /> Dashboard
          </button>
          <button
            type="button"
            onClick={() => setVendorSection("meals")}
            className={navItemClass(vendorSection === "meals")}
          >
            <UtensilsCrossed className="h-4 w-4 shrink-0" /> Meal Management
          </button>
          <button
            type="button"
            onClick={() => setVendorSection("orders")}
            className={navItemClass(vendorSection === "orders")}
          >
            <Store className="h-4 w-4 shrink-0" /> Orders
          </button>
          <button
            type="button"
            onClick={() => setVendorSection("menu")}
            className={navItemClass(vendorSection === "menu")}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" /> Menu
          </button>
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-auto inline-flex items-center justify-center rounded-full bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-wellora-hover"
        >
          Log Out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="mb-6 flex shrink-0 flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex items-center gap-3 rounded-3xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
            <WelloraLogoMark size="md" className="shadow-lg" />
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Welcome back,</p>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
                Vendor Dashboard
              </h1>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-left">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                Total Orders
              </p>
              <p className="text-2xl font-bold leading-none text-slate-900 dark:text-white">
                {stats.total_orders.toLocaleString()}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))
              }
              className="rounded-full border border-slate-200 bg-white p-3 text-slate-600 shadow-sm transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={
                themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              title={themeMode === "dark" ? "Light mode" : "Dark mode"}
            >
              {themeMode === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </button>
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((o) => !o)}
                className="rounded-full ring-2 ring-slate-200 transition hover:ring-wellora/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wellora dark:ring-slate-700"
                aria-label="Open profile menu"
              >
                <img
                  src={PROFILE_IMG}
                  alt="Profile"
                  className="h-9 w-9 rounded-full object-cover"
                />
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LogOut className="h-4 w-4 text-red-600" /> Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          {/* ── DASHBOARD ── */}
          {vendorSection === "dashboard" && (
            <div className="mx-auto max-w-7xl space-y-8">
              {/* <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Dashboard
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Welcome back — here's how your store is performing.
                </p>
              </div> */}

              <section className="overflow-hidden rounded-3xl border border-wellora/20 bg-wellora-light shadow-sm dark:border-wellora-dark/40 dark:bg-gradient-to-br dark:from-wellora-dark/30 dark:via-[#0a1620] dark:to-[#050a0f]">
                <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
                  <div className="max-w-xl shrink-0">
                    <h2 className="text-2xl font-bold tracking-tight text-wellora sm:text-3xl dark:text-wellora">
                      Eat Smart. Live Well.
                    </h2>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-200">
                      Your personalized journey to healthy eating starts here.
                      Discover meals tailored to your health goals.
                    </p>
                    <button
                      type="button"
                      onClick={() => setVendorSection("menu")}
                      className="mt-6 inline-flex items-center justify-center rounded-full bg-wellora px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wellora"
                    >
                      Order Healthy Meals
                    </button>
                  </div>
                  <div className="relative w-full max-w-md shrink-0 overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 lg:max-w-lg dark:ring-white/10">
                    <img
                      src={VENDOR_HERO_IMAGE}
                      alt="Healthy meal bowl with vegetables and grains"
                      className="h-52 w-full object-cover sm:h-56 lg:h-[220px]"
                    />
                  </div>
                </div>
              </section>

              {/* KPI Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Total Orders",
                    value: stats.total_orders.toLocaleString(),
                    icon: <Package className="h-5 w-5" />,
                  },
                  {
                    label: "Total Meals",
                    value: meals.length.toString(),
                    icon: <UtensilsCrossed className="h-5 w-5" />,
                  },
                  {
                    label: "Total Revenue",
                    value: `Rs ${stats.total_revenue.toLocaleString()}`,
                    // icon: <DollarSign className="h-5 w-5" />,
                  },
                  {
                    label: "Customer Rating",
                    value: "4.8 / 5.0",
                    icon: <Star className="h-5 w-5" />,
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                          {kpi.label}
                        </p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                          {kpi.value}
                        </p>
                      </div>
                      <div className="rounded-xl bg-wellora/15 p-2.5 text-wellora">
                        {kpi.icon}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quick actions
                </h2>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setVendorSection("meals")}
                    className="inline-flex items-center gap-2 rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover"
                  >
                    <Plus className="h-4 w-4" /> Add New Meal
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorSection("meals")}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <UtensilsCrossed className="h-4 w-4" /> Manage Meals
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorSection("orders")}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <Store className="h-4 w-4" /> View Orders
                  </button>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Recent Orders
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    Latest activity from your customers
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                        <th className="px-5 py-3 font-semibold">Order ID</th>
                        <th className="px-5 py-3 font-semibold">Customer</th>
                        <th className="px-5 py-3 font-semibold">Meal</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {recentOrders.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">
                            {o.id}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.customer_name}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.meal_name}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${orderStatusClass(o.status as OrderStatus)}`}
                            >
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-wellora" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Top Selling Meals
                    </h2>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {topSelling.length > 0 ? (
                      topSelling.map((item) => (
                        <li
                          key={item.rank}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-wellora">
                              #{item.rank}
                            </span>
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                              {item.mealName}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-semibold tabular-nums text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                            {item.orders} orders
                          </span>
                        </li>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No meals yet. Add your first meal!
                      </p>
                    )}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-wellora" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Sales Overview
                    </h2>
                  </div>
                  <div className="mt-6 flex h-52 items-end justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
                    {WEEKLY_REVENUE.map((d) => (
                      <div
                        key={d.label}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                      >
                        <span className="text-[10px] font-medium tabular-nums text-slate-500">
                          Rs {(d.value / 1000).toFixed(1)}k
                        </span>
                        <div
                          className="w-full max-w-[52px] rounded-t-md bg-gradient-to-t from-wellora to-emerald-400/90 shadow-sm"
                          style={{
                            height: `${Math.max(12, (d.value / chartMax) * 100)}%`,
                          }}
                        />
                        <span className="text-xs text-slate-500">
                          {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MEAL MANAGEMENT ── */}
          {vendorSection === "meals" && <MealManagement onNavigate={onNavigate} />}

          {/* ── ORDERS ── */}
          {vendorSection === "orders" && <VendorOrdersSection />}
          {/* ── MENU PREVIEW ── */}
          {vendorSection === "menu" && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Menu
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  How your meals appear to customers
                </p>
              </div>
              {meals.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500">
                    No meals yet. Add meals in Meal Management!
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {meals.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-snug text-slate-900 dark:text-white">
                          {m.name}
                        </h3>
                        <span className="shrink-0 text-lg font-bold text-wellora">
                          Rs {m.price.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {m.category} · {m.calories} kcal
                      </p>
                      {m.image_url && (
                        <div className="mt-3 overflow-hidden rounded-xl">
                          <img
                            src={resolveImageUrl(m.image_url) || m.image_url}
                            alt={m.name}
                            className="h-36 w-full object-cover"
                          />
                        </div>
                      )}
                      <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {m.dietary}
                      </span>
                      <p className="mt-3 text-xs">
                        {m.available ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Available for order
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Currently unavailable
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      </div>
    </div>
  );
}
