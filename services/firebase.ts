/**
 * services/firebase.ts — Google Sign-In (platform-aware)
 *
 * Web: uses Google Identity Services (GIS). No redirect, no popup issues on mobile.
 * Native: uses @react-native-google-signin/google-signin + Firebase credential.
 */

import { Platform } from "react-native";

const GOOGLE_WEB_CLIENT_ID =
  "307784786805-367sr8uhq6g4enb9eoiv8ae9dt4irmnp.apps.googleusercontent.com";

const FIREBASE_WEB_CONFIG = {
  apiKey: "AIzaSyBWJy60hdo1qDA_AxbB1dAJAlu82806mfo",
  authDomain: "basswala-client-51bb9.firebaseapp.com",
  projectId: "basswala-client-51bb9",
  storageBucket: "basswala-client-51bb9.firebasestorage.app",
  messagingSenderId: "307784786805",
  appId: "1:307784786805:web:1d92f2c6f1f8d4e6b1693c",
  measurementId: "G-D19KXYYQH2"
};

const isWeb = Platform.OS === "web";

// ────────────────────────────────────────────────────────────────────
//  WEB — Google Identity Services (GIS)
// ────────────────────────────────────────────────────────────────────

let _gisLoaded = false;
function loadGoogleIdentityServices(): Promise<void> {
  if (_gisLoaded) return Promise.resolve();
  if (typeof document === "undefined") return Promise.resolve();

  return new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.id) { _gisLoaded = true; return resolve(); }

    const existing = document.getElementById("google-identity-services-script");
    if (existing) {
      existing.addEventListener("load", () => { _gisLoaded = true; resolve(); });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Identity Services")));
      return;
    }

    const script = document.createElement("script");
    script.id = "google-identity-services-script";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => { _gisLoaded = true; resolve(); };
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

async function getGoogleIdTokenWeb(): Promise<string> {
  await loadGoogleIdentityServices();
  const g = (window as any).google;
  if (!g?.accounts?.id) throw new Error("Google Identity Services not available");

  return new Promise<string>((resolve, reject) => {
    g.accounts.id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      callback: (response: any) => {
        if (response?.credential) resolve(response.credential);
        else reject(new Error(response?.error || "No credential returned from Google"));
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup",
    });

    g.accounts.id.prompt((notification: any) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        let container = document.getElementById("gis-hidden-btn");
        if (!container) {
          container = document.createElement("div");
          container.id = "gis-hidden-btn";
          container.style.position = "fixed";
          container.style.top = "-9999px";
          document.body.appendChild(container);
        }
        try {
          g.accounts.id.renderButton(container, { theme: "outline", size: "large" });
          setTimeout(() => {
            const btn = container!.querySelector("div[role=button]") as HTMLElement | null;
            if (btn) btn.click();
            else reject(new Error("Google Sign-In could not be shown. Please allow pop-ups and try again."));
          }, 50);
        } catch (e: any) {
          reject(new Error(e?.message || "Google Sign-In failed"));
        }
      }
    });
  });
}

let _webAuth: any = null;
let _webSdk: any = null;
function getWebAuth() {
  if (_webAuth) return _webAuth;
  const { initializeApp, getApps, getApp } = require("firebase/app");
  const authMod = require("firebase/auth");
  const app = getApps().length ? getApp() : initializeApp(FIREBASE_WEB_CONFIG);
  _webAuth = authMod.getAuth(app);
  _webSdk = authMod;
  return _webAuth;
}

function getNativeAuth() {
  const { getApp } = require("@react-native-firebase/app");
  const { getAuth } = require("@react-native-firebase/auth");
  return getAuth(getApp());
}

