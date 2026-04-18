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
    dietary_preference: string;
    allergies: string;
    ideal_weight_kg: number;
    weight_to_goal_kg: number;
    estimated_weeks_to_goal: number;
    calorie_deficit_surplus: number;
    calculated_at: string;
}

export interface DailyLog {
    log_date: string;
    calories_consumed: number;
    calorie_target: number;
    protein_consumed_g: number;
    carbs_consumed_g: number;
    fat_consumed_g: number;
    meals_count: number;
    calorie_goal_met: boolean;
    wellness_score: number;
    streak_day: number;
    notes?: string;
}

export interface ProgressSummary extends HealthMetrics {
    avg_calories_7d: number;
    avg_wellness_score_7d: number;
    days_on_track_7d: number;
    current_streak: number;
}

// Get full health metrics
export const getHealthMetrics = async (): Promise<HealthMetrics> => {
    const res = await api.get('/api/health/metrics');
    return res.data;
};

// Get today's daily log
export const getTodayLog = async (): Promise<DailyLog> => {
    const res = await api.get('/api/health/daily-log/today');
    return res.data;
};

// Get 30-day log history
export const getLogHistory = async (): Promise<DailyLog[]> => {
    const res = await api.get('/api/health/daily-log/history');
    return res.data;
};

// Sync today's log from orders
export const syncDailyLog = async (): Promise<DailyLog> => {
    const res = await api.post('/api/health/daily-log/sync');
    return res.data;
};

// Get full progress summary for AI
export const getProgressSummary = async (): Promise<ProgressSummary> => {
    const res = await api.get('/api/health/progress');
    return res.data;
};