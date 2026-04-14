import { useEffect, useMemo, useState } from "react";
import { getPublicMeals, placeOrder, PublicMeal } from "../api/orders";
import {
  Bell,
  Heart,
  Home,
  LayoutGrid,
  Settings,
  Minus,
  Plus,
  ShoppingCart,
  Star,
  Flower2,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";

interface MenuOrderPageProps {
  onNavigate: (page: AppPage) => void;
}

type Category =
  | "All"
  | "Breakfast"
  | "Lunch"
  | "Dinner"
  | "Snacks"
  | "Desserts"
  | "Drinks";

const CATEGORIES: Category[] = [
  "All",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snacks",
  "Desserts",
  "Drinks",
];
const TAX_RATE = 0.08;
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80";

interface CartLine {
  id: string;
  title: string;
  unitPrice: number;
  kcal: number;
  qty: number;
}

export function MenuOrderPage({ onNavigate }: MenuOrderPageProps) {
  const [menuItems, setMenuItems] = useState<PublicMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartLine[]>([]);

  // ─── Load meals from backend ─────────────────
  useEffect(() => {
    setIsLoading(true);
    getPublicMeals()
      .then(setMenuItems)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // ─── Filter by category ───────────────────────
  const filteredItems = useMemo(() => {
    if (activeCategory === "All") return menuItems;
    return menuItems.filter((m) => m.category === activeCategory);
  }, [activeCategory, menuItems]);

  // ─── Cart helpers ─────────────────────────────
  const getQty = (id: string) => qtyByItem[id] ?? 1;

  const setQty = (id: string, next: number) => {
    setQtyByItem((prev) => ({
      ...prev,
      [id]: Math.min(99, Math.max(1, next)),
    }));
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addToCart = (item: PublicMeal) => {
    const key = String(item.id);
    const q = getQty(key);
    setCart((prev) => {
      const existing = prev.find((l) => l.id === key);
      if (existing) {
        return prev.map((l) => (l.id === key ? { ...l, qty: l.qty + q } : l));
      }
      return [
        ...prev,
        {
          id: key,
          title: item.name,
          unitPrice: item.price,
          kcal: item.calories,
          qty: q,
        },
      ];
    });
    setQtyByItem((prev) => ({ ...prev, [key]: 1 }));
  };

  const emptyCart = () => setCart([]);

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  // ─── Checkout ─────────────────────────────────
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsOrdering(true);
    try {
      const items = cart.map((line) => ({
        meal_id: Number(line.id),
        quantity: line.qty,
      }));
      await placeOrder(items);
      setOrderSuccess("🎉 Order placed successfully!");
      emptyCart();
      setTimeout(() => setOrderSuccess(""), 4000);
    } catch {
      alert("Failed to place order. Please try again.");
    } finally {
      setIsOrdering(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <div className="flex w-full flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* ── Sidebar ── */}
        <aside className="shrink-0 border-b border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900 lg:flex lg:h-full lg:w-64 lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-8 flex items-center gap-2 px-2">
            <WelloraLogoMark size="md" />
            <span className="text-lg font-semibold tracking-tight text-wellora">
              Wellora
            </span>
          </div>
          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => onNavigate("user-dashboard")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Home className="h-4 w-4 shrink-0" /> Dashboard
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user-meal-recommendations")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Star className="h-4 w-4 shrink-0" /> Meal Recommendations
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
            >
              <ShoppingCart className="h-4 w-4 shrink-0" /> Menu & Order
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user-wellness")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Flower2 className="h-4 w-4 shrink-0" /> Wellness
            </button>
          </nav>
          <button
            type="button"
            onClick={() => onNavigate("user-settings")}
            className="mt-8 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4 shrink-0" /> Settings
          </button>
        </aside>

        <div className="flex min-w-0 min-h-0 flex-1 flex-col">
          {/* ── Header ── */}
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <LayoutGrid className="h-5 w-5" />
              </button>
              <span className="font-semibold text-wellora">Wellora</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Bell className="h-5 w-5" />
              </button>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-wellora ring-2 ring-white dark:ring-slate-800" />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            {/* ── Menu Grid ── */}
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 xl:pb-8">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Menu & Ordering
              </h1>

              {/* Category filters */}
              <div className="mt-6 flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      activeCategory === cat
                        ? "bg-wellora text-white shadow-sm"
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Meal cards */}
              {isLoading ? (
                <div className="mt-12 flex items-center justify-center">
                  <p className="text-slate-500">Loading meals...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center">
                  <ShoppingCart className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                  <p className="text-slate-500 dark:text-slate-400">
                    No meals available in this category yet.
                  </p>
                </div>
              ) : (
                <div className="mt-8 grid auto-rows-fr gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredItems.map((item) => {
                    const key = String(item.id);
                    return (
                      <article
                        key={key}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
                      >
                        {/* Image */}
                        <div className="relative aspect-[4/3] overflow-hidden bg-slate-200 dark:bg-slate-800">
                          <img
                            src={item.image_url || FALLBACK_IMAGE}
                            alt={item.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => toggleFavorite(key)}
                            className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 shadow-sm dark:bg-slate-900/90"
                          >
                            <Heart
                              className={`h-4 w-4 ${favorites.has(key) ? "fill-rose-500 text-rose-500" : "text-slate-600"}`}
                            />
                          </button>
                          {/* Dietary badge */}
                          {item.dietary && (
                            <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                              {item.dietary}
                            </span>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-4">
                          <h2 className="font-semibold leading-snug text-slate-900 dark:text-white">
                            {item.name}
                          </h2>
                          {item.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                              {item.description}
                            </p>
                          )}
                          <div className="mt-3 flex items-baseline justify-between gap-2">
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                              {item.calories} kcal
                            </span>
                            <span className="text-lg font-bold text-wellora">
                              ${item.price.toFixed(2)}
                            </span>
                          </div>

                          {/* Qty + Add to cart */}
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                              <button
                                type="button"
                                onClick={() => setQty(key, getQty(key) - 1)}
                                className="rounded-l-xl p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">
                                {getQty(key)}
                              </span>
                              <button
                                type="button"
                                onClick={() => setQty(key, getQty(key) + 1)}
                                className="rounded-r-xl p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => addToCart(item)}
                              className="flex-1 rounded-xl bg-wellora py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
                            >
                              Add to cart
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </main>

            {/* ── Cart ── */}
            <aside className="flex shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:h-full xl:w-[min(100%,380px)] xl:min-h-0 xl:border-l xl:border-t-0">
              <div className="flex min-h-0 flex-1 flex-col p-5 xl:max-h-full">
                <h2 className="shrink-0 text-lg font-semibold text-slate-900 dark:text-white">
                  Your Order
                </h2>

                <div className="mt-4 flex min-h-[min(180px,35svh)] flex-1 flex-col xl:min-h-0">
                  {cart.length === 0 ? (
                    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center dark:border-slate-700 dark:bg-slate-800/50 xl:min-h-0">
                      <ShoppingCart className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                      <p className="mt-3 max-w-[220px] text-sm text-slate-500 dark:text-slate-400">
                        Your cart is empty. Start adding some delicious meals!
                      </p>
                    </div>
                  ) : (
                    <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                      {cart.map((line) => (
                        <li
                          key={line.id}
                          className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 dark:text-white">
                              {line.title}
                            </p>
                            <p className="text-xs text-slate-500">
                              {line.qty} × ${line.unitPrice.toFixed(2)}
                            </p>
                          </div>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white">
                            ${(line.unitPrice * line.qty).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Totals */}
                <div className="mt-4 shrink-0 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>Subtotal</span>
                    <span className="tabular-nums">${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>Tax (8%)</span>
                    <span className="tabular-nums">${tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900 dark:border-slate-700 dark:text-white">
                    <span>Total</span>
                    <span className="tabular-nums">${total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Success message */}
                {orderSuccess && (
                  <div className="mt-3 rounded-xl bg-green-50 p-3 text-center dark:bg-green-900/20">
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      {orderSuccess}
                    </p>
                  </div>
                )}

                {/* Checkout */}
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || isOrdering}
                  className="mt-4 w-full shrink-0 rounded-xl bg-wellora py-3 text-sm font-semibold text-white transition hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isOrdering ? "Placing Order..." : "Checkout"}
                </button>

                {/* Empty cart */}
                <button
                  type="button"
                  onClick={emptyCart}
                  disabled={cart.length === 0}
                  className="mt-3 w-full shrink-0 text-center text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-40 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Empty Cart
                </button>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