export const firebaseAuth = {
  async consumeRedirectResult(): Promise<string | null> {
    return null;
  },

  /**
   * Run the Google account picker and return only the raw Google ID token —
   * does NOT sign the user into Firebase Auth. Used by the "link Google
   * to my existing phone-OTP account" flow on the profile screen, where
   * we don't want to actually flip the local auth identity, just send
   * the token to our backend to attach the email.
   */
  async getGoogleIdToken(): Promise<string> {
    if (isWeb) {
      return getGoogleIdTokenWeb();
    }
    const { GoogleSignin } = require("@react-native-google-signin/google-signin");
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Make sure we always present the chooser — if a user is already
    // signed-in, signOut first so they can pick a different account.
    try { await GoogleSignin.signOut(); } catch {}
    const userInfo = await GoogleSignin.signIn();
    const googleIdToken = userInfo?.data?.idToken || userInfo?.idToken;
    if (!googleIdToken) throw new Error("No Google ID token returned.");
    return googleIdToken;
  },

  async signInWithGoogle(): Promise<string> {
    if (isWeb) {
      return getGoogleIdTokenWeb();
    }

    try {
      const { GoogleSignin } = require("@react-native-google-signin/google-signin");
      const { getApp } = require("@react-native-firebase/app");
      const { getAuth, GoogleAuthProvider, signInWithCredential } =
        require("@react-native-firebase/auth");

      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const userInfo = await GoogleSignin.signIn();
      const googleIdToken = userInfo?.data?.idToken || userInfo?.idToken;
      if (!googleIdToken) throw new Error("No Google ID token returned.");

      const credential = GoogleAuthProvider.credential(googleIdToken);
      const fbAuth = getAuth(getApp());
      const credResult = await signInWithCredential(fbAuth, credential);
      const firebaseIdToken = await credResult.user.getIdToken(true);
      if (!firebaseIdToken) throw new Error("Firebase did not return ID token.");
      return firebaseIdToken;
    } catch (err: any) {
      if (String(err?.message || err).includes("Cannot find module")) {
        throw new Error(
          "Google Sign-In is not installed. Run: npx expo install @react-native-google-signin/google-signin"
        );
      }
      throw err;
    }
  },

  /**
   * Sign in with Apple (iOS only). Presents Apple's native sheet, gets an
   * identity token, exchanges it for a Firebase credential, and returns the
   * Firebase ID token to hand to our backend — same shape as Google so the
   * backend's /auth/firebase-login handles both identically.
   *
   * Firebase REQUIRES a nonce for Apple sign-in: we generate a random raw
   * nonce, send its SHA-256 hash to Apple (so Apple stamps the hash into the
   * identity token), then hand the *raw* nonce to Firebase. Firebase re-hashes
   * the raw nonce and checks it matches the token — without this the exchange
   * fails with `auth/invalid-credential` / a missing-nonce error, which is the
   * "error message during login" App Review hit.
   */
  async signInWithApple(): Promise<{
    firebaseIdToken: string;
    /** Present only on the FIRST sign-in; null on subsequent logins. */
    appleFirstName: string | null;
    appleLastName: string | null;
    /** Present only on the FIRST sign-in (or when user chooses to share). */
    appleEmail: string | null;
  }> {
    if (isWeb) {
      throw new Error("Apple Sign-In is not supported on web.");
    }

    try {
      const AppleAuthentication = require("expo-apple-authentication");
      const Crypto = require("expo-crypto");
      const { getApp } = require("@react-native-firebase/app");
      const { getAuth, AppleAuthProvider, signInWithCredential } =
        require("@react-native-firebase/auth");

      // 1. Random raw nonce (replay protection).
      const charset =
        "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._";
      const bytes = Crypto.getRandomBytes(32);
      let rawNonce = "";
      for (let i = 0; i < bytes.length; i++) {
        rawNonce += charset[bytes[i] % charset.length];
      }

      // 2. Apple wants the SHA-256 hash of the nonce.
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );

      const appleAuthRequestResponse = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const { identityToken, fullName, email: appleEmail } = appleAuthRequestResponse;
      if (!identityToken) throw new Error("No Apple identity token returned.");

      // 3. Firebase verifies the token by re-hashing the raw nonce.
      const credential = AppleAuthProvider.credential(identityToken, rawNonce);
      const fbAuth = getAuth(getApp());
      const credResult = await signInWithCredential(fbAuth, credential);
      const firebaseIdToken = await credResult.user.getIdToken(true);
      if (!firebaseIdToken) throw new Error("Firebase did not return ID token.");

      // IMPORTANT: Apple only provides fullName and email on the FIRST
      // authentication. On every subsequent login these will be null.
      // We must capture and forward them to the backend NOW.
      return {
        firebaseIdToken,
        appleFirstName: fullName?.givenName ?? null,
        appleLastName: fullName?.familyName ?? null,
        appleEmail: appleEmail ?? null,
      };
    } catch (err: any) {
      if (String(err?.message || err).includes("Cannot find module")) {
        throw new Error(
          "Apple Authentication is not installed. Run: npx expo install expo-apple-authentication expo-crypto"
        );
      }
      throw err;
    }
  },

  async signOut(): Promise<void> {
    try {
      if (isWeb) {
        try {
          const g = (window as any).google;
          g?.accounts?.id?.disableAutoSelect?.();
        } catch {}
        try {
          const auth = getWebAuth();
          const { signOut } = _webSdk;
          await signOut(auth);
        } catch {}
      } else {
        const auth = getNativeAuth();
        const { signOut } = require("@react-native-firebase/auth");
        await signOut(auth);
      }
    } catch { /* non-fatal */ }
  },
};

// ────────────────────────────────────────────────────────────────────
//  PHONE OTP — Firebase Phone Authentication
//
//  Two-step flow:
//    1. start(phone)     → sends SMS, returns a sessionToken
//    2. confirm(sessionToken, otp) → returns a Firebase ID token
//
//  Web: uses firebase/auth + an invisible reCAPTCHA verifier (auto-mounted).
//  Native: uses @react-native-firebase/auth's signInWithPhoneNumber.
// ────────────────────────────────────────────────────────────────────

