import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  addMeal,
  deleteMealApi,
  getVendorMeals,
  updateMeal,
  type MealIngredient,
} from "../api/meals";
import {
  searchIngredients,
  type IngredientSearchResult,
} from "../api/ingredients";
import type { AppPage } from "../types/page";
import { SkeletonBlock } from "../components/LoadingStates";
import { getApiDetail, getApiStatus } from "../utils/apiError";

interface MealManagementProps {
  onNavigate?: (page: AppPage) => void;
}

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
  description?: string;
  ingredients?: MealIngredient[];
  image_url?: string;
}

interface MealFormState {
  mealName: string;
  category: FormCategory;
  dietary: FormDietary;
  price: string;
  available: boolean;
  ingredients: MealIngredient[];
}

interface IngredientDraft {
  ingredientId: string;
  name: string;
  weight: string;
}

const CATEGORIES: CategoryFilter[] = [
  "All Categories",
  "Breakfast",
  "Lunch",
  "Dinner",
];
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
    dietary: "Vegetarian",
    price: "",
    available: true,
    ingredients: [],
  };
}

function emptyIngredientDraft(): IngredientDraft {
  return {
    ingredientId: "",
    name: "",
    weight: "",
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function scaleNutrition(
  option: IngredientSearchResult | null | undefined,
  grams: number,
) {
  const base = option?.nutritionPer100g ?? {
    calories: 0,
    protein: 0,
    carbs: 0,
    fats: 0,
  };

  return {
    calories: round2((base.calories * grams) / 100),
    protein: round2((base.protein * grams) / 100),
    carbs: round2((base.carbs * grams) / 100),
    fats: round2((base.fats * grams) / 100),
  };
}

function totalNutrition(ingredients: MealIngredient[]) {
  return ingredients.reduce(
    (total, item) => ({
      calories: round2(total.calories + item.nutrition.calories),
      protein: round2(total.protein + item.nutrition.protein),
      carbs: round2(total.carbs + item.nutrition.carbs),
      fats: round2(total.fats + item.nutrition.fats),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 },
  );
}

export const MealManagement: React.FC<MealManagementProps> = ({
  onNavigate,
}) => {
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [isLoadingMeals, setIsLoadingMeals] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All Categories");
  const [dietary, setDietary] = useState<DietaryFilter>("All Dietary Types");
  const [page, setPage] = useState(1);
  const [mealFormOpen, setMealFormOpen] = useState(false);
  const [ingredientDrawerOpen, setIngredientDrawerOpen] = useState(false);
  const [ingredientSearchOpen, setIngredientSearchOpen] = useState(false);
  const [ingredientOptions, setIngredientOptions] = useState<
    IngredientSearchResult[]
  >([]);
  const [selectedIngredient, setSelectedIngredient] =
    useState<IngredientSearchResult | null>(null);
  const [ingredientLoading, setIngredientLoading] = useState(false);
  const [ingredientSearchError, setIngredientSearchError] = useState("");
  const [activeIngredientIndex, setActiveIngredientIndex] = useState(-1);
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [mealForm, setMealForm] = useState<MealFormState>(emptyMealForm());
  const [ingredientDraft, setIngredientDraft] =
    useState<IngredientDraft>(emptyIngredientDraft());
  const [mealNameError, setMealNameError] = useState("");
  const [priceError, setPriceError] = useState("");
  const [ingredientError, setIngredientError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const ingredientSearchRef = useRef<HTMLDivElement | null>(null);
  const ingredientCacheRef = useRef<Record<string, IngredientSearchResult[]>>({});
  const pageSize = 5;

  useEffect(() => {
    loadMeals();
  }, []);

  const loadMeals = async () => {
    setIsLoadingMeals(true);
    try {
      const data = await getVendorMeals();
      setMeals(data);
    } catch (err: unknown) {
      console.error("Failed to load meals:", err);
      const status = getApiStatus(err);
      if (status === 401 || status === 403) {
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

  const filtered = useMemo(
    () =>
      meals.filter((m) => {
        if (search && !m.name.toLowerCase().includes(search.toLowerCase())) {
          return false;
        }
        if (category !== "All Categories" && m.category !== category) {
          return false;
        }
        if (dietary !== "All Dietary Types" && m.dietary !== dietary) {
          return false;
        }
        return true;
      }),
    [meals, search, category, dietary],
  );

  const totals = totalNutrition(mealForm.ingredients);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  const ingredientQuery = ingredientDraft.name.trim();
  const draftWeight = Number(ingredientDraft.weight);
  const draftNutrition = scaleNutrition(
    selectedIngredient,
    Number.isFinite(draftWeight) && draftWeight > 0 ? draftWeight : 0,
  );
  const canAddIngredient =
    Boolean(selectedIngredient) && Number.isFinite(draftWeight) && draftWeight > 0;
  const ingredientValidationMessage =
    ingredientError ||
    (ingredientQuery.length >= 2 &&
    !selectedIngredient &&
    !ingredientLoading &&
    !ingredientSearchError
      ? "Please select a valid ingredient from the list."
      : "");

  useEffect(() => {
    if (!ingredientSearchOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        ingredientSearchRef.current &&
        !ingredientSearchRef.current.contains(event.target as Node)
      ) {
        setIngredientSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [ingredientSearchOpen]);

  useEffect(() => {
    if (!ingredientDrawerOpen) return;

    const query = ingredientQuery.toLowerCase();
    setIngredientSearchError("");
    setActiveIngredientIndex(-1);

    if (query.length < 2) {
      setIngredientOptions([]);
      setIngredientLoading(false);
      return;
    }

    if (ingredientCacheRef.current[query]) {
      setIngredientOptions(ingredientCacheRef.current[query]);
      setIngredientLoading(false);
      return;
    }

    setIngredientLoading(true);
    const timeoutId = window.setTimeout(() => {
      searchIngredients(query)
        .then((results) => {
          ingredientCacheRef.current[query] = results;
          setIngredientOptions(results);
        })
        .catch(() => {
          setIngredientOptions([]);
          setIngredientSearchError("Unable to search ingredients right now.");
        })
        .finally(() => setIngredientLoading(false));
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [ingredientDrawerOpen, ingredientQuery]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const openAddMealForm = () => {
    setEditingMealId(null);
    setMealForm(emptyMealForm());
    setMealNameError("");
    setPriceError("");
    setIngredientError("");
    setIngredientDrawerOpen(false);
    setMealFormOpen(true);
  };

  const openEditMealForm = (row: MealRow) => {
    setEditingMealId(row.id);
    setMealForm({
      mealName: row.name,
      category: FORM_CATEGORIES.includes(row.category as FormCategory)
        ? (row.category as FormCategory)
        : "Breakfast",
      dietary: FORM_DIETARY.includes(row.dietary as FormDietary)
        ? (row.dietary as FormDietary)
        : "Vegetarian",
      price: String(row.price),
      available: row.available,
      ingredients: row.ingredients ?? [],
    });
    setMealNameError("");
    setPriceError("");
    setIngredientError("");
    setIngredientDrawerOpen(false);
    setMealFormOpen(true);
  };

  const closeMealForm = () => {
    setMealFormOpen(false);
    setIngredientDrawerOpen(false);
    setEditingMealId(null);
    setMealForm(emptyMealForm());
    setIngredientDraft(emptyIngredientDraft());
  };

  const openIngredientDrawer = () => {
    setIngredientDraft(emptyIngredientDraft());
    setSelectedIngredient(null);
    setIngredientOptions([]);
    setIngredientError("");
    setIngredientSearchError("");
    setActiveIngredientIndex(-1);
    setIngredientSearchOpen(false);
    setIngredientDrawerOpen(true);
  };

  const selectIngredient = (option: IngredientSearchResult) => {
    setIngredientDraft((draft) => ({
      ...draft,
      ingredientId: option.id,
      name: option.name,
    }));
    setSelectedIngredient(option);
    setIngredientError("");
    setIngredientSearchError("");
    setIngredientSearchOpen(false);
    setActiveIngredientIndex(-1);
  };

  const addIngredient = () => {
    const option =
      selectedIngredient &&
      selectedIngredient.name.toLowerCase() === ingredientDraft.name.trim().toLowerCase()
        ? selectedIngredient
        : null;
    const weight = Number(ingredientDraft.weight);

    if (!option) {
      setIngredientError("Select a valid ingredient from the dropdown list.");
      return;
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      setIngredientError("Enter a weight greater than 0 grams.");
      return;
    }

    setMealForm((form) => ({
      ...form,
      ingredients: [
        ...form.ingredients,
        {
          ingredientId: option.id,
          name: option.name,
          weight: round2(weight),
          nutrition: scaleNutrition(option, weight),
        },
      ],
    }));
    setIngredientDrawerOpen(false);
    setIngredientDraft(emptyIngredientDraft());
    setSelectedIngredient(null);
    setIngredientOptions([]);
    setActiveIngredientIndex(-1);
  };

  const removeIngredient = (index: number) => {
    setMealForm((form) => ({
      ...form,
      ingredients: form.ingredients.filter((_, i) => i !== index),
    }));
  };

  const saveMealForm = async () => {
    const nameTrim = mealForm.mealName.trim();
    const duplicateName = meals.some(
      (meal) =>
        meal.id !== editingMealId &&
        meal.name.trim().toLowerCase() === nameTrim.toLowerCase(),
    );
    const priceNum = Number(mealForm.price);
    const priceInvalid =
      !mealForm.price.trim() || !Number.isFinite(priceNum) || priceNum < 0;

    setMealNameError(
      nameTrim === ""
        ? "Meal name is required."
        : duplicateName
          ? "Meal name must be unique."
          : "",
    );
    setPriceError(priceInvalid ? "Enter a valid price." : "");

    if (nameTrim === "" || duplicateName || priceInvalid) return;

    setIsSaving(true);
    try {
      const payload = {
        name: nameTrim,
        category: mealForm.category,
        calories: Math.round(totals.calories),
        dietary: mealForm.dietary,
        price: round2(priceNum),
        available: mealForm.available,
        description: "",
        ingredients: mealForm.ingredients,
      };

      if (editingMealId) {
        const updated = await updateMeal(editingMealId, payload);
        setMeals((prev) =>
          prev.map((m) => (m.id === editingMealId ? updated : m)),
        );
      } else {
        const created = await addMeal(payload);
        setMeals((prev) => [...prev, created]);
      }

      closeMealForm();
    } catch (err: unknown) {
      console.error("Failed to save meal:", err);
      alert(getApiDetail(err, "Failed to save meal. Please try again."));
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
        description: row.description ?? "",
        ingredients: row.ingredients ?? [],
      });
      setMeals((prev) => [...prev, created]);
    } catch (err) {
      console.error("Failed to duplicate meal:", err);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Meal Management
        </h1>
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
          <div className="overflow-x-auto" aria-busy="true" aria-live="polite">
            <table className="w-full min-w-[720px] text-left text-sm">
              <tbody>
                {Array.from({ length: 5 }).map((_, row) => (
                  <tr key={row} className="border-b border-slate-100 dark:border-slate-800">
                    {Array.from({ length: 7 }).map((__, col) => (
                      <td key={col} className="px-4 py-4">
                        <SkeletonBlock className={col === 0 ? "h-4 w-36" : "h-4 w-20"} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-slate-500"
                    >
                      No meals found. Click "Add New Meal" to get started!
                    </td>
                  </tr>
                ) : (
                  slice.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                        {row.name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {row.category}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                        {row.calories}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {row.dietary}
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums text-slate-900 dark:text-white">
                        Rs {row.price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            row.available
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                          }`}
                        >
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
                className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-medium ${
                  n === pageSafe
                    ? "bg-wellora text-white"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
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

      {mealFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={closeMealForm}
            aria-label="Close meal form"
          />
          <div className="relative z-10 flex max-h-[min(100dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {editingMealId ? "Edit Meal" : "Add Meal"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Manage meal details, diet type, and ingredient nutrition.
                </p>
              </div>
              <button
                type="button"
                onClick={closeMealForm}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-5">
                <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Meal Basic Info
                  </h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Meal Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., Grilled Chicken Salad"
                        value={mealForm.mealName}
                        onChange={(e) => {
                          setMealForm((f) => ({
                            ...f,
                            mealName: e.target.value,
                          }));
                          setMealNameError("");
                        }}
                        className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${
                          mealNameError
                            ? "border-red-500 focus:ring-red-500/20"
                            : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"
                        }`}
                      />
                      {mealNameError && (
                        <p className="mt-1.5 text-sm text-red-600">
                          {mealNameError}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Category
                      </label>
                      <select
                        value={mealForm.category}
                        onChange={(e) =>
                          setMealForm((f) => ({
                            ...f,
                            category: e.target.value as FormCategory,
                          }))
                        }
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                      >
                        {FORM_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Price (Rs.)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="e.g., 1200"
                        value={mealForm.price}
                        onChange={(e) => {
                          setMealForm((f) => ({
                            ...f,
                            price: e.target.value,
                          }));
                          setPriceError("");
                        }}
                        className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${
                          priceError
                            ? "border-red-500 focus:ring-red-500/20"
                            : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"
                        }`}
                      />
                      {priceError && (
                        <p className="mt-1.5 text-sm text-red-600">
                          {priceError}
                        </p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            Available for Order
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Make this meal visible to customers.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={mealForm.available}
                          onClick={() =>
                            setMealForm((f) => ({
                              ...f,
                              available: !f.available,
                            }))
                          }
                          className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-wellora ${
                            mealForm.available
                              ? "bg-wellora"
                              : "bg-slate-300 dark:bg-slate-600"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-6 w-6 translate-y-0.5 rounded-full bg-white shadow transition ${
                              mealForm.available
                                ? "translate-x-5"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Dietary Type
                  </h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-5">
                    {FORM_DIETARY.map((opt) => (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition has-[:checked]:border-wellora has-[:checked]:bg-emerald-50 has-[:checked]:text-wellora dark:border-slate-700 dark:text-slate-200 dark:has-[:checked]:bg-emerald-950/30"
                      >
                        <input
                          type="radio"
                          name="dietary-type"
                          checked={mealForm.dietary === opt}
                          onChange={() =>
                            setMealForm((f) => ({ ...f, dietary: opt }))
                          }
                          className="h-4 w-4 border-slate-300 text-wellora focus:ring-wellora"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Ingredients
                      </h3>
                      <p className="mt-1 text-sm text-slate-500">
                        Nutrition is calculated from ingredient weight.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={openIngredientDrawer}
                      className="inline-flex items-center justify-center rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover"
                    >
                      + Add Ingredient
                    </button>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    {mealForm.ingredients.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-slate-500">
                        No ingredients added yet.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-200 dark:divide-slate-700">
                        {mealForm.ingredients.map((ingredient, index) => (
                          <div
                            key={`${ingredient.ingredientId}-${index}`}
                            className="grid gap-3 px-4 py-3 text-sm sm:grid-cols-[1fr_auto_auto]"
                          >
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {ingredient.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {ingredient.weight}g
                              </p>
                            </div>
                            <div className="text-slate-600 dark:text-slate-300">
                              {ingredient.nutrition.calories} kcal · P{" "}
                              {ingredient.nutrition.protein}g · C{" "}
                              {ingredient.nutrition.carbs}g · F{" "}
                              {ingredient.nutrition.fats}g
                            </div>
                            <button
                              type="button"
                              onClick={() => removeIngredient(index)}
                              className="justify-self-start rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 sm:justify-self-end"
                              aria-label={`Remove ${ingredient.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60 sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-500">Calories</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {totals.calories} kcal
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Protein</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {totals.protein}g
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Carbs</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {totals.carbs}g
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Fats</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {totals.fats}g
                      </p>
                    </div>
                  </div>
                </section>
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
                className="rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Meal"}
              </button>
            </div>
          </div>

          <div
            className={`fixed inset-y-0 right-0 z-20 flex w-full max-w-md transform flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 dark:border-slate-700 dark:bg-slate-900 ${
              ingredientDrawerOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Add Ingredient
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Select an ingredient and enter its weight.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIngredientDrawerOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Close ingredient drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="space-y-4">
                <div className="relative" ref={ingredientSearchRef}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Ingredient Name
                  </label>
                  <input
                    placeholder="Search ingredient..."
                    value={ingredientDraft.name}
                    onFocus={() => setIngredientSearchOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setIngredientSearchOpen(false);
                        return;
                      }
                      if (!ingredientSearchOpen || ingredientOptions.length === 0) {
                        return;
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveIngredientIndex((index) =>
                          index >= ingredientOptions.length - 1 ? 0 : index + 1,
                        );
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveIngredientIndex((index) =>
                          index <= 0 ? ingredientOptions.length - 1 : index - 1,
                        );
                      }
                      if (event.key === "Enter") {
                        event.preventDefault();
                        const option =
                          ingredientOptions[
                            activeIngredientIndex >= 0 ? activeIngredientIndex : 0
                          ];
                        if (option) {
                          selectIngredient(option);
                        }
                      }
                    }}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setIngredientDraft((draft) => ({
                        ...draft,
                        name: nextName,
                        ingredientId: "",
                      }));
                      setSelectedIngredient(null);
                      setIngredientError("");
                      setIngredientSearchError("");
                      setIngredientSearchOpen(true);
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  />
                  {ingredientSearchOpen && ingredientQuery.length >= 2 && (
                    <div className="absolute left-0 right-0 z-30 mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {ingredientLoading ? (
                        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-wellora" />
                          Searching ingredients...
                        </div>
                      ) : ingredientSearchError ? (
                        <div className="px-3 py-3 text-sm text-red-600 dark:text-red-300">
                          {ingredientSearchError}
                        </div>
                      ) : ingredientOptions.length > 0 ? (
                        ingredientOptions.map((item, index) => (
                          <button
                            key={item.id}
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              selectIngredient(item);
                            }}
                            onMouseEnter={() => setActiveIngredientIndex(index)}
                            className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                              activeIngredientIndex === index
                                ? "bg-slate-100 dark:bg-slate-800"
                                : "hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                          >
                            <span className="font-medium text-slate-800 dark:text-slate-100">
                              {item.name}
                            </span>
                            <span className="shrink-0 text-xs text-slate-500">
                              {item.nutritionPer100g.calories} kcal / 100g
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-3 text-sm text-slate-500">
                          No ingredients found.
                        </div>
                      )}
                    </div>
                  )}
                  <p className="mt-1.5 text-xs text-slate-500">
                    Type at least 2 characters and select a listed ingredient.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Weight (grams)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g., 150"
                    value={ingredientDraft.weight}
                    onChange={(e) => {
                      setIngredientDraft((draft) => ({
                        ...draft,
                        weight: e.target.value,
                      }));
                      setIngredientError("");
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                {ingredientValidationMessage && (
                  <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                    {ingredientValidationMessage}
                  </p>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Live Nutrition Preview
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        {selectedIngredient
                          ? `Using ${selectedIngredient.name} nutrition per 100g.`
                          : "Select a valid ingredient to preview nutrition."}
                      </p>
                    </div>
                    {selectedIngredient && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Valid
                      </span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500">Calories</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {draftNutrition.calories} kcal
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500">Protein</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {draftNutrition.protein}g
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500">Carbs</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {draftNutrition.carbs}g
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-3 dark:bg-slate-900">
                      <p className="text-xs text-slate-500">Fats</p>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {draftNutrition.fats}g
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIngredientDrawerOpen(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addIngredient}
                disabled={!canAddIngredient}
                className="rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add Ingredient
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealManagement;
