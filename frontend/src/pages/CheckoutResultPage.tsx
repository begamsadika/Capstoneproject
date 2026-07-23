import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, ShoppingCart } from "lucide-react";
import type { AppPage } from "../types/page";
import { getCheckoutOrder, type CheckoutOrderSummary } from "../api/orders";
import { syncDailyLog } from "../api/health";

interface CheckoutResultPageProps {
  type: "success" | "cancel";
  onNavigate: (page: AppPage) => void;
}

const CART_STORAGE_KEY = "wellora-menu-cart";

export function CheckoutResultPage({ type, onNavigate }: CheckoutResultPageProps) {
  const [summary, setSummary] = useState<CheckoutOrderSummary | null>(null);
  const [isLoading, setIsLoading] = useState(type === "success");
  const [error, setError] = useState("");

  useEffect(() => {
    if (type !== "success") return;
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      setError("Payment session was not found.");
      setIsLoading(false);
      return;
    }
    getCheckoutOrder(sessionId)
      .then(async (data) => {
        setSummary(data);
        if (data.payment_status === "paid") {
          localStorage.removeItem(CART_STORAGE_KEY);
          await syncDailyLog().catch(() => undefined);
        }
      })
      .catch((err) => {
        setError(err.response?.data?.detail ?? "Unable to verify payment status.");
      })
      .finally(() => setIsLoading(false));
  }, [type]);

  const paid = summary?.payment_status === "paid";
  const failed = summary?.payment_status === "failed";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-wellora" />
        ) : type === "cancel" ? (
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
        ) : paid ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-wellora" />
        ) : (
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
        )}

        <h1 className="mt-4 text-2xl font-bold tracking-tight">
          {isLoading
            ? "Checking Payment"
            : type === "cancel"
              ? "Payment Cancelled"
              : paid
                ? "Order Placed Successfully"
                : failed
                  ? "Payment Could Not Be Completed"
                  : "Payment Verification Pending"}
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {type === "cancel"
            ? "Your cart is still saved. You can return to checkout when ready."
            : paid
              ? "Your order has been sent to the vendor for preparation."
              : failed
                ? "Please review your payment details or try another test payment method."
                : error || "We could not confirm this payment yet. Please check again shortly."}
        </p>

        {summary && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-sm dark:border-slate-700 dark:bg-slate-800">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Order</span>
              <span className="font-semibold">{summary.order_number}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-slate-500">Vendor</span>
              <span className="font-semibold">{summary.vendor_name}</span>
            </div>
            <div className="mt-2 flex justify-between gap-4">
              <span className="text-slate-500">Amount</span>
              <span className="font-semibold">Rs {summary.amount_paid.toFixed(2)}</span>
            </div>
            {summary.items[0]?.delivery_address && (
              <div className="mt-2 flex justify-between gap-4">
                <span className="text-slate-500">Delivery</span>
                <span className="max-w-[260px] text-right font-semibold">
                  {summary.items[0].delivery_address}
                  {summary.items[0].delivery_city ? `, ${summary.items[0].delivery_city}` : ""}
                </span>
              </div>
            )}
            <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
              {summary.items.map((item) => (
                <div key={item.id} className="flex justify-between gap-4">
                  <span>{item.meal_name} x {item.quantity}</span>
                  <span>Rs {item.total_price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => onNavigate("user-menu-order")}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ShoppingCart className="h-4 w-4" />
            {type === "cancel" ? "Return to Checkout" : "Order More"}
          </button>
          <button
            type="button"
            onClick={() => onNavigate("user-wellness")}
            className="flex-1 rounded-xl bg-wellora px-4 py-3 text-sm font-semibold text-white transition hover:bg-wellora-hover"
          >
            View Orders
          </button>
        </div>
      </div>
    </div>
  );
}
