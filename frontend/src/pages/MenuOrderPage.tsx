import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronDown,
  CreditCard,
  Eye,
  Flower2,
  Heart,
  Home,
  Loader2,
  Minus,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { getPublicMeals, placeOrder, PublicMeal } from "../api/orders";
import { resolveImageUrl } from "../api/client";
import { getMe } from "../api/user";
import { syncDailyLog } from "../api/health";
import { BackButton } from "../components/BackButton";

interface MenuOrderPageProps {
  onNavigate: (page: AppPage) => void;
}

type Category = "All" | "Breakfast" | "Lunch" | "Dinner" | "Snacks" | "Desserts" | "Drinks";
type AvailabilityFilter = "all" | "available" | "unavailable";
type SortOption = "recommended" | "price-low" | "price-high" | "calories-low" | "calories-high";

const CATEGORIES: Category[] = ["All", "Breakfast", "Lunch", "Dinner", "Snacks", "Desserts", "Drinks"];
const CART_STORAGE_KEY = "wellora-menu-cart";
const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80";
const SIDE_NAV_ITEMS: Array<{ page: AppPage; icon: LucideIcon; label: string }> = [
  { page: "user-dashboard", icon: Home, label: "Dashboard" },
  { page: "user-meal-recommendations", icon: Star, label: "Meal Recommendations" },
  { page: "user-menu-order", icon: ShoppingCart, label: "Menu & Order" },
  { page: "user-wellness", icon: Flower2, label: "Wellness" },
];

interface CartLine {
  id: string;
  name: string;
  unitPrice: number;
  calories: number;
  qty: number;
  vendorId: number;
  vendorName: string;
  dietary: string;
  image?: string;
}

interface DeliveryForm {
  recipient_name: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  notes: string;
}

interface TestPaymentForm {
  cardNumber: string;
  expiry: string;
  cvc: string;
  name: string;
}

interface MealIngredient {
  name?: string;
  weight?: number;
  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
    fat?: number;
  };
}

const readStoredCart = (): CartLine[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const parseIngredients = (value?: string): MealIngredient[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value
      .split(",")
      .map((name) => ({ name: name.trim() }))
      .filter((item) => item.name);
  }
};

const nutritionTotal = (ingredients: MealIngredient[], field: "protein" | "carbs" | "fat") =>
  ingredients.reduce((sum, ingredient) => {
    const nutrition = ingredient.nutrition;
    const value = field === "fat" ? nutrition?.fat ?? nutrition?.fats : nutrition?.[field];
    return sum + (Number(value) || 0);
  }, 0);

export function MenuOrderPage({ onNavigate }: MenuOrderPageProps) {
  const [meals, setMeals] = useState<PublicMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<Category>("All");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartLine[]>(readStoredCart);
  const [isOrdering, setIsOrdering] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [toast, setToast] = useState("");
  const [addingMealId, setAddingMealId] = useState<string | null>(null);
  const [addedMealId, setAddedMealId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState("All");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>("available");
  const [maxCalories, setMaxCalories] = useState("All");
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [selectedMeal, setSelectedMeal] = useState<PublicMeal | null>(null);
  const [pendingMeal, setPendingMeal] = useState<PublicMeal | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"idle" | "success" | "failed">("idle");
  const [delivery, setDelivery] = useState<DeliveryForm>({
    recipient_name: "",
    phone: "",
    address: "",
    city: "",
    postal_code: "",
    notes: "",
  });
  const [payment, setPayment] = useState<TestPaymentForm>({
    cardNumber: "",
    expiry: "",
    cvc: "",
    name: "",
  });

  useEffect(() => {
    setIsLoading(true);
    getPublicMeals()
      .then(setMeals)
      .catch((err) => {
        console.error("Failed to load meals:", err);
        setOrderError("Unable to load vendor meals. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    getMe()
      .then((user) => {
        setDelivery((prev) => ({
          ...prev,
          recipient_name: prev.recipient_name || user.name || "",
          phone: prev.phone || user.phone || "",
          address: prev.address || user.address || "",
        }));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (paymentStatus === "failed" && paymentMessage) {
      setOrderError(paymentMessage);
    }
  }, [paymentMessage, paymentStatus]);

  const vendors = useMemo(
    () => Array.from(new Set(meals.map((meal) => meal.vendor_name || `Vendor ${meal.vendor_id}`))).sort(),
    [meals],
  );
  const dietaryTypes = useMemo(
    () => Array.from(new Set(meals.map((meal) => meal.dietary).filter(Boolean))).sort(),
    [meals],
  );

  const filteredMeals = useMemo(() => {
    let result = [...meals];
    const query = searchQuery.trim().toLowerCase();
    if (activeCategory !== "All") result = result.filter((meal) => meal.category === activeCategory);
    if (dietaryFilter !== "All") result = result.filter((meal) => meal.dietary === dietaryFilter);
    if (vendorFilter !== "All") result = result.filter((meal) => (meal.vendor_name || `Vendor ${meal.vendor_id}`) === vendorFilter);
    if (availabilityFilter === "available") result = result.filter((meal) => meal.available !== false);
    if (availabilityFilter === "unavailable") result = result.filter((meal) => meal.available === false);
    if (maxCalories !== "All") result = result.filter((meal) => meal.calories <= Number(maxCalories));
    if (query) {
      result = result.filter(
        (meal) =>
          meal.name.toLowerCase().includes(query) ||
          meal.dietary.toLowerCase().includes(query) ||
          (meal.vendor_name || "").toLowerCase().includes(query),
      );
    }
    if (sortBy === "price-low") result.sort((a, b) => a.price - b.price);
    if (sortBy === "price-high") result.sort((a, b) => b.price - a.price);
    if (sortBy === "calories-low") result.sort((a, b) => a.calories - b.calories);
    if (sortBy === "calories-high") result.sort((a, b) => b.calories - a.calories);
    return result;
  }, [meals, activeCategory, searchQuery, dietaryFilter, vendorFilter, availabilityFilter, maxCalories, sortBy]);

  const getQty = (id: string) => qtyByItem[id] ?? 1;
  const setQty = (id: string, next: number) =>
    setQtyByItem((prev) => ({ ...prev, [id]: Math.min(99, Math.max(1, next)) }));
  const toggleFavorite = (id: string) =>
    setFavorites((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const appendMealToCart = (meal: PublicMeal, replace = false) => {
    const key = String(meal.id);
    const q = getQty(key);
    const line: CartLine = {
      id: key,
      name: meal.name,
      unitPrice: meal.price,
      calories: meal.calories,
      qty: q,
      vendorId: meal.vendor_id,
      vendorName: meal.vendor_name || `Vendor ${meal.vendor_id}`,
      dietary: meal.dietary,
      image: meal.image_url,
    };
    setCart((prev) => {
      const base = replace ? [] : prev;
      const existing = base.find((item) => item.id === key);
      if (existing) {
        return base.map((item) => (item.id === key ? { ...item, qty: Math.min(99, item.qty + q) } : item));
      }
      return [...base, line];
    });
    setQtyByItem((prev) => ({ ...prev, [key]: 1 }));
    setCheckoutOpen(false);
    setPaymentOpen(false);
  };

  const addToCart = (meal: PublicMeal) => {
    const key = String(meal.id);
    if (addingMealId === key) return;
    if (meal.available === false) {
      setToast("Meal is unavailable.");
      return;
    }
    const currentVendorId = cart[0]?.vendorId;
    if (currentVendorId && currentVendorId !== meal.vendor_id) {
      setPendingMeal(meal);
      return;
    }
    setAddingMealId(key);
    appendMealToCart(meal);
    setToast("Meal added to cart.");
    setAddedMealId(key);
    window.setTimeout(() => setAddingMealId(null), 450);
    window.setTimeout(() => setAddedMealId((current) => (current === key ? null : current)), 1600);
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((item) => item.id !== id));
  const updateCartQty = (id: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(id);
      return;
    }
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, qty: Math.min(99, qty) } : item)));
  };
  const emptyCart = () => {
    setCart([]);
    setCheckoutOpen(false);
    setPaymentOpen(false);
    setOrderError("");
  };

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const totalCalories = cart.reduce((sum, line) => sum + line.calories * line.qty, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);
  const activeVendorName = cart[0]?.vendorName;
  const deliveryComplete = Boolean(
    delivery.recipient_name.trim() &&
    delivery.phone.trim() &&
    delivery.address.trim() &&
    delivery.city.trim(),
  );

  const handleCheckout = () => {
    setOrderError("");
    setPaymentMessage("");
    setPaymentStatus("idle");
    if (cart.length === 0) return;
    if (!delivery.recipient_name.trim() || !delivery.phone.trim() || !delivery.address.trim() || !delivery.city.trim()) {
      setOrderError("Please complete the required delivery details.");
      return;
    }
    setPaymentOpen(true);
  };

  const handleTestPayment = async () => {
    setOrderError("");
    setPaymentMessage("");
    setPaymentStatus("idle");
    const cardNumber = payment.cardNumber.replace(/\s/g, "");
    if (!cardNumber || !payment.name.trim() || !payment.expiry.trim() || !payment.cvc.trim()) {
      setPaymentStatus("failed");
      setPaymentMessage("Please complete all test card payment fields.");
      setOrderError("Please enter a test card number.");
      return;
    }
    if (cardNumber === "4000000000000002") {
      setPaymentStatus("failed");
      setPaymentMessage("Payment failed. This test card was declined.");
      setOrderError("Payment failed. This test card was declined.");
      return;
    }
    if (cardNumber === "4000000000009995") {
      setPaymentStatus("failed");
      setPaymentMessage("Payment failed. The test card has insufficient funds.");
      setOrderError("Payment failed. The test card has insufficient funds.");
      return;
    }
    if (!["4242424242424242", "5555555555554444"].includes(cardNumber)) {
      setPaymentStatus("failed");
      setPaymentMessage("Invalid test card. Use 4242 4242 4242 4242 for a successful payment.");
      setOrderError("Invalid test card. Use 4242 4242 4242 4242 for a successful payment.");
      return;
    }
    setIsOrdering(true);
    try {
      await placeOrder(
        cart.map((line) => ({ meal_id: Number(line.id), quantity: line.qty })),
        delivery,
      );
      await syncDailyLog().catch(() => undefined);
      localStorage.removeItem(CART_STORAGE_KEY);
      setCart([]);
      setCheckoutOpen(false);
      setPaymentOpen(false);
      setPaymentStatus("success");
      setPaymentMessage("Payment successful. Order placed and sent to the vendor.");
    } catch (err: any) {
      setPaymentStatus("failed");
      setPaymentMessage(err.response?.data?.detail ?? "Payment could not be completed. Please try again.");
    } finally {
      setIsOrdering(false);
    }
  };

  const renderSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: string[],
  ) => (
    <label className="min-w-[10rem] flex-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
      {label}
      <span className="relative mt-1 block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-9 text-sm font-medium text-slate-700 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      </span>
    </label>
  );

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <div className="flex w-full flex-1 flex-col lg:min-h-0 lg:flex-row">
        <aside className="shrink-0 border-b border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900 lg:flex lg:h-full lg:w-64 lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="mb-8 flex items-center gap-2 px-2">
            <WelloraLogoMark size="md" />
            <span className="text-lg font-semibold tracking-tight text-wellora">Wellora</span>
          </div>
          <nav className="space-y-1">
            {SIDE_NAV_ITEMS.map(({ page, icon: Icon, label }) => (
              <button
                key={String(page)}
                type="button"
                onClick={() => page !== "user-menu-order" && onNavigate(page)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                  page === "user-menu-order"
                    ? "bg-slate-100 font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" /> {label}
              </button>
            ))}
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
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
            <div className="flex items-center gap-3">
              <BackButton label="Dashboard" to="user-dashboard" onNavigate={onNavigate} className="lg:hidden" />
              <span className="font-semibold text-wellora">Wellora</span>
            </div>
            <div className="flex items-center gap-3">
              {cartCount > 0 && (
                <div className="relative">
                  <ShoppingCart className="h-5 w-5 text-wellora" />
                  <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-wellora text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                </div>
              )}
              <button type="button" className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300">
                <Bell className="h-5 w-5" />
              </button>
              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-wellora ring-2 ring-white dark:ring-slate-800" />
            </div>
          </header>

          <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 xl:pb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Menu & Ordering</h1>
                  <p className="mt-1 text-sm text-slate-500">Choose meals from approved vendors only.</p>
                </div>
                <span className="text-sm text-slate-500">{filteredMeals.length} meals shown</span>
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search meals, vendors, or dietary type..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setActiveCategory(cat)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        activeCategory === cat
                          ? "bg-wellora text-white shadow-sm"
                          : "bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-end gap-2 text-xs font-semibold text-slate-500">
                    <SlidersHorizontal className="mb-3 h-4 w-4" />
                  </div>
                  {renderSelect("Dietary", dietaryFilter, setDietaryFilter, ["All", ...dietaryTypes])}
                  {renderSelect("Vendor", vendorFilter, setVendorFilter, ["All", ...vendors])}
                  {renderSelect("Availability", availabilityFilter, (value) => setAvailabilityFilter(value as AvailabilityFilter), ["all", "available", "unavailable"])}
                  {renderSelect("Calories", maxCalories, setMaxCalories, ["All", "300", "500", "700", "900"])}
                  {renderSelect("Sort", sortBy, (value) => setSortBy(value as SortOption), ["recommended", "price-low", "price-high", "calories-low", "calories-high"])}
                </div>
              </div>

              {isLoading ? (
                <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-80 animate-pulse rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
                  ))}
                </div>
              ) : filteredMeals.length === 0 ? (
                <div className="mt-12 flex flex-col items-center justify-center gap-3 text-center">
                  <ShoppingCart className="h-12 w-12 text-slate-300 dark:text-slate-600" />
                  <p className="font-medium text-slate-600 dark:text-slate-400">No meals match these filters.</p>
                  <button type="button" onClick={() => setSearchQuery("")} className="text-sm text-wellora hover:underline">
                    Clear search
                  </button>
                </div>
              ) : (
                <div className="mt-6 grid auto-rows-fr gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredMeals.map((meal) => {
                    const key = String(meal.id);
                    const inCart = cart.find((line) => line.id === key);
                    const isFav = favorites.has(key);
                    const available = meal.available !== false;
                    return (
                      <article key={key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
                        <div className="relative aspect-[4/3] overflow-hidden bg-slate-200 dark:bg-slate-800">
                          <img src={resolveImageUrl(meal.image_url) || FALLBACK_IMG} alt={meal.name} className="h-full w-full object-cover transition duration-300 hover:scale-105" />
                          <button type="button" onClick={() => toggleFavorite(key)} className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 shadow-sm transition hover:scale-110 dark:bg-slate-900/90">
                            <Heart className={`h-4 w-4 transition ${isFav ? "fill-rose-500 text-rose-500" : "text-slate-600"}`} />
                          </button>
                          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                            {meal.dietary}
                          </span>
                          {!available && (
                            <span className="absolute bottom-3 left-3 rounded-full bg-slate-900/80 px-2.5 py-0.5 text-xs font-semibold text-white">
                              Unavailable
                            </span>
                          )}
                          {inCart && (
                            <span className="absolute bottom-3 right-3 rounded-full bg-wellora px-2.5 py-0.5 text-xs font-semibold text-white">
                              {inCart.qty} in cart
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h2 className="font-semibold leading-snug text-slate-900 dark:text-white">{meal.name}</h2>
                              <p className="mt-1 text-xs font-medium text-wellora">{meal.vendor_name || `Vendor ${meal.vendor_id}`}</p>
                            </div>
                            <span className="text-lg font-bold text-wellora">Rs {meal.price.toFixed(2)}</span>
                          </div>
                          {meal.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{meal.description}</p>}
                          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                            <span>{meal.calories} kcal</span>
                            <span>-</span>
                            <span>{meal.category}</span>
                          </div>
                          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
                              <button type="button" onClick={() => setQty(key, getQty(key) - 1)} className="rounded-l-xl p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">{getQty(key)}</span>
                              <button type="button" onClick={() => setQty(key, getQty(key) + 1)} className="rounded-r-xl p-2 text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700">
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                            <button type="button" onClick={() => setSelectedMeal(meal)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => addToCart(meal)}
                              disabled={!available || addingMealId === key}
                              title={available ? "Add to Cart" : "Unavailable"}
                              aria-label={available ? `Add ${meal.name} to cart` : `${meal.name} unavailable`}
                              className={`inline-flex h-10 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-wellora/30 disabled:cursor-not-allowed disabled:opacity-50 ${
                                addedMealId === key
                                  ? "bg-emerald-600"
                                  : "bg-wellora hover:bg-wellora-hover"
                              }`}
                            >
                              {addingMealId === key ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : addedMealId === key ? (
                                <Check className="h-4 w-4" />
                              ) : (
                                <ShoppingCart className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </main>

            <aside className="flex shrink-0 flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:h-full xl:w-[min(100%,420px)] xl:min-h-0 xl:border-l xl:border-t-0">
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 xl:max-h-full">
                <div className="flex shrink-0 items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{checkoutOpen ? "Checkout" : "Your Order"}</h2>
                    {activeVendorName && <p className="text-xs text-slate-500">From {activeVendorName}</p>}
                  </div>
                  {cart.length > 0 && (
                    <button type="button" onClick={emptyCart} className="text-xs text-slate-400 transition hover:text-red-500">
                      Clear all
                    </button>
                  )}
                </div>

                <div className="mt-4 flex min-h-[min(180px,35svh)] flex-1 flex-col xl:min-h-0">
                  {cart.length === 0 ? (
                    <div className="flex min-h-[12rem] flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center dark:border-slate-700 dark:bg-slate-800/50 xl:min-h-0">
                      <ShoppingCart className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                      <p className="mt-3 max-w-[220px] text-sm text-slate-500 dark:text-slate-400">Your cart is empty. Add meals from one vendor to start checkout.</p>
                    </div>
                  ) : (
                    <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
                      {cart.map((line) => (
                        <li key={line.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                          <div className="flex items-start gap-3">
                            <img src={resolveImageUrl(line.image) || FALLBACK_IMG} alt={line.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{line.name}</p>
                              <p className="text-xs text-slate-500">{line.calories * line.qty} kcal total</p>
                            </div>
                            <button type="button" onClick={() => removeFromCart(line.id)} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
                              <button type="button" onClick={() => updateCartQty(line.id, line.qty - 1)} className="rounded-l-lg px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-[1.5rem] text-center text-xs font-semibold">{line.qty}</span>
                              <button type="button" onClick={() => updateCartQty(line.id, line.qty + 1)} className="rounded-r-lg px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">Rs {(line.unitPrice * line.qty).toFixed(2)}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {cart.length > 0 && (
                  <>
                    <div className="mt-3 shrink-0 rounded-xl bg-wellora/10 p-3 text-xs font-medium text-wellora">
                      Total calories: <span className="font-bold">{totalCalories} kcal</span>
                    </div>
                    {checkoutOpen && (
                      <div className="mt-4 shrink-0 space-y-3">
                        <input value={delivery.recipient_name} onChange={(event) => setDelivery((prev) => ({ ...prev, recipient_name: event.target.value }))} placeholder="Recipient name" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                        <input value={delivery.phone} onChange={(event) => setDelivery((prev) => ({ ...prev, phone: event.target.value }))} placeholder="Phone number" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                        <textarea value={delivery.address} onChange={(event) => setDelivery((prev) => ({ ...prev, address: event.target.value }))} placeholder="Delivery address" rows={3} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <input value={delivery.city} onChange={(event) => setDelivery((prev) => ({ ...prev, city: event.target.value }))} placeholder="City / Area" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                          <input value={delivery.postal_code} onChange={(event) => setDelivery((prev) => ({ ...prev, postal_code: event.target.value }))} placeholder="Postal code optional" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                        </div>
                        <textarea value={delivery.notes} onChange={(event) => setDelivery((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Delivery notes optional" rows={2} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                          <div className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
                            <CreditCard className="h-4 w-4 text-wellora" />
                            Test card payment
                          </div>
                          <p className="mt-1">Use 4242 4242 4242 4242 for success, or 4000 0000 0000 0002 for failure.</p>
                        </div>
                        {orderError && <p className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">{orderError}</p>}
                        {paymentOpen && (
                          <div className="space-y-3">
                            <input value={payment.name} onChange={(event) => setPayment((prev) => ({ ...prev, name: event.target.value }))} placeholder="Name on card" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                            <input value={payment.cardNumber} onChange={(event) => setPayment((prev) => ({ ...prev, cardNumber: event.target.value }))} placeholder="Test card number" inputMode="numeric" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                            <div className="grid grid-cols-2 gap-3">
                              <input value={payment.expiry} onChange={(event) => setPayment((prev) => ({ ...prev, expiry: event.target.value }))} placeholder="MM/YY" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                              <input value={payment.cvc} onChange={(event) => setPayment((prev) => ({ ...prev, cvc: event.target.value }))} placeholder="CVC" inputMode="numeric" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="mt-4 shrink-0 space-y-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                      <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                        <span>Subtotal</span>
                        <span className="tabular-nums">Rs {subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-900 dark:border-slate-700 dark:text-white">
                        <span>Total</span>
                        <span className="tabular-nums">Rs {subtotal.toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="sticky bottom-0 -mx-5 mt-4 grid shrink-0 gap-3 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
                      {checkoutOpen && (
                        <button type="button" onClick={() => setCheckoutOpen(false)} className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                          Continue Shopping
                        </button>
                      )}
                      <button type="button" onClick={checkoutOpen ? (paymentOpen ? handleTestPayment : handleCheckout) : () => setCheckoutOpen(true)} disabled={cart.length === 0 || isOrdering || (checkoutOpen && !deliveryComplete)} className="w-full rounded-xl bg-wellora py-3 text-sm font-semibold text-white transition hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50">
                        {isOrdering ? "Processing Payment..." : paymentOpen ? `Pay Rs ${subtotal.toFixed(2)}` : checkoutOpen ? `Place Order - Rs ${subtotal.toFixed(2)}` : `Checkout - Rs ${subtotal.toFixed(2)}`}
                      </button>
                    </div>
                  </>
                )}

                {cart.length === 0 && (
                  <div className="mt-3 space-y-3">
                    {paymentStatus === "success" && (
                      <div className="rounded-xl bg-green-50 p-3 text-sm font-medium text-green-700 dark:bg-green-900/20 dark:text-green-300">
                        Payment successful. Order placed and sent to the vendor.
                      </div>
                    )}
                    <button type="button" onClick={() => onNavigate("user-wellness")} className="w-full shrink-0 text-center text-sm font-medium text-wellora hover:underline">
                      View my order history
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {selectedMeal && (
        <MealDetailModal meal={selectedMeal} onClose={() => setSelectedMeal(null)} onAdd={() => addToCart(selectedMeal)} />
      )}

      {pendingMeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
              <div>
                <h3 className="text-lg font-semibold">Start a new vendor cart?</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Your current cart has meals from {activeVendorName}. Orders can include meals from one vendor only.
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setPendingMeal(null)} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                Keep Cart
              </button>
              <button
                type="button"
                onClick={() => {
                  appendMealToCart(pendingMeal, true);
                  setPendingMeal(null);
                }}
                className="flex-1 rounded-xl bg-wellora px-4 py-3 text-sm font-semibold text-white hover:bg-wellora-hover"
              >
                Clear Cart & Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MealDetailModal({
  meal,
  onClose,
  onAdd,
}: {
  meal: PublicMeal;
  onClose: () => void;
  onAdd: () => void;
}) {
  const ingredients = parseIngredients(meal.ingredients);
  const protein = nutritionTotal(ingredients, "protein");
  const carbs = nutritionTotal(ingredients, "carbs");
  const fat = nutritionTotal(ingredients, "fat");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="relative aspect-[16/7] bg-slate-200 dark:bg-slate-800">
          <img src={resolveImageUrl(meal.image_url) || FALLBACK_IMG} alt={meal.name} className="h-full w-full object-cover" />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-600 shadow-sm hover:bg-white dark:bg-slate-900/90 dark:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{meal.name}</h2>
              <p className="mt-1 text-sm font-medium text-wellora">{meal.vendor_name || `Vendor ${meal.vendor_id}`}</p>
            </div>
            <span className="text-xl font-bold text-wellora">Rs {meal.price.toFixed(2)}</span>
          </div>
          {meal.description && <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{meal.description}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Calories", `${meal.calories} kcal`],
              ["Protein", `${protein.toFixed(1)} g`],
              ["Carbs", `${carbs.toFixed(1)} g`],
              ["Fat", `${fat.toFixed(1)} g`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 font-semibold">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Ingredients</h3>
            {ingredients.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No ingredient details added for this meal.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {ingredients.map((ingredient, index) => (
                  <li key={`${ingredient.name}-${index}`} className="flex justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                    <span>{ingredient.name || "Ingredient"}</span>
                    {ingredient.weight ? <span className="text-slate-500">{ingredient.weight} g</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="button" onClick={onAdd} disabled={meal.available === false} className="mt-6 w-full rounded-xl bg-wellora px-4 py-3 text-sm font-semibold text-white transition hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50">
            {meal.available === false ? "Currently Unavailable" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
