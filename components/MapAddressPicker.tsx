/**
 * components/MapAddressPicker.tsx
 *
 * Full-screen map for picking a precise delivery address.
 *
 * UX flow:
 *   1. Open the picker → it grabs the user's GPS and centers the map there
 *      (falls back to Jaipur if permission denied / GPS unavailable).
 *   2. The marker stays pinned to the centre of the screen — the user
 *      drags the *map* under the pin (the standard Zomato/Uber pattern,
 *      easier than dragging a marker on touch devices).
 *   3. As the map settles, we reverse-geocode the centre coords and fill
 *      a bottom card with the human-readable address.
 *   4. "Use current location" recenters on GPS.
 *   5. "Confirm location" returns { latitude, longitude, street, city, state, zipCode }
 *      to the parent via onConfirm — the parent (AddAddressModal) treats
 *      that as pre-filled fields the user can still edit.
 *
 * Requires `react-native-maps` and a Google Maps API key in app.json under
 * `android.config.googleMaps.apiKey`. No native rebuild required after the
 * first install + prebuild.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, { PROVIDER_GOOGLE, Region } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";

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

// Fallback centre when no GPS is available (Jaipur — change to your default city).
const DEFAULT_REGION: Region = {
  latitude: 26.9124,
  longitude: 75.7873,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
};

export default function MapAddressPicker({
  visible,
  initial,
  onClose,
  onConfirm,
}: Props) {
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState<Region>(DEFAULT_REGION);
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<PickedAddress | null>(null);

  // When the picker opens, decide where to centre the map.
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    (async () => {
      // 1. If parent passed an existing pin, start there.
      if (
        typeof initial?.latitude === "number" &&
        typeof initial?.longitude === "number" &&
        Number.isFinite(initial.latitude) &&
        Number.isFinite(initial.longitude)
      ) {
        const r: Region = {
          latitude: initial.latitude,
          longitude: initial.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        };
        if (!cancelled) {
          setRegion(r);
          // Reverse-geocode immediately so the bottom card isn't empty.
          reverseGeocode(r.latitude, r.longitude);
        }
        return;
      }

      // 2. Otherwise try GPS — but don't block the UI if it's slow.
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          const ask = await Location.requestForegroundPermissionsAsync();
          if (ask.status !== "granted") {
            // Silent — we just stay on the default region. User can still
            // drag the map manually.
            reverseGeocode(DEFAULT_REGION.latitude, DEFAULT_REGION.longitude);
            return;
          }
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const r: Region = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        };
        setRegion(r);
        reverseGeocode(r.latitude, r.longitude);
      } catch {
        if (!cancelled) {
          reverseGeocode(DEFAULT_REGION.latitude, DEFAULT_REGION.longitude);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  /** Reverse-geocode the given coords and update the bottom card. */
  const reverseGeocode = async (lat: number, lng: number) => {
    setResolving(true);
    try {
      const results = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });
      const first = results?.[0];
      const street = first
        ? [first.name, first.street].filter(Boolean).join(", ")
        : "";
      setResolved({
        latitude: lat,
        longitude: lng,
        street: street || undefined,
        city: first?.city || first?.subregion || undefined,
        state: first?.region || undefined,
        zipCode: first?.postalCode || undefined,
      });
    } catch {
      // Even if geocoding fails, we still have valid coords — let the user confirm.
      setResolved({ latitude: lat, longitude: lng });
    } finally {
      setResolving(false);
    }
  };

  /** Called when the user lifts their finger after panning the map. */
  const handleRegionChangeComplete = (r: Region) => {
    setRegion(r);
    reverseGeocode(r.latitude, r.longitude);
  };

  /** "Use my current location" button. */
  const recenterOnGps = async () => {
    setResolving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const r: Region = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.012,
        longitudeDelta: 0.012,
      };
      mapRef.current?.animateToRegion(r, 350);
      setRegion(r);
      reverseGeocode(r.latitude, r.longitude);
    } catch {
      /* ignore — keep current region */
    } finally {
      setResolving(false);
    }
  };

  const handleConfirm = () => {
    if (!resolved) {
      // Edge case — shouldn't happen since we always set after region change.
      onConfirm({ latitude: region.latitude, longitude: region.longitude });
      return;
    }
    onConfirm(resolved);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.root} edges={["top"]}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.headerBtn} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#101720" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Pin your address</Text>
          <View style={{ width: 42 }} />
        </View>

        {/* Map */}
        <View style={s.mapWrap}>
          <MapView
            ref={mapRef}
            provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
            style={StyleSheet.absoluteFill}
            initialRegion={region}
            region={region}
            onRegionChangeComplete={handleRegionChangeComplete}
            showsUserLocation
            showsMyLocationButton={false}
            toolbarEnabled={false}
          />

          {/* Centre pin — the map slides under this fixed marker. */}
          <View pointerEvents="none" style={s.pinWrap}>
            <View style={s.pinHead}>
              <Ionicons name="location" size={26} color="#fff" />
            </View>
            <View style={s.pinShadow} />
          </View>

          {/* Recenter button */}
          <TouchableOpacity
            style={s.recenterBtn}
            onPress={recenterOnGps}
            activeOpacity={0.85}
          >
            <Ionicons name="locate" size={22} color="#02023E" />
          </TouchableOpacity>
        </View>

        {/* Bottom card */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="navigate" size={14} color="#02023E" />
            <Text style={s.cardLabel}>SELECTED LOCATION</Text>
            {resolving ? <ActivityIndicator size="small" color="#02023E" /> : null}
          </View>

          <Text style={s.addressLine} numberOfLines={2}>
            {resolved?.street || resolved?.city
              ? [resolved.street, resolved.city, resolved.state]
                  .filter(Boolean)
                  .join(", ")
              : "Drag the map to position the pin on your delivery address."}
          </Text>
          {(resolved?.zipCode || (resolved?.latitude && resolved?.longitude)) && (
            <Text style={s.coords}>
              {resolved?.zipCode ? `PIN ${resolved.zipCode} · ` : ""}
              {resolved?.latitude.toFixed(5)}, {resolved?.longitude.toFixed(5)}
            </Text>
          )}

          <TouchableOpacity
            style={[s.confirmBtn, resolving && { opacity: 0.55 }]}
            onPress={handleConfirm}
            disabled={resolving}
            activeOpacity={0.88}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={s.confirmBtnText}>Confirm location</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  headerBtn: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#f4f8ff",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },

  mapWrap: { flex: 1, backgroundColor: "#e6e9ef" },

  // Centre pin
  pinWrap: {
    position: "absolute",
    top: "50%", left: "50%",
    marginLeft: -22, marginTop: -52,
    alignItems: "center",
  },
  pinHead: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#02023E",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#fff",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  pinShadow: {
    width: 12, height: 6, borderRadius: 6,
    backgroundColor: "rgba(2,2,30,0.25)",
    marginTop: 4,
  },

  recenterBtn: {
    position: "absolute",
    right: 16, bottom: 24,
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1, borderColor: "#eef0f3",
  },

  // Bottom card
  card: {
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 22,
    backgroundColor: "#fff",
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  cardHeader: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginBottom: 8,
  },
  cardLabel: {
    flex: 1,
    fontSize: 11, fontWeight: "800", color: "#02023E",
    letterSpacing: 0.6,
  },
  addressLine: {
    fontSize: 15, fontWeight: "700", color: "#101720",
    lineHeight: 22, marginBottom: 4,
  },
  coords: {
    fontSize: 11, fontWeight: "600", color: "#8696a0",
    marginBottom: 14,
  },
  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8,
    backgroundColor: "#02023E",
    height: 52, borderRadius: 16,
  },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
});
