/**
 * components/OfflineBanner.tsx
 *
 * Shows a red banner at the top of the screen ONLY when the app genuinely
 * can't reach the backend. We piggy-back on the axios interceptors (they call
 * `notifyNetworkEvent()` on every success / network-level failure), but a
 * handful of failed requests is NOT enough to declare "offline" — a single
 * slow endpoint, a timeout, or a dropped socket on the reverse proxy would
 * otherwise flash a false "No internet" banner repeatedly.
 *
 * So before we ever show the banner we ACTIVELY CONFIRM by probing the
 * lightweight `/health` endpoint. The banner appears only if that probe also
 * fails. While shown, we keep probing and auto-hide the moment the server is
 * reachable again. This eliminates the "banner keeps flashing" problem.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Platform, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ─── Tiny event bus — the axios interceptors call this ──────────────────────
type Listener = (type: "success" | "network-error") => void;
const listeners = new Set<Listener>();

export function notifyNetworkEvent(type: "success" | "network-error") {
  listeners.forEach((l) => {
    try { l(type); } catch { /* ignore */ }
  });
}

// How many consecutive network errors before we bother to actively probe the
// server. Higher than before so a couple of flaky requests never trigger a probe.
const FAIL_THRESHOLD = 4;
// How often to re-check connectivity while the banner is showing.
const RECHECK_MS = 4000;

// Root origin of the backend (strip the trailing /api), then hit /health.
const HEALTH_URL =
  (process.env.EXPO_PUBLIC_API_BASE_URL || "https://server.basswala.com/api")
    .replace(/\/api\/?$/, "") + "/health";

/**
 * Is the backend actually reachable right now? Any HTTP response (even an
 * error status) proves we have connectivity — only a thrown fetch (DNS fail,
 * connection refused, timeout) means we're truly offline.
 */
async function serverReachable(timeoutMs = 5000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(HEALTH_URL, { method: "GET", signal: ctrl.signal });
    clearTimeout(timer);
    return !!res; // got a response → we're online
  } catch {
    return false;
  }
}

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const failCountRef = useRef(0);
  const confirmingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onlineRef = useRef(true);
  const translateY = useRef(new Animated.Value(-80)).current;

  const setOnlineState = useCallback((v: boolean) => {
    onlineRef.current = v;
    setOnline(v);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // While offline, keep probing and flip back the instant the server answers.
  const startRecoveryPolling = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      if (await serverReachable()) {
        failCountRef.current = 0;
        setOnlineState(true);
        stopPolling();
      }
    }, RECHECK_MS);
  }, [setOnlineState, stopPolling]);

  useEffect(() => {
    const handler: Listener = async (type) => {
      if (type === "success") {
        // Any successful response → we're definitely online.
        failCountRef.current = 0;
        if (!onlineRef.current) { setOnlineState(true); stopPolling(); }
        return;
      }

      // network-error
      failCountRef.current += 1;
      if (
        failCountRef.current >= FAIL_THRESHOLD &&
        !confirmingRef.current &&
        onlineRef.current
      ) {
        // Don't trust the request failures alone — confirm with a real probe.
        confirmingRef.current = true;
        const reachable = await serverReachable();
        confirmingRef.current = false;
        if (reachable) {
          // False alarm: the server is fine, individual requests were just slow.
          failCountRef.current = 0;
        } else {
          setOnlineState(false);
          startRecoveryPolling();
        }
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
      stopPolling();
    };
  }, [setOnlineState, startRecoveryPolling, stopPolling]);

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: online ? -80 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [online]);

  // Never rendered while online — zero visual impact on normal operation.
  if (online) return null;

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <SafeAreaView edges={["top"]}>
        <Animated.View style={styles.banner}>
          <Ionicons name="cloud-offline-outline" size={14} color="#fff" />
          <Text style={styles.text}>No internet connection</Text>
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  banner: {
    backgroundColor: "#ef4444",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: { paddingTop: 10 },
      android: { paddingTop: 12 },
    }),
  },
  text: { color: "#fff", fontSize: 12, fontWeight: "800" },
});
