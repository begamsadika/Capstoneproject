import api from './client';

// ─── AUTH ─────────────────────────────────────────
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  user_type: string;
}

export async function adminLogin(email: string, password: string): Promise<AdminUser> {
  const res = await api.post('/api/auth/login', { email, password });
  const { access_token, user } = res.data;

  if (user.user_type !== 'admin') {
    throw new Error('Access denied. Admin accounts only.');
  }

  localStorage.setItem('wellora_admin_token', access_token);
  localStorage.setItem('wellora_admin_user', JSON.stringify(user));
  return user;
}

export function adminLogout() {
  localStorage.removeItem('wellora_admin_token');
  localStorage.removeItem('wellora_admin_user');
}

export function getStoredAdminUser(): AdminUser | null {
  const raw = localStorage.getItem('wellora_admin_user');
  return raw ? (JSON.parse(raw) as AdminUser) : null;
}

// ─── STATS ────────────────────────────────────────
export interface AdminStats {
  total_users: number;
  total_vendors: number;
  total_partners: number;
  orders_today: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await api.get('/api/admin/stats');
  return res.data;
}

// ─── USERS ────────────────────────────────────────
export interface ManagedUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  user_type: string;
  is_active: boolean;
  created_at: string;
}

export interface UsersResponse {
  total: number;
  page: number;
  page_size: number;
  users: ManagedUser[];
}

export async function getAdminUsers(
  page = 1,
  pageSize = 20,
  search?: string,
  statusFilter?: string,
): Promise<UsersResponse> {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (search) params.search = search;
  if (statusFilter && statusFilter !== 'All Statuses') {
    params.status_filter = statusFilter === 'Active' ? 'active' : 'disabled';
  }
  const res = await api.get('/api/admin/users', { params });
  return res.data;
}

export async function toggleUserStatus(userId: number): Promise<{ is_active: boolean; message: string }> {
  const res = await api.put(`/api/admin/users/${userId}/toggle`);
  return res.data;
}

// ─── VENDORS ──────────────────────────────────────
export interface ManagedVendor {
  id: number;
  user_id: number;
  business_name: string;
  business_type: string;
  service_area: string;
  email: string;
  owner_name: string;
  is_approved: number;       // -1 | 0 | 1
  status: 'Approved' | 'Pending' | 'Rejected';
  submitted_at: string;
  review_notes: string | null;
}

export interface VendorsResponse {
  total: number;
  page: number;
  page_size: number;
  vendors: ManagedVendor[];
}

export async function getAdminVendors(
  page = 1,
  pageSize = 20,
  search?: string,
  statusFilter?: string,
): Promise<VendorsResponse> {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (search) params.search = search;
  if (statusFilter && statusFilter !== 'All Statuses') params.status_filter = statusFilter;
  const res = await api.get('/api/admin/vendors', { params });
  return res.data;
}

export async function approveVendor(vendorId: number): Promise<void> {
  await api.put(`/api/admin/vendors/${vendorId}/approve`);
}

export async function suspendVendor(vendorId: number): Promise<void> {
  await api.put(`/api/admin/vendors/${vendorId}/suspend`);
}
