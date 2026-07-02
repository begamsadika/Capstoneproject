import api from './client';

export interface HealthMetrics {
  user_id: number;
  height_cm: number;
  weight_kg: number;
  bmi: number;
  bmi_category: string;
  bmr: number;
  maintenance_calories: number;
  target_calories: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  health_goal: string;
  activity_level: string;
  dietary_preference: string | null;
  allergies: string | null;
  ideal_weight_kg: number;
  weight_to_goal_kg: number;
  estimated_weeks_to_goal: number;
  calorie_deficit_surplus: number;
  calculated_at: string;
}

export const getHealthMetrics = async (): Promise<HealthMetrics> => {
  const response = await api.get('/api/health/metrics');
  return response.data;
};

export const syncDailyLog = async () => {
  const response = await api.post('/api/health/daily-log/sync');
  return response.data;
};
