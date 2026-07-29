/**
 * app/onboarding.tsx — User Onboarding
 *
 * Shown if a user's profile is incomplete (missing name or phone).
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "../context/AuthContext";
import { authApi } from "../services/userApi";

const Field = React.memo(function Field({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  autoCapitalize?: any;
  keyboardType?: any;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#c4c9d0"
        autoCapitalize={autoCapitalize ?? "words"}
        keyboardType={keyboardType}
      />
    </View>
  );
});

export default function OnboardingScreen() {
  const router = useRouter();
  const { user, refreshUser, logout } = useAuth();

  const isPlaceholderFirst = user?.firstName?.trim().toLowerCase() === 'basswala';
  const isPlaceholderLast = user?.lastName?.trim().toLowerCase() === 'user' || user?.lastName?.trim().toLowerCase() === 'captain';

  const [firstName, setFirstName] = useState(isPlaceholderFirst ? "" : (user?.firstName || ""));
  const [lastName, setLastName] = useState(isPlaceholderLast ? "" : (user?.lastName || ""));
  const [phone, setPhone] = useState(user?.phone || "");
  
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert("Name required", "Please enter your first and last name.");
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      Alert.alert("Phone required", "Please enter a valid 10-digit mobile number.");
      return;
    }

    setSaving(true);
    try {
      await authApi.completeProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      });

      await refreshUser();
      router.replace("/(tabs)" as any);
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || err?.message || "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(tabs)" as any);
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" translucent={false} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <Ionicons name="person-outline" size={32} color="#02023E" />
            </View>
            <Text style={s.title}>Almost there!</Text>
            <Text style={s.subtitle}>
              We just need a few more details to set up your account.
            </Text>
          </View>

          <View style={s.form}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Field label="First Name *" value={firstName} onChangeText={setFirstName} placeholder="e.g. John" />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Field label="Last Name *" value={lastName} onChangeText={setLastName} placeholder="e.g. Doe" />
              </View>
            </View>

            <Field 
              label="Phone Number *" 
              value={phone} 
              onChangeText={setPhone} 
              placeholder="10-digit mobile" 
              keyboardType="phone-pad"
            />
            
            <Text style={s.info}>
              We'll use your phone number to send order updates and connect you with captains.
            </Text>

            <TouchableOpacity
              style={[s.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={0.88}
            >
              <LinearGradient colors={["#02023E", "#02023E"]} style={s.saveBtnGrad}>
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.saveBtnText}>Save and Continue</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
              <Text style={s.logoutText}>Not now? Sign out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  scroll: { paddingHorizontal: 24, paddingTop: 40 },
  header: { alignItems: "center", marginBottom: 32 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
    marginBottom: 16, borderWidth: 1, borderColor: "#a5f3fc",
  },
  title: { fontSize: 24, fontWeight: "900", color: "#101720", letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: "#8696a0", textAlign: "center", lineHeight: 21, marginTop: 8 },
  form: { marginTop: 8 },
  row: { flexDirection: 'row' },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: "#5a6169", marginBottom: 8, letterSpacing: 0.3 },
  fieldInput: {
    borderWidth: 1.5, borderColor: "#eef0f3", borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: "#101720", backgroundColor: "#fff",
  },
  info: { fontSize: 12, color: "#8696a0", lineHeight: 18, marginBottom: 24 },
  saveBtn: { borderRadius: 18, overflow: "hidden" },
  saveBtnGrad: { alignItems: "center", justifyContent: "center", paddingVertical: 18 },
  saveBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  logoutBtn: { alignItems: "center", marginTop: 20, paddingVertical: 10 },
  logoutText: { fontSize: 14, fontWeight: "600", color: "#ef4444" },
});
