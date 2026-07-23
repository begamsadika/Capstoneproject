import api from './client';

export interface PublicMeal {
  id: number;
  name: string;
  category: string;
  calories: number;
  dietary: string;
  price: number;
  vendor_id: number;
  vendor_name?: string;
  available?: boolean;
  description?: string;
  ingredients?: string;
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
  order_status?: string;
  payment_status?: string;
  checkout_reference?: string;
  vendor_id?: number;
  vendor_name?: string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_notes?: string;
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
  order_status?: string;
  payment_status?: string;
  checkout_reference?: string;
  recipient_name?: string;
  recipient_phone?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_notes?: string;
  created_at: string;
}

export interface VendorOrderStats {
  total_orders: number;
  total_revenue: number;
  pending: number;
  accepted: number;   // in-progress orders (accepted + preparing + ready)
  confirmed: number;  // alias for accepted (backward compat)
  delivered: number;
}

export interface ManualVendorOrderPayload {
  customer_email: string;
  meal_id: number;
  quantity: number;
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

export interface CheckoutDeliveryDetails {
  recipient_name: string;
  phone: string;
  address: string;
  city: string;
  postal_code?: string;
  notes?: string;
}

export interface CheckoutSessionResponse {
  checkout_url: string;
  session_id: string;
  checkout_reference: string;
  total: number;
  vendor_name: string;
}

export interface CheckoutOrderSummary {
  order_number: string;
  vendor_id: number;
  vendor_name: string;
  amount_paid: number;
  payment_status: string;
  order_status: string;
  status: string;
  items: MyOrder[];
  created_at: string;
}

// ─── USER FUNCTIONS ───────────────────────────────
export const getPublicMeals = async (): Promise<PublicMeal[]> => {
  const res = await api.get('/api/orders/meals');
  return res.data;
};

export const placeOrder = async (
  items: OrderItem[],
  delivery?: CheckoutDeliveryDetails,
) => {
  const res = await api.post('/api/orders/', { items, delivery });
  return res.data;
};

export const createCheckoutSession = async (
  items: OrderItem[],
  delivery: CheckoutDeliveryDetails,
): Promise<CheckoutSessionResponse> => {
  const res = await api.post('/api/orders/checkout/create-session', {
    items,
    delivery,
  });
  return res.data;
};

export const getCheckoutOrder = async (
  sessionId: string,
): Promise<CheckoutOrderSummary> => {
  const res = await api.get(`/api/orders/checkout/session/${sessionId}`);
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

export const createVendorManualOrder = async (payload: ManualVendorOrderPayload) => {
  const res = await api.post('/api/orders/vendor/manual', payload);
  return res.data;
};

export const submitRating = async (orderId: number, rating: number, review?: string) => {
  const res = await api.post('/api/orders/rate', {
    order_id: orderId,
    rating,
    review: review ?? '',
  });
  return res.data;
};
