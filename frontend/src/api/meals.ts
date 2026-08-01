import api from './client';

export interface VendorMeal {
  id: number;
  name: string;
  category: string;
  calories: number;
  dietary: string;
  price: number;
  available: boolean;
  description?: string;
  ingredients?: MealIngredient[];
  image_url?: string;  // returned by backend as full URL
}

export type Meal = VendorMeal;

export interface MealIngredient {
  ingredientId: string;
  name: string;
  weight: number;
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
}

export interface TopMeal {
  id: number;
  name: string;
  category: string;
  price: number;
  total_sold: number;
  revenue: number;
}

export interface WeeklyDay {
  label: string;
  date: string;
  revenue: number;
  orders: number;
}

export interface VendorStats {
  total_meals: number;
  total_orders: number;
  total_revenue: number;
  avg_rating: number;
  top_meals: TopMeal[];
  weekly_revenue: WeeklyDay[];
}

export interface RatingItem {
  id: number;
  meal_name: string;
  customer_name: string;
  rating: number;
  review: string;
  created_at: string;
}

export interface VendorRatings {
  ratings: RatingItem[];
  avg_rating: number;
  total: number;
}

export const getVendorMeals = async (): Promise<VendorMeal[]> => {
  const res = await api.get('/api/vendor/meals/');
  return res.data;
};

// ✅ Sends FormData with optional image file
export const addMeal = async (
  data: Omit<VendorMeal, 'id'>,
  imageFile?: File | null
): Promise<VendorMeal> => {
  const form = new FormData();
  form.append('name', data.name);
  form.append('category', data.category);
  form.append('calories', String(data.calories));
  form.append('dietary', data.dietary);
  form.append('price', String(data.price));
  form.append('available', String(data.available));
  form.append('description', data.description ?? '');
  if (data.ingredients !== undefined) {
    form.append('ingredients', JSON.stringify(data.ingredients));
  }
  if (imageFile) form.append('image', imageFile);

  const res = await api.post('/api/vendor/meals/', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

// ✅ Sends FormData with optional new image file
export const updateMeal = async (
  id: number,
  data: Partial<VendorMeal>,
  imageFile?: File | null
): Promise<VendorMeal> => {
  const form = new FormData();
  if (data.name !== undefined) form.append('name', data.name);
  if (data.category !== undefined) form.append('category', data.category);
  if (data.calories !== undefined) form.append('calories', String(data.calories));
  if (data.dietary !== undefined) form.append('dietary', data.dietary);
  if (data.price !== undefined) form.append('price', String(data.price));
  if (data.available !== undefined) form.append('available', String(data.available));
  if (data.description !== undefined) form.append('description', data.description);
  if (data.ingredients !== undefined) {
    form.append('ingredients', JSON.stringify(data.ingredients));
  }
  if (imageFile) form.append('image', imageFile);

  const res = await api.put(`/api/vendor/meals/${id}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const deleteMealApi = async (id: number): Promise<void> => {
  await api.delete(`/api/vendor/meals/${id}`);
};

export const getVendorStats = async (): Promise<VendorStats> => {
  const res = await api.get('/api/vendor/meals/stats');
  return res.data;
};

export const getVendorRatings = async (): Promise<VendorRatings> => {
  const res = await api.get('/api/orders/vendor/ratings');
  return res.data;
};
