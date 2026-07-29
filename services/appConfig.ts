/**
 * services/appConfig.ts
 *
 * Thin client for the public /api/app/* endpoints that drive admin-
 * controlled content in the user app: support contacts and feature
 * flags. No auth needed — these are public, cacheable, and called
 * from screens that may render before the user has logged in.
 *
 * Each call has an in-memory cache with a soft TTL so screens that
 * remount (Contact Us / Refunds / Wallet) don't hammer the backend
 * — and an AsyncStorage mirror so we still have *something* to show
 * when offline or on the first cold boot.
 */

import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Keep the base URL in sync with services/api.ts. We don't reuse
// apiService here because that one attaches auth headers; this is
// deliberately auth-less so it works on the splash / login screens
// too.
const API_BASE_URL = "https://server.basswala.com/api";

export interface SupportContact {
  email: string;
  phone: string;
  whatsapp: string;
  emailHours: string;
  phoneHours: string;
  whatsappHours: string;
}

export interface FeatureFlags {
  walletComingSoon: boolean;
}

const DEFAULT_CONTACT: SupportContact = {
  email: "support@basswala.in",
  phone: "",
  whatsapp: "",
  emailHours: "Reply within 24 hrs",
  phoneHours: "Mon–Sat, 10am–6pm",
  whatsappHours: "Mon–Sat, 9am–7pm",
};

const DEFAULT_FLAGS: FeatureFlags = {
  walletComingSoon: false,
};

const TTL_MS = 5 * 60 * 1000;             // 5 minutes
const STORAGE_KEY_CONTACT = "basswala:supportContact";
const STORAGE_KEY_FLAGS   = "basswala:featureFlags";

// In-memory cache (per process). Survives screen navigation but
// resets on a JS reload — that's fine.
let contactCache: { data: SupportContact; ts: number } | null = null;
let flagsCache:   { data: FeatureFlags;   ts: number } | null = null;

async function readFromStorage<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

async function writeToStorage(key: string, value: unknown) {
  try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* non-fatal */ }
}

/**
 * Fetch support contact details with cache fallback.
 * Resolves quickly from cache (memory → storage → defaults) and
 * triggers a background refresh if the cached copy is stale.
 */
export async function getSupportContact(forceRefresh = false): Promise<SupportContact> {
  if (!forceRefresh && contactCache && Date.now() - contactCache.ts < TTL_MS) {
    return contactCache.data;
  }
  try {
    const res = await axios.get(`${API_BASE_URL}/app/contact`, { timeout: 6000 });
    const data: SupportContact = { ...DEFAULT_CONTACT, ...(res.data?.data || {}) };
    contactCache = { data, ts: Date.now() };
    writeToStorage(STORAGE_KEY_CONTACT, data);
    return data;
  } catch {
    // Network down → use the last copy we have on disk, or the
    // hardcoded defaults if there isn't one yet.
    return readFromStorage(STORAGE_KEY_CONTACT, DEFAULT_CONTACT);
  }
}

/**
 * Fetch feature flags. Same shape as getSupportContact.
 */
export async function getFeatureFlags(forceRefresh = false): Promise<FeatureFlags> {
  if (!forceRefresh && flagsCache && Date.now() - flagsCache.ts < TTL_MS) {
    return flagsCache.data;
  }
  try {
    const res = await axios.get(`${API_BASE_URL}/app/feature-flags`, { timeout: 6000 });
    const data: FeatureFlags = { ...DEFAULT_FLAGS, ...(res.data?.data || {}) };
    flagsCache = { data, ts: Date.now() };
    writeToStorage(STORAGE_KEY_FLAGS, data);
    return data;
  } catch {
    return readFromStorage(STORAGE_KEY_FLAGS, DEFAULT_FLAGS);
  }
}

/**
 * Build a tel: link from the raw support phone. Strips spaces / dashes
 * but leaves the leading "+" intact so the OS dialer can parse it.
 */
export function telLink(phone: string) {
  if (!phone) return "";
  const cleaned = phone.replace(/[^\d+]/g, "");
  return `tel:${cleaned}`;
}

/**
 * Build a wa.me link. The admin stores WhatsApp as digits only
 * (e.g. "917878075119"); we strip anything else just in case.
 */
export function whatsappLink(whatsapp: string, prefill?: string) {
  if (!whatsapp) return "";
  const digits = whatsapp.replace(/\D/g, "");
  const q = prefill ? `?text=${encodeURIComponent(prefill)}` : "";
  return `https://wa.me/${digits}${q}`;
}

/**
 * Pretty-print phone for display (e.g. "+91 78780 75119"). Best-effort;
 * falls back to the raw string for unusual formats.
 */
export function formatPhone(phone: string) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}
