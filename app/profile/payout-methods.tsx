/**
 * app/profile/payout-methods.tsx — Manage refund payout methods
 *
 * Users can add UPI IDs or bank accounts where refunds will be sent.
 * One method is marked as default; the support team uses the default
 * to process manual refunds.
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { userApi } from "../../services/userApi";

interface PayoutMethod {
  id: number;
  type: "upi" | "bank";
  upiId?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankName?: string | null;
  isDefault: boolean;
}

const maskAccount = (num?: string | null) => {
  if (!num) return "";
  const s = String(num);
  if (s.length <= 4) return s;
  return "••••" + s.slice(-4);
};

export default function PayoutMethodsScreen() {
  const router = useRouter();
  const [methods, setMethods] = useState<PayoutMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userApi.getPayoutMethods();
      if (res?.success) setMethods(res.data || []);
    } catch (err: any) {
      console.error("Load payout methods:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleDelete = (m: PayoutMethod) => {
    const label =
      m.type === "upi" ? m.upiId : `${m.bankName || "Bank"} ${maskAccount(m.accountNumber)}`;
    Alert.alert("Remove payout method?", `Delete ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            const res = await userApi.deletePayoutMethod(m.id);
            if (res?.success) {
              setMethods((prev) => prev.filter((x) => x.id !== m.id));
            } else {
              Alert.alert("Error", res?.message || "Failed to delete");
            }
          } catch (err: any) {
            Alert.alert("Error", err?.response?.data?.message || err?.message || "Failed to delete");
          }
        },
      },
    ]);
  };

  const handleSetDefault = async (m: PayoutMethod) => {
    if (m.isDefault) return;
    try {
      const res = await userApi.setDefaultPayoutMethod(m.id);
      if (res?.success) {
        setMethods((prev) =>
          prev.map((x) => ({ ...x, isDefault: x.id === m.id }))
        );
      }
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || err?.message || "Failed to set default");
    }
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#101720" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Payout Methods</Text>
          <View style={{ width: 42 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Info card */}
          <View style={s.infoCard}>
            <View style={s.infoIcon}>
              <Ionicons name="information-circle-outline" size={20} color="#02023E" />
            </View>
            <Text style={s.infoText}>
              When you request a refund, we'll send the money to your{" "}
              <Text style={{ fontWeight: "800", color: "#101720" }}>default</Text> payout method.
              You can add multiple UPI IDs or bank accounts.
            </Text>
          </View>

          {loading ? (
            <View style={s.loadingCard}>
              <ActivityIndicator color="#02023E" />
            </View>
          ) : methods.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="wallet-outline" size={36} color="#02023E" />
              </View>
              <Text style={s.emptyTitle}>No payout methods</Text>
              <Text style={s.emptySub}>
                Add a UPI ID or bank account so refunds can be sent to you automatically.
              </Text>
            </View>
          ) : (
            methods.map((m) => (
              <View key={m.id} style={[s.card, m.isDefault && s.cardDefault]}>
                <View style={[s.cardIcon, { backgroundColor: m.type === "upi" ? "#f0fffe" : "#fef3c7" }]}>
                  <Ionicons
                    name={m.type === "upi" ? "phone-portrait-outline" : "business-outline"}
                    size={20}
                    color={m.type === "upi" ? "#02023E" : "#d97706"}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.cardTitleRow}>
                    <Text style={s.cardTitle}>
                      {m.type === "upi" ? "UPI" : "Bank Account"}
                    </Text>
                    {m.isDefault && (
                      <View style={s.defaultBadge}>
                        <Ionicons name="checkmark-circle" size={10} color="#22c55e" />
                        <Text style={s.defaultBadgeText}>DEFAULT</Text>
                      </View>
                    )}
                  </View>
                  {m.type === "upi" ? (
                    <Text style={s.cardValue}>{m.upiId}</Text>
                  ) : (
                    <>
                      <Text style={s.cardValue}>
                        {m.accountHolderName}
                      </Text>
                      <Text style={s.cardMeta}>
                        {m.bankName ? m.bankName + " · " : ""}
                        {maskAccount(m.accountNumber)} · {m.ifscCode}
                      </Text>
                    </>
                  )}
                </View>
                <View style={{ gap: 6, alignItems: "flex-end" }}>
                  {!m.isDefault && (
                    <TouchableOpacity onPress={() => handleSetDefault(m)} style={s.setDefBtn}>
                      <Text style={s.setDefText}>Set default</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => handleDelete(m)} style={s.deleteBtn}>
                    <Ionicons name="trash-outline" size={14} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {/* Add button */}
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setShowAdd(true)}
            activeOpacity={0.85}
          >
            <LinearGradient colors={["#02023E", "#02023E"]} style={s.addBtnGrad}>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={s.addBtnText}>Add Payout Method</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </LinearGradient>

      <AddPayoutModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => {
          setShowAdd(false);
          load();
        }}
      />
    </SafeAreaView>
  );
}

// ─── Add modal ────────────────────────────────────────────────────────────────
function AddPayoutModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [type, setType] = useState<"upi" | "bank">("upi");
  const [upiId, setUpiId] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType("upi");
    setUpiId("");
    setAccountHolderName("");
    setAccountNumber("");
    setConfirmAccountNumber("");
    setIfscCode("");
    setBankName("");
    setMakeDefault(true);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (type === "upi") {
      if (!upiId.trim()) return Alert.alert("Required", "Please enter your UPI ID");
      if (!/^[\w.\-]+@[\w.\-]+$/.test(upiId.trim())) {
        return Alert.alert("Invalid UPI ID", "UPI IDs look like name@bank — e.g. ravi@okicici");
      }
    } else {
      if (!accountHolderName.trim()) return Alert.alert("Required", "Account holder name is required");
      if (!accountNumber.trim()) return Alert.alert("Required", "Account number is required");
      if (accountNumber.trim() !== confirmAccountNumber.trim()) {
        return Alert.alert("Account numbers don't match", "Please re-enter your account number carefully");
      }
      if (!/^\d{6,20}$/.test(accountNumber.trim())) {
        return Alert.alert("Invalid account number", "Must be 6–20 digits");
      }
      if (!ifscCode.trim()) return Alert.alert("Required", "IFSC code is required");
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.trim().toUpperCase())) {
        return Alert.alert(
          "Invalid IFSC",
          "IFSC codes look like HDFC0001234 (4 letters + 0 + 6 alphanumeric)"
        );
      }
    }

    setSaving(true);
    try {
      const res = await userApi.addPayoutMethod({
        type,
        upiId: type === "upi" ? upiId.trim() : undefined,
        accountHolderName: type === "bank" ? accountHolderName.trim() : undefined,
        accountNumber: type === "bank" ? accountNumber.trim() : undefined,
        ifscCode: type === "bank" ? ifscCode.trim().toUpperCase() : undefined,
        bankName: type === "bank" ? bankName.trim() || undefined : undefined,
        makeDefault,
      });
      if (res?.success) {
        reset();
        onAdded();
      } else {
        Alert.alert("Error", res?.message || "Failed to add payout method");
      }
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || err?.message || "Failed to add payout method");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={m.overlay}>
          <View style={m.sheet}>
            <View style={m.topRow}>
              <Text style={m.title}>Add Payout Method</Text>
              <TouchableOpacity onPress={handleClose} style={m.closeBtn}>
                <Ionicons name="close" size={20} color="#101720" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Type switcher */}
              <View style={m.typeRow}>
                <TouchableOpacity
                  style={[m.typeBtn, type === "upi" && m.typeBtnActive]}
                  onPress={() => setType("upi")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="phone-portrait-outline" size={18} color={type === "upi" ? "#fff" : "#8696a0"} />
                  <Text style={[m.typeBtnText, type === "upi" && m.typeBtnTextActive]}>UPI</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[m.typeBtn, type === "bank" && m.typeBtnActive]}
                  onPress={() => setType("bank")}
                  activeOpacity={0.85}
                >
                  <Ionicons name="business-outline" size={18} color={type === "bank" ? "#fff" : "#8696a0"} />
                  <Text style={[m.typeBtnText, type === "bank" && m.typeBtnTextActive]}>Bank Account</Text>
                </TouchableOpacity>
              </View>

              {type === "upi" ? (
                <View style={m.field}>
                  <Text style={m.label}>UPI ID</Text>
                  <TextInput
                    style={m.input}
                    value={upiId}
                    onChangeText={setUpiId}
                    placeholder="name@okicici"
                    placeholderTextColor="#c4c9d0"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={m.hint}>
                    <Ionicons name="information-circle-outline" size={10} color="#8696a0" /> Works with
                    PhonePe, Google Pay, Paytm and any BHIM-UPI app.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={m.field}>
                    <Text style={m.label}>Account Holder Name</Text>
                    <TextInput
                      style={m.input}
                      value={accountHolderName}
                      onChangeText={setAccountHolderName}
                      placeholder="As per bank records"
                      placeholderTextColor="#c4c9d0"
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={m.field}>
                    <Text style={m.label}>Bank Name (optional)</Text>
                    <TextInput
                      style={m.input}
                      value={bankName}
                      onChangeText={setBankName}
                      placeholder="e.g. HDFC Bank"
                      placeholderTextColor="#c4c9d0"
                      autoCapitalize="words"
                    />
                  </View>
                  <View style={m.field}>
                    <Text style={m.label}>Account Number</Text>
                    <TextInput
                      style={m.input}
                      value={accountNumber}
                      onChangeText={(v) => setAccountNumber(v.replace(/[^\d]/g, ""))}
                      placeholder="Enter account number"
                      placeholderTextColor="#c4c9d0"
                      keyboardType="number-pad"
                      secureTextEntry
                    />
                  </View>
                  <View style={m.field}>
                    <Text style={m.label}>Confirm Account Number</Text>
                    <TextInput
                      style={m.input}
                      value={confirmAccountNumber}
                      onChangeText={(v) => setConfirmAccountNumber(v.replace(/[^\d]/g, ""))}
                      placeholder="Re-enter account number"
                      placeholderTextColor="#c4c9d0"
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={m.field}>
                    <Text style={m.label}>IFSC Code</Text>
                    <TextInput
                      style={m.input}
                      value={ifscCode}
                      onChangeText={(v) => setIfscCode(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))}
                      placeholder="HDFC0001234"
                      placeholderTextColor="#c4c9d0"
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={11}
                    />
                  </View>
                </>
              )}

              <TouchableOpacity
                style={m.defaultRow}
                onPress={() => setMakeDefault((v) => !v)}
                activeOpacity={0.8}
              >
                <View style={[m.checkbox, makeDefault && m.checkboxOn]}>
                  {makeDefault && <Ionicons name="checkmark" size={14} color="#fff" />}
                </View>
                <Text style={m.defaultText}>Make this my default payout method</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={m.submitBtn}
                onPress={handleSubmit}
                disabled={saving}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#02023E", "#02023E"]} style={m.submitGrad}>
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={m.submitText}>Save Payout Method</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <View style={m.securityNote}>
                <Ionicons name="lock-closed-outline" size={12} color="#8696a0" />
                <Text style={m.securityText}>
                  Your details are stored securely and only used to process refunds.
                </Text>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f3",
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  scroll: { padding: 20 },

  infoCard: {
    flexDirection: "row", gap: 10,
    backgroundColor: "#fff", borderRadius: 16, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: "#a5f3fc",
    backgroundColor: "#f0fffe",
  },
  infoIcon: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  infoText: {
    flex: 1, fontSize: 12, color: "#02023E",
    fontWeight: "600", lineHeight: 18,
  },

  loadingCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 30,
    alignItems: "center", borderWidth: 1, borderColor: "#eef0f3",
  },
  emptyCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 28,
    alignItems: "center", marginBottom: 16,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: "#f0fffe", alignItems: "center", justifyContent: "center",
    marginBottom: 12, borderWidth: 1, borderColor: "#a5f3fc",
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#101720" },
  emptySub: {
    fontSize: 13, color: "#8696a0", textAlign: "center",
    marginTop: 6, lineHeight: 19, fontWeight: "500",
  },

  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: "#eef0f3",
  },
  cardDefault: { borderColor: "#22c55e", borderWidth: 1.5, backgroundColor: "#f0fdf4" },
  cardIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  cardTitle: { fontSize: 11, fontWeight: "800", color: "#8696a0", letterSpacing: 0.5 },
  defaultBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#fff", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: "#bbf7d0",
  },
  defaultBadgeText: { fontSize: 8, fontWeight: "800", color: "#22c55e", letterSpacing: 0.5 },
  cardValue: { fontSize: 14, fontWeight: "800", color: "#101720" },
  cardMeta: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },

  setDefBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, backgroundColor: "#f0fffe",
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  setDefText: { fontSize: 10, fontWeight: "800", color: "#02023E" },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: "#fef2f2",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#fecaca",
  },

  addBtn: { marginTop: 16, borderRadius: 16, overflow: "hidden" },
  addBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15,
  },
  addBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 16, maxHeight: "92%",
  },
  topRow: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: "800", color: "#101720" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
  },

  typeRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  typeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 14,
    backgroundColor: "#f4f8ff",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  typeBtnActive: { backgroundColor: "#02023E", borderColor: "#02023E" },
  typeBtnText: { fontSize: 13, fontWeight: "700", color: "#8696a0" },
  typeBtnTextActive: { color: "#fff" },

  field: { marginBottom: 14 },
  label: {
    fontSize: 11, fontWeight: "700", color: "#5a6169",
    marginBottom: 7, letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  input: {
    borderWidth: 1, borderColor: "#eef0f3", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: "#101720",
  },
  hint: { fontSize: 10, color: "#8696a0", fontWeight: "500", marginTop: 5, lineHeight: 14 },

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

  submitBtn: { marginTop: 10, borderRadius: 16, overflow: "hidden" },
  submitGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 15, gap: 8,
  },
  submitText: { fontSize: 15, fontWeight: "800", color: "#fff" },

  securityNote: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, marginTop: 12,
  },
  securityText: { fontSize: 11, color: "#8696a0", fontWeight: "500" },
});
