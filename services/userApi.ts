/**
 * userApi.ts — Basswala User App API Service
 *
 * FIXES:
 *  1. Added `export default api` so BookingBottomSheet can import the base
 *     axios instance for direct calls (e.g. POST /payments/create-order)
 *     without going through a wrapper function.
 *  2. Added paymentApi for typed payment-related calls.
 */

import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';

// Always default to the hosted backend. To run against a local / ngrok server,
// set EXPO_PUBLIC_API_BASE_URL in your shell or eas.json before starting Metro:
//   EXPO_PUBLIC_API_BASE_URL=https://abc.ngrok-free.app/api npx expo start
const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://server.basswala.com/api";

// Loud one-line log so it's obvious which backend the app is hitting. If this
// prints the hosted URL but you set EXPO_PUBLIC_API_BASE_URL, your env var
// didn't reach Metro — you need to restart Metro with `--clear` AND set the
// var in the SAME shell session you launched Metro from.
console.log(`[api] base URL = ${API_BASE_URL}`);

// ── Token Storage (SecureStore on native, localStorage on web) ───────────────

const TOKEN_KEY = 'user_jwt_token';
const USER_KEY  = 'user_data';

const isWeb = Platform.OS === 'web';

// Web-safe wrappers — SecureStore is unavailable on web
const store = {
  async set(key: string, value: string) {
    if (isWeb) { try { localStorage.setItem(key, value); } catch {} return; }
    const SecureStore = require('expo-secure-store');
    await SecureStore.setItemAsync(key, value);
  },
  async get(key: string): Promise<string | null> {
    if (isWeb) { try { return localStorage.getItem(key); } catch { return null; } }
    const SecureStore = require('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  async del(key: string) {
    if (isWeb) { try { localStorage.removeItem(key); } catch {} return; }
    const SecureStore = require('expo-secure-store');
    await SecureStore.deleteItemAsync(key);
  },
};

export const tokenStorage = {
  async save(token: string)           { await store.set(TOKEN_KEY, token); },
  async get(): Promise<string | null> { return store.get(TOKEN_KEY); },
  async clear()                       { await store.del(TOKEN_KEY); },
  async saveUser(user: any)           { await store.set(USER_KEY, JSON.stringify(user)); },
  async getUser(): Promise<any> {
    const s = await store.get(USER_KEY);
    return s ? JSON.parse(s) : null;
  },
  async clearAll() {
    await store.del(TOKEN_KEY);
    await store.del(USER_KEY);
  },
};

// ── Axios Instance ────────────────────────────────────────────────────────────

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.get();
  if (config.headers) {
    if (token) config.headers.Authorization = `Bearer ${token}`;
    (config.headers as any)['ngrok-skip-browser-warning'] = 'true';
  }

  // If the body is FormData, drop Content-Type so the browser / RN polyfill
  // can set "multipart/form-data; boundary=..." correctly. Leaving a manual
  // Content-Type header here (with no boundary) makes the server-side multer
  // fail to parse the body on web.
  const isFormData =
    (typeof FormData !== "undefined" && config.data instanceof FormData) ||
    (config.data && typeof config.data === "object" && typeof (config.data as any).getParts === "function");
  if (isFormData && config.headers) {
    delete (config.headers as any)['Content-Type'];
    delete (config.headers as any)['content-type'];

    // Multipart uploads (avatar, etc.) stream a file through to Cloudinary
    // server-side. The 15s default times out mid-upload on mobile data and
    // surfaces as a misleading "Network Error" — give file uploads longer.
    config.timeout = 60000;
  }

  return config;
});

// ── Session expiry handling ──────────────────────────────────────────────────
// When any authenticated call returns 401/403 we clear the stored token so
// the app redirects to login rather than silently looping on failed requests.
// Consumers can listen for this via the onSessionExpired hook below.
type SessionExpiredHandler = () => void;
let sessionExpiredHandler: SessionExpiredHandler | null = null;

export function onSessionExpired(handler: SessionExpiredHandler | null) {
  sessionExpiredHandler = handler;
}

api.interceptors.response.use(
  (response) => {
    // Any successful response means we're online — tell the offline banner.
    try {
      // Late import so userApi.ts doesn't pull in OfflineBanner at module load time
      const { notifyNetworkEvent } = require('../components/OfflineBanner');
      notifyNetworkEvent('success');
    } catch (_) {}
    return response;
  },
  async (error: AxiosError) => {
    // Retry idempotent GETs on a transient network error (no HTTP response =
    // timeout / dropped socket on the reverse proxy) before treating it as
    // offline. Never retry POST/PUT/DELETE — they may not be idempotent
    // (bookings, payments, status changes).
    const rcfg = error.config as (InternalAxiosRequestConfig & { _retryCount?: number }) | undefined;
    if (rcfg && !error.response && String(rcfg.method || 'get').toLowerCase() === 'get') {
      rcfg._retryCount = rcfg._retryCount ?? 0;
      if (rcfg._retryCount < 2) {
        rcfg._retryCount += 1;
        await new Promise((r) => setTimeout(r, 500 * (rcfg._retryCount as number)));
        return api(rcfg);
      }
    }

    const status = error.response?.status;
    const url = error.config?.url ?? '';

    // "Network error" = no response at all (device offline, DNS fail, etc.)
    if (!error.response) {
      try {
        const { notifyNetworkEvent } = require('../components/OfflineBanner');
        notifyNetworkEvent('network-error');
      } catch (_) {}
    } else {
      // We got a response from the server → we're online even if it's a 4xx/5xx
      try {
        const { notifyNetworkEvent } = require('../components/OfflineBanner');
        notifyNetworkEvent('success');
      } catch (_) {}
    }

    // Don't clear credentials on the login/register endpoints themselves —
    // those 401s are expected ("wrong password") and should surface to the UI.
    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/firebase-login');

    // Only clear the token on a genuine 401 (token expired / invalid).
    // A 403 can come from the Hostinger CDN/WAF for a path-level block
    // and does NOT mean the token is bad — silently logging the user out
    // in that case is wrong. The caller will receive the error and can
    // show a friendly message without destroying the session.
    if (status === 401 && !isAuthEndpoint) {
      try {
        await tokenStorage.clearAll();
      } catch (_) {
        /* ignore */
      }
      if (sessionExpiredHandler) {
        try { sessionExpiredHandler(); } catch (_) {}
      }
    }

    return Promise.reject(error);
  },
);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  async login(email: string, password: string) {
    const res = await api.post('/auth/login', { email, password });
    return res.data; // { success, token, user }
  },

  /** Link a Google account to the currently-logged-in user (phone-OTP signups). */
  async linkGoogle(idToken: string) {
    const res = await api.post('/auth/link-google', { idToken });
    return res.data; // { success, data: updatedUser }
  },

  async register(data: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
  }) {
    const res = await api.post('/auth/register', { ...data, role: 'user' });
    return res.data;
  },

  async getMe() {
    const res = await api.get('/auth/me');
    return res.data;
  },

  async firebaseLogin(
    idToken: string,
    role?: 'user' | 'captain',
    /** Apple Sign-In provides name/email only on the first authentication.
     *  Pass them here so the backend can store them before Apple stops sending them. */
    appleIdentity?: { firstName?: string; lastName?: string; email?: string },
  ) {
    const res = await api.post('/auth/firebase-login', {
      idToken,
      role,
      ...appleIdentity,  // firstName, lastName, email (all optional)
    });
    return res.data; // { success, token, user, isNewCaptain?, needsProfileCompletion? }
  },

  /** Complete profile — collect phone, name and email if missing/placeholder */
  async completeProfile(data: { firstName?: string; lastName?: string; phone: string; email?: string }) {
    const res = await api.put('/auth/profile', data);
    return res.data; // { success, data: user }
  },

  /** Permanently delete the logged-in user's own account. */
  async deleteAccount() {
    const res = await api.delete('/auth/me');
    return res.data; // { success, message }
  },
};

