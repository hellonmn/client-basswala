import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

/**
 * Captain API Service
 * Connects to: http://your-server:5000/api
 * Update API_BASE_URL to your actual server address.
 */

// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Defaults to the hosted production backend; override via
// EXPO_PUBLIC_API_BASE_URL. Keep in sync with services/userApi.ts + api.ts.
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://server.basswala.com/api";

// ─── TOKEN STORAGE ────────────────────────────────────────────────────────────
const TOKEN_KEY = 'captain_jwt_token';
const USER_KEY  = 'captain_user_data';

export const tokenStorage = {
  async save(token: string)      { await SecureStore.setItemAsync(TOKEN_KEY, token); },
  async get(): Promise<string | null> { return SecureStore.getItemAsync(TOKEN_KEY); },
  async clear()                  { await SecureStore.deleteItemAsync(TOKEN_KEY); },

  async saveUser(user: any)      { await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)); },
  async getUser(): Promise<any>  {
    const s = await SecureStore.getItemAsync(USER_KEY);
    return s ? JSON.parse(s) : null;
  },
  async clearUser()              { await SecureStore.deleteItemAsync(USER_KEY); },

  async clearAll() {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },
};

// ─── AXIOS INSTANCE ───────────────────────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject JWT automatically
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.get();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authApi = {
  // Standard email/password login (for existing accounts)
  async login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    return res.data; // { success, token, user }
  },

  // Register captain account
  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }) {
    const res = await api.post('/auth/register', { ...data, role: 'captain' });
    return res.data;
  },

  // Firebase phone OTP login for captains
  async firebaseLogin(idToken: string) {
    const res = await api.post('/captain/auth/firebase-login', { idToken });
    return res.data; // { success, token, user, isNewCaptain }
  },

  // Complete captain profile after OTP login
  async completeProfile(data: {
    businessName?: string;
    phone?: string;
    description?: string;
    latitude?: number;
    longitude?: number;
    locationCity?: string;
    locationState?: string;
    locationCountry?: string;
    serviceRadiusKm?: number;
  }) {
    const res = await api.post('/captain/auth/complete-profile', data);
    return res.data;
  },

  async getMe() {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

// ─── CAPTAIN PROFILE ──────────────────────────────────────────────────────────
export const captainApi = {
  async getProfile() {
    const res = await api.get('/captain/profile');
    return res.data;
  },

  async updateProfile(data: {
    businessName?: string;
    phone?: string;
    description?: string;
    profilePicture?: string;
    latitude?: number;
    longitude?: number;
    locationCity?: string;
    locationState?: string;
    locationCountry?: string;
    serviceRadiusKm?: number;
  }) {
    const res = await api.put('/captain/profile', data);
    return res.data;
  },

  async getDashboard() {
    const res = await api.get('/captain/dashboard');
    return res.data;
  },
};

// ─── DJ MANAGEMENT ────────────────────────────────────────────────────────────
export const djApi = {
  async getAll(params?: { isAvailable?: boolean; search?: string }) {
    const res = await api.get('/captain/djs', { params });
    return res.data; // { success, count, data: [] }
  },

  async getById(id: number) {
    const res = await api.get(`/captain/djs/${id}`);
    return res.data;
  },

  async create(data: {
    name: string;
    hourlyRate: number;
    phone?: string;
    email?: string;
    bio?: string;
    genres?: string[];
    experienceYears?: number;
    minimumHours?: number;
    currency?: string;
    specializations?: string[];
    images?: string[];
    userId?: number;
  }) {
    const res = await api.post('/captain/djs', data);
    return res.data;
  },

  async update(id: number, data: Partial<{
    name: string;
    phone: string;
    email: string;
    bio: string;
    genres: string[];
    experienceYears: number;
    hourlyRate: number;
    minimumHours: number;
    isAvailable: boolean;
    specializations: string[];
    images: string[];
  }>) {
    const res = await api.put(`/captain/djs/${id}`, data);
    return res.data;
  },

  async toggleAvailability(id: number) {
    const res = await api.put(`/captain/djs/${id}/availability`);
    return res.data;
  },

  async remove(id: number) {
    const res = await api.delete(`/captain/djs/${id}`);
    return res.data;
  },
};

// ─── EQUIPMENT MANAGEMENT ─────────────────────────────────────────────────────
export const equipmentApi = {
  async getAll(params?: { category?: string; isAvailable?: boolean; search?: string }) {
    const res = await api.get('/captain/equipment', { params });
    return res.data;
  },

  async getById(id: number) {
    const res = await api.get(`/captain/equipment/${id}`);
    return res.data;
  },

  async create(data: {
    name: string;
    category: string;
    dailyRate: number;
    brand?: string;
    model?: string;
    description?: string;
    hourlyRate?: number;
    currency?: string;
    quantity?: number;
    images?: string[];
    specifications?: Record<string, any>;
    requiresDelivery?: boolean;
    deliveryChargePerKm?: number;
    condition?: 'Excellent' | 'Good' | 'Fair';
  }) {
    const res = await api.post('/captain/equipment', data);
    return res.data;
  },

  async update(id: number, data: any) {
    const res = await api.put(`/captain/equipment/${id}`, data);
    return res.data;
  },

  async toggleAvailability(id: number) {
    const res = await api.put(`/captain/equipment/${id}/availability`);
    return res.data;
  },

  async remove(id: number) {
    const res = await api.delete(`/captain/equipment/${id}`);
    return res.data;
  },

  CATEGORIES: [
    'Speaker', 'Mixer', 'Turntable', 'Microphone',
    'Lighting', 'Fog Machine', 'Laser', 'LED Panel',
    'Amplifier', 'Subwoofer', 'DJ Controller', 'Projector',
    'LED Screen', 'Karaoke System', 'CO2 Cannon', 'Other',
  ] as const,
};

// ─── BOOKING MANAGEMENT ───────────────────────────────────────────────────────
export const bookingApi = {
  async getAll(params?: {
    status?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
  }) {
    const res = await api.get('/captain/bookings', { params });
    return res.data;
  },

  async getById(id: number) {
    const res = await api.get(`/captain/bookings/${id}`);
    return res.data;
  },

  async getMapView(status?: string) {
    const res = await api.get('/captain/bookings/map', { params: { status } });
    return res.data;
  },

  async updateStatus(id: number, status: string, captainNotes?: string) {
    const res = await api.put(`/captain/bookings/${id}/status`, { status, captainNotes });
    return res.data;
  },

  async updatePayment(id: number, data: {
    paymentStatus: 'Pending' | 'Paid' | 'Partially Paid' | 'Refunded';
    paymentMethod?: string;
    transactionId?: string;
  }) {
    const res = await api.put(`/captain/bookings/${id}/payment`, data);
    return res.data;
  },

  STATUSES: ['Pending', 'Confirmed', 'Equipment Dispatched', 'In Progress', 'Completed', 'Cancelled'] as const,
};

export default api;