import api from './client';

export interface Meal {
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

export interface MealPayload {
  name: string;
  category: string;
  calories: number;
  dietary: string;
  price: number;
  available: boolean;
  description?: string | null;
  image?: File | null;
}

const toMealFormData = (data: MealPayload) => {
  const formData = new FormData();
  formData.append('name', data.name);
  formData.append('category', data.category);
  formData.append('calories', String(data.calories));
  formData.append('dietary', data.dietary);
  formData.append('price', String(data.price));
  formData.append('available', String(data.available));
  formData.append('description', data.description ?? '');
  if (data.image) {
    formData.append('image', data.image);
  }
  return formData;
};

export const getVendorMeals = async (): Promise<Meal[]> => {
  const response = await api.get('/api/vendor/meals/');
  return response.data;
};

export const addMeal = async (data: MealPayload): Promise<Meal> => {
  const response = await api.post('/api/vendor/meals/', toMealFormData(data), {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.meal;
};

export const updateMeal = async (
  id: number,
  data: Partial<MealPayload>
): Promise<Meal> => {
  const formData = new FormData();

  if (data.name !== undefined) formData.append('name', data.name);
  if (data.category !== undefined) formData.append('category', data.category);
  if (data.calories !== undefined) formData.append('calories', String(data.calories));
  if (data.dietary !== undefined) formData.append('dietary', data.dietary);
  if (data.price !== undefined) formData.append('price', String(data.price));
  if (data.available !== undefined) formData.append('available', String(data.available));
  if (data.description !== undefined) formData.append('description', data.description ?? '');
  if (data.image) formData.append('image', data.image);

  const response = await api.put(`/api/vendor/meals/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.meal;
};

export const deleteMealApi = async (id: number): Promise<void> => {
  await api.delete(`/api/vendor/meals/${id}`);
};

export const getVendorStats = async () => {
  const response = await api.get('/api/vendor/meals/stats');
  return response.data;
};
