import api from './client';

export const registerUser = async (data: {
    name: string;
    email: string;
    password: string;
    phone: string;
    user_type: string;
}) => {
    const response = await api.post('/api/auth/register', data);
    return response.data;
};

export const loginUser = async (data: {
    email: string;
    password: string;
}) => {
    const response = await api.post('/api/auth/login', data, { timeout: 10000 });
    return response.data;
};

export const getCurrentUser = async () => {
    const response = await api.get('/api/users/me');
    return response.data;
};
