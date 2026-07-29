/**
 * components/AddAddressModal.tsx
 *
 * Bottom-sheet modal for adding/editing a saved delivery address.
 *
 * Two ways to fill the form:
 *  1. "Use my current location" — grabs GPS via expo-location and
 *     reverse-geocodes it to populate the street/city/state/pincode.
 *  2. Manual entry of all fields.
 *
 * Either way we always capture latitude + longitude so the booking
 * flow can calculate delivery distance accurately.
 *
 * When react-native-maps is installed, we can add a visual drag-pin
 * without changing this component's public API — just swap the
 * location block for a map.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { userApi } from "../services/userApi";
import { SavedAddress } from "../types/address";
import MapAddressPicker, { PickedAddress } from "./MapAddressPicker";

type Props = {
  visible: boolean;
  editing?: SavedAddress | null;
  onClose: () => void;
  onSaved: (address: SavedAddress) => void;
};

const LABELS = [
  { value: "Home", icon: "home-outline" as const },
  { value: "Work", icon: "briefcase-outline" as const },
  { value: "Other", icon: "location-outline" as const },
];

// Stable module-level Field component — inline would kill keyboard focus.
const Field = React.memo(function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  maxLength?: number;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#c4c9d0"
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? "words"}
        maxLength={maxLength}
      />
    </View>
  );
});

export default function AddAddressModal({ visible, editing, onClose, onSaved }: Props) {
  const isEdit = !!editing;

  const [label, setLabel] = useState("Home");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [street, setStreet] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [makeDefault, setMakeDefault] = useState(true);

  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMap, setShowMap] = useState(false);

  /** Map picker confirmed → fill the form with the picked coords + reverse-
   *  geocoded fields. The user can still edit any of them. */
  const handleMapConfirm = (addr: PickedAddress) => {
    setLatitude(addr.latitude);
    setLongitude(addr.longitude);
    if (addr.street) setStreet(addr.street);
    if (addr.city) setCity(addr.city);
    if (addr.state) setState(addr.state);
    if (addr.zipCode) setZipCode(addr.zipCode);
    setShowMap(false);
  };

  // Reset state whenever the modal opens or the editing target changes
  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setLabel(editing.label || "Home");
      setContactName(editing.contactName || "");
      setContactPhone(editing.contactPhone || "");
      setStreet(editing.street || "");
      setLandmark(editing.landmark || "");
      setCity(editing.city || "");
      setState(editing.state || "");
      setZipCode(editing.zipCode || "");
      setLatitude(Number(editing.latitude));
      setLongitude(Number(editing.longitude));
      setMakeDefault(editing.isDefault);
    } else {
      setLabel("Home");
      setContactName("");
      setContactPhone("");
      setStreet("");
      setLandmark("");
      setCity("");
      setState("");
      setZipCode("");
      setLatitude(null);
      setLongitude(null);
      setMakeDefault(true);
    }
  }, [visible, editing]);

  const useCurrentLocation = async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Please allow location access so we can pin your address. You can still fill the form manually."
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);

      // Reverse geocode — best-effort, fills whatever fields it can
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        const first = results?.[0];
        if (first) {
          // Build street from the most specific parts we have
          const streetParts = [first.name, first.street].filter(Boolean);
          if (streetParts.length) setStreet(streetParts.join(", "));
          if (first.city) setCity(first.city);
          else if (first.subregion) setCity(first.subregion);
          if (first.region) setState(first.region);
          if (first.postalCode) setZipCode(first.postalCode);
        }
      } catch {
        /* Reverse geocode can fail — we still have the coords */
      }
    } catch (err: any) {
      Alert.alert("Location error", err?.message || "Could not get your location");
    } finally {
      setFetchingLocation(false);
    }
  };

  const validate = (): string | null => {
    if (!city.trim()) return "City is required";
    if (latitude === null || longitude === null) {
      return "We need a location pin for your address. Tap 'Use my current location' or fill the form after allowing location access.";
    }
    if (zipCode && !/^\d{4,10}$/.test(zipCode.replace(/\s+/g, ""))) {
      return "Pin code must be 4–10 digits";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      Alert.alert("Please check your address", err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: label.trim() || "Home",
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        street: street.trim() || undefined,
        landmark: landmark.trim() || undefined,
        city: city.trim(),
        state: state.trim() || undefined,
        zipCode: zipCode.replace(/\s+/g, "") || undefined,
        latitude: latitude as number,
        longitude: longitude as number,
        makeDefault,
      };

      let res: any;
      if (isEdit && editing) {
        res = await userApi.updateSavedAddress(editing.id, payload);
        if (res?.success && makeDefault && !editing.isDefault) {
          await userApi.setDefaultAddress(editing.id);
        }
      } else {
        res = await userApi.addSavedAddress(payload);
      }

      if (res?.success) {
        onSaved(res.data);
      } else {
        Alert.alert("Error", res?.message || "Failed to save address");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || err?.message || "Failed to save address");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.topRow}>
              <Text style={s.title}>{isEdit ? "Edit Address" : "Add Address"}</Text>
              <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                <Ionicons name="close" size={20} color="#101720" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Label picker */}
              <Text style={s.sectionLabel}>Save as</Text>
              <View style={s.labelRow}>
                {LABELS.map((l) => {
                  const active = label === l.value;
                  return (
                    <TouchableOpacity
                      key={l.value}
                      style={[s.labelChip, active && s.labelChipActive]}
                      onPress={() => setLabel(l.value)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={l.icon} size={16} color={active ? "#fff" : "#02023E"} />
                      <Text style={[s.labelChipText, active && { color: "#fff" }]}>
                        {l.value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Location capture — primary path is the map picker so the
                  delivery pin is precise. GPS-only is kept as a quick fallback. */}
              <Text style={s.sectionLabel}>Location</Text>
              <TouchableOpacity
                style={s.locationBtn}
                onPress={() => setShowMap(true)}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#02023E", "#02023E"]} style={s.locationBtnGrad}>
                  <Ionicons name="map" size={16} color="#fff" />
                  <Text style={s.locationBtnText}>
                    {latitude !== null ? "Adjust on map" : "Pick on map"}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.gpsBtn}
                onPress={useCurrentLocation}
                disabled={fetchingLocation}
                activeOpacity={0.85}
              >
                {fetchingLocation ? (
                  <ActivityIndicator color="#02023E" size="small" />
                ) : (
                  <>
                    <Ionicons name="locate" size={14} color="#02023E" />
                    <Text style={s.gpsBtnText}>Use my current GPS</Text>
                  </>
                )}
              </TouchableOpacity>

              {latitude !== null && longitude !== null && (
                <View style={s.pinRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={s.pinText}>
                    Location pinned · {latitude.toFixed(4)}, {longitude.toFixed(4)}
                  </Text>
                </View>
              )}

              {/* Address fields */}
              <Text style={s.sectionLabel}>Address Details</Text>
              <View style={s.card}>
                <Field
                  label="House / Flat / Street *"
                  value={street}
                  onChangeText={setStreet}
                  placeholder="e.g. 42 Baker Street, Apt 3B"
                />
                <Field
                  label="Landmark (optional)"
                  value={landmark}
                  onChangeText={setLandmark}
                  placeholder="e.g. Near City Mall"
                />
                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="City *"
                      value={city}
                      onChangeText={setCity}
                      placeholder="e.g. Jaipur"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Pin Code"
                      value={zipCode}
                      onChangeText={(v) => setZipCode(v.replace(/[^\d]/g, "").slice(0, 10))}
                      placeholder="302019"
                      keyboardType="number-pad"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
                <Field
                  label="State"
                  value={state}
                  onChangeText={setState}
                  placeholder="e.g. Rajasthan"
                />
              </View>

              {/* Contact (optional) */}
              <Text style={s.sectionLabel}>Contact at this address (optional)</Text>
              <View style={s.card}>
                <View style={s.row2}>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Name"
                      value={contactName}
                      onChangeText={setContactName}
                      placeholder="Leave blank to use yours"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field
                      label="Phone"
                      value={contactPhone}
                      onChangeText={(v) => setContactPhone(v.replace(/[^\d+\s]/g, ""))}
                      placeholder="+91…"
                      keyboardType="phone-pad"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>

              {/* Make default checkbox */}
              <TouchableOpacity
                style={s.defaultRow}
                onPress={() => setMakeDefault((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={[s.checkbox, makeDefault && s.checkboxOn]}>
                  {makeDefault && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={s.defaultText}>Use as my default address</Text>
              </TouchableOpacity>

              {/* Save button */}
              <TouchableOpacity
                style={s.saveBtn}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#02023E", "#02023E"]} style={s.saveBtnGrad}>
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={s.saveBtnText}>
                        {isEdit ? "Save Changes" : "Save Address"}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Map picker — overlays the address form. Drops the user back to the
          form with the picked coords + auto-filled address fields. */}
      <MapAddressPicker
        visible={showMap}
        initial={
          latitude !== null && longitude !== null
            ? { latitude, longitude }
            : undefined
        }
        onClose={() => setShowMap(false)}
        onConfirm={handleMapConfirm}
      />
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 16,
    maxHeight: "95%",
  },
  topRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#101720" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
  },

  sectionLabel: {
    fontSize: 11, fontWeight: "700", color: "#8696a0",
    letterSpacing: 0.8, textTransform: "uppercase",
    marginBottom: 10, paddingLeft: 4, marginTop: 6,
  },

  // Label chips (Home/Work/Other)
  labelRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  labelChip: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 11, borderRadius: 14,
    backgroundColor: "#f0fffe",
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  labelChipActive: { backgroundColor: "#02023E", borderColor: "#02023E" },
  labelChipText: { fontSize: 13, fontWeight: "800", color: "#02023E" },

  // Use current location
  locationBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 10 },
  locationBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14,
  },
  locationBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },

  // Secondary GPS-only fallback button
  gpsBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6,
    paddingVertical: 10, marginBottom: 10,
    borderRadius: 12,
    backgroundColor: "#f4f8ff",
    borderWidth: 1, borderColor: "#e2e8f0",
  },
  gpsBtnText: { fontSize: 12, fontWeight: "700", color: "#02023E" },

  pinRow: {
    flexDirection: "row", alignItems: "center", gap: 5,
    marginBottom: 14, paddingLeft: 4,
  },
  pinText: { fontSize: 11, color: "#22c55e", fontWeight: "700" },

  card: {
    backgroundColor: "#f8fafc", borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: "#eef0f3",
    marginBottom: 14,
  },
  row2: { flexDirection: "row", gap: 10 },

  field: { marginBottom: 10 },
  label: {
    fontSize: 10, fontWeight: "800", color: "#5a6169",
    letterSpacing: 0.5, textTransform: "uppercase",
    marginBottom: 5,
  },
  input: {
    borderWidth: 1, borderColor: "#eef0f3", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: "#101720",
    backgroundColor: "#fff",
  },

  defaultRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12,
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: "#d1d5db",
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: "#02023E", borderColor: "#02023E" },
  defaultText: { fontSize: 13, color: "#101720", fontWeight: "600" },

  saveBtn: { marginTop: 10, borderRadius: 16, overflow: "hidden" },
  saveBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 15, gap: 8,
  },
  saveBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
