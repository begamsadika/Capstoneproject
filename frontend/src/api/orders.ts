import api from './client';

export interface PublicMeal {
  id: number;
  name: string;
  category: string;
  calories: number;
  dietary: string;
  price: number;
  vendor_id: number;
  description?: string;
  image_url?: string;
}

export interface OrderItem {
  meal_id: number;
  quantity: number;
}

export interface MealLogItem {
  name: string;
  calories: number;
  quantity: number;
  category: string;
  time: string;
}

export interface TodaySummary {
  total_calories: number;
  meal_log: MealLogItem[];
  order_count: number;
}

export interface MyOrder {
  id: number;
  meal_id: number;
  quantity: number;
  total_price: number;
  status: string;
  created_at: string;
}

export interface VendorOrder {
  id: number;
  customer_name: string;
  customer_email: string;
  meal_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  created_at: string;
}

// Get all available meals from vendors
export const getPublicMeals = async (): Promise<PublicMeal[]> => {
  const response = await api.get('/api/orders/meals');
  return response.data;
};

// Place an order
export const placeOrder = async (items: OrderItem[]) => {
  const response = await api.post('/api/orders/', { items });
  return response.data;
};

// Get user's all orders
export const getMyOrders = async (): Promise<MyOrder[]> => {
  const response = await api.get('/api/orders/my-orders');
  return response.data;
};

export const getVendorOrders = async (): Promise<VendorOrder[]> => {
  const response = await api.get('/api/orders/vendor-orders');
  return response.data;
};

// Get today's calorie summary + meal log
export const getTodaySummary = async (): Promise<TodaySummary> => {
  const response = await api.get('/api/orders/today-summary');
  return response.data;
};
