import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import PressableScale from "./PressableScale";
import { BORDER_RADIUS, COLORS, FONT_SIZES, FONT_WEIGHTS, SHADOWS, SPACING } from "../constants/theme";

export interface BannerCardData {
  id: number;
  imageUrl: string;
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaLink?: string;
}

interface Props {
  banner: BannerCardData;
  width: number;
  height?: number;
  onPress?: () => void;
}

export default function BannerCard({ banner, width, height = 160, onPress }: Props) {
  const hasOverlay = !!(banner.title || banner.subtitle || banner.ctaLabel);
  return (
    <PressableScale
      style={[s.card, { width, height }]}
      scaleTo={0.97}
      disabled={!onPress}
      onPress={onPress}
    >
      <Image source={{ uri: banner.imageUrl }} style={s.img} resizeMode="cover" />

      {hasOverlay && (
        <>
          <LinearGradient
            colors={["rgba(2,2,62,0)", "rgba(2,2,62,0.6)", "rgba(2,2,62,0.9)"]}
            locations={[0, 0.5, 1]}
            style={s.scrim}
            pointerEvents="none"
          />
          <View style={s.overlay}>
            <View style={s.textCol}>
              {banner.title ? (
                <Text style={s.title} numberOfLines={1}>{banner.title}</Text>
              ) : null}
              {banner.subtitle ? (
                <Text style={s.subtitle} numberOfLines={2}>{banner.subtitle}</Text>
              ) : null}
            </View>
            {banner.ctaLabel ? (
              <View style={s.cta}>
                <Text style={s.ctaText}>{banner.ctaLabel}</Text>
                <Ionicons name="arrow-forward-circle" size={16} color={COLORS.accent} />
              </View>
            ) : null}
          </View>
        </>
      )}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: "hidden",
    backgroundColor: COLORS.primaryDark,
    ...SHADOWS.medium,
  },
  img: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "75%",
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.md,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textInverted,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    color: "rgba(255, 255, 255, 0.88)",
    fontWeight: FONT_WEIGHTS.medium,
    marginTop: 2,
    lineHeight: 16,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.primary,
    borderColor: 'rgba(6, 243, 249, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: BORDER_RADIUS.pill,
    ...SHADOWS.soft,
  },
  ctaText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textInverted,
    letterSpacing: 0.2,
  },
});

