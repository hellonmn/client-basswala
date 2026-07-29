/**
 * app/(auth)/splash.tsx — Basswala Splash Screen
 *
 * Design matches login screen:
 *  - Same #f0fafa teal-tinted background
 *  - Same scrolling emoji tile rows (4 rows: 2 top, 2 bottom)
 *  - Same 4-directional fade overlays
 *  - Same logo mark (teal gradient + ring + B)
 *  - Audio bar loader instead of spinner
 *  - Staggered fade-in animations for logo → name → tagline → bars
 */

import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const { width: W, height: H } = Dimensions.get("window");

// ─── Tile data (mirrors login screen exactly) ─────────────────────────────────

const ROW1_ITEMS = [
  { emoji: "🎧", bg: "#e8fafa" },
  { emoji: "🎤", bg: "#f0f4ff" },
  { emoji: "🎸", bg: "#fdf0fa" },
  { emoji: "�?", bg: "#fff8e8" },
  { emoji: "🎹", bg: "#e8fafa" },
  { emoji: "🔊", bg: "#f0f4ff" },
];
const ROW2_ITEMS = [
  { emoji: "🎺", bg: "#fdf0fa" },
  { emoji: "🎷", bg: "#e8fafa" },
  { emoji: "🎵", bg: "#fff8e8" },
  { emoji: "🎶", bg: "#f0f4ff" },
  { emoji: "💿", bg: "#fdf0fa" },
  { emoji: "🎙�?", bg: "#e8fafa" },
];
const ROW3_ITEMS = [
  { emoji: "🎹", bg: "#e8fafa" },
  { emoji: "�?", bg: "#fff8e8" },
  { emoji: "🎧", bg: "#f0f4ff" },
  { emoji: "🎷", bg: "#fdf0fa" },
  { emoji: "🔊", bg: "#e8fafa" },
  { emoji: "🎸", bg: "#f0f4ff" },
];
const ROW4_ITEMS = [
  { emoji: "🎶", bg: "#fff8e8" },
  { emoji: "🎤", bg: "#fdf0fa" },
  { emoji: "🎙�?", bg: "#e8fafa" },
  { emoji: "🎵", bg: "#f0f4ff" },
  { emoji: "💿", bg: "#fff8e8" },
  { emoji: "🎺", bg: "#fdf0fa" },
];

const TILE_SIZE = 72;
const TILE_GAP = 12;
const TILE_STEP = TILE_SIZE + TILE_GAP;

const DUPED_ROW1 = [...ROW1_ITEMS, ...ROW1_ITEMS, ...ROW1_ITEMS];
const DUPED_ROW2 = [...ROW2_ITEMS, ...ROW2_ITEMS, ...ROW2_ITEMS];
const DUPED_ROW3 = [...ROW3_ITEMS, ...ROW3_ITEMS, ...ROW3_ITEMS];
const DUPED_ROW4 = [...ROW4_ITEMS, ...ROW4_ITEMS, ...ROW4_ITEMS];

const LOOP_W1 = ROW1_ITEMS.length * TILE_STEP;
const LOOP_W2 = ROW2_ITEMS.length * TILE_STEP;
const LOOP_W3 = ROW3_ITEMS.length * TILE_STEP;
const LOOP_W4 = ROW4_ITEMS.length * TILE_STEP;

// ─── Scrolling tile row ───────────────────────────────────────────────────────

