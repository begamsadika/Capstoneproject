import axios from 'axios';
import { expireUserSession } from '../auth/session';

export const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
    baseURL: 'http://localhost:8000',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Auto attach token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('wellora_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Expire protected sessions on 401. Invalid login credentials also return 401,
// so the login endpoint is intentionally excluded.
api.interceptors.response.use(
    (response) => response,
    (error) => {
        const requestUrl = String(error.config?.url ?? '');
        const isLoginRequest = requestUrl.includes('/api/auth/login');

        if (error.response?.status === 401 && !isLoginRequest) {
            expireUserSession();
        }

        return Promise.reject(error);
    }
);

export const resolveImageUrl = (imageUrl?: string | null) => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    return `${API_BASE_URL}${imageUrl}`;
};


export default api;