// ── Phone + OTP (Firebase Phone Auth) ────────────────────────────────────────
// We migrated off 2factor.in to Firebase because Google handles Indian DLT
// compliance for us — real SMS (not voice fallback) without paperwork. The
// flow is fully client-side until the very last step where we exchange the
// Firebase ID token for our own JWT via `/auth/firebase-login`.

export const otpApi = {
  /**
   * Send the OTP. The SMS goes out via Firebase. Returns a `sessionId`
   * that must be passed back to `login()` along with the code the user
   * typed in.
   */
  async send(phone: string) {
    try {
      const { phoneSignIn } = require('./firebase');
      const { sessionToken } = await phoneSignIn.start(phone);
      return { success: true, sessionId: sessionToken };
    } catch (err: any) {
      // Translate the cryptic Firebase error codes into something a captain
      // / user can act on. The original code is preserved at the end so you
      // can still grep logs for it.
      const code = err?.code || '';
      let msg = err?.message || 'Could not send OTP. Try again.';

      if (code === 'auth/invalid-app-credential') {
        msg = "We couldn't verify this device. Make sure your domain is added to Firebase → Auth → Authorized domains, and that the app's SHA-1/SHA-256 are registered. (auth/invalid-app-credential)";
      } else if (code === 'auth/billing-not-enabled') {
        msg = 'Phone Auth needs the Firebase project on the Blaze plan. Upgrade billing in the Firebase Console.';
      } else if (code === 'auth/too-many-requests') {
        msg = 'Too many attempts from this device. Wait a few minutes and try again.';
      } else if (code === 'auth/quota-exceeded') {
        msg = 'Daily SMS quota exceeded. Try again tomorrow or contact support.';
      } else if (code === 'auth/invalid-phone-number') {
        msg = 'That phone number looks invalid. Use a 10-digit Indian mobile.';
      } else if (code === 'auth/captcha-check-failed') {
        msg = 'Verification check failed. Refresh the page and try again.';
      }

      return { success: false, message: msg, code };
    }
  },

  // ── Legacy 2factor server route — kept for emergency fallback ──────────────
  /** @deprecated Use `send()` — routes via Firebase now. */
  async sendVia2factor(phone: string) {
    const res = await api.post('/auth/otp/send', { phone });
    return res.data;
  },

  /**
   * Verify the OTP via Firebase, then exchange the Firebase ID token for our
   * own JWT. Returns { success, token, user, isNewUser? }.
   *
   * Note: the third arg used to be a backend sessionId; with Firebase it's
   * the in-memory session token returned from `send()`.
   */
  async login(_phone: string, otp: string, sessionId: string) {
    try {
      const { phoneSignIn } = require('./firebase');
      const firebaseIdToken = await phoneSignIn.confirm(sessionId, otp);
      // Hand the verified Firebase token to our backend in exchange for a JWT.
      const res = await api.post('/auth/firebase-login', {
        idToken: firebaseIdToken,
        role: 'user',
      });
      return res.data; // { success, token, user, needsProfileCompletion?, isNewCaptain? }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Invalid OTP. Try again.';
      return { success: false, message: msg };
    }
  },

  /**
   * After Google sign-in we still need a verified phone before booking.
   * The user types their number → Firebase sends an SMS → they type the
   * code → we verify with Firebase, then attach the verified phone to the
   * already-signed-in user via PUT /auth/profile.
   *
   * `phone` (10-digit) is what we save server-side; `sessionId` was returned
   * from `send()` and `otp` is what the user typed.
   */
  async verifyPhone(phone: string, otp: string, sessionId: string) {
    try {
      const { phoneSignIn } = require('./firebase');
      // Confirming the OTP with Firebase proves the user owns this number.
      // We don't actually use the Firebase identity here — the user is
      // already authenticated as themselves via the existing JWT.
      await phoneSignIn.confirm(sessionId, otp);

      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      const res = await api.put('/auth/profile', { phone: cleanPhone });
      return res.data; // { success, data: user }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Could not verify the OTP. Try again.';
      return { success: false, message: msg };
    }
  },
};

// ── Services — Public Browse ──────────────────────────────────────────────────

export const servicesApi = {
  /** Active home banners managed by admin from the panel. */
  /**
   * Fetch active promotional banners.
   * @param placement  'home' or 'explore' — returns banners targeted at that
   *                   screen plus any with placement='both'. Omit for all.
   */
  async getBanners(placement?: 'home' | 'explore') {
    const res = await api.get('/services/banners', {
      params: placement ? { placement } : undefined,
    });
    return res.data; // { success, data: [{ id, imageUrl, title, subtitle, ctaLabel, ctaLink, placement }] }
  },

  async getCaptains(params?: { city?: string }) {
    const res = await api.get('/services/captains', { params });
    return res.data;
  },

  async getNearbyCaptains(params: {
    latitude: number;
    longitude: number;
    maxDistance?: number;
  }) {
    const res = await api.get('/services/captains/nearby', { params });
    return res.data;
  },

async getAllDJs(params?: { 
  startDate?: string; 
  endDate?: string; 
  city?: string 
}) {
  const res = await api.get('/services/djs', { params });
  return res.data;
},

  async getCaptainById(captainId: number) {
    const res = await api.get(`/services/captains/${captainId}`);
    return res.data;
  },

  async getCaptainDJs(captainId: number, params?: {
    genre?: string;
    minRate?: number;
    maxRate?: number;
  }) {
    const res = await api.get(`/services/captains/${captainId}/djs`, { params });
    return res.data;
  },

  async getAllEquipment(params?: {
    category?: string;
    city?: string;
    minRate?: number;
    maxRate?: number;
    search?: string;
  }) {
    const res = await api.get('/services/equipment', { params });
    return res.data;
  },

  async getCaptainEquipment(captainId: number, params?: { category?: string }) {
    const res = await api.get(`/services/captains/${captainId}/equipment`, { params });
    return res.data;
  },
};

// ── Payments ──────────────────────────────────────────────────────────────────

export const paymentApi = {
  /**
   * Create a Razorpay order on the backend.
   * Send amount in RUPEES — backend multiplies by 100 for paise.
   *
   * Returns: { success, orderId, amount, currency, keyId }
   */
  async createOrder(data: {
    amount: number;     // RUPEES (e.g. 499)
    currency?: string;  // default "INR"
    notes?: Record<string, string>;
  }) {
    const res = await api.post('/payments/create-order', {
      currency: 'INR',
      ...data,
    });
    return res.data;
  },

  /**
   * Verify Razorpay payment signature on backend.
   * Call this after successful SDK payment if using the standard checkout.
   */
  async verifyPayment(data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) {
    const res = await api.post('/payments/verify-payment', data);
    return res.data; // { success, verified, paymentId, status }
  },

  /** Get status of a specific order */
  async getStatus(orderId: string) {
    const res = await api.get(`/payments/status/${orderId}`);
    return res.data;
  },

  /** Get full payment history for the logged-in user */
  async getHistory(params?: { page?: number; limit?: number; status?: string }) {
    const res = await api.get('/payments/history', { params });
    return res.data;
  },
};

// ── Bookings — Authenticated User ─────────────────────────────────────────────

