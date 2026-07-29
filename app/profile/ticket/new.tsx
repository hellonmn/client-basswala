/**
 * app/profile/ticket/new.tsx — Create a new support ticket
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { supportApi } from "../../../services/userApi";

// Lightweight toast that works on web and native
const Toast = ({ visible, type, message, onDone }: { visible: boolean; type: "error" | "info"; message: string; onDone: () => void }) => {
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
  const border = type === "error" ? "#fecaca" : "#a5f3fc";
  const color = type === "error" ? "#ef4444" : "#02023E";
  return (
    <Animated.View style={{
      position: "absolute", top: Platform.OS === "ios" ? 54 : 14, left: 16, right: 16,
      backgroundColor: bg, borderColor: border, borderWidth: 1, borderRadius: 12,
      padding: 12, flexDirection: "row", alignItems: "center", gap: 10, zIndex: 999,
      transform: [{ translateY: tx }],
      shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    }}>
      <Ionicons name={type === "error" ? "alert-circle" : "information-circle"} size={18} color={color} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color }}>{message}</Text>
    </Animated.View>
  );
};

const TYPES = [
  { key: "Refund", label: "Refund", icon: "cash-outline" as const, color: "#22c55e" },
  { key: "Booking Issue", label: "Booking Issue", icon: "calendar-outline" as const, color: "#6366f1" },
  { key: "Payment Problem", label: "Payment Problem", icon: "card-outline" as const, color: "#f59e0b" },
  { key: "DJ Complaint", label: "DJ Complaint", icon: "musical-notes-outline" as const, color: "#8b5cf6" },
  { key: "Equipment Issue", label: "Equipment Issue", icon: "hardware-chip-outline" as const, color: "#0ea5e9" },
  { key: "Technical Support", label: "Technical Support", icon: "build-outline" as const, color: "#64748b" },
  { key: "Account", label: "Account", icon: "person-circle-outline" as const, color: "#ec4899" },
  { key: "Other", label: "Other", icon: "ellipsis-horizontal-circle-outline" as const, color: "#8696a0" },
];

export default function NewTicketScreen() {
  const router = useRouter();
  const [type, setType] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: "error" | "info"; message: string } | null>(null);
  const [createdTicket, setCreatedTicket] = useState<any | null>(null);

  const showToast = (type: "error" | "info", message: string) => setToast({ type, message });

  const submit = async () => {
    if (!type) return showToast("error", "Please select what this ticket is about");
    if (!subject.trim()) return showToast("error", "Please add a subject");
    if (!description.trim() || description.trim().length < 10)
      return showToast("error", "Please add at least 10 characters in the description");

    setSubmitting(true);
    try {
      const res = await supportApi.createTicket({ type, subject: subject.trim(), description: description.trim() });
      if (res?.success) {
        setCreatedTicket(res.data);
      } else {
        showToast("error", res?.message || "Could not create ticket");
      }
    } catch (err: any) {
      showToast("error", err?.response?.data?.message || err?.message || "Failed to create ticket");
    } finally {
      setSubmitting(false);
    }
  };

  // Success screen — shown after ticket is created
  if (createdTicket) {
    return (
      <SafeAreaView style={s.root} edges={["top"]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.replace("/profile/tickets")} style={s.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#101720" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Ticket Submitted</Text>
        </View>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: "#101720", marginBottom: 8, textAlign: "center" }}>
            Ticket created
          </Text>
          <Text style={{ fontSize: 14, color: "#8696a0", textAlign: "center", lineHeight: 21, marginBottom: 8 }}>
            Your ticket has been submitted to our support team. We'll respond shortly.
          </Text>
          <View style={{ backgroundColor: "#f0fffe", borderWidth: 1, borderColor: "#a5f3fc", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginBottom: 28 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#02023E", letterSpacing: 0.5 }}>
              #{createdTicket.ticketCode}
            </Text>
          </View>

          <TouchableOpacity
            style={{ backgroundColor: "#02023E", paddingVertical: 14, paddingHorizontal: 36, borderRadius: 14, marginBottom: 12, minWidth: 220, alignItems: "center" }}
            onPress={() => router.replace({ pathname: "/profile/ticket/[id]", params: { id: String(createdTicket.id) } })}
            activeOpacity={0.85}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>View Ticket</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ paddingVertical: 12, paddingHorizontal: 20 }}
            onPress={() => router.replace("/profile/tickets")}
          >
            <Text style={{ color: "#8696a0", fontWeight: "600", fontSize: 13 }}>Back to Tickets</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <Toast visible={!!toast} type={toast?.type || "info"} message={toast?.message || ""} onDone={() => setToast(null)} />

      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#101720" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Raise a Ticket</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">

          <Text style={s.sectionLabel}>WHAT'S THIS ABOUT?</Text>
          <View style={s.typeGrid}>
            {TYPES.map((t) => {
              const selected = type === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[s.typeCard, selected && { borderColor: t.color, backgroundColor: t.color + "10" }]}
                  onPress={() => setType(t.key)}
                  activeOpacity={0.8}
                >
                  <View style={[s.typeIconWrap, { backgroundColor: t.color + "18" }]}>
                    <Ionicons name={t.icon} size={18} color={t.color} />
                  </View>
                  <Text style={[s.typeLabel, selected && { color: t.color, fontWeight: "700" }]} numberOfLines={2}>{t.label}</Text>
                  {selected && (
                    <View style={[s.typeCheck, { backgroundColor: t.color }]}>
                      <Ionicons name="checkmark" size={10} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.sectionLabel, { marginTop: 24 }]}>SUBJECT</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. Refund for cancelled booking #123"
            placeholderTextColor="#8696a0"
            value={subject}
            onChangeText={setSubject}
            maxLength={200}
          />
          <Text style={s.hint}>{subject.length}/200</Text>

          <Text style={[s.sectionLabel, { marginTop: 16 }]}>DESCRIPTION</Text>
          <TextInput
            style={[s.input, s.textarea]}
            placeholder="Describe your issue in detail. Include booking IDs, dates, and any relevant information."
            placeholderTextColor="#8696a0"
            value={description}
            onChangeText={setDescription}
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
          <Text style={s.hint}>{description.length}/2000</Text>

          <View style={s.info}>
            <Ionicons name="information-circle-outline" size={16} color="#02023E" />
            <Text style={s.infoText}>Our team typically responds within 24 hours. You'll be notified when we reply.</Text>
          </View>
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.submitBtn, (!type || !subject.trim() || !description.trim() || submitting) && { opacity: 0.5 }]}
            onPress={submit}
            disabled={!type || !subject.trim() || !description.trim() || submitting}
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="send" size={16} color="#fff" />
                <Text style={s.submitBtnText}>Submit Ticket</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f4f8ff", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: "#101720" },

  sectionLabel: { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.8, marginBottom: 10 },

  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  typeCard: {
    width: "48%",
    backgroundColor: "#fff", borderRadius: 14, padding: 14,
    borderWidth: 1.5, borderColor: "#eef0f3",
    position: "relative",
  },
  typeIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  typeLabel: { fontSize: 13, fontWeight: "600", color: "#101720" },
  typeCheck: { position: "absolute", top: 10, right: 10, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center" },

  input: {
    backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: "#eef0f3",
    fontSize: 14, color: "#101720",
  },
  textarea: { height: 140 },
  hint: { fontSize: 11, color: "#8696a0", marginTop: 4, marginLeft: 4 },

  info: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#f0fffe", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#a5f3fc",
    marginTop: 20,
  },
  infoText: { flex: 1, fontSize: 12, color: "#02023E", lineHeight: 17, fontWeight: "500" },

  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: 16, paddingBottom: Platform.OS === "ios" ? 28 : 16,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#02023E", borderRadius: 14, paddingVertical: 15,
  },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
