import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useChat } from "../../context/ChatContext";
import * as Haptics from "expo-haptics";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// Breakpoint above which we switch the tab bar to a left-side rail.
const SIDEBAR_BREAKPOINT = 900;
const SIDEBAR_WIDTH = 240;

const TABS = [
  { name: "index",     label: "Home",      icon: "home",              iconOutline: "home-outline" },
  { name: "explore",   label: "Explore",   icon: "compass",           iconOutline: "compass-outline" },
  { name: "chats",     label: "Chats",     icon: "chatbubble-ellipses", iconOutline: "chatbubble-ellipses-outline" },
  { name: "bookings",  label: "Bookings",  icon: "calendar",          iconOutline: "calendar-outline" },
  { name: "profile",   label: "Profile",   icon: "person",            iconOutline: "person-outline" },
];

const BAR_H = 74;
const BAR_SIDE_PAD = 16;
const BAR_WIDTH = Math.min(SCREEN_WIDTH - BAR_SIDE_PAD * 2, 480);

// Basswala brand colors for black navbar
const ACTIVE_TEXT_COLOR = "#05EAF7";
const INACTIVE_COLOR = "#8696A0";

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
  const scaleAnim = useRef(new Animated.Value(isFocused ? 1 : 0.94)).current;
  const pillBgAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: isFocused ? 1 : 0.94,
        useNativeDriver: true,
        tension: 180,
        friction: 12,
      }),
      Animated.timing(pillBgAnim, {
        toValue: isFocused ? 1 : 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [isFocused]);

  const handlePress = () => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch (_) {}
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      style={styles.tabBtn}
      android_ripple={null}
    >
      <Animated.View style={[styles.tabContent, { transform: [{ scale: scaleAnim }] }]}>
        {/* Basswala cyan pill marks the active tab */}
        {isFocused ? (
          <LinearGradient
            colors={["#05EAF7", "#00B4D8"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconPillActive}
          >
            <Ionicons
              name={tab.icon as any}
              size={22}
              color="#01011A"
            />
            {badge != null && badge > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{badge > 99 ? "99+" : badge}</Text>
              </View>
            )}
          </LinearGradient>
        ) : (
          <View style={styles.iconPillInactive}>
            <Ionicons
              name={tab.iconOutline as any}
              size={22}
              color={INACTIVE_COLOR}
            />
            {badge != null && badge > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{badge > 99 ? "99+" : badge}</Text>
              </View>
            )}
          </View>
        )}

        {/* Tab Text Label */}
        <Text
          style={[
            styles.tabLabel,
            isFocused ? styles.tabLabelActive : styles.tabLabelInactive,
          ]}
          numberOfLines={1}
        >
          {tab.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function CustomTabBar({ state, navigation }: any) {
  let chatUnread = 0;
  try { const chat = useChat(); chatUnread = chat.totalUnread; } catch { /* ChatProvider fallback */ }

  return (
    <View style={styles.barWrapper} pointerEvents="box-none">
      {/* Sleek Black Navbar Container */}
      <LinearGradient
        colors={["#0B0F19", "#01011A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.barContainer}
      >
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
      </LinearGradient>
    </View>
  );
}

export default function TabLayout() {
  const { width } = useWindowDimensions();
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
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: Platform.select({ ios: 24, android: 12, default: 12 }),
    paddingHorizontal: BAR_SIDE_PAD,
  },
  barContainer: {
    flexDirection: "row",
    alignItems: "center",
    justify.content: "space-around",
    width: BAR_WIDTH,
    height: BAR_H,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 12,
    paddingHorizontal: 8,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justify.content: "center",
    height: "100%",
  },
  tabContent: {
    alignItems: "center",
    justify.content: "center",
  },
  iconPillActive: {
    width: 48,
    height: 32,
    borderRadius: 18,
    alignItems: "center",
    justify.content: "center",
    position: "relative",
    shadowColor: "#05EAF7",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  iconPillInactive: {
    width: 48,
    height: 32,
    borderRadius: 18,
    alignItems: "center",
    justify.content: "center",
    position: "relative",
    backgroundColor: "transparent",
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
  },
  tabLabelActive: {
    color: ACTIVE_TEXT_COLOR,
    fontWeight: "700",
  },
  tabLabelInactive: {
    color: INACTIVE_COLOR,
    fontWeight: "600",
  },
  tabBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: "center",
    justify.content: "center",
    borderWidth: 1.5,
    borderColor: "#01011A",
    zIndex: 10,
  },
  tabBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
});
