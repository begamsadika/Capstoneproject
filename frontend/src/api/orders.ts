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

export interface MyOrder {
  id: number;
  meal_id: number;
  meal_name: string;
  meal_image: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  created_at: string;
}

export interface VendorOrder {
  id: number;
  meal_id: number;
  meal_name: string;
  meal_image: string;
  customer_name: string;
  customer_email: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  status: string;
  created_at: string;
}

export interface VendorOrderStats {
  total_orders: number;
  total_revenue: number;
  pending: number;
  confirmed: number;
  delivered: number;
}

export interface MealLogItem {
  name: string;
  calories: number;
  quantity: number;
  category: string;
  time: string;
  image_url: string;
}

export interface TodaySummary {
  total_calories: number;
  meal_log: MealLogItem[];
  order_count: number;
}

// ─── USER FUNCTIONS ───────────────────────────────
export const getPublicMeals = async (): Promise<PublicMeal[]> => {
  const res = await api.get('/api/orders/meals');
  return res.data;
};

export const placeOrder = async (items: OrderItem[]) => {
  const res = await api.post('/api/orders/', { items });
  return res.data;
};

export const getMyOrders = async (): Promise<MyOrder[]> => {
  const res = await api.get('/api/orders/my-orders');
  return res.data;
};

export const cancelOrder = async (orderId: number) => {
  const res = await api.put(`/api/orders/${orderId}/cancel`);
  return res.data;
};

export const getTodaySummary = async (): Promise<TodaySummary> => {
  const res = await api.get('/api/orders/today-summary');
  return res.data;
};

// ─── VENDOR FUNCTIONS ─────────────────────────────
export const getVendorOrders = async (status?: string): Promise<VendorOrder[]> => {
  const url = status
    ? `/api/orders/vendor/all?status=${status}`
    : '/api/orders/vendor/all';
  const res = await api.get(url);
  return res.data;
};

export const updateOrderStatus = async (orderId: number, status: string) => {
  const res = await api.put(`/api/orders/vendor/${orderId}/status`, { status });
  return res.data;
};

export const getVendorOrderStats = async (): Promise<VendorOrderStats> => {
  const res = await api.get('/api/orders/vendor/stats');
  return res.data;
};