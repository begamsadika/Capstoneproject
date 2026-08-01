import api from './client';

export interface NutritionToday {
  log_date: string;
  calories_consumed: number;
  calorie_target: number;
  protein_consumed_g: number;
  carbs_consumed_g: number;
  fat_consumed_g: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  meals_count: number;
  calorie_goal_met: boolean;
  wellness_score: number;
  streak_day: number;
  notes?: string | null;
}

export const getNutritionToday = async (): Promise<NutritionToday> => {
  const response = await api.get('/api/health/daily-log/today');
  return response.data;
};
