/**
 * LocationLoadingScreen.tsx — Zepto-style location detection screen
 *
 * Design: big brand color block top, animated map pin with ripple waves,
 * bold hero text, shimmer skeleton chips showing upcoming "nearby DJs",
 * and a fat teal CTA. Error state keeps the same structure with a red pin.
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TouchableOpacity,
  Easing,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocation } from "@/context/LocationContext";

const { width: W, height: H } = Dimensions.get("window");

// ─── Ripple waves (Zepto-style radar pulse) ──────────────────────────────────

function RadarRings({ color = "#02023E" }: { color?: string }) {
  const rings = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = rings.map((ring, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 700),
          Animated.timing(ring, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(ring, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, []);

  return (
    <View style={s.ringContainer} pointerEvents="none">
      {rings.map((ring, i) => {
        const scale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.4] });
        const opacity = ring.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] });
        return (
          <Animated.View
            key={i}
            style={[s.ring, { borderColor: color, transform: [{ scale }], opacity }]}
          />
        );
      })}
    </View>
  );
}

// ─── Animated bouncing pin ───────────────────────────────────────────────────

function BouncePin({ color = "#fff" }: { color?: string }) {
  const y = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(y, {
          toValue: -10,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(y, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={{ transform: [{ translateY: y }] }}>
      <Ionicons name="location-sharp" size={56} color={color} />
    </Animated.View>
  );
}

// ─── Shimmer skeleton strip ──────────────────────────────────────────────────

function ShimmerRow() {
  const x = useRef(new Animated.Value(-W)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(x, {
        toValue: W,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, []);

  return (
    <View style={s.skeletonRow}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={s.skeletonCard}>
          <View style={s.skeletonImg}>
            <Animated.View style={[s.shimmer, { transform: [{ translateX: x }] }]}>
              <LinearGradient
                colors={["transparent", "rgba(255,255,255,0.6)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          </View>
          <View style={s.skeletonLine} />
          <View style={[s.skeletonLine, { width: "60%" }]} />
        </View>
      ))}
    </View>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function LocationLoadingScreen({
  onLocationReady,
}: {
  onLocationReady: () => void;
}) {
  const { location, isLoadingLocation, locationError, getCurrentLocation } =
    useLocation();

  const fadeY = useRef(new Animated.Value(24)).current;
  const fadeOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeOp, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(fadeY, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isLoadingLocation && location) {
      setTimeout(() => onLocationReady(), 500);
    }
  }, [isLoadingLocation, location]);

  // ── Error state ──
  if (locationError) {
    return (
      <View style={s.root}>
        <View style={s.heroErrorBlock}>
          <View style={s.ringContainerWrap}>
            <RadarRings color="#ef4444" />
            <View style={[s.pinPuck, s.pinPuckError]}>
              <Ionicons name="close-circle" size={56} color="#fff" />
            </View>
          </View>
        </View>

        <Animated.View style={[s.sheet, { opacity: fadeOp, transform: [{ translateY: fadeY }] }]}>
          <Text style={s.heroTitle}>Location blocked</Text>
          <Text style={s.heroSub}>
            We need your location to show DJs and gear available in your area.
          </Text>

          <View style={s.stepsCard}>
            <Step num="1" title="Allow location" desc="Tap the button below and grant access" />
            <Step num="2" title="Or set it manually" desc="Pick your city from the location picker" />
          </View>

          <TouchableOpacity onPress={getCurrentLocation} activeOpacity={0.9} style={s.ctaWrap}>
            <LinearGradient
              colors={["#5cf6f9", "#02023E"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.ctaGrad}
            >
              <Ionicons name="location" size={20} color="#fff" />
              <Text style={s.ctaText}>Enable location</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity onPress={onLocationReady} activeOpacity={0.7} style={s.ghostBtn}>
            <Ionicons name="map-outline" size={16} color="#02023E" />
            <Text style={s.ghostBtnText}>Set location manually</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  // ── Loading state ──
  return (
    <View style={s.root}>
      {/* Top brand block with radar + pin */}
      <LinearGradient
        colors={["#02023E", "#02023E"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={s.heroBlock}
      >
        <View style={s.ringContainerWrap}>
          <RadarRings color="#ffffff" />
          <View style={s.pinPuck}>
            <BouncePin />
          </View>
        </View>
      </LinearGradient>

      {/* Curved sheet below */}
      <Animated.View style={[s.sheet, { opacity: fadeOp, transform: [{ translateY: fadeY }] }]}>
        <View style={s.sheetHandle} />

        <Text style={s.heroTitle}>Finding your location</Text>
        <Text style={s.heroSub}>
          Hang tight — we're discovering DJs and gear around you.
        </Text>

        {/* Live status chip */}
        <View style={s.statusChip}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>Getting precise coordinates…</Text>
        </View>

        {/* Skeleton preview row */}
        <Text style={s.previewLabel}>Soon near you</Text>
        <ShimmerRow />

        <View style={s.privacyRow}>
          <Ionicons name="shield-checkmark" size={14} color="#02023E" />
          <Text style={s.privacyText}>Your location stays private</Text>
        </View>
      </Animated.View>
    </View>
  );
}

function Step({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <View style={s.stepRow}>
      <View style={s.stepNum}><Text style={s.stepNumText}>{num}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={s.stepTitle}>{title}</Text>
        <Text style={s.stepDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const HERO_H = Math.min(H * 0.38, 320);
const RING_WRAP = 220;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0fafa" },

  // Top teal block
  heroBlock: {
    height: HERO_H,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  heroErrorBlock: {
    height: HERO_H,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fef2f2",
    borderBottomWidth: 1,
    borderBottomColor: "#fecaca",
  },

  ringContainerWrap: {
    width: RING_WRAP,
    height: RING_WRAP,
    alignItems: "center",
    justifyContent: "center",
  },
  ringContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
  },

  // Pin puck
  pinPuck: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinPuckError: { backgroundColor: "#ef4444", borderColor: "#fca5a5" },

  // Curved sheet
  sheet: {
    flex: 1,
    marginTop: -28,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e7eb",
    marginBottom: 18,
  },

  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#101720",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    color: "#6B7A8A",
    lineHeight: 21,
    marginBottom: 18,
  },

  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: "#f0fafa",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#d0f0ef",
    marginBottom: 22,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: "#02023E",
  },
  statusText: { fontSize: 12, color: "#02023E", fontWeight: "700", letterSpacing: 0.2 },

  previewLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#8696a0",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  skeletonRow: { flexDirection: "row", gap: 10, marginBottom: 22 },
  skeletonCard: {
    flex: 1,
    backgroundColor: "#f4f6f9",
    borderRadius: 16,
    padding: 8,
  },
  skeletonImg: {
    height: 84,
    backgroundColor: "#e5e9f0",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 8,
  },
  shimmer: { ...StyleSheet.absoluteFillObject, width: "50%" },
  skeletonLine: {
    height: 8,
    backgroundColor: "#e5e9f0",
    borderRadius: 4,
    marginTop: 6,
  },

  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "center",
    marginTop: "auto",
    marginBottom: Platform.OS === "ios" ? 32 : 20,
  },
  privacyText: { fontSize: 12, color: "#6B7A8A", fontWeight: "500" },

  // Error — steps
  stepsCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eef0f3",
    marginBottom: 22,
    gap: 14,
  },
  stepRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  stepNum: {
    width: 28, height: 28, borderRadius: 10,
    backgroundColor: "#02023E",
    alignItems: "center", justifyContent: "center",
  },
  stepNumText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  stepTitle: { fontSize: 14, fontWeight: "700", color: "#101720" },
  stepDesc: { fontSize: 12, color: "#6B7A8A", marginTop: 2 },

  // CTA
  ctaWrap: {
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
    shadowColor: "#02023E",
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  ctaText: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: 0.3 },

  ghostBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  ghostBtnText: { fontSize: 14, color: "#02023E", fontWeight: "700" },
});
