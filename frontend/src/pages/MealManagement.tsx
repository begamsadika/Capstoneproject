import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { getVendorMeals, addMeal, updateMeal, deleteMealApi, getVendorStats } from "../api/meals";
import { resolveImageUrl } from "../api/client";
import type { AppPage } from "../types/page";

interface MealManagementProps {
  onNavigate?: (page: AppPage) => void;
}

// Types
// (Copy types from VendorDashboardPage)
type CategoryFilter = string;
type DietaryFilter = string;
type FormCategory = "Breakfast" | "Lunch" | "Dinner";
type FormDietary = "Vegetarian" | "Vegan" | "Gluten-Free" | "Keto" | "Paleo";

interface MealRow {
  id: number;
  name: string;
  category: string;
  calories: number;
  dietary: string;
  price: number;
  available: boolean;
  description?: string | null;
  image_url?: string | null;
}

interface MealFormState {
  mealName: string;
  category: FormCategory;
  calories: string;
  dietary: FormDietary;
  price: string;
  available: boolean;
  description?: string;
  imageFile: File | null;
  imagePreviewUrl: string;
}

const CATEGORIES: CategoryFilter[] = ["All Categories", "Breakfast", "Lunch", "Dinner"];
const DIETARY: DietaryFilter[] = [
  "All Dietary Types",
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Keto",
  "Paleo",
];
const FORM_CATEGORIES: FormCategory[] = ["Breakfast", "Lunch", "Dinner"];
const FORM_DIETARY: FormDietary[] = [
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Keto",
  "Paleo",
];

function emptyMealForm(): MealFormState {
  return {
    mealName: "",
    category: "Breakfast",
    calories: "",
    dietary: "Vegetarian",
    price: "",
    available: true,
    description: "",
    imageFile: null,
    imagePreviewUrl: "",
  };
}

