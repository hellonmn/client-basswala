/**
 * components/SmartImage.tsx
 *
 * Drop-in Image replacement that shows a clean gradient placeholder with an
 * icon (+ optional label) instead of a stock photo when no source is available.
 *
 * Usage:
 *   <SmartImage uri={item.image} style={s.card} label={item.name} kind="dj" />
 *
 *   If `uri` is missing, empty, not a valid http(s) URL, or the remote image
 *   fails to load, the placeholder renders instead.
 */

import React, { useState } from "react";
import { Image, ImageStyle, StyleProp, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

type Kind = "dj" | "equipment" | "captain";

const KIND_CONFIG: Record<
  Kind,
  { icon: React.ComponentProps<typeof Ionicons>["name"]; colors: [string, string] }
> = {
  dj:        { icon: "image-outline", colors: ["#18181876", "#18181876"] },
  equipment: { icon: "hardware-chip", colors: ["#f59e0b", "#d97706"] },
  captain:   { icon: "storefront",    colors: ["#6366f1", "#4338ca"] },
};

function isValidUri(uri?: string | null): uri is string {
  if (!uri || typeof uri !== "string") return false;
  const trimmed = uri.trim();
  if (!trimmed) return false;
  return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("file://") || trimmed.startsWith("data:");
}

/**
 * Rewrite stale-host upload URLs to the current API host.
 *
 * Why: during dev, captains upload through ngrok and the URL persisted
 * to the DB looks like `https://abc.ngrok-free.app/uploads/...`. When
 * the user app (which hits production `server.basswala.com`) renders
 * that DJ later, the ngrok host is unreachable from the customer's
 * network and the image silently fails. We normalise any URL whose
 * path starts with `/uploads/` to the current API host so the file
 * resolves no matter which environment uploaded it.
 *
 * Cloudinary URLs and any other absolute URL with a non-`/uploads/`
 * path are returned untouched.
 */
function getApiOrigin(): string {
  // Same source the rest of the app uses; fall back to prod.
  const fromEnv = (process.env.EXPO_PUBLIC_API_BASE_URL || "").replace(/\/api\/?$/, "");
  if (fromEnv) return fromEnv;
  // Hardcoded fallback — keep in sync with services/userApi.ts.
  return "https://server.basswala.com";
}

export function normaliseUploadUrl(uri?: string | null): string | null {
  if (!uri || typeof uri !== "string") return uri ?? null;
  const u = uri.trim();
  if (!u) return null;
  // Relative path — prepend API origin.
  if (u.startsWith("/uploads/")) return `${getApiOrigin()}${u}`;
  // Absolute URL whose path contains /uploads/ → rewrite host.
  const match = u.match(/^https?:\/\/[^/]+(\/uploads\/.+)$/);
  if (match) return `${getApiOrigin()}${match[1]}`;
  return u;
}

export default function SmartImage({
  uri,
  style,
  kind = "dj",
  label,
  iconSize,
  showLabel = false,
}: {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  kind?: Kind;
  /** Displayed in the placeholder when showLabel is true */
  label?: string;
  /** Icon size override (auto-scales to thumbnail size otherwise) */
  iconSize?: number;
  /** Show label text under icon (only useful for large thumbnails) */
  showLabel?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // Reset failed state when the URI changes (e.g., when the component is recycled in FlatList)
  React.useEffect(() => {
    setFailed(false);
  }, [uri]);

  // Rewrite stale ngrok / cross-environment hosts before checking.
  const normalised = normaliseUploadUrl(uri);
  const valid = isValidUri(normalised) && !failed;

  if (valid) {
    return (
      <Image
        source={{ uri: normalised as string }}
        style={style}
        onError={() => setFailed(true)}
      />
    );
  }

  const cfg = KIND_CONFIG[kind];
  const initial = (label?.[0] ?? "").toUpperCase();

  return (
    <LinearGradient
      colors={cfg.colors}
      style={[styles.placeholder, style as any]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.inner}>
        <Ionicons
          name={cfg.icon}
          size={iconSize ?? 32}
          color="rgba(255,255,255,0.85)"
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
  },
  initial: {
    position: "absolute",
    fontSize: 32,
    fontWeight: "800",
    color: "rgba(255,255,255,0.12)",
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
    textAlign: "center",
  },
});
