/**
 * components/CaptainAvatar.tsx — user app
 *
 * Single source of truth for how a captain's profile picture renders
 * across the user app: home tab cards, explore tab cards, captain
 * detail header, saved-DJs list, chat thread header, my-bookings, etc.
 *
 * Behaviour:
 *  - If `uri` is a real HTTP/HTTPS URL → render the image.
 *  - If the image FAILS to load (404, CORS, expired Cloudinary asset) →
 *    automatically fall back to the initials chip without leaving a
 *    broken icon on screen.
 *  - If `uri` is missing → render the initials chip directly.
 *
 * Centralising this means future changes (verified tick overlay, online
 * dot, ring colour) live in one file instead of being copy-pasted into
 * every screen.
 */

import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { normaliseUploadUrl } from "./SmartImage";

interface Props {
  uri?: string | null;
  /** Used to build initials when there's no uploaded picture. */
  name?: string;
  size?: number;
  /** Rounded square corner radius. Defaults to ~35% of size (squircle). */
  radius?: number;
  borderColor?: string;
  borderWidth?: number;
  textSize?: number;
}

const isHttp = (u?: string | null) =>
  !!u && (u.startsWith("http://") || u.startsWith("https://"));

function initialsOf(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase() || "?";
}

export default function CaptainAvatar({
  uri,
  name = "",
  size = 44,
  radius,
  borderColor,
  borderWidth = 0,
  textSize,
}: Props) {
  const r = radius ?? Math.round(size * 0.35);
  const fontSize = textSize ?? Math.max(12, Math.round(size * 0.4));

  // `failed` tracks Image.onError so a broken Cloudinary URL doesn't
  // leave a tiny grey icon — we silently flip to the initials chip.
  // Reset whenever the URI changes (e.g. captain uploaded a new pic
  // and AuthContext refreshed).
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);

  const base = {
    width: size,
    height: size,
    borderRadius: r,
    overflow: "hidden" as const,
    ...(borderWidth > 0 && {
      borderWidth,
      borderColor: borderColor || "#fff",
    }),
  };

  // Rewrite stale ngrok / cross-environment hosts before deciding
  // whether to render the image. Same helper used by SmartImage.
  const resolvedUri = normaliseUploadUrl(uri);
  if (isHttp(resolvedUri) && !failed) {
    return (
      <View style={base}>
        <Image
          source={{ uri: resolvedUri! }}
          style={s.fill}
          onError={() => setFailed(true)}
        />
      </View>
    );
  }

  return (
    <View style={[base, s.fallback]}>
      <Text style={[s.initials, { fontSize }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { width: "100%", height: "100%" },
  fallback: {
    backgroundColor: "#02023E",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { color: "#fff", fontWeight: "800", letterSpacing: -0.5 },
});
