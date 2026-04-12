import api from './client';

export const submitUserOnboarding = async (formData: FormData) => {
  const token = localStorage.getItem('wellora_token');
  const response = await api.post('/api/user/onboarding', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${token}`
    }
  });
  return response.data;
};

