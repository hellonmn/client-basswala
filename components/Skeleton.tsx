/**
 * components/Skeleton.tsx
 *
 * Lightweight shimmer placeholders for loading states. A single pulsing
 * opacity animation (native driver) drives all boxes — cheap and smooth.
 *
 * Usage:
 *   <SkeletonBox w="60%" h={14} radius={7} />
 *   <FeaturedDJSkeleton />   // matches the Home featured-DJ card
 *   <CaptainCardSkeleton />  // matches the Home Top-Captains card
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from "react-native";

export function SkeletonBox({
  w,
  h,
  radius = 8,
  style,
}: {
  w?: number | string;
  h?: number | string;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 750, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.9] });
  return (
    <Animated.View
      style={[
        { width: w as any, height: h as any, borderRadius: radius, backgroundColor: "#e3e8f0", opacity },
        style,
      ]}
    />
  );
}

/** Featured-DJ card placeholder — same footprint as the real card. */
export function FeaturedDJSkeleton({ width }: { width: number }) {
  return (
    <View style={[sk.featured, { width }]}>
      <SkeletonBox w="55%" h={16} radius={6} style={{ marginBottom: 8 }} />
      <SkeletonBox w="80%" h={22} radius={7} style={{ marginBottom: 14 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 14 }}>
        <SkeletonBox w={70} h={14} radius={6} />
        <SkeletonBox w={50} h={14} radius={6} />
      </View>
      <SkeletonBox w="100%" h={40} radius={13} />
    </View>
  );
}

/** Top-Captains card placeholder. */
export function CaptainCardSkeleton() {
  return (
    <View style={sk.captain}>
      <SkeletonBox w={56} h={56} radius={18} style={{ marginBottom: 10 }} />
      <SkeletonBox w="70%" h={13} radius={6} style={{ marginBottom: 7 }} />
      <SkeletonBox w="45%" h={11} radius={5} />
    </View>
  );
}

const sk = StyleSheet.create({
  featured: {
    height: 215,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e9f1",
    padding: 12,
    justifyContent: "flex-end",
  },
  captain: {
    width: 150,
    borderRadius: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e9f1",
    padding: 14,
  },
});
