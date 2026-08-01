import api from './client';

export interface UserProfile {
  name: string;
  email: string;
  onboarding_done: boolean;
  gender?: string;
  height?: number;
  weight?: number;
  bmi?: number;
  bmi_category?: string;
  calorie_goal: number;
  health_goal?: string;
  dietary_preferences?: string;
  allergies?: string;
  medical_conditions?: string;
  medications?: string;
}

// Submit user onboarding
export const submitUserOnboarding = async (formData: FormData) => {
  const response = await api.post('/api/users/onboarding', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data;
};

// Get user profile
export const getUserProfile = async (): Promise<UserProfile> => {
  const response = await api.get('/api/users/profile');
  return response.data;
};

// Get current user
export const getMe = async () => {
  const response = await api.get('/api/users/me');
  return response.data;
};

export interface UpdateProfileData {
  name?: string;
  phone?: string;
  gender?: string;
  height?: number;
  weight?: number;
  health_goal?: string;
  dietary_preferences?: string;
  allergies?: string;
  medical_conditions?: string;
  medications?: string;
}

export const updateUserProfile = async (data: UpdateProfileData) => {
  const response = await api.put('/api/users/profile', data);
  return response.data;
};
