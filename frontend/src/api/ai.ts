import api from './client';

export interface AIRecommendation {
    meal_id: number;
    meal_name: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
    calories: number;
    dietary: string;
    image_url: string;
    price: number;
    category: string;
}

export interface AIRecommendationResult {
    recommendations: AIRecommendation[];
    ai_summary: string;
    daily_tip: string;
    calories_remaining: number;
}

// Get AI-powered recommendations (auto based on health profile)
export const getAIRecommendations = async (): Promise<AIRecommendationResult> => {
    const res = await api.get('/api/ai/recommendations');
    return res.data;
};

// Ask AI a custom question
export const askAI = async (message: string): Promise<AIRecommendationResult> => {
    const res = await api.post('/api/ai/ask', { message });
    return res.data;
};