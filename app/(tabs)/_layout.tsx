import { Ionicons } from "@expo/vector-icons";
import { Tabs, usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Platform, Pressable, StyleSheet, Text, UIManager, useWindowDimensions, View } from "react-native";
import { useChat } from "../../context/ChatContext";
import { GlassView } from "expo-glass-effect";
import * as Haptics from "expo-haptics";

const hasGlassEffect = 
  UIManager.getViewManagerConfig("ExpoGlassEffect") != null || 
  UIManager.getViewManagerConfig("GlassView") != null;

function GlassContainer({ children, style }: { children: React.ReactNode; style: any }) {
  if (hasGlassEffect) {
    return <GlassView style={style}>{children}</GlassView>;
  }
  // Safe layout fallback for devices that haven't been rebuilt with the native iOS pod yet
  return (
    <View style={[style, { backgroundColor: Platform.OS === "ios" ? "rgba(240, 240, 245, 0.85)" : "#ffffff" }]}>
      {children}
    </View>
  );
}


const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Breakpoint above which we switch the tab bar to a left-side rail.
// 900px lets it kick in at laptop / iPad-landscape sizes.
const SIDEBAR_BREAKPOINT = 900;
const SIDEBAR_WIDTH = 240;

const TABS = [
  { name: "index",     label: "Home",      icon: "home",              iconOutline: "home-outline" },
  { name: "explore",   label: "Explore",   icon: "compass",           iconOutline: "compass-outline" },
  { name: "chats",     label: "Chats",     icon: "chatbubble-ellipses", iconOutline: "chatbubble-ellipses-outline" },
  { name: "bookings",  label: "Bookings",  icon: "calendar",          iconOutline: "calendar-outline" },
  { name: "profile",   label: "Profile",   icon: "person",            iconOutline: "person-outline" },
];

const BAR_H = 64;
const BAR_SIDE_PAD = 16;
const BAR_WIDTH = SCREEN_WIDTH - BAR_SIDE_PAD * 2;

function TabButton({
  tab,
  isFocused,
  onPress,
  onLongPress,
  badge,
}: {
  tab: (typeof TABS)[number];
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  badge?: number;
}) {
  const progress = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const squish = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: false,
      tension: 140,
      friction: 10,
    }).start();
  }, [isFocused]);

  const handlePressIn = () => {
    Animated.spring(squish, {
      toValue: 1,
      useNativeDriver: false,
      tension: 220,
      friction: 14,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(squish, {
      toValue: 0,
      useNativeDriver: false,
      tension: 160,
      friction: 6,
    }).start();
  };

  const pillBg = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255, 255, 255, 0)", "rgba(2, 2, 62, 0.08)"],
  });
  const pillBorderColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["rgba(255, 255, 255, 0)", "rgba(2, 2, 62, 0.15)"],
  });
  const labelMaxW = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 72] });
  const labelOp = progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0, 1] });

  const baseScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  const scaleX = Animated.multiply(
    baseScale,
    squish.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })
  );
  const scaleY = Animated.multiply(
    baseScale,
    squish.interpolate({ inputRange: [0, 1], outputRange: [1, 0.85] })
  );

  const handlePress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
    onPress();
  };

  return (
    <Pressable 
      onPress={handlePress} 
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={onLongPress} 
      style={styles.tabBtn} 
      android_ripple={null}
    >
      <View style={{ position: "relative" }}>
        <Animated.View style={[
          styles.pill,
          { 
            backgroundColor: pillBg, 
            borderColor: pillBorderColor,
            transform: [
              { scaleX },
              { scaleY }
            ] 
          }
        ]}>
          <Animated.View style={{ transform: [{ scale: 1 }] }}>
            <Ionicons
              name={(isFocused ? tab.icon : tab.iconOutline) as any}
              size={21}
              color={isFocused ? "#02023E" : "#8696a0"}
            />
          </Animated.View>
          <Animated.View style={{ maxWidth: labelMaxW, overflow: "hidden" }}>
            <Animated.Text style={[styles.tabLabel, { opacity: labelOp, color: isFocused ? "#02023E" : "#8696a0" }]} numberOfLines={1}>
              {" "}{tab.label}
            </Animated.Text>
          </Animated.View>
        </Animated.View>
        {badge != null && badge > 0 && (
          <View style={styles.tabBadge}>
            <Text style={styles.tabBadgeText}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: any) {
  let chatUnread = 0;
  try { const chat = useChat(); chatUnread = chat.totalUnread; } catch { /* ChatProvider might not be mounted yet */ }

  return (
    <View style={styles.barWrapper} pointerEvents="box-none">
      <GlassContainer
        style={styles.barBlur}
      >
        <View style={styles.bar}>
          {state.routes.map((route: any, index: number) => {
            const isFocused = state.index === index;
            const tab = TABS.find(t => t.name === route.name) ?? TABS[0];
            return (
              <TabButton
                key={route.key}
                tab={tab}
                isFocused={isFocused}
                badge={route.name === "chats" ? chatUnread : undefined}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
              />
            );
          })}
        </View>
      </GlassContainer>
    </View>
  );
}

export default function TabLayout() {
  const { width } = useWindowDimensions();
  // Sidebar now lives at the root layout level, so here we just need to
  // know whether to hide the floating bottom tab bar (desktop) or show
  // it (mobile / narrow web).
  const useSidebar = Platform.OS === "web" && width >= SIDEBAR_BREAKPOINT;

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={useSidebar ? () => null : (props) => <CustomTabBar {...props} />}
    >
      {TABS.map((tab) => <Tabs.Screen key={tab.name} name={tab.name} />)}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  barWrapper: {
    position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center",
    paddingBottom: Platform.select({ ios: 28, android: 14, default: 14 }),
    paddingHorizontal: BAR_SIDE_PAD,
  },
  barBlur: {
    borderRadius: 28,
    overflow: "hidden",
    width: BAR_WIDTH,
    height: BAR_H,
    borderWidth: 1.5,
    borderColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.35)" : "#eef0f3",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08, shadowRadius: 18, elevation: 8,
  },
  bar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-evenly",
    height: "100%", width: "100%",
    paddingHorizontal: 8,
    backgroundColor: Platform.OS === "ios" ? "rgba(255, 255, 255, 0.22)" : "rgba(255, 255, 255, 0.85)",
  },
  tabBtn: { flex: 1, alignItems: "center", justifyContent: "center", height: BAR_H },
  pill: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    borderWidth: 1,
    // ELEVATED BUBBLE SHADOW
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  tabLabel: { fontSize: 12, fontWeight: "700", letterSpacing: -0.2, flexShrink: 0 },
  tabBadge: {
    position: "absolute", top: -4, right: -6,
    backgroundColor: "#ef4444", borderRadius: 10,
    minWidth: 18, height: 18, paddingHorizontal: 4,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
    zIndex: 10,
  },
  tabBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // ── Desktop sidebar ────────────────────────────────────────────────
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
  sidebarLogoDot: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "#02023E",
  },
  sidebarBrandName: {
    fontSize: 16, fontWeight: "800", color: "#101720",
    letterSpacing: -0.3,
  },
  sidebarBrandSub: {
    fontSize: 11, fontWeight: "600", color: "#8696a0",
    letterSpacing: 0.4, marginTop: 1,
  },

  sideItem: {
    position: "relative",
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 2,
  },
  sideItemActive: {
    backgroundColor: "#eef0fa",
  },
  sideItemAccent: {
    position: "absolute",
    left: 4, top: 10, bottom: 10,
    width: 3, borderRadius: 2,
    backgroundColor: "#02023E",
  },
  sideItemLabel: {
    flex: 1,
    fontSize: 14, fontWeight: "600", color: "#5b6877",
    letterSpacing: -0.1,
  },
  sideItemLabelActive: {
    color: "#02023E", fontWeight: "800",
  },
  sideBadge: {
    minWidth: 20, height: 20, paddingHorizontal: 6,
    borderRadius: 10, backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
  },
  sideBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  // Reserved for future tweaks
  sidebarMount: { position: "absolute", left: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH },
});