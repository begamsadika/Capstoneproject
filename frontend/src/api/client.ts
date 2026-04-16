import axios from 'axios';

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

// // Auto logout if token expires
// api.interceptors.response.use(
//     (response) => response,
//     (error) => {
//         if (error.response?.status === 401) {
//             localStorage.removeItem('wellora_token');
//             localStorage.removeItem('wellora_user');
//             window.location.href = '/';
//         }
//         return Promise.reject(error);
//     }
// );

// Don't auto redirect — just reject the error
api.interceptors.response.use(
    (response) => response,
    (error) => Promise.reject(error)
);

export const resolveImageUrl = (imageUrl?: string | null) => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        return imageUrl;
    }
    return `${API_BASE_URL}${imageUrl}`;
};


export default api;