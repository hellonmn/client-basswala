/**
 * app/(auth)/complete-profile.tsx
 * Shown to users who just signed up with Google and don't have a phone saved yet.
 * They must enter their phone (and optionally fix their name) before continuing.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { authApi } from "@/services/userApi";

const Toast = ({ visible, type, message, onDone }: any) => {
  const tx = React.useRef(new Animated.Value(-80)).current;
  useEffect(() => {
    if (!visible) return;
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
    const t = setTimeout(() => {
      Animated.timing(tx, { toValue: -80, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => onDone());
    }, 3200);
    return () => clearTimeout(t);
  }, [visible]);
  if (!visible) return null;
  const bg = type === "error" ? "#fef2f2" : "#f0fffe";
  const color = type === "error" ? "#ef4444" : "#02023E";
  return (
    <Animated.View style={{
      position: "absolute", top: Platform.OS === "ios" ? 54 : 14, left: 16, right: 16,
      backgroundColor: bg, borderColor: color + "55", borderWidth: 1, borderRadius: 12,
      padding: 12, flexDirection: "row", alignItems: "center", gap: 10, zIndex: 999,
      transform: [{ translateY: tx }],
    }}>
      <Ionicons name={type === "error" ? "alert-circle" : "information-circle"} size={18} color={color} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color }}>{message}</Text>
    </Animated.View>
  );
};

const isPlaceholderEmail = (e?: string | null) => !!e && /@(basswala\.app|basswala\.com)$/i.test(e);

export default function CompleteProfileScreen() {
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();
  const isPlaceholderFirst = user?.firstName?.trim().toLowerCase() === 'basswala';
  const isPlaceholderLast = user?.lastName?.trim().toLowerCase() === 'user' || user?.lastName?.trim().toLowerCase() === 'captain';
  const needsEmail = !user?.email || isPlaceholderEmail(user.email);

  const [firstName, setFirstName] = useState(isPlaceholderFirst ? "" : (user?.firstName || ""));
  const [lastName, setLastName] = useState(isPlaceholderLast ? "" : (user?.lastName || ""));
  const [phone, setPhone] = useState(user?.phone || "");
  const [email, setEmail] = useState(isPlaceholderEmail(user?.email) ? "" : (user?.email || ""));
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: string; message: string } | null>(null);

  const phoneClean = phone.replace(/\D/g, "");
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(email.trim()) && !/@(basswala\.app|basswala\.com)$/i.test(email.trim());
  const valid = phoneClean.length === 10 && firstName.trim().length >= 1 && (!needsEmail || emailOk);

  const submit = async () => {
    if (needsEmail && !emailOk) {
      return setToast({ type: "error", message: "Please enter a valid email address" });
    }
    if (phoneClean.length !== 10) {
      return setToast({ type: "error", message: "Enter your 10-digit phone number" });
    }
    if (firstName.trim().length < 1) {
      return setToast({ type: "error", message: "First name is required" });
    }
    setSubmitting(true);
    try {
      const res = await authApi.completeProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phoneClean,
        ...(needsEmail ? { email: email.trim().toLowerCase() } : {}),
      });
      if (res?.success) {
        await refreshUser();
        router.replace("/(tabs)");
      } else {
        setToast({ type: "error", message: res?.message || "Could not save. Try again." });
      }
    } catch (err: any) {
      setToast({ type: "error", message: err?.response?.data?.message || err?.message || "Failed to save" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <Toast visible={!!toast} type={toast?.type} message={toast?.message || ""} onDone={() => setToast(null)} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <View style={s.heroBadge}>
              <Ionicons name="sparkles" size={22} color="#02023E" />
            </View>
            <Text style={s.title}>One last step</Text>
            <Text style={s.subtitle}>
              {user?.firstName ? `Welcome ${user.firstName}! ` : ""}
              Add your phone number so captains can reach you about bookings.
            </Text>
          </View>

          {/* First / last name */}
          <Text style={s.label}>FIRST NAME</Text>
          <View style={s.inputRow}>
            <Ionicons name="person-outline" size={18} color="#8696a0" style={{ marginRight: 8 }} />
            <TextInput
              style={s.input}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="Your first name"
              placeholderTextColor="#B0B8C1"
              autoCapitalize="words"
            />
          </View>

          <Text style={[s.label, { marginTop: 14 }]}>LAST NAME</Text>
          <View style={s.inputRow}>
            <Ionicons name="person-outline" size={18} color="#8696a0" style={{ marginRight: 8 }} />
            <TextInput
              style={s.input}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Your last name (optional)"
              placeholderTextColor="#B0B8C1"
              autoCapitalize="words"
            />
          </View>

          {/* Phone */}
          <Text style={[s.label, { marginTop: 14 }]}>PHONE NUMBER</Text>
          <View style={s.inputRow}>
            <View style={s.flag}><Text style={s.flagEmoji}>ðŸ‡®ðŸ‡³</Text><Text style={s.dial}>+91</Text></View>
            <View style={s.divider} />
            <TextInput
              style={s.input}
              value={phone}
              onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit mobile number"
              placeholderTextColor="#B0B8C1"
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
          <Text style={s.hint}>We'll send booking updates to this number</Text>

          {/* Email (input or read-only) */}
          {needsEmail ? (
            <>
              <Text style={[s.label, { marginTop: 14 }]}>EMAIL ADDRESS</Text>
              <View style={s.inputRow}>
                <Ionicons name="mail-outline" size={18} color="#8696a0" style={{ marginRight: 8 }} />
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Your real email address"
                  placeholderTextColor="#B0B8C1"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </>
          ) : (
            user?.email && (
              <View style={s.emailBox}>
                <Ionicons name="mail-outline" size={14} color="#8696a0" />
                <Text style={s.emailText}>{user.email}</Text>
              </View>
            )
          )}

          <TouchableOpacity onPress={() => logout()} style={{ marginTop: 28, alignSelf: "center" }}>
            <Text style={s.logoutLink}>Sign out and use a different account</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.submitBtn, (!valid || submitting) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={!valid || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={s.submitText}>Continue</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },

  hero: { alignItems: "center", marginBottom: 28, paddingTop: 24 },
  heroBadge: {
    width: 60, height: 60, borderRadius: 18, backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center", marginBottom: 14,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  title: { fontSize: 22, fontWeight: "800", color: "#101720", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#8696a0", textAlign: "center", lineHeight: 21, paddingHorizontal: 16 },

  label: { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.8, marginBottom: 8 },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#E4EBF0", borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    backgroundColor: "#fff",
  },
  input: { flex: 1, fontSize: 15, color: "#111", padding: 0 },
  flag: { flexDirection: "row", alignItems: "center", gap: 4 },
  flagEmoji: { fontSize: 17 },
  dial: { fontSize: 14, fontWeight: "600", color: "#101720" },
  divider: { width: 1, height: 20, backgroundColor: "#E4EBF0", marginHorizontal: 10 },
  hint: { fontSize: 11, color: "#8696a0", marginTop: 6, marginLeft: 4 },

  emailBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: "#f4f8ff", borderRadius: 10, marginTop: 18,
  },
  emailText: { fontSize: 12, color: "#5a6a85", fontWeight: "500" },

  logoutLink: { fontSize: 13, color: "#ef4444", fontWeight: "600", textDecorationLine: "underline" },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: 16, paddingBottom: Platform.OS === "ios" ? 28 : 16,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#02023E", borderRadius: 14, paddingVertical: 15,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
