import api from './client';

export interface Meal {
  id:        number;
  name:      string;
  category:  string;
  calories:  number;
  dietary:   string;
  price:     number;
  available: boolean;
}

export interface MealCreate {
  name:      string;
  category:  string;
  calories:  number;
  dietary:   string;
  price:     number;
  available: boolean;
}

// Get all meals for this vendor
export const getVendorMeals = async (): Promise<Meal[]> => {
  const response = await api.get('/api/vendor/meals/');
  return response.data;
};

// Add new meal
export const addMeal = async (data: MealCreate): Promise<Meal> => {
  const response = await api.post('/api/vendor/meals/', data);
  return response.data.meal;
};

// Update meal
export const updateMeal = async (id: number, data: Partial<MealCreate>): Promise<Meal> => {
  const response = await api.put(`/api/vendor/meals/${id}`, data);
  return response.data.meal;
};

// Delete meal
export const deleteMealApi = async (id: number): Promise<void> => {
  await api.delete(`/api/vendor/meals/${id}`);
};

// Get stats
export const getVendorStats = async () => {
  const response = await api.get('/api/vendor/meals/stats');
  return response.data;
};