/**
 * app/scan.tsx — QR Scanner
 *
 * Opens the camera and watches for a Basswala-style universal link
 * (https://basswala.com/captain/<id>, /dj-detail, /equipment/<id>).
 * Anything else → "Not a Basswala QR code" toast and keep scanning.
 *
 * Trigger from the explore tab header (we'll add the button next).
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";

// Lazy-load expo-camera so the screen mounts on dev clients that haven't been
// rebuilt yet — we render a friendly "Rebuild required" hint instead of a
// hard native-module crash on app start.
let _CameraView: any = null;
let _useCameraPermissions: any = null;
let _cameraLoadError: string | null = null;
try {
  const cam = require("expo-camera");
  _CameraView = cam.CameraView;
  _useCameraPermissions = cam.useCameraPermissions;
} catch (e: any) {
  _cameraLoadError = e?.message || "expo-camera native module missing";
}
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Linking,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: W } = Dimensions.get("window");
const FRAME_SIZE = Math.min(W * 0.72, 300);

// Hosts we recognize as our own — anything else is rejected.
const OUR_HOSTS = ["basswala.com", "www.basswala.com"];

interface ParsedRoute {
  pathname: string;
  params: Record<string, string>;
}

function parseBasswalaUrl(raw: string): ParsedRoute | null {
  try {
    const url = new URL(raw);
    if (!OUR_HOSTS.includes(url.host.toLowerCase())) return null;

    const path = url.pathname;
    const search = Object.fromEntries(url.searchParams.entries());

    // /captain/<id>
    const cap = path.match(/^\/captain\/(\d+)\/?$/);
    if (cap) return { pathname: "/captain/[id]", params: { id: cap[1] } };

    // /dj-detail?djId=…&captainId=…
    if (path === "/dj-detail" || path === "/dj-detail/") {
      if (search.djId) {
        return {
          pathname: "/dj-detail",
          params: {
            djId: search.djId,
            ...(search.captainId ? { captainId: search.captainId } : {}),
          },
        };
      }
    }

    // /equipment/<id>
    const eq = path.match(/^\/equipment\/(\d+)\/?$/);
    if (eq) return { pathname: "/equipment/[id]", params: { id: eq[1] } };
  } catch {
    return null;
  }
  return null;
}

export default function ScanScreen() {
  const router = useRouter();

  // If the native camera module isn't loaded (dev client not rebuilt),
  // render a clear instruction screen — no hooks below this point so we
  // don't violate rules-of-hooks.
  if (!_useCameraPermissions || !_CameraView) {
    return (
      <SafeAreaView style={s.permRoot} edges={["top"]}>
        <View style={s.permContent}>
          <View style={s.permPuck}>
            <Ionicons name="construct-outline" size={36} color="#02023E" />
          </View>
          <Text style={s.permTitle}>QR scan needs a rebuild</Text>
          <Text style={s.permSub}>
            We just added the camera module. Rebuild the dev client to use the scanner.
            {_cameraLoadError ? `\n\n(${_cameraLoadError})` : ""}
          </Text>
          <Pressable style={s.primaryBtn} onPress={() => router.back()}>
            <Text style={s.primaryBtnText}>OK</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <ScanScreenInner />;
}

function ScanScreenInner() {
  const router = useRouter();
  const [permission, requestPermission] = _useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);

  // Pulsing scan-line animation
  const lineY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lineY, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(lineY, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const lineTranslate = lineY.interpolate({
    inputRange: [0, 1],
    outputRange: [0, FRAME_SIZE - 4],
  });

  // Auto-clear error after 2 s and re-arm scanner
  useEffect(() => {
    if (!errorMsg) return;
    const t = setTimeout(() => {
      setErrorMsg(null);
      setScanned(false);
    }, 2000);
    return () => clearTimeout(t);
  }, [errorMsg]);

  if (!permission) {
    return (
      <SafeAreaView style={s.darkRoot} edges={["top"]}>
        <ActivityIndicator color="#02023E" size="large" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.permRoot} edges={["top"]}>
        <View style={s.permContent}>
          <View style={s.permPuck}>
            <Ionicons name="camera-outline" size={36} color="#02023E" />
          </View>
          <Text style={s.permTitle}>Camera access needed</Text>
          <Text style={s.permSub}>
            Allow Basswala to use your camera so you can scan a captain's QR code and open their profile instantly.
          </Text>

          <Pressable style={s.primaryBtn} onPress={requestPermission}>
            <Ionicons name="camera" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>Allow camera</Text>
          </Pressable>

          {!permission.canAskAgain ? (
            <Pressable style={s.secondaryBtn} onPress={() => Linking.openSettings()}>
              <Text style={s.secondaryBtnText}>Open settings</Text>
            </Pressable>
          ) : null}

          <Pressable style={s.secondaryBtn} onPress={() => router.back()}>
            <Text style={s.secondaryBtnText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleBarCodeScanned = ({ data, type }: { data: string; type: string }) => {
    if (scanned) return;
    setScanned(true);

    const parsed = parseBasswalaUrl(data);
    if (!parsed) {
      setErrorMsg("Not a Basswala QR code");
      return;
    }
    // Brief delay so the user sees the success state before nav.
    setTimeout(() => {
      router.replace({ pathname: parsed.pathname as any, params: parsed.params });
    }, 250);
  };

  return (
    <View style={s.darkRoot}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      {React.createElement(_CameraView, {
        style: StyleSheet.absoluteFill,
        facing: "back",
        enableTorch: torchOn,
        barcodeScannerSettings: { barcodeTypes: ["qr"] },
        onBarcodeScanned: handleBarCodeScanned,
      })}

      {/* Top-edge dim + back/torch */}
      <SafeAreaView edges={["top"]} pointerEvents="box-none" style={s.topBar}>
        <Pressable style={s.iconBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={s.topTitle}>Scan QR</Text>
        <Pressable
          style={[s.iconBtn, torchOn && s.iconBtnActive]}
          onPress={() => setTorchOn((v) => !v)}
        >
          <Ionicons name={torchOn ? "flashlight" : "flashlight-outline"} size={20} color="#fff" />
        </Pressable>
      </SafeAreaView>

      {/* Center frame with corners + animated scan line */}
      <View style={s.frameCentre} pointerEvents="none">
        <View style={[s.frame, { width: FRAME_SIZE, height: FRAME_SIZE }]}>
          <View style={[s.corner, s.cornerTL]} />
          <View style={[s.corner, s.cornerTR]} />
          <View style={[s.corner, s.cornerBL]} />
          <View style={[s.corner, s.cornerBR]} />
          {!errorMsg && !scanned ? (
            <Animated.View style={[s.scanLine, { transform: [{ translateY: lineTranslate }] }]}>
              <LinearGradient
                colors={["transparent", "#02023E", "transparent"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          ) : null}
        </View>

        <Text style={s.frameHint}>
          Align the QR code inside the frame
        </Text>
      </View>

      {/* Inline status pill */}
      {errorMsg ? (
        <View style={s.statusPillError}>
          <Ionicons name="alert-circle" size={14} color="#fff" />
          <Text style={s.statusPillText}>{errorMsg}</Text>
        </View>
      ) : scanned ? (
        <View style={s.statusPillOk}>
          <Ionicons name="checkmark-circle" size={14} color="#fff" />
          <Text style={s.statusPillText}>Got it — opening…</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  darkRoot: { flex: 1, backgroundColor: "#000" },

  // Camera permission UI
  permRoot: { flex: 1, backgroundColor: "#ffffff" },
  permContent: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32,
  },
  permPuck: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: "#f0fffe", borderWidth: 1, borderColor: "#a5f3fc",
    alignItems: "center", justifyContent: "center", marginBottom: 18,
  },
  permTitle: {
    fontSize: 20, fontWeight: "800", color: "#101720",
    letterSpacing: -0.4, marginBottom: 8, textAlign: "center",
  },
  permSub: {
    fontSize: 14, color: "#6B7A8A", textAlign: "center",
    lineHeight: 21, marginBottom: 26,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#02023E",
    height: 54, borderRadius: 999, paddingHorizontal: 28, minWidth: 200,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: {
    paddingVertical: 14, paddingHorizontal: 22, marginTop: 10,
  },
  secondaryBtnText: { color: "#02023E", fontWeight: "700", fontSize: 14 },

  // Top bar overlay
  topBar: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: Platform.OS === "android" ? 12 : 0, paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  topTitle: { color: "#fff", fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  iconBtnActive: { backgroundColor: "#02023E" },

  // Frame
  frameCentre: {
    flex: 1, alignItems: "center", justifyContent: "center",
  },
  frame: { position: "relative" },
  corner: {
    position: "absolute", width: 28, height: 28,
    borderColor: "#02023E", borderWidth: 4, borderRadius: 4,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 18 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 18 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 18 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 18 },
  scanLine: {
    position: "absolute", left: 6, right: 6, height: 2,
    backgroundColor: "transparent",
  },
  frameHint: {
    color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600",
    marginTop: 24, textAlign: "center",
  },

  statusPillError: {
    position: "absolute", bottom: 80, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#ef4444",
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
  },
  statusPillOk: {
    position: "absolute", bottom: 80, alignSelf: "center",
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#22c55e",
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999,
  },
  statusPillText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
