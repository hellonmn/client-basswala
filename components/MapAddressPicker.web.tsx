/**
 * components/MapAddressPicker.web.tsx
 *
 * Web stub for the map address picker. `react-native-maps` is native-only
 * and crashes the web bundler if imported, so this file is auto-picked by
 * Metro / Expo Router on the web target (any `.web.tsx` shadows the
 * matching `.tsx`).
 *
 * Behaviour on web:
 *   - Tries to grab the browser's geolocation (HTML5 `navigator.geolocation`).
 *   - On success: reverse-geocodes via `expo-location` and returns the
 *     same shape as the native picker — caller doesn't have to branch.
 *   - On denial / failure: shows a friendly "fill it manually" message
 *     and closes.
 *
 * Visually it's a thin modal with a message — no map. We deliberately
 * avoid pulling in a web-only mapping library (Google Maps JS SDK, Mapbox
 * GL) because the address picker is a tiny part of the desktop UX and
 * the manual-entry fields in AddAddressModal already cover the use case.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";

export interface PickedAddress {
  latitude: number;
  longitude: number;
  street?: string;
  landmark?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

interface Props {
  visible: boolean;
  initial?: { latitude?: number; longitude?: number };
  onClose: () => void;
  onConfirm: (addr: PickedAddress) => void;
}

type Phase = "asking" | "resolved" | "denied" | "unsupported";

export default function MapAddressPicker({ visible, onClose, onConfirm }: Props) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [resolved, setResolved] = useState<PickedAddress | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPhase("asking");
    setResolved(null);

    // Reset & request fresh geolocation each time the picker opens.
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setPhase("unsupported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          // expo-location's reverse geocode works on the web via the
          // browser's Geolocation API + the platform geocoder, but in
          // practice it often returns an empty array on web — we still
          // hand back coords so the caller can save the pin.
          const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const first = results?.[0];
          const street = first ? [first.name, first.street].filter(Boolean).join(", ") : "";
          setResolved({
            latitude: lat,
            longitude: lng,
            street: street || undefined,
            city: first?.city || first?.subregion || undefined,
            state: first?.region || undefined,
            zipCode: first?.postalCode || undefined,
          });
        } catch {
          setResolved({ latitude: lat, longitude: lng });
        }
        setPhase("resolved");
      },
      () => setPhase("denied"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }, [visible]);

  const useResolved = () => {
    if (resolved) onConfirm(resolved);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="map-outline" size={28} color="#02023E" />
          </View>
          <Text style={s.title}>Pin your location</Text>

          {phase === "asking" && (
            <>
              <Text style={s.body}>Looking up your current location…</Text>
              <ActivityIndicator size="large" color="#02023E" style={{ marginTop: 16 }} />
            </>
          )}

          {phase === "resolved" && resolved && (
            <>
              <Text style={s.body}>
                We found your current location. Confirm to use it as the delivery pin
                {resolved.street ? ` near ${resolved.street}` : ""}.
              </Text>
              <Text style={s.coords}>
                {resolved.latitude.toFixed(5)}, {resolved.longitude.toFixed(5)}
              </Text>
            </>
          )}

          {phase === "denied" && (
            <Text style={s.body}>
              Couldn't get your location — your browser denied the request. Fill the
              address fields manually, or allow location access from the URL bar and
              try again.
            </Text>
          )}

          {phase === "unsupported" && (
            <Text style={s.body}>
              The map picker isn't supported in this browser. Please fill the
              address fields manually below.
            </Text>
          )}

          <View style={s.btnRow}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={s.cancelText}>{phase === "resolved" ? "Cancel" : "Close"}</Text>
            </TouchableOpacity>
            {phase === "resolved" && (
              <TouchableOpacity style={s.confirmBtn} onPress={useResolved} activeOpacity={0.88}>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={s.confirmText}>Use this location</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,2,30,0.55)",
    alignItems: "center", justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%", maxWidth: 420,
    backgroundColor: "#fff", borderRadius: 22,
    padding: 24, alignItems: "center",
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "#eef0fa",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 19, fontWeight: "800", color: "#0F1626",
    textAlign: "center", letterSpacing: -0.2,
  },
  body: {
    fontSize: 14, color: "#5b6877",
    textAlign: "center", lineHeight: 21,
    marginTop: 10, marginBottom: 4,
  },
  coords: {
    fontSize: 12, color: "#8696a0", fontWeight: "600",
    marginTop: 8,
  },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 20, width: "100%" },
  cancelBtn: {
    flex: 1, height: 50, borderRadius: 14,
    backgroundColor: "#f1f3f7",
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { color: "#0F1626", fontSize: 15, fontWeight: "700" },
  confirmBtn: {
    flex: 1, height: 50, borderRadius: 14,
    backgroundColor: "#02023E",
    flexDirection: "row", gap: 8,
    alignItems: "center", justifyContent: "center",
  },
  confirmText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
});
