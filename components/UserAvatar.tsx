/**
 * components/UserAvatar.tsx
 *
 * Reusable avatar that renders the user's profile picture if uploaded,
 * otherwise falls back to a gradient circle with their initials.
 *
 * Used in: home tab header, profile tab, edit profile screen, and anywhere
 * else we need a consistent representation of the signed-in user.
 *
 * Pass `uri` + first/last name strings; the component handles the rest.
 */

import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { normaliseUploadUrl } from "./SmartImage";

interface Props {
  uri?: string | null;
  firstName?: string;
  lastName?: string;
  size?: number;
  radius?: number;     // 0 → circle (defaults to size/2 if omitted, but we usually pass squircle radius)
  borderColor?: string;
  borderWidth?: number;
  textSize?: number;
}

const isHttp = (u?: string | null) =>
  !!u && (u.startsWith("http://") || u.startsWith("https://"));

export default function UserAvatar({
  uri,
  firstName = "",
  lastName = "",
  size = 40,
  radius,
  borderColor,
  borderWidth = 0,
  textSize,
}: Props) {
  const r = radius ?? Math.round(size * 0.35);
  const fontSize = textSize ?? Math.max(12, Math.round(size * 0.4));
  const initials = `${(firstName[0] || "?").toUpperCase()}${(lastName[0] || "").toUpperCase()}`.trim();

  // `failed` flips on Image.onError (404, CORS, expired Cloudinary asset)
  // so a broken URL silently degrades to the initials chip instead of a
  // grey broken-image icon. Reset whenever `uri` changes (e.g. user
  // uploads a new picture and AuthContext refreshes).
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: r,
    overflow: "hidden" as const,
    ...(borderWidth > 0 && {
      borderWidth,
      borderColor: borderColor || "#fff",
    }),
  };

  // Rewrite stale ngrok / cross-environment hosts so captain photos
  // uploaded in dev still load when fetched from production.
  const resolvedUri = normaliseUploadUrl(uri);
  if (isHttp(resolvedUri) && !failed) {
    return (
      <View style={baseStyle}>
        <Image
          source={{ uri: resolvedUri! }}
          style={styles.fill}
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={["#02023E", "#02023E"]}
      style={[baseStyle, styles.center]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <Text style={[styles.initialsText, { fontSize }]}>{initials || "?"}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  center: { alignItems: "center", justifyContent: "center" },
  initialsText: { color: "#fff", fontWeight: "800", letterSpacing: -0.5 },
});
