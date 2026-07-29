/**
 * components/AppSidebar.tsx
 *
 * Desktop sidebar used by both the (tabs) layout AND the root Stack so it
 * persists across internal screens (dj-detail, captain detail, cart,
 * booking detail, etc.).
 *
 * Drives navigation via expo-router's router/pathname rather than the
 * Tabs navigator's internal state — that way it can render anywhere in
 * the tree without needing the navigator context.
 */

import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { usePathname, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useChat } from "../context/ChatContext";

export const SIDEBAR_BREAKPOINT = 900;
export const SIDEBAR_WIDTH = 240;

export const TABS = [
  { name: "index",    label: "Home",     icon: "home" as const,                iconOutline: "home-outline" as const,                href: "/(tabs)" },
  { name: "explore",  label: "Explore",  icon: "compass" as const,             iconOutline: "compass-outline" as const,             href: "/(tabs)/explore" },
  { name: "chats",    label: "Chats",    icon: "chatbubble-ellipses" as const, iconOutline: "chatbubble-ellipses-outline" as const, href: "/(tabs)/chats" },
  { name: "bookings", label: "Bookings", icon: "calendar" as const,            iconOutline: "calendar-outline" as const,            href: "/(tabs)/bookings" },
  { name: "profile",  label: "Profile",  icon: "person" as const,              iconOutline: "person-outline" as const,              href: "/(tabs)/profile" },
];

export default function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  let chatUnread = 0;
  try { const chat = useChat(); chatUnread = chat.totalUnread; } catch {}

  // Match the active tab against the path. We highlight any internal
  // screen rooted at /chat/ as the Chats tab, /my-bookings as Bookings,
  // etc., so the sidebar still feels anchored when the user is deep in.
  const segs = (pathname || "/").replace(/^\/+/, "").split("/");
  const head = segs[0] || "";
  const norm =
    head === "" ? "index"
    : head === "chat" ? "chats"
    : head === "my-bookings" ? "bookings"
    : head === "dj-detail" || head === "djs" || head === "captain" ? "explore"
    : head === "explore" || head === "chats" || head === "bookings" || head === "profile" ? head
    : "index";

  return (
    <View style={styles.sidebar}>
      <Pressable
        style={styles.sidebarBrand}
        onPress={() => router.push("/(tabs)" as any)}
      >
        <View style={styles.sidebarLogoDot} />
        <View>
          <Text style={styles.sidebarBrandName}>Basswala</Text>
          <Text style={styles.sidebarBrandSub}>DJ rental</Text>
        </View>
      </Pressable>

      <View style={{ height: 8 }} />

      {TABS.map((tab) => {
        const isFocused = norm === tab.name;
        const badge = tab.name === "chats" ? chatUnread : 0;
        return (
          <Pressable
            key={tab.name}
            onPress={() => router.push(tab.href as any)}
            style={[styles.sideItem, isFocused && styles.sideItemActive]}
          >
            {isFocused && <View style={styles.sideItemAccent} />}
            <Ionicons
              name={(isFocused ? tab.icon : tab.iconOutline) as any}
              size={20}
              color={isFocused ? "#02023E" : "#5b6877"}
            />
            <Text style={[styles.sideItemLabel, isFocused && styles.sideItemLabelActive]}>
              {tab.label}
            </Text>
            {badge > 0 && (
              <View style={styles.sideBadge}>
                <Text style={styles.sideBadgeText}>{badge > 99 ? "99+" : badge}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: "#ffffff",
    borderRightWidth: 1, borderRightColor: "#eef0f3",
    paddingVertical: 22, paddingHorizontal: 14,
  },
  sidebarBrand: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 10, paddingVertical: 12,
    marginBottom: 6,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  sidebarLogoDot: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#02023E" },
  sidebarBrandName: { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  sidebarBrandSub: { fontSize: 11, fontWeight: "600", color: "#8696a0", letterSpacing: 0.4, marginTop: 1 },

  sideItem: {
    position: "relative",
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, marginBottom: 2,
  },
  sideItemActive: { backgroundColor: "#eef0fa" },
  sideItemAccent: {
    position: "absolute", left: 4, top: 10, bottom: 10,
    width: 3, borderRadius: 2, backgroundColor: "#02023E",
  },
  sideItemLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: "#5b6877", letterSpacing: -0.1 },
  sideItemLabelActive: { color: "#02023E", fontWeight: "800" },
  sideBadge: {
    minWidth: 20, height: 20, paddingHorizontal: 6,
    borderRadius: 10, backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
  },
  sideBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