export const bookingApi = {
  /**
   * Create a booking for a captain's DJ and/or equipment.
   * This is what the user submits → captain sees it in their dashboard.
   */
  async create(data: {
    captainId: number;
    captainDJId?: number;
    equipmentItems?: { equipmentId: number; quantity: number; days: number }[];
    eventType: string;
    eventDate: string;        // ISO string e.g. "2026-04-10"
    startTime: string;        // "18:00"
    endTime: string;          // "23:00"
    durationHours: number;
    guestCount?: number;
    specialRequests?: string;
    deliveryLocation: {
      latitude: number;
      longitude: number;
      street?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    };
  }) {
    const res = await api.post('/services/bookings', data);
    return res.data;
  },

  /** Get all bookings for the logged-in user */
  async getMyBookings(params?: { status?: string; page?: number; limit?: number }) {
    const res = await api.get('/services/bookings/my', { params });
    return res.data;
  },

  /** Get single booking detail */
  async getById(id: number) {
    const res = await api.get(`/services/bookings/${id}`);
    return res.data;
  },

  /** Flat advance booking fee (e.g. ₹499) the user pays up-front */
  async getBookingFee() {
    const res = await api.get('/services/booking-fee');
    return res.data;
  },

  /** Create a Razorpay Payment Link for the booking advance.
   *  Returns { linkId, shortUrl, amount, currency } or { alreadyPaid: true }. */
  async createPaymentLink(bookingId: number) {
    const res = await api.post(`/services/bookings/${bookingId}/payment/create-link`);
    return res.data;
  },

  /** Ask the backend to poll Razorpay for the link status and mark the
   *  booking as Paid if it has been paid. Returns { paid, linkStatus, data }. */
  async verifyPayment(bookingId: number) {
    const res = await api.post(`/services/bookings/${bookingId}/payment/verify`);
    return res.data;
  },

  /** In-app native UPI flow — once the user has approved a UPI Collect on
   *  Razorpay's order, send the resulting paymentId here so the backend can
   *  verify and mark the booking as Paid. */
  async markBookingPaidInApp(
    bookingId: number,
    body: { razorpayPaymentId: string; razorpayOrderId?: string; razorpaySignature?: string },
  ) {
    const res = await api.post(`/services/bookings/${bookingId}/mark-paid`, body);
    return res.data;
  },

  /** Cancel a booking */
  async cancel(id: number) {
    const res = await api.delete(`/services/bookings/${id}`);
    return res.data;
  },

  /** Create Razorpay payment link for full delivery payment */
  async createDeliveryPaymentLink(id: number) {
    const res = await api.post(`/services/bookings/${id}/delivery-payment/create-link`);
    return res.data;
  },

  /** Verify delivery payment (poll Razorpay) */
  async verifyDeliveryPayment(id: number) {
    const res = await api.post(`/services/bookings/${id}/delivery-payment/verify`);
    return res.data;
  },

  /** Confirm in-app payment after Razorpay checkout */
  async confirmDeliveryPayment(id: number, data: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string; paymentMethod?: string }) {
    const res = await api.post(`/services/bookings/${id}/delivery-payment/confirm`, data);
    return res.data;
  },

  /** Submit a review after completion */
  async addReview(id: number, data: { rating: number; review?: string }) {
    const res = await api.put(`/services/bookings/${id}/review`, data);
    return res.data;
  },

  EVENT_TYPES: [
    'Wedding', 'Birthday', 'Corporate', 'Club',
    'Private Party', 'Festival', 'School Event', 'Other',
  ] as const,
};

// ── User Profile ──────────────────────────────────────────────────────────────

