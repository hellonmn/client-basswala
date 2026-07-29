/**
 * components/ResponsiveWebShell.tsx
 *
 * Lightweight responsive wrapper for the web target only — pass-through
 * on native. Does NOT constrain content to a phone column. Instead it:
 *
 *   - Ensures the document body fills the viewport with the app's bg.
 *   - Hides the browser's horizontal scroll if a child accidentally
 *     overflows (mobile-built screens sometimes use fixed pixel widths).
 *
 * Real responsive layout decisions (sidebar vs bottom tabs, multi-column
 * grids, two-pane list+detail) live in the screens themselves and in
 * `app/(tabs)/_layout.tsx`. This shell intentionally stays thin.
 */

import React from "react";
import { Platform, StyleSheet, View } from "react-native";

export default function ResponsiveWebShell({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== "web") return <>{children}</>;
  return <View style={styles.root}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    minHeight: "100%" as any,
    backgroundColor: "#f4f8ff",
    overflow: "hidden",
  },
});