// Module-level slot for the in-flight confirmation object. Firebase's API
// returns an opaque object with a .confirm(code) method; we cache it here
// keyed by a UUID we hand back to the UI so multiple OTP requests don't
// clobber each other.
const pendingConfirmations: Record<string, any> = {};

function newSessionToken(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function recreateRecaptchaContainer(): string {
  if (typeof document === "undefined") {
    throw new Error("Recaptcha container can only be created in a browser");
  }
  // Wipe the previous one so we always start with a clean slate. Stale
  // verifiers cause `auth/invalid-app-credential` when the page is hot-
  // reloaded or the bottom sheet has been opened/closed multiple times.
  const previous = document.getElementById("firebase-recaptcha-container");
  if (previous && previous.parentElement) previous.parentElement.removeChild(previous);

  const el = document.createElement("div");
  el.id = "firebase-recaptcha-container";
  // Hidden but in DOM — invisible reCAPTCHA still needs a real element.
  el.style.position = "fixed";
  el.style.bottom = "0";
  el.style.right = "0";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  return "firebase-recaptcha-container";
}

/**
 * Make a brand-new invisible RecaptchaVerifier each time we send an OTP.
 * Caching the verifier across multiple sends is fragile — it goes stale
 * when the DOM is touched by a hot reload or by the LoginGate bottom sheet
 * unmounting. The verifier is a one-shot handle anyway: Firebase's
 * `signInWithPhoneNumber` uses it once per call.
 */
async function makeWebRecaptchaVerifier(): Promise<any> {
  const auth = getWebAuth();
  const { RecaptchaVerifier } = _webSdk;
  const containerId = recreateRecaptchaContainer();
  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
    callback: () => { /* solved */ },
    "expired-callback": () => { /* user took too long */ },
  });
  // Render once so reCAPTCHA Enterprise / v2 is initialised before we ask
  // signInWithPhoneNumber to verify.
  try { await verifier.render(); } catch { /* harmless if already rendered */ }
  return verifier;
}

function normalizeIndianPhone(raw: string): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  if (digits.length === 10) return `+91${digits}`;
  // Fallback — caller may have supplied a fully-qualified number already
  return raw.startsWith("+") ? raw : `+${digits}`;
}

export const phoneSignIn = {
  /**
   * Send the OTP. Returns a sessionToken that must be passed to `confirm`.
   * Throws on network / configuration errors.
   */
  async start(phone: string): Promise<{ sessionToken: string }> {
    const phoneNumber = normalizeIndianPhone(phone);

    if (isWeb) {
      const auth = getWebAuth();
      const { signInWithPhoneNumber } = _webSdk;
      const verifier = await makeWebRecaptchaVerifier();
      try {
        const confirmation = await signInWithPhoneNumber(auth, phoneNumber, verifier);
        const token = newSessionToken();
        pendingConfirmations[token] = confirmation;
        return { sessionToken: token };
      } catch (err: any) {
        // Try to clean up the verifier so the next attempt starts fresh.
        try { verifier?.clear?.(); } catch {}
        throw err;
      }
    }

    // Native (Android / iOS) — RNFirebase
    const { getApp } = require("@react-native-firebase/app");
    const { getAuth, signInWithPhoneNumber } = require("@react-native-firebase/auth");
    const auth = getAuth(getApp());
    const confirmation = await signInWithPhoneNumber(auth, phoneNumber);
    const token = newSessionToken();
    pendingConfirmations[token] = confirmation;
    return { sessionToken: token };
  },

  /**
   * Verify the SMS OTP. Returns the Firebase ID token on success — pass it
   * to `authApi.firebaseLogin` to exchange for the app's own JWT.
   * Throws if the code is wrong or the session expired.
   */
  async confirm(sessionToken: string, code: string): Promise<string> {
    const confirmation = pendingConfirmations[sessionToken];
    if (!confirmation) {
      throw new Error("OTP session expired. Please request a new code.");
    }
    try {
      const credential = await confirmation.confirm(code);
      // RNFirebase exposes user via `credential.user`; web SDK does the same.
      const user = credential?.user;
      if (!user) throw new Error("Firebase did not return a user.");
      const idToken: string = await user.getIdToken(true);
      if (!idToken) throw new Error("Firebase did not return an ID token.");
      return idToken;
    } finally {
      // Always clear — single-use session
      delete pendingConfirmations[sessionToken];
    }
  },

  /** Drop a pending OTP session (e.g. when the user changes their number). */
  cancel(sessionToken: string) {
    if (sessionToken) delete pendingConfirmations[sessionToken];
  },
};
