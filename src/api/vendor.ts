import api from './client';

export type VendorStatus = 'NEW' | 'PENDING' | 'APPROVED' | 'REJECTED';

export const getVendorStatus = async (): Promise<VendorStatus> => {
  const token = localStorage.getItem('wellora_token');
  if (!token) return 'NEW';

  const response = await api.get('/api/vendor/status', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.status as VendorStatus;
};

export const submitVendorOnboarding = async (formData: FormData) => {
  const token = localStorage.getItem('wellora_token');
  const response = await api.post('/api/vendor/onboarding', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${token}`
    }
  });
  return response.data;
};

export const getVendorProfile = async () => {
  const response = await api.get('/api/vendor/profile');
  return response.data;
};