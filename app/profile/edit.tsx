/**
 * app/profile/edit.tsx — Edit Profile screen
 *
 * Editable: avatar (upload), first/last name, email, phone, DOB (picker)
 * Saves via PUT /users/profile then calls refreshUser() to sync context.
 *
 * Note: no "Change Password" — the app uses OTP / Google login, so users
 * don't have a password to change.
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../../context/AuthContext";
import { userApi } from "../../services/userApi";
import { DateField } from "../../components/DateTimePickerField";
import UserAvatar from "../../components/UserAvatar";
import { appendImage, compressImage } from "../../utils/upload";
import { useAlert } from "../../components/AppAlert";

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { alert: appAlert } = useAlert();

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dob, setDob] = useState(user?.dateOfBirth ? String(user.dateOfBirth).split("T")[0] : "");
  const [profilePicture, setProfilePicture] = useState<string | undefined>(user?.profilePicture);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setEmail(user.email ?? "");
      setPhone(user.phone ?? "");
      setDob(user.dateOfBirth ? String(user.dateOfBirth).split("T")[0] : "");
      setProfilePicture(user.profilePicture);
    }
    // Track profilePicture too so the screen stays in sync if it changes
    // elsewhere (e.g. cached user updated via refreshUser after avatar upload).
  }, [user?.id, user?.profilePicture]);

  const phoneClean = phone.replace(/\D/g, "");
  const originalPhoneClean = (user?.phone ?? "").replace(/\D/g, "");

  const isDirty =
    firstName.trim() !== (user?.firstName ?? "") ||
    lastName.trim() !== (user?.lastName ?? "") ||
    email.trim().toLowerCase() !== (user?.email ?? "").toLowerCase() ||
    phoneClean !== originalPhoneClean ||
    dob !== (user?.dateOfBirth ? String(user.dateOfBirth).split("T")[0] : "");

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      await appAlert({
        title: "Permission needed",
        message: "Please allow photo library access to change your profile picture.",
        tone: "warning",
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      // Hostinger's nginx default rejects multipart bodies above 1 MB
      // with a 413 (which surfaces as "Network Error" in the app).
      // A 12 MP camera JPEG at quality 0.8 is 2-5 MB; 0.4 lands around
      // 300-600 KB, well under the limit and visually indistinguishable
      // at avatar size. If you raise this, raise nginx client_max_body_size
      // on the server at the same time.
      quality: 0.4,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      // Read file as base64 and POST as JSON instead of multipart.
      // RN's multipart layer was failing with ERR_NETWORK on Android
      // (no response, axios couldn't see why); JSON uses the same
      // axios path as every other API call so it works reliably.
      const fileRes = await fetch(asset.uri);
      const blob    = await fileRes.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror   = () => reject(new Error("Could not read photo"));
        reader.readAsDataURL(blob);
      });

      const res = await userApi.uploadAvatarBase64(dataUrl);
      if (res?.success && res.url) {
        // Optimistic local update — the avatar updates immediately on this
        // screen. refreshUser() then refetches /auth/me so user.profilePicture
        // is up to date everywhere else (home, profile tab, chat, etc.).
        setProfilePicture(res.url);
        await refreshUser();
      } else {
        await appAlert({ title: "Upload failed", message: res?.message || "Could not upload image", tone: "error" });
      }
    } catch (err: any) {
      // Decode the most common failure modes so the captain doesn't
      // see a generic "Network Error" and give up. 413 from nginx
      // means the photo exceeds the proxy body limit even though
      // multer would have accepted it.
      const status = err?.response?.status;
      const msg =
        status === 413
          ? "Photo is too large to upload. Please pick a smaller image and try again."
          : err?.code === "ECONNABORTED"
          ? "Upload timed out. Check your internet and try a smaller photo."
          : err?.message === "Network Error"
          ? "Could not reach server. Check your internet and try again."
          : err?.response?.data?.message || err?.message || "Error uploading";
      await appAlert({ title: "Upload failed", message: msg, tone: "error" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim()) {
      setError("First name is required.");
      return;
    }
    const trimmedEmail = email.trim().toLowerCase();
    if (trimmedEmail) {
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRe.test(trimmedEmail)) {
        setError("Please enter a valid email address.");
        return;
      }
    }

    const phoneChanged = phoneClean !== originalPhoneClean;
    if (phoneChanged && phoneClean.length !== 10) {
      setError("Phone must be exactly 10 digits.");
      return;
    }

    setError("");
    setSaving(true);
    try {
      await userApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: trimmedEmail || undefined,
        phone: phoneChanged ? phoneClean : undefined,
        dateOfBirth: dob || undefined,
      });
      await refreshUser();
      router.replace({ pathname: "/(tabs)/profile" as any, params: { saved: "1" } });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to save. Please try again.");
      setSaving(false);
    }
  };

  const initials = `${(firstName[0] ?? "?").toUpperCase()}${(lastName[0] ?? "").toUpperCase()}`;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#101720" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Edit Profile</Text>
          <View style={{ width: 42 }} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Avatar with upload */}
            <View style={s.avatarWrap}>
              <TouchableOpacity onPress={pickImage} activeOpacity={0.85} disabled={uploading}>
                <View style={s.avatarRing}>
                  <UserAvatar
                    uri={profilePicture}
                    firstName={firstName}
                    lastName={lastName}
                    size={104}
                    radius={30}
                    textSize={36}
                  />
                  <View style={s.cameraBadge}>
                    {uploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons name="camera" size={16} color="#fff" />
                    )}
                  </View>
                </View>
              </TouchableOpacity>
              <Text style={s.avatarHint}>Tap to change photo</Text>
            </View>

            {/* Personal Info */}
            <Text style={s.sectionLabel}>Personal Info</Text>
            <View style={s.card}>
              <Field label="First Name" icon="person-outline" value={firstName}
                onChange={setFirstName} placeholder="Enter first name" />
              <Divider />
              <Field label="Last Name" icon="person-outline" value={lastName}
                onChange={setLastName} placeholder="Enter last name" />
              <Divider />
              <Field label="Email" icon="mail-outline" value={email}
                onChange={setEmail} placeholder="you@example.com"
                keyboardType="email-address" autoCapitalize="none" />
              <Divider />
              <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                <DateField
                  label="Date of Birth"
                  value={dob}
                  onChange={setDob}
                  mode="past"
                  placeholder="Select date of birth"
                />
              </View>
            </View>

            {/* Phone — editable */}
            <Text style={s.sectionLabel}>Contact</Text>
            <View style={s.card}>
              <View style={f.row}>
                <View style={f.iconBox}>
                  <Ionicons name="call-outline" size={17} color="#8696a0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={f.label}>Phone Number</Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={f.dial}>🇮🇳  +91</Text>
                    <View style={f.phoneDivider} />
                    <TextInput
                      style={[f.input, { flex: 1 }]}
                      value={phone}
                      onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
                      placeholder="10-digit mobile number"
                      placeholderTextColor="#c4c9d0"
                      keyboardType="phone-pad"
                      maxLength={10}
                    />
                  </View>
                </View>
              </View>
            </View>
            <Text style={s.phoneNote}>
              <Ionicons name="information-circle-outline" size={11} color="#8696a0" /> {" "}
              Used for booking confirmations and captain contact. Must be a valid 10-digit Indian mobile number.
            </Text>

            {!!error && (
              <View style={s.errorCard}>
                <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
                <Text style={s.errorText}>{error}</Text>
              </View>
            )}

            <TouchableOpacity
              style={[s.saveBtn, (!isDirty || saving) && s.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!isDirty || saving}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={s.saveBtnText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
}

// ─── Stable field components (module-level!) ─────────────────────────────────
const Field = React.memo(function Field({
  label, icon, value, onChange, placeholder, keyboardType, autoCapitalize,
}: {
  label: string; icon: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  const defaultAutoCap: "none" | "words" =
    keyboardType === "email-address" || keyboardType === "phone-pad" ? "none" : "words";
  return (
    <View style={f.row}>
      <View style={f.iconBox}>
        <Ionicons name={icon as any} size={17} color="#8696a0" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={f.label}>{label}</Text>
        <TextInput
          style={f.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#c4c9d0"
          keyboardType={keyboardType ?? "default"}
          autoCapitalize={autoCapitalize ?? defaultAutoCap}
        />
      </View>
    </View>
  );
});

const ReadOnlyField = React.memo(function ReadOnlyField({
  label, icon, value,
}: { label: string; icon: string; value: string }) {
  return (
    <View style={f.row}>
      <View style={f.iconBox}>
        <Ionicons name={icon as any} size={17} color="#8696a0" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={f.label}>{label}</Text>
        <Text style={f.readOnly}>{value}</Text>
      </View>
      <View style={f.lockedBadge}>
        <Ionicons name="lock-closed-outline" size={12} color="#8696a0" />
      </View>
    </View>
  );
});

const Divider = () => <View style={{ height: 1, backgroundColor: "#f3f4f6", marginHorizontal: 16 }} />;

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  avatarWrap: { alignItems: "center", marginBottom: 28 },
  avatarRing: {
    position: "relative",
    width: 112, height: 112, borderRadius: 36,
    padding: 4, backgroundColor: "#fff",
    borderWidth: 2, borderColor: "#eef0f3",
  },
  avatarImg: {
    width: "100%", height: "100%", borderRadius: 30,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 36, fontWeight: "800", color: "#fff" },
  cameraBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "#02023E",
    alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#fff",
  },
  avatarHint: { fontSize: 12, color: "#8696a0", fontWeight: "600", marginTop: 10 },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, paddingLeft: 4 },
  card: { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#eef0f3", overflow: "hidden", marginBottom: 20 },

  phoneNote: {
    fontSize: 11, color: "#8696a0", fontWeight: "500",
    lineHeight: 16, paddingHorizontal: 4,
    marginTop: -12, marginBottom: 20,
  },

  errorCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fef2f2", borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#fecaca" },
  errorText: { flex: 1, fontSize: 13, color: "#dc2626", fontWeight: "600", lineHeight: 18 },

  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#02023E", borderRadius: 18, paddingVertical: 17, marginBottom: 12 },
  saveBtnDisabled: { opacity: 0.35 },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
});

const f = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  iconBox: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center" },
  label: { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 },
  input: { fontSize: 15, color: "#101720", fontWeight: "500", paddingVertical: 0 },
  readOnly: { fontSize: 15, color: "#6b7280", fontWeight: "500" },
  lockedBadge: { width: 26, height: 26, borderRadius: 8, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center" },
  dial: { fontSize: 15, fontWeight: "600", color: "#101720" },
  phoneDivider: { width: 1, height: 18, backgroundColor: "#e4ebf0", marginHorizontal: 10 },
});