export const MealManagement: React.FC<MealManagementProps> = ({ onNavigate }) => {
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [isLoadingMeals, setIsLoadingMeals] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All Categories");
  const [dietary, setDietary] = useState<DietaryFilter>("All Dietary Types");
  const [page, setPage] = useState(1);
  const [mealFormOpen, setMealFormOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [mealForm, setMealForm] = useState<MealFormState>(emptyMealForm());
  const [mealNameError, setMealNameError] = useState(false);
  const [caloriesError, setCaloriesError] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pageSize = 5;

  useEffect(() => {
    loadMeals();
  }, []);

  const loadMeals = async () => {
    setIsLoadingMeals(true);
    try {
      const data = await getVendorMeals();
      setMeals(data);
    } catch (err: any) {
      console.error("Failed to load meals:", err);
      // If 401 Unauthorized, redirect to login
      if (err.response?.status === 401 || err.response?.status === 403) {
        localStorage.removeItem("wellora_token");
        localStorage.removeItem("wellora_user");
        if (onNavigate) {
          onNavigate("login");
        } else {
          window.location.href = "/";
        }
      }
    } finally {
      setIsLoadingMeals(false);
    }
  };

  // Filtering + pagination
  const filtered = useMemo(
    () =>
      meals.filter((m) => {
        if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (category !== "All Categories" && m.category !== category) return false;
        if (dietary !== "All Dietary Types" && m.dietary !== dietary) return false;
        return true;
      }),
    [meals, search, category, dietary]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  // Meal form handlers
  const openAddMealForm = () => {
    setEditingMealId(null);
    setMealForm(emptyMealForm());
    setMealNameError(false);
    setCaloriesError(false);
    setPriceError(false);
    setMealFormOpen(true);
  };

  const openEditMealForm = (row: MealRow) => {
    setEditingMealId(row.id);
    setMealForm({
      mealName: row.name,
      category: FORM_CATEGORIES.includes(row.category as FormCategory) ? (row.category as FormCategory) : "Breakfast",
      calories: String(row.calories),
      dietary: FORM_DIETARY.includes(row.dietary as FormDietary) ? (row.dietary as FormDietary) : "Vegetarian",
      price: String(row.price),
      available: row.available,
      description: row.description ?? "",
      imageFile: null,
      imagePreviewUrl: row.image_url ?? "",
    });
    setMealNameError(false);
    setCaloriesError(false);
    setPriceError(false);
    setMealFormOpen(true);
  };

  const closeMealForm = () => {
    setMealFormOpen(false);
    setEditingMealId(null);
    setMealForm(emptyMealForm());
  };

  const saveMealForm = async () => {
    // Validate
    const nameTrim = mealForm.mealName.trim();
    const nameInvalid = nameTrim === "";
    const calNum = Number(mealForm.calories);
    const calInvalid = !mealForm.calories.trim() || !Number.isFinite(calNum) || calNum <= 0;
    const priceNum = Number(mealForm.price);
    const priceInvalid = !mealForm.price.trim() || !Number.isFinite(priceNum) || priceNum < 0;

    setMealNameError(nameInvalid);
    setCaloriesError(calInvalid);
    setPriceError(priceInvalid);

    if (nameInvalid || calInvalid || priceInvalid) return;

    setIsSaving(true);
    try {
      const payload = {
        name: nameTrim,
        category: mealForm.category,
        calories: Math.round(calNum),
        dietary: mealForm.dietary,
        price: Math.round(priceNum * 100) / 100,
        available: mealForm.available,
        description: mealForm.description || null,
        image: mealForm.imageFile,
      };

      if (editingMealId) {
        // Update existing meal in backend
        const updated = await updateMeal(editingMealId, payload);
        setMeals((prev) => prev.map((m) => (m.id === editingMealId ? updated : m)));
      } else {
        // Add new meal to backend
        const created = await addMeal(payload);
        setMeals((prev) => [...prev, created]);
      }

      closeMealForm();
    } catch (err) {
      console.error("Failed to save meal:", err);
      alert("Failed to save meal. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMeal = async (id: number) => {
    if (!window.confirm("Delete this meal?")) return;
    try {
      await deleteMealApi(id);
      setMeals((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Failed to delete meal:", err);
      alert("Failed to delete meal. Please try again.");
    }
  };

  const duplicateMeal = async (row: MealRow) => {
    try {
      const created = await addMeal({
        name: `${row.name} (copy)`,
        category: row.category,
        calories: row.calories,
        dietary: row.dietary,
        price: row.price,
        available: row.available,
      });
      setMeals((prev) => [...prev, created]);
    } catch (err) {
      console.error("Failed to duplicate meal:", err);
    }
  };

  return (
    <div>
      {/* Meal Management UI (copied from VendorDashboardPage) */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Meal Management</h1>
        <button
          type="button"
          onClick={openAddMealForm}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover"
        >
          + Add New Meal
        </button>
      </div>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Search meals..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={dietary}
            onChange={(e) => {
              setDietary(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {DIETARY.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isLoadingMeals ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-slate-500">Loading meals...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                  <th className="px-4 py-3 font-semibold">Meal Name</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold">Calories</th>
                  <th className="px-4 py-3 font-semibold">Dietary Type</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Availability</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {slice.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      No meals found. Click "Add New Meal" to get started!
                    </td>
                  </tr>
                ) : (
                  slice.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{row.name}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.category}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{row.calories}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.dietary}</td>
                      <td className="px-4 py-3 font-medium tabular-nums text-slate-900 dark:text-white">Rs {row.price.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${row.available ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                          {row.available ? "Available" : "Unavailable"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => duplicateMeal(row)}
                            className="rounded-lg p-1.5 text-wellora hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                            title="Duplicate"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditMealForm(row)}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMeal(row.id)}
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
          <button
            type="button"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" /> Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-medium ${n === pageSafe ? "bg-wellora text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Next <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      {/* Meal Form Modal */}
      {mealFormOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]" onClick={closeMealForm} />
          <div className="relative z-10 flex max-h-[min(100dvh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-2xl">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{editingMealId ? "Edit meal" : "Add new meal"}</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-5">
                {/* Meal Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Meal Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Grilled Chicken Salad"
                    value={mealForm.mealName}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, mealName: e.target.value }));
                      setMealNameError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${mealNameError ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"}`}
                  />
                  {mealNameError && <p className="mt-1.5 text-sm text-red-600">Meal name is required.</p>}
                </div>
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Description (Optional)</label>
                  <textarea
                    placeholder="Brief description of the meal..."
                    value={mealForm.description ?? ""}
                    onChange={(e) => setMealForm((f) => ({ ...f, description: e.target.value }))}
                    rows={2}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                {/* Meal Image */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Meal Image (Optional)</label>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setMealForm((f) => ({
                        ...f,
                        imageFile: file,
                        imagePreviewUrl: file ? URL.createObjectURL(file) : f.imagePreviewUrl,
                      }));
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  />
                  {mealForm.imagePreviewUrl && (
                    <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                      <img
                        src={mealForm.imageFile ? mealForm.imagePreviewUrl : resolveImageUrl(mealForm.imagePreviewUrl) || mealForm.imagePreviewUrl}
                        alt="Meal preview"
                        className="h-40 w-full object-cover"
                      />
                    </div>
                  )}
                </div>
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Category</label>
                  <select
                    value={mealForm.category}
                    onChange={(e) => setMealForm((f) => ({ ...f, category: e.target.value as FormCategory }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  >
                    {FORM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Calories */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Calories (kcal)</label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g., 450"
                    value={mealForm.calories}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, calories: e.target.value }));
                      setCaloriesError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${caloriesError ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"}`}
                  />
                  {caloriesError && <p className="mt-1.5 text-sm text-red-600">Enter a valid calorie amount.</p>}
                </div>
                {/* Dietary */}
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Dietary Type</legend>
                  <div className="mt-2 space-y-2">
                    {FORM_DIETARY.map((opt) => (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-wellora has-[:checked]:bg-emerald-50/80 dark:border-slate-600 dark:text-slate-200 dark:has-[:checked]:bg-emerald-950/30"
                      >
                        <input
                          type="radio"
                          name="dietary-type"
                          value={opt}
                          checked={mealForm.dietary === opt}
                          onChange={() => setMealForm((f) => ({ ...f, dietary: opt }))}
                          className="h-4 w-4 border-slate-300 text-wellora focus:ring-wellora"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {/* Price */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Price (Rs.)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="e.g., 12.99"
                    value={mealForm.price}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, price: e.target.value }));
                      setPriceError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${priceError ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"}`}
                  />
                  {priceError && <p className="mt-1.5 text-sm text-red-600">Enter a valid price.</p>}
                </div>
                {/* Available toggle */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Available for Order</p>
                      <p className="mt-1 text-xs text-slate-500">Toggle to make this meal visible to users.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={mealForm.available}
                      onClick={() => setMealForm((f) => ({ ...f, available: !f.available }))}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-wellora ${mealForm.available ? "bg-wellora" : "bg-slate-300 dark:bg-slate-600"}`}
                    >
                      <span className={`pointer-events-none inline-block h-6 w-6 translate-y-0.5 rounded-full bg-white shadow transition ${mealForm.available ? "translate-x-5" : "translate-x-1"}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeMealForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveMealForm}
                disabled={isSaving}
                className="rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save Meal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealManagement;
