/**
 * components/OpenInAppBanner.tsx
 *
 * Sticky banner shown ONLY on the mobile web build of the user app.
 * Detects if the user landed on a deep-linkable route (captain profile,
 * dj-detail, equipment) and offers them a one-tap "Open in app" button.
 *
 * Behavior:
 *  - Hidden on native (`Platform.OS !== "web"`).
 *  - Hidden on desktop browsers (only mobile UAs see it).
 *  - Tap "Open app" → opens the deep link `basswala://<path>`. If the app
 *    isn't installed, falls back to Play Store / App Store after 1.5s.
 *  - "Continue on web" dismiss is remembered for 7 days via localStorage.
 *
 * Mount once near the top of `_layout.tsx` (sibling to OfflineBanner).
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";

const APP_SCHEME = "basswala";
const ANDROID_PACKAGE = "com.basswala.app";
// TODO: replace with the real numeric App Store ID once iOS app is published.
const IOS_APP_ID = "0000000000";
const PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const APP_STORE_URL = `https://apps.apple.com/app/id${IOS_APP_ID}`;

const STORAGE_KEY = "basswala:open-in-app-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Routes where the deep link makes sense — opening the home tab via the app
// works too, but the banner is more compelling on a shared content URL.
const DEEP_LINK_PATHS = [/^\/captain\/\d+/, /^\/dj-detail/, /^\/equipment\//];

function isMobileUA(ua: string): boolean {
  if (!ua) return false;
  const u = ua.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/.test(u) && !/macintosh|windows nt/.test(u);
}

function getOSFromUA(ua: string): "ios" | "android" | null {
  const u = (ua || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(u)) return "ios";
  if (/android/.test(u)) return "android";
  return null;
}

export default function OpenInAppBanner() {
  const [visible, setVisible] = useState(false);
  const [path, setPath] = useState("");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    // Mobile only — desktop users almost certainly don't have the app.
    if (!isMobileUA(navigator.userAgent || "")) return;

    // Recently dismissed → don't pester.
    try {
      const dismissedAt = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;
    } catch {}

    const here = window.location.pathname + window.location.search;
    const isDeepLinkable = DEEP_LINK_PATHS.some((re) => re.test(window.location.pathname));
    if (!isDeepLinkable) return;

    setPath(here);
    setVisible(true);
  }, []);

  if (Platform.OS !== "web" || !visible) return null;

  const handleOpenApp = () => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent || "";
    const os = getOSFromUA(ua);

    // Universal/App-link friendly: same https URL the user is on. iOS and
    // verified Android Chrome will route directly to the installed app.
    // For unverified Android we also fire the custom-scheme link as fallback.
    const httpsUrl = window.location.href;
    const schemeUrl = `${APP_SCHEME}:/${path}`;

    // Track whether the page lost focus (= app probably opened)
    const start = Date.now();
    const onVis = () => {
      if (document.hidden) cleanup();
    };
    const cleanup = () => {
      clearTimeout(fallbackTimer);
      document.removeEventListener("visibilitychange", onVis);
    };
    document.addEventListener("visibilitychange", onVis);

    // Prefer the universal link (same https URL) — OS handles it.
    // If the app isn't installed, the OS keeps the user on the page;
    // after 1.5s with no visibility change, we send them to the store.
    try { window.location.href = httpsUrl; } catch {}

    // Android-only nudge — try the custom scheme too in case App Links
    // aren't verified yet (.well-known/assetlinks.json missing or wrong).
    if (os === "android") {
      setTimeout(() => {
        if (!document.hidden) {
          try { window.location.href = schemeUrl; } catch {}
        }
      }, 250);
    }

    const fallbackTimer = setTimeout(() => {
      // If we're still here, the app didn't open — go to the store.
      if (!document.hidden && Date.now() - start > 1300) {
        const storeUrl = os === "ios" ? APP_STORE_URL : os === "android" ? PLAY_URL : null;
        if (storeUrl) window.location.href = storeUrl;
      }
      cleanup();
    }, 1500);
  };

  const handleDismiss = () => {
    try { window.localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  return (
    <View style={s.banner} pointerEvents="box-none">
      <View style={s.iconWrap}>
        <Image source={require("../assets/images/logo.png")} style={s.logo} resizeMode="contain" />
      </View>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={s.title}>Open in Basswala app</Text>
        <Text style={s.sub} numberOfLines={1}>
          Faster, with notifications and saved location.
        </Text>
      </View>
      <Pressable style={s.openBtn} onPress={handleOpenApp}>
        <Text style={s.openBtnText}>Open</Text>
      </Pressable>
      <Pressable style={s.closeBtn} onPress={handleDismiss} hitSlop={10}>
        <Ionicons name="close" size={18} color="#8696a0" />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
    gap: 10,
    zIndex: 9999,
    // Subtle shadow to lift it above page content
    shadowColor: "#101720", shadowOpacity: 0.06,
    shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: "#f0fffe",
    borderWidth: 1, borderColor: "#a5f3fc",
    alignItems: "center", justifyContent: "center",
  },
  logo: { width: 24, height: 24 },
  title: { fontSize: 13, fontWeight: "800", color: "#101720", letterSpacing: -0.2 },
  sub: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 1 },
  openBtn: {
    backgroundColor: "#02023E",
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 999,
  },
  openBtnText: { fontSize: 13, fontWeight: "800", color: "#ffffff", letterSpacing: 0.2 },
  closeBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
});
