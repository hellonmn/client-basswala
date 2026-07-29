/**
 * services/pushNotifications.ts
 *
 * Lazy push-token registration. Call usePushTokenSync() once near the top
 * of the authenticated app tree — it asks for permission, fetches an Expo
 * push token, and PUTs it to /auth/push-token.
 *
 * Safe to call before the user logs in: the hook short-circuits until a
 * JWT is in storage (so we never register an anonymous token).
 *
 * Tap-handling: also exports useNotificationTapNavigator() which routes
 * the user to a deep link when they tap a notification (data.route).
 */

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";
import api from "./userApi";

// Foreground notifications: still show banner + play sound by default.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowAlert: true,
  } as any),
});

let cachedToken: string | null = null;

/**
 * Registers the push token with the backend on first authenticated mount.
 * Re-runs whenever the user changes (login/logout). Silent on failure —
 * notifications are a nice-to-have, never block the app.
 */
export function usePushTokenSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        // 1. Need a real device — emulators won't get a token.
        if (!Device.isDevice) {
          console.log("[push] skip: not a physical device (emulators can't get push tokens).");
          return;
        }

        // 2. Permissions
        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== "granted") {
          const ask = await Notifications.requestPermissionsAsync();
          status = ask.status;
        }
        if (status !== "granted") {
          console.warn(
            `[push] skip: notification permission is "${status}". ` +
            "Open Android Settings → Apps → Basswala → Notifications and toggle them on, " +
            "then re-open the app."
          );
          return;
        }

        // 3. Android channel — required for category + sound
        if (Platform.OS === "android") {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: "#02023E",
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }

        // 4. Token
        const Constants = require("expo-constants").default;
        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ||
          Constants?.easConfig?.projectId;
        if (!projectId) {
          console.warn(
            "[push] no EAS projectId found in app config. " +
            "Check app.json → extra.eas.projectId. Without this the Expo push " +
            "service can't issue a token."
          );
        }
        const tokenRes = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        const token = tokenRes?.data;
        if (!token) {
          console.warn(
            "[push] getExpoPushTokenAsync returned no token. " +
            "On Android this often means FCM credentials aren't configured for " +
            "the Expo project. Run `eas credentials -p android` and upload the " +
            "FCM V1 service account JSON."
          );
          return;
        }
        if (cancelled) return;

        console.log(`[push] got Expo token: ${token.slice(0, 25)}…`);

        // Skip the round-trip if it hasn't changed
        if (cachedToken === token) {
          console.log("[push] token unchanged — skipping backend sync.");
          return;
        }
        cachedToken = token;

        const res = await api.put("/auth/push-token", { token });
        if (res?.data?.success) {
          console.log(`[push] token synced to backend for user ${user.id}.`);
        } else {
          console.warn("[push] backend rejected token sync:", res?.data?.message);
        }
      } catch (err) {
        // Don't crash the app on push failures — they're optional.
        console.warn("[push] register failed:", (err as Error).message, err);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);
}

/**
 * Listens for notification taps and routes to the deep link in data.route.
 * Mount once near the root.
 */
export function useNotificationTapNavigator() {
  const router = useRouter();
  const subscription = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    subscription.current = Notifications.addNotificationResponseReceivedListener((event) => {
      const data: any = event.notification.request.content.data || {};
      const route = data.route || data.url;
      if (typeof route === "string" && route.length > 0) {
        // Internal route OR universal-link URL — both work via expo-router push
        try { router.push(route as any); } catch (e) { console.warn("[push] route push failed:", e); }
      }
    });
    return () => {
      try { subscription.current?.remove(); } catch {}
    };
  }, [router]);
}