function ScrollingRow({
  items,
  loopWidth,
  direction,
  duration,
}: {
  items: { emoji: string; bg: string }[];
  loopWidth: number;
  direction: "ltr" | "rtl";
  duration: number;
}) {
  const tx = useRef(
    new Animated.Value(direction === "ltr" ? 0 : -loopWidth)
  ).current;

  useEffect(() => {
    tx.setValue(direction === "ltr" ? 0 : -loopWidth);
    const anim = Animated.loop(
      Animated.timing(tx, {
        toValue: direction === "ltr" ? -loopWidth : 0,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={{ overflow: "hidden" }}>
      <Animated.View
        style={{
          flexDirection: "row",
          transform: [{ translateX: tx }],
          paddingLeft: TILE_GAP,
        }}
      >
        {items.map((item, i) => (
          <View key={i} style={[s.tile, { backgroundColor: item.bg }]}>
            <Text style={s.tileEmoji}>{item.emoji}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

// ─── Audio bar loader ─────────────────────────────────────────────────────────

const BAR_HEIGHTS = [10, 18, 14, 20, 12, 16, 8];
const BAR_DELAYS  = [0, 100, 200, 50, 150, 250, 80];

function AudioBars({ opacity }: { opacity: Animated.Value }) {
  const anims = useRef(BAR_HEIGHTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(BAR_DELAYS[i]),
          Animated.timing(anim, {
            toValue: 1,
            duration: 400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 400,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <Animated.View style={[s.barsRow, { opacity }]}>
      {anims.map((anim, i) => {
        const maxH = BAR_HEIGHTS[i];
        const scaleY = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.35, 1],
        });
        return (
          <Animated.View
            key={i}
            style={[
              s.bar,
              {
                height: maxH,
                transform: [{ scaleY }],
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

// ─── Main splash screen ───────────────────────────────────────────────────────

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Animation values
  const exitOpacity  = useRef(new Animated.Value(1)).current;
  const logoOpacity  = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.88)).current;
  const nameOpacity  = useRef(new Animated.Value(0)).current;
  const tagOpacity   = useRef(new Animated.Value(0)).current;
  const barsOpacity  = useRef(new Animated.Value(0)).current;
  const logoPulse    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Logo fades + springs in
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 55,
        friction: 11,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Brand name
    setTimeout(() => {
      Animated.timing(nameOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }, 250);

    // 3. Tagline
    setTimeout(() => {
      Animated.timing(tagOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 500);

    // 4. Audio bars
    setTimeout(() => {
      Animated.timing(barsOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start();
    }, 700);

    // 5. Logo pulse loop
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(logoPulse, {
          toValue: 1.05,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(logoPulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    setTimeout(() => pulse.start(), 800);

    // 6. Fade out and navigate — already-signed-in users skip the login screen
    setTimeout(() => {
      Animated.timing(exitOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (isAuthenticated) {
          router.replace("/(tabs)" as any);
        } else {
          router.replace("/(auth)/login");
        }
      });
    }, 2800);

    return () => pulse.stop();
  }, [isAuthenticated]);

  return (
    <Animated.View style={[s.root, { opacity: exitOpacity }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f0fafa" translucent={false} />

      {/* ── Tile background ── */}
      <View style={s.tileZone} pointerEvents="none">
        {/* Top pair */}
        <View style={s.topRows}>
          <ScrollingRow items={DUPED_ROW1} loopWidth={LOOP_W1} direction="ltr" duration={14000} />
          <View style={{ height: TILE_GAP }} />
          <ScrollingRow items={DUPED_ROW2} loopWidth={LOOP_W2} direction="rtl" duration={11000} />
        </View>

        {/* Bottom pair */}
        <View style={s.bottomRows}>
          <ScrollingRow items={DUPED_ROW3} loopWidth={LOOP_W3} direction="ltr" duration={13000} />
          <View style={{ height: TILE_GAP }} />
          <ScrollingRow items={DUPED_ROW4} loopWidth={LOOP_W4} direction="rtl" duration={10000} />
        </View>

        {/* Fades */}
        <LinearGradient
          colors={["#f0fafa", "#f0fafa", "transparent"]}
          style={s.fadeTop}
          pointerEvents="none"
        />
        <LinearGradient
          colors={["transparent", "#f0fafa", "#f0fafa"]}
          style={s.fadeBottom}
          pointerEvents="none"
        />
      </View>

      {/* ── Centre content ── */}
      <View style={s.centre}>
        {/* Logo */}
        <Animated.View
          style={[
            s.logoWrap,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <Animated.View style={{ transform: [{ scale: logoPulse }] }}>
            <Image
              source={require("../../assets/images/logo.png")}
              style={s.logoImg}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>

        {/* Brand name */}
        <Animated.Text style={[s.brandName, { opacity: nameOpacity }]}>
          basswala
        </Animated.Text>

        {/* Tagline */}
        <Animated.Text style={[s.tagline, { opacity: tagOpacity }]}>
          rent · play · perform
        </Animated.Text>

        {/* Audio bar loader */}
        <AudioBars opacity={barsOpacity} />
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TOP_ROWS_TOP    = H * 0.06;
const BOTTOM_ROWS_BOT = H * 0.06;
const ROW_BLOCK_H     = TILE_SIZE * 2 + TILE_GAP;

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f0fafa",
    alignItems: "center",
    justifyContent: "center",
  },

  // Tile layout
  tileZone: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  topRows: {
    position: "absolute",
    top: TOP_ROWS_TOP,
    left: 0,
    right: 0,
  },
  bottomRows: {
    position: "absolute",
    bottom: BOTTOM_ROWS_BOT,
    left: 0,
    right: 0,
  },

  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: TILE_GAP,
  },
  tileEmoji: { fontSize: 30 },

  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: TOP_ROWS_TOP + ROW_BLOCK_H * 0.6,
    zIndex: 2,
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: BOTTOM_ROWS_BOT + ROW_BLOCK_H * 0.6,
    zIndex: 2,
  },

  // Centre
  centre: {
    alignItems: "center",
    zIndex: 10,
  },

  // Logo
  logoWrap: {
    marginBottom: 28,
    shadowColor: "#02023E",
    shadowOpacity: 0.32,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  logoImg: { width: 108, height: 108 },

  // Text
  brandName: {
    fontSize: 32,
    fontWeight: "300",
    color: "#101720",
    letterSpacing: 5,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 11,
    fontWeight: "500",
    color: "#8696a0",
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 36,
  },

  // Audio bars
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 22,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: "#02023E",
  },
});