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

// Get all available meals from all vendors
export const getPublicMeals = async (): Promise<PublicMeal[]> => {
  const response = await api.get('/api/orders/meals');
  return response.data;
};

// Place an order
export const placeOrder = async (items: OrderItem[]) => {
  const response = await api.post('/api/orders/', { items });
  return response.data;
};

// Get user's orders
export const getMyOrders = async () => {
  const response = await api.get('/api/orders/my-orders');
  return response.data;
};