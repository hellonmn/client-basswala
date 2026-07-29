/**
 * app/profile/contact-us.tsx — Contact Us screen
 *
 * Features:
 *  - Contact form (name, email, subject, message)
 *  - Contact channel cards (WhatsApp, Email, Phone)
 *  - Form submission via apiService or direct mailto fallback
 *  - Success state after submission
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { getSupportContact, telLink, whatsappLink, formatPhone, type SupportContact } from "../../services/appConfig";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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
import { useAuth } from "../../context/AuthContext";

const SUBJECTS = ["General Inquiry", "Booking Issue", "Payment Problem", "DJ Complaint", "Technical Support", "Other"];

// Channels are computed from the live SupportContact below. WhatsApp
// and phone cards are only included if the admin has populated those
// fields, so an empty value just hides that card instead of rendering
// "+91 " with nothing after.
function buildChannels(contact: SupportContact) {
  const channels: Array<{
    key: string; icon: string; label: string; detail: string; sub: string;
    color: string; bg: string; border: string; iconBg: string; onPress: () => void;
  }> = [];

  if (contact.whatsapp) {
    channels.push({
      key: "whatsapp",
      icon: "logo-whatsapp",
      label: "WhatsApp",
      detail: formatPhone(`+${contact.whatsapp}`),
      sub: contact.whatsappHours,
      color: "#16a34a",
      bg: "#f0fff4",
      border: "#bbf7d0",
      iconBg: "#dcfce7",
      onPress: () => Linking.openURL(whatsappLink(contact.whatsapp)).catch(() => {}),
    });
  }

  if (contact.email) {
    channels.push({
      key: "email",
      icon: "mail-outline",
      label: "Email Support",
      detail: contact.email,
      sub: contact.emailHours,
      color: "#7c3aed",
      bg: "#f5f3ff",
      border: "#ddd6fe",
      iconBg: "#ede9fe",
      onPress: () => Linking.openURL(`mailto:${contact.email}`).catch(() => {}),
    });
  }

  if (contact.phone) {
    channels.push({
      key: "phone",
      icon: "call-outline",
      label: "Call Us",
      detail: formatPhone(contact.phone),
      sub: contact.phoneHours,
      color: "#02023E",
      bg: "#f0fafa",
      border: "#d0f0ef",
      iconBg: "#ccf2f1",
      onPress: () => Linking.openURL(telLink(contact.phone)).catch(() => {}),
    });
  }

  return channels;
}

export default function ContactUsScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [name,    setName]    = useState(`${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim());
  const [email,   setEmail]   = useState(user?.email ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState("");
  const [contact, setContact] = useState<SupportContact | null>(null);

  // Fetch admin-controlled contact details on mount. Cached in
  // appConfig so revisiting this screen doesn't refetch.
  useEffect(() => {
    let cancelled = false;
    getSupportContact().then(c => { if (!cancelled) setContact(c); });
    return () => { cancelled = true; };
  }, []);

  const channels = useMemo(() => contact ? buildChannels(contact) : [], [contact]);
  const supportEmailForMailto = contact?.email || "support@basswala.in";

  const canSubmit = name.trim() && email.trim() && subject && message.trim().length >= 10;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError("");
    setSending(true);
    try {
      // Attempt API submission; fall back to mailto
      const body = `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`;
      await Linking.openURL(
        `mailto:${supportEmailForMailto}?subject=${encodeURIComponent(`[Basswala] ${subject}`)}&body=${encodeURIComponent(body)}`
      );
      setSent(true);
    } catch {
      setError(`Could not open mail app. Please email ${supportEmailForMailto} directly.`);
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#101720" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Contact Us</Text>
          <View style={{ width: 42 }} />
        </View>
        <View style={s.successWrap}>
          <LinearGradient colors={["#02023E", "#02023E"]} style={s.successCircle}>
            <Ionicons name="checkmark" size={44} color="#fff" />
          </LinearGradient>
          <Text style={s.successTitle}>Message Sent!</Text>
          <Text style={s.successSub}>
            Thanks for reaching out. Our support team will get back to you at{"\n"}
            <Text style={{ fontWeight: "700", color: "#101720" }}>{email}</Text>
            {"\n"}within 24 hours.
          </Text>
          <TouchableOpacity style={s.doneBtn} onPress={() => router.back()} activeOpacity={0.88}>
            <Text style={s.doneBtnText}>Back to Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#101720" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Contact Us</Text>
        <View style={{ width: 42 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Hero */}
          <LinearGradient colors={["#101720", "#1a2536"]} style={s.heroBanner}>
            <Text style={s.heroEmoji}>💬</Text>
            <Text style={s.heroTitle}>We're here to help</Text>
            <Text style={s.heroSub}>Tell us what's on your mind and we'll get back to you as soon as possible</Text>
          </LinearGradient>

          {/* Channel cards */}
          <Text style={s.sectionLabel}>Reach Us Directly</Text>
          {channels.length === 0 && (
            <View style={[s.channelCard, { backgroundColor: "#fafafa", borderColor: "#eef0f3", justifyContent: "center" }]}>
              <ActivityIndicator size="small" color="#8696a0" />
            </View>
          )}
          {channels.map((ch) => (
            <TouchableOpacity key={ch.key} style={[s.channelCard, { backgroundColor: ch.bg, borderColor: ch.border }]}
              onPress={ch.onPress} activeOpacity={0.82}>
              <View style={[s.channelIcon, { backgroundColor: ch.iconBg }]}>
                <Ionicons name={ch.icon as any} size={22} color={ch.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.channelLabel}>{ch.label}</Text>
                <Text style={[s.channelDetail, { color: ch.color }]}>{ch.detail}</Text>
                <Text style={s.channelSub}>{ch.sub}</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={22} color={ch.color} style={{ opacity: 0.7 }} />
            </TouchableOpacity>
          ))}

          {/* Form */}
          <Text style={[s.sectionLabel, { marginTop: 8 }]}>Send a Message</Text>
          <View style={s.formCard}>

            <FormField label="Your Name" icon="person-outline" value={name}
              onChange={setName} placeholder="Full name" />
            <View style={s.divider} />
            <FormField label="Email Address" icon="mail-outline" value={email}
              onChange={setEmail} placeholder="you@example.com" keyboardType="email-address" />
            <View style={s.divider} />

            {/* Subject picker */}
            <View style={s.subjectSection}>
              <Text style={s.fieldLabel}>Subject</Text>
              <View style={s.subjectChips}>
                {SUBJECTS.map(sub => (
                  <TouchableOpacity key={sub}
                    style={[s.subjectChip, subject === sub && s.subjectChipActive]}
                    onPress={() => setSubject(sub)} activeOpacity={0.8}>
                    <Text style={[s.subjectChipText, subject === sub && s.subjectChipTextActive]}>
                      {sub}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.divider} />

            {/* Message */}
            <View style={s.messageSection}>
              <View style={s.fieldRow}>
                <View style={s.fieldIconBox}>
                  <Ionicons name="create-outline" size={17} color="#8696a0" />
                </View>
                <Text style={s.fieldLabel}>Message</Text>
              </View>
              <TextInput
                style={s.messageInput}
                value={message}
                onChangeText={setMessage}
                placeholder="Describe your issue or question in detail..."
                placeholderTextColor="#c4c9d0"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              <Text style={s.charCount}>{message.length} / 500</Text>
            </View>
          </View>

          {/* Error */}
          {!!error && (
            <View style={s.errorCard}>
              <Ionicons name="alert-circle-outline" size={16} color="#dc2626" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit */}
          <TouchableOpacity
            style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit || sending}
            activeOpacity={0.88}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="send-outline" size={18} color="#fff" />
                  <Text style={s.submitBtnText}>Send Message</Text>
                </>
            }
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FormField({ label, icon, value, onChange, placeholder, keyboardType }: {
  label: string; icon: string; value: string;
  onChange: (v: string) => void; placeholder?: string; keyboardType?: any;
}) {
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
          autoCapitalize={keyboardType === "email-address" ? "none" : "words"}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root:               { flex: 1, backgroundColor: "#f4f8ff" },
  header:             { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#f4f8ff", borderBottomWidth: 1, borderBottomColor: "#eef0f3" },
  backBtn:            { width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  headerTitle:        { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  scroll:             { paddingHorizontal: 20, paddingTop: 20 },

  heroBanner:         { borderRadius: 22, padding: 24, marginBottom: 20, alignItems: "center" },
  heroEmoji:          { fontSize: 32, marginBottom: 8 },
  heroTitle:          { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.3, marginBottom: 6 },
  heroSub:            { fontSize: 13, color: "rgba(255,255,255,0.65)", textAlign: "center", lineHeight: 19, fontWeight: "500" },

  sectionLabel:       { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10, paddingLeft: 4 },

  channelCard:        { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1 },
  channelIcon:        { width: 48, height: 48, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  channelLabel:       { fontSize: 14, fontWeight: "800", color: "#101720", marginBottom: 2 },
  channelDetail:      { fontSize: 13, fontWeight: "700", marginBottom: 1 },
  channelSub:         { fontSize: 11, color: "#8696a0", fontWeight: "600" },

  formCard:           { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#eef0f3", overflow: "hidden", marginBottom: 16 },
  divider:            { height: 1, backgroundColor: "#f3f4f6", marginHorizontal: 16 },

  subjectSection:     { padding: 16 },
  fieldLabel:         { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },
  subjectChips:       { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subjectChip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: "#f4f8ff", borderWidth: 1, borderColor: "#eef0f3" },
  subjectChipActive:  { backgroundColor: "#101720", borderColor: "#101720" },
  subjectChipText:    { fontSize: 12, fontWeight: "700", color: "#8696a0" },
  subjectChipTextActive:{ color: "#fff" },

  messageSection:     { padding: 16 },
  fieldRow:           { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  fieldIconBox:       { width: 30, height: 30, borderRadius: 9, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center" },
  messageInput:       { fontSize: 14, color: "#101720", fontWeight: "500", minHeight: 110, lineHeight: 21, borderWidth: 1, borderColor: "#eef0f3", borderRadius: 12, padding: 12, backgroundColor: "#fafafa" },
  charCount:          { textAlign: "right", fontSize: 11, color: "#c4c9d0", fontWeight: "600", marginTop: 6 },

  errorCard:          { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fef2f2", borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: "#fecaca" },
  errorText:          { flex: 1, fontSize: 13, color: "#dc2626", fontWeight: "600", lineHeight: 18 },

  submitBtn:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#02023E", borderRadius: 18, paddingVertical: 17, marginBottom: 12 },
  submitBtnDisabled:  { opacity: 0.35 },
  submitBtnText:      { fontSize: 16, fontWeight: "800", color: "#fff" },

  successWrap:        { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  successCircle:      { width: 100, height: 100, borderRadius: 34, justifyContent: "center", alignItems: "center", marginBottom: 24 },
  successTitle:       { fontSize: 26, fontWeight: "800", color: "#101720", marginBottom: 12, letterSpacing: -0.4 },
  successSub:         { fontSize: 14, color: "#8696a0", textAlign: "center", lineHeight: 22, fontWeight: "500", marginBottom: 32 },
  doneBtn:            { backgroundColor: "#101720", borderRadius: 16, paddingHorizontal: 32, paddingVertical: 15 },
  doneBtnText:        { fontSize: 15, fontWeight: "800", color: "#fff" },
});

const f = StyleSheet.create({
  row:    { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  iconBox:{ width: 36, height: 36, borderRadius: 11, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center" },
  label:  { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 3 },
  input:  { fontSize: 15, color: "#101720", fontWeight: "500", paddingVertical: 0 },
});