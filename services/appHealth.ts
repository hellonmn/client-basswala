/**
 * services/appHealth.ts
 *
 * Two cross-cutting UX nudges that live above the screen layer:
 *
 *   1. requestPlayStoreReview()   → asks the user to rate the app on Play
 *                                   Store. Uses native in-app review (no
 *                                   Play Store redirect needed on Android).
 *                                   Gated to fire at most once per
 *                                   significant interval so we don't pester.
 *
 *   2. checkForAppUpdate()        → compares the running app's version
 *                                   against the latest published Play Store
 *                                   version (fetched from our backend, since
 *                                   the Play Store doesn't expose a public
 *                                   API). Returns whether an update is
 *                                   available so the caller can show a
 *                                   custom popup.
 *
 * Both functions are pure utilities — UI is up to the caller. The Play Store
 * review path uses `expo-store-review` which renders Google's in-app review
 * card directly. No redirect. On iOS we use SKStoreReviewController.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Linking, Platform } from "react-native";
import api from "./userApi";

// ── Lazy native module shims ─────────────────────────────────────────────
// These packages ship a native module that must be compiled into the
// JS engine. A bare `import` runs at module load and CRASHES the whole
// app if the dev client / standalone build hasn't bundled the native
// side yet (e.g. expo-store-review was added to package.json but the
// dev client wasn't rebuilt).
//
// Requiring lazily inside the function and swallowing the error means
// the host call site just gets a no-op instead of taking the app down,
// so developers can iterate without a 30-minute dev-client rebuild
// every time they pull a new native dependency.

function loadStoreReview(): null | typeof import("expo-store-review") {
  try { return require("expo-store-review"); }
  catch (e) {
    console.warn("[appHealth] expo-store-review unavailable (rebuild the dev client to enable)");
    return null;
  }
}

function loadApplication(): null | typeof import("expo-application") {
  try { return require("expo-application"); }
  catch (e) {
    console.warn("[appHealth] expo-application unavailable");
    return null;
  }
}

const STORE_REVIEW_LAST_PROMPT_KEY = "basswala:storeReviewLastPrompt";
const STORE_REVIEW_DONE_KEY        = "basswala:storeReviewDone";

// Don't prompt the same user twice within 30 days — Google rate-limits
// the in-app review API anyway, but we add a client-side cool-down for
// users we know declined.
const REVIEW_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Trigger the Play Store / App Store in-app review prompt.
 *
 * Returns whether we actually shown the prompt (could be skipped due to
 * cooldown, platform support, or the OS deciding not to show it — Google
 * has its own internal quota).
 */
export async function requestPlayStoreReview(): Promise<boolean> {
  try {
    // 1. Has the user already left a review and we marked it done?
    const done = await AsyncStorage.getItem(STORE_REVIEW_DONE_KEY);
    if (done === "1") return false;

    // 2. Cool-down — prompted recently?
    const lastStr = await AsyncStorage.getItem(STORE_REVIEW_LAST_PROMPT_KEY);
    const last = lastStr ? parseInt(lastStr, 10) : 0;
    if (Date.now() - last < REVIEW_COOLDOWN_MS) return false;

    // 3. Is the OS capable of showing the native review UI?
    const StoreReview = loadStoreReview();
    if (!StoreReview) return false;
    const available = await StoreReview.isAvailableAsync();
    if (!available) {
      // Last-resort fallback — open the store listing. Only do this if
      // we have a clear signal the user wants to leave a review; we
      // don't fall through here from regular gating.
      return false;
    }

    // 4. Show the native review card.
    await StoreReview.requestReview();

    // 5. Remember when we asked, so the cool-down kicks in.
    await AsyncStorage.setItem(STORE_REVIEW_LAST_PROMPT_KEY, String(Date.now()));
    return true;
  } catch (err) {
    // Never crash the host call site over a review prompt.
    console.warn("[review] requestPlayStoreReview failed:", err);
    return false;
  }
}

/**
 * Mark the user as having actively engaged with the review flow (e.g.
 * they tapped "Rate us" and submitted, or we deep-linked them out to
 * the store and they left a rating). Stops future prompts.
 */
export async function markStoreReviewDone() {
  try { await AsyncStorage.setItem(STORE_REVIEW_DONE_KEY, "1"); } catch {}
}

/**
 * Open the Play Store / App Store listing directly. Useful when the
 * native in-app review isn't available (e.g. browser web), or when the
 * caller wants the user to explicitly land on the store.
 */
export async function openStoreListing(): Promise<void> {
  const Application = loadApplication();
  const pkg = Application?.applicationId; // e.g. com.basswaala.djbooking
  const url =
    Platform.OS === "android"
      ? `market://details?id=${pkg}`
      : `itms-apps://itunes.apple.com/app/id<APPLE_APP_ID>`;
  const fallback =
    Platform.OS === "android"
      ? `https://play.google.com/store/apps/details?id=${pkg}`
      : `https://apps.apple.com/app/id<APPLE_APP_ID>`;
  try {
    const canOpen = await Linking.canOpenURL(url);
    await Linking.openURL(canOpen ? url : fallback);
  } catch {
    Linking.openURL(fallback).catch(() => {});
  }
}

// ─── Update-available check ───────────────────────────────────────────────

export interface UpdateInfo {
  /** True if the Play Store has a higher version than the running app. */
  updateAvailable: boolean;
  /** The version string from the running app. */
  currentVersion: string | null;
  /** The latest version published. Null if we couldn't determine it. */
  latestVersion: string | null;
  /** True if the latest update is marked as "required" (forced) by the
   *  backend. Caller can use this to make the popup non-dismissable. */
  isRequired: boolean;
  /** Optional changelog / release notes the backend can return. */
  notes?: string;
}

const VERSION_DISMISS_KEY = "basswala:updateDismissUntil";

/**
 * Ask our backend for the latest published Play Store version. Backend
 * is the source of truth because the Play Store doesn't have a public
 * API for "what's my latest version?" — admin updates a Setting row
 * after each release.
 *
 * Returns UpdateInfo with `updateAvailable` true when a strictly higher
 * version exists. The caller decides whether to show a popup.
 */
export async function checkForAppUpdate(): Promise<UpdateInfo> {
  const Application = loadApplication();
  const currentVersion = Application?.nativeApplicationVersion || null;
  const fallback: UpdateInfo = {
    updateAvailable: false,
    currentVersion,
    latestVersion: null,
    isRequired: false,
  };

  try {
    const res = await api.get("/app/version");
    const data = res?.data?.data || res?.data || {};
    const latestVersion: string | null = data.latestVersion || null;
    const isRequired = !!data.isRequired;
    const notes = data.notes || undefined;

    if (!latestVersion || !currentVersion) return fallback;

    const updateAvailable = compareSemver(currentVersion, latestVersion) < 0;
    return { updateAvailable, currentVersion, latestVersion, isRequired, notes };
  } catch (err) {
    // Backend offline / endpoint missing — don't bother the user.
    return fallback;
  }
}

/**
 * Has the user dismissed an update-available popup recently?
 * Required updates ignore this gate.
 */
export async function isUpdateRecentlyDismissed(): Promise<boolean> {
  try {
    const until = await AsyncStorage.getItem(VERSION_DISMISS_KEY);
    if (!until) return false;
    return Date.now() < parseInt(until, 10);
  } catch { return false; }
}

/** Snooze the update popup for N hours so we don't show it every launch. */
export async function snoozeUpdatePopup(hours: number = 24) {
  try {
    const until = Date.now() + hours * 60 * 60 * 1000;
    await AsyncStorage.setItem(VERSION_DISMISS_KEY, String(until));
  } catch {}
}

/** Tiny semver-ish comparator. Returns -1/0/1 (a < b, a == b, a > b). */
export function compareSemver(a: string, b: string): number {
  const parse = (s: string) =>
    s.replace(/[^0-9.]/g, "").split(".").map((x) => parseInt(x, 10) || 0);
  const A = parse(a);
  const B = parse(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const av = A[i] || 0;
    const bv = B[i] || 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}