export const userApi = {
  async getProfile() {
    const res = await api.get('/users/profile');
    return res.data;
  },

  async updateProfile(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    profilePicture?: string;
  }) {
    const res = await api.put('/users/profile', data);
    return res.data;
  },

  /**
   * Upload a user profile picture as multipart (browser / web).
   * @param formData  FormData with field "avatar" (single image file).
   */
  async uploadAvatar(formData: FormData) {
    const res = await api.post('/users/avatar', formData);
    return res.data;
  },

  /**
   * Upload a user profile picture as base64 JSON.
   *
   * Used by the React Native app — multipart through axios + RN's
   * FormData polyfill + Hostinger's proxy was failing with ERR_NETWORK
   * (no response at all). JSON goes through the same axios path as
   * every other call (which works), so it just works.
   *
   * @param dataUrl  "data:image/jpeg;base64,..." string
   */
  async uploadAvatarBase64(dataUrl: string) {
    const res = await api.post('/users/avatar', { photoBase64: dataUrl });
    return res.data;
  },

  async getMyBookings(params?: { status?: string; page?: number; limit?: number }) {
    const res = await api.get('/users/bookings', { params });
    return res.data;
  },

  async changePassword(data: { currentPassword: string; newPassword: string }) {
    const res = await api.put('/users/change-password', data);
    return res.data;
  },

  // ─── Saved addresses (delivery addresses) ──────────────────────────────
  async getSavedAddresses() {
    const res = await api.get('/users/addresses');
    return res.data;
  },
  async addSavedAddress(data: {
    label: string;
    contactName?: string;
    contactPhone?: string;
    street?: string;
    landmark?: string;
    city: string;
    state?: string;
    zipCode?: string;
    country?: string;
    latitude: number;
    longitude: number;
    makeDefault?: boolean;
  }) {
    const res = await api.post('/users/addresses', data);
    return res.data;
  },
  async updateSavedAddress(id: number, data: Partial<{
    label: string;
    contactName: string | null;
    contactPhone: string | null;
    street: string | null;
    landmark: string | null;
    city: string;
    state: string | null;
    zipCode: string | null;
    country: string;
    latitude: number;
    longitude: number;
  }>) {
    const res = await api.put(`/users/addresses/${id}`, data);
    return res.data;
  },
  async setDefaultAddress(id: number) {
    const res = await api.put(`/users/addresses/${id}/default`);
    return res.data;
  },
  async deleteSavedAddress(id: number) {
    const res = await api.delete(`/users/addresses/${id}`);
    return res.data;
  },

  // ─── Payout methods (where refunds are sent) ──────────────────────────────
  async getPayoutMethods() {
    const res = await api.get('/users/payout-methods');
    return res.data;
  },
  async addPayoutMethod(data: {
    type: 'upi' | 'bank';
    upiId?: string;
    accountHolderName?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    makeDefault?: boolean;
  }) {
    const res = await api.post('/users/payout-methods', data);
    return res.data;
  },
  async setDefaultPayoutMethod(id: number) {
    const res = await api.put(`/users/payout-methods/${id}/default`);
    return res.data;
  },
  async deletePayoutMethod(id: number) {
    const res = await api.delete(`/users/payout-methods/${id}`);
    return res.data;
  },
};

// ── Chat ─────────────────────────────────────────────────────────────────────

export const chatApi = {
  async getConversations() {
    const res = await api.get('/chat/conversations');
    return res.data;
  },
  async getOrCreateConversation(captainId: number, userId?: number) {
    // Backend keys conversations by the captain's underlying user account,
    // so it requires `userId` (the captain's user id). We still send
    // `captainId` for backward compatibility.
    const res = await api.post('/chat/conversations', { captainId, userId });
    return res.data;
  },
  async getMessages(conversationId: number, params?: { before?: number; limit?: number }) {
    const res = await api.get(`/chat/conversations/${conversationId}/messages`, { params });
    return res.data;
  },
  async sendMessage(conversationId: number, text: string, metadata?: any) {
    const res = await api.post('/chat/messages', { conversationId, text, metadata: metadata || undefined });
    return res.data;
  },
  async markAsRead(conversationId: number) {
    const res = await api.put(`/chat/conversations/${conversationId}/read`);
    return res.data;
  },
};

export const supportApi = {
  async createTicket(data: { type: string; subject: string; description: string; relatedBookingId?: number; priority?: string }) {
    const res = await api.post('/support/tickets', data);
    return res.data;
  },
  async getMyTickets(status?: string) {
    const res = await api.get('/support/tickets', { params: status ? { status } : {} });
    return res.data;
  },
  async getTicket(id: number) {
    const res = await api.get(`/support/tickets/${id}`);
    return res.data;
  },
  async addMessage(id: number, message: string) {
    const res = await api.post(`/support/tickets/${id}/messages`, { message });
    return res.data;
  },
  async closeTicket(id: number) {
    const res = await api.put(`/support/tickets/${id}/close`);
    return res.data;
  },
  TYPES: ['Refund', 'Booking Issue', 'Payment Problem', 'DJ Complaint', 'Equipment Issue', 'Technical Support', 'Account', 'Other'] as const,
};

// ✅ FIXED: export default so BookingBottomSheet can do:
//   import api, { bookingApi } from "../services/userApi"
//   and call api.post('/payments/create-order', ...) directly
export default api;