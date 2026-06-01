import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Heart,
  Home,
  LayoutGrid,
  Minus,
  Plus,
  Settings,
  ShoppingCart,
  Star,
  Flower2,
  Trash2,
  X,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { getPublicMeals, placeOrder, PublicMeal } from "../api/orders";
import { resolveImageUrl } from "../api/client";
import { syncDailyLog } from "../api/health";

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
const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80";

interface CartLine {
  id: string;
  name: string;
  unitPrice: number;
  calories: number;
  qty: number;
  image?: string;
}

export function MenuOrderPage({ onNavigate }: MenuOrderPageProps) {
  // ─── State ───────────────────────────────────
  const [meals, setMeals] = useState<PublicMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartLine[]>([]);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // ─── Load meals from backend ─────────────────
  useEffect(() => {
    setIsLoading(true);
    getPublicMeals()
      .then(setMeals)
      .catch((err) => console.error("Failed to load meals:", err))
      .finally(() => setIsLoading(false));
  }, []);

  // ─── Filter meals ─────────────────────────────
  const filteredMeals = useMemo(() => {
    let result = meals;
    if (activeCategory !== "All") {
      result = result.filter((m) => m.category === activeCategory);
    }
    if (searchQuery.trim()) {
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.dietary.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }
    return result;
  }, [meals, activeCategory, searchQuery]);

  // ─── Cart helpers ─────────────────────────────
  const getQty = (id: string) => qtyByItem[id] ?? 1;

  const setQty = (id: string, next: number) =>
    setQtyByItem((prev) => ({
      ...prev,
      [id]: Math.min(99, Math.max(1, next)),
    }));

  const toggleFavorite = (id: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const addToCart = (meal: PublicMeal) => {
    const key = String(meal.id);
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
          name: meal.name,
          unitPrice: meal.price,
          calories: meal.calories,
          qty: q,
          image: meal.image_url,
        },
      ];
    });
    setQtyByItem((prev) => ({ ...prev, [key]: 1 }));
  };

  const removeFromCart = (id: string) =>
    setCart((prev) => prev.filter((l) => l.id !== id));

  const updateCartQty = (id: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    setCart((prev) => prev.map((l) => (l.id === id ? { ...l, qty } : l)));
  };

  const emptyCart = () => setCart([]);

  // ─── Totals ───────────────────────────────────
  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  const totalCalories = cart.reduce((s, l) => s + l.calories * l.qty, 0);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  // ─── Checkout ─────────────────────────────────
  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsOrdering(true);
    setOrderError("");
    try {
      await placeOrder(
        cart.map((l) => ({
          meal_id: Number(l.id),
          quantity: l.qty,
        })),
      );
      await syncDailyLog();
      setOrderSuccess(true);
      emptyCart();
      setTimeout(() => setOrderSuccess(false), 5000);
    } catch (err: any) {
      setOrderError(
        err.response?.data?.detail ??
          "Failed to place order. Please try again.",
      );
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
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300"
              >
                <LayoutGrid className="h-5 w-5" />
              </button>
              <span className="font-semibold text-wellora">Wellora</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Cart badge */}
              {cartCount > 0 && (
                <div className="relative">
                  <ShoppingCart className="h-5 w-5 text-wellora" />
                  <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-wellora text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                </div>
              )}
              <button
                type="button"
                className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
              >
                <Bell className="h-5 w-5" />
              </button>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-wellora ring-2 ring-white dark:ring-slate-800" />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            {/* ── Menu Grid ── */}
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 xl:pb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Menu & Ordering
                </h1>
                {meals.length > 0 && (
                  <span className="text-sm text-slate-500">
                    {meals.length} meals available
                  </span>
                )}
              </div>

              {/* Search */}
              <div className="mt-4">
                <input
                  type="search"
                  placeholder="Search meals or dietary type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
              </div>

              {/* Category filters */}
              <div className="mt-4 flex flex-wrap gap-2">
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

              {/* Order success banner */}
              {orderSuccess && (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-green-50 p-4 dark:bg-green-900/20">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="font-semibold text-green-700 dark:text-green-400">
                      Order placed successfully! 🎉
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-500">
                      Your order is being prepared. Check Wellness → My Orders
                      for status.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOrderSuccess(false)}
                    className="ml-auto"
                  >
                    <X className="h-4 w-4 text-green-600" />
                  </button>
                </div>
              )}

              {/* Meal cards */}
              {isLoading ? (
                <div className="mt-16 flex flex-col items-center justify-center gap-3">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-wellora border-t-transparent" />
                  <p className="text-sm text-slate-500">
                    Loading meals from vendors...
                  </p>
                </div>
              ) : filteredMeals.length === 0 ? (
                <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center">
                  <ShoppingCart className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                  <p className="font-medium text-slate-600 dark:text-slate-400">
                    {searchQuery
                      ? `No meals found for "${searchQuery}"`
                      : "No meals in this category yet."}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-sm text-wellora hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-6 grid auto-rows-fr gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredMeals.map((meal) => {
                    const key = String(meal.id);
                    const inCart = cart.find((l) => l.id === key);
                    const isFav = favorites.has(key);
                    return (
                      <article
                        key={key}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                      >
                        {/* Image */}
                        <div className="relative aspect-[4/3] overflow-hidden bg-slate-200 dark:bg-slate-800">
                          <img
                            src={
                              resolveImageUrl(meal.image_url) || FALLBACK_IMG
                            }
                            alt={meal.name}
                            className="h-full w-full object-cover transition duration-300 hover:scale-105"
                          />
                          {/* Favorite */}
                          <button
                            type="button"
                            onClick={() => toggleFavorite(key)}
                            className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 shadow-sm transition hover:scale-110 dark:bg-slate-900/90"
                          >
                            <Heart
                              className={`h-4 w-4 transition ${isFav ? "fill-rose-500 text-rose-500" : "text-slate-600"}`}
                            />
                          </button>
                          {/* Dietary badge */}
                          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                            {meal.dietary}
                          </span>
                          {/* In cart indicator */}
                          {inCart && (
                            <div className="absolute bottom-3 right-3 rounded-full bg-wellora px-2.5 py-0.5 text-xs font-semibold text-white">
                              {inCart.qty} in cart
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-4">
                          <h2 className="font-semibold leading-snug text-slate-900 dark:text-white">
                            {meal.name}
                          </h2>
                          {meal.description && (
                            <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                              {meal.description}
                            </p>
                          )}
                          <div className="mt-3 flex items-baseline justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-slate-500">
                                {meal.calories} kcal
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-400">
                                {meal.category}
                              </span>
                            </div>
                            <span className="text-lg font-bold text-wellora">
                              Rs {meal.price.toFixed(2)}
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
                              onClick={() => addToCart(meal)}
                              className="flex-1 rounded-xl bg-wellora py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover active:scale-95"
                            >
                              {inCart ? "+ Add More" : "Add to Cart"}
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
            <aside className="flex shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:h-full xl:w-[min(100%,400px)] xl:min-h-0 xl:border-l xl:border-t-0">
              <div className="flex min-h-0 flex-1 flex-col p-5 xl:max-h-full">
                {/* Cart header */}
                <div className="flex shrink-0 items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Your Order
                    {cartCount > 0 && (
                      <span className="ml-2 rounded-full bg-wellora px-2 py-0.5 text-xs font-bold text-white">
                        {cartCount}
                      </span>
                    )}
                  </h2>
                  {cart.length > 0 && (
                    <button
                      type="button"
                      onClick={emptyCart}
                      className="text-xs text-slate-400 hover:text-red-500 transition"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {/* Cart items */}
                <div className="mt-4 flex min-h-[min(180px,35svh)] flex-1 flex-col xl:min-h-0">
                  {cart.length === 0 ? (
                    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center dark:border-slate-700 dark:bg-slate-800/50 xl:min-h-0">
                      <ShoppingCart className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                      <p className="mt-3 max-w-[200px] text-sm text-slate-500 dark:text-slate-400">
                        Your cart is empty. Add some healthy meals!
                      </p>
                    </div>
                  ) : (
                    <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                      {cart.map((line) => (
                        <li
                          key={line.id}
                          className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
                        >
                          <div className="flex items-start gap-3">
                            {/* Thumbnail */}
                            <img
                              src={resolveImageUrl(line.image) || FALLBACK_IMG}
                              alt={line.name}
                              className="h-12 w-12 shrink-0 rounded-lg object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                {line.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {line.calories * line.qty} kcal total
                              </p>
                            </div>
                            {/* Remove */}
                            <button
                              type="button"
                              onClick={() => removeFromCart(line.id)}
                              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {/* Qty controls in cart */}
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQty(line.id, line.qty - 1)
                                }
                                className="rounded-l-lg px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-[1.5rem] text-center text-xs font-semibold">
                                {line.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateCartQty(line.id, line.qty + 1)
                                }
                                className="rounded-r-lg px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                              Rs {(line.unitPrice * line.qty).toFixed(2)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Calorie summary */}
                {cart.length > 0 && (
                  <div className="mt-3 shrink-0 rounded-xl bg-wellora/10 p-3">
                    <p className="text-xs font-medium text-wellora">
                      🔥 Total calories:{" "}
                      <span className="font-bold">{totalCalories} kcal</span>
                    </p>
                  </div>
                )}

                {/* Totals */}
                <div className="mt-4 shrink-0 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>Subtotal</span>
                    <span className="tabular-nums">Rs {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                    <span>Tax (8%)</span>
                    <span className="tabular-nums">Rs {tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                    <span>Total</span>
                    <span className="tabular-nums">Rs {total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Error message */}
                {orderError && (
                  <div className="mt-3 rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {orderError}
                    </p>
                  </div>
                )}

                {/* Checkout button */}
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={cart.length === 0 || isOrdering}
                  className="mt-4 w-full shrink-0 rounded-xl bg-wellora py-3 text-sm font-semibold text-white transition hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isOrdering ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Placing Order...
                    </span>
                  ) : (
                    `Place Order · Rs ${total.toFixed(2)}`
                  )}
                </button>

                {/* View orders link */}
                {cart.length === 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate("user-wellness")}
                    className="mt-3 w-full shrink-0 text-center text-sm font-medium text-wellora hover:underline"
                  >
                    View my order history →
                  </button>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
