/**
 * components/BannerCard.tsx
 *
 * Shared promo-banner card used on both Home and Explore tabs. Pulls from
 * the admin-managed Banner model (image + optional title / subtitle / CTA).
 *
 * Visual recipe:
 *   - Image fills the card.
 *   - A bottom gradient overlay guarantees text readability over any image.
 *   - Title + subtitle stack on the left, CTA pill sits on the right.
 *   - CTA pill uses the brand navy (#02023E) with white text — readable
 *     contrast in every theme. (The old version used dark text on navy
 *     background, which was unreadable.)
 */
import React from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

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

export default function BannerCard({ banner, width, height = 150, onPress }: Props) {
  const hasOverlay = !!(banner.title || banner.subtitle || banner.ctaLabel);
  return (
    <TouchableOpacity
      style={[s.card, { width, height }]}
      activeOpacity={onPress ? 0.92 : 1}
      onPress={onPress}
    >
      <Image source={{ uri: banner.imageUrl }} style={s.img} />

      {hasOverlay && (
        <>
          {/* Dark gradient bottom-up so any image still shows readable text */}
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(2,2,30,0.65)", "rgba(2,2,30,0.85)"]}
            locations={[0, 0.55, 1]}
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
                <Ionicons name="arrow-forward" size={12} color="#fff" />
              </View>
            ) : null}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#0F1626",
  },
  img: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  scrim: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: "70%",
  },
  overlay: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  textCol: { flex: 1 },
  title: {
    fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12.5, color: "rgba(255,255,255,0.92)",
    fontWeight: "500", marginTop: 3, lineHeight: 17,
  },
  cta: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#02023E",
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999,
  },
  ctaText: {
    fontSize: 12, fontWeight: "800", color: "#fff", letterSpacing: 0.2,
  },
});
