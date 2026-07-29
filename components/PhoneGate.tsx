/**
 * components/PhoneGate.tsx
 *
 * Lazy phone-number collection — shown right before a booking is placed if
 * the signed-in user doesn't have a verified phone yet (typical after Google
 * sign-in). Two-step: enter phone → verify OTP via 2factor.in.
 *
 * Usage:
 *   const { ensurePhone } = usePhoneGate();
 *   const onBookPress = async () => {
 *     const ok = await ensurePhone();
 *     if (!ok) return;
 *     // proceed to booking…
 *   };
 *
 *   <PhoneGateProvider>{children}</PhoneGateProvider>   // mount once in _layout
 */

import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from "react";
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { otpApi } from "../services/userApi";

type Resolver = (ok: boolean) => void;

interface PhoneGateCtx {
  /**
   * Returns a Promise that resolves `true` once the user's phone is set and
   * verified, `false` if they cancel. If they already have a phone on the
   * account, resolves `true` immediately without showing UI.
   */
  ensurePhone: () => Promise<boolean>;
}

const Ctx = createContext<PhoneGateCtx>({ ensurePhone: async () => true });

export function usePhoneGate() {
  return useContext(Ctx);
}

export function PhoneGateProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);

  const ensurePhone = (): Promise<boolean> => {
    if (user?.phone && String(user.phone).trim()) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setVisible(true);
    });
  };

  const handleClose = (ok: boolean) => {
    setVisible(false);
    const r = resolverRef.current;
    resolverRef.current = null;
    if (r) r(ok);
  };

  return (
    <Ctx.Provider value={{ ensurePhone }}>
      {children}
      <PhoneGateSheet
        visible={visible}
        firstName={user?.firstName}
        onCancel={() => handleClose(false)}
        onSaved={async () => {
          await refreshUser();
          handleClose(true);
        }}
      />
    </Ctx.Provider>
  );
}

// ─── The bottom sheet ──────────────────────────────────────────────────────
function PhoneGateSheet({
  visible, firstName, onCancel, onSaved,
}: {
  visible: boolean;
  firstName?: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [error, setError] = useState("");

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setSessionId("");
      setResendIn(0);
      setPhoneLoading(false);
      setOtpLoading(false);
      setError("");
    }
  }, [visible]);

  // Resend countdown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneClean = phone.replace(/\D/g, "");
  const phoneValid = phoneClean.length === 10 && /^[6-9]/.test(phoneClean);
  const otpClean = otp.replace(/\D/g, "");
  const otpValid = otpClean.length >= 4;

  const describeError = (e: any): string => {
    const raw = e?.response?.data?.message || e?.message || String(e || "");
    if (/network error|Network request failed|ECONNREFUSED|ENOTFOUND|Failed to fetch/i.test(raw)) {
      return "Can't reach Basswala servers. Check your internet and try again.";
    }
    return raw || "Failed to save. Try again.";
  };

  const handleSendOtp = async () => {
    setError("");
    if (!phoneValid) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await otpApi.send(phoneClean);
      if (!res?.success || !res?.sessionId) {
        setError(res?.message || "Could not send OTP. Try again.");
        return;
      }
      setSessionId(res.sessionId);
      setStep("otp");
      setOtp("");
      setResendIn(30);
    } catch (e: any) {
      setError(describeError(e));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError("");
    if (!otpValid) {
      setError("Enter the OTP from your phone.");
      return;
    }
    setOtpLoading(true);
    try {
      const res = await otpApi.verifyPhone(phoneClean, otpClean, sessionId);
      if (!res?.success) {
        setError(res?.message || "Invalid OTP. Try again.");
        return;
      }
      onSaved();
    } catch (e: any) {
      setError(describeError(e));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    await handleSendOtp();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.overlay}
      >
        <Pressable
          style={s.overlayTap}
          onPress={() => { Keyboard.dismiss(); onCancel(); }}
        />
        <View style={s.sheet}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.scrollPad}
            bounces={false}
          >
            <View style={s.handle} />

            <View style={s.header}>
              <View style={s.icon}>
                <Ionicons name={step === "otp" ? "keypad" : "call"} size={22} color="#02023E" />
              </View>
              <Text style={s.title}>
                {step === "phone"
                  ? (firstName ? `Hey ${firstName}, add your phone` : "Add your phone")
                  : "Verify your phone"}
              </Text>
              <Text style={s.subtitle}>
                {step === "phone"
                  ? "Captains need a way to reach you about your booking. We'll send a one-time code to verify."
                  : `We sent a 6-digit code to +91 ${phoneClean}.`}
              </Text>
            </View>

            {step === "phone" ? (
              <>
                <View style={[s.inputRow, error ? s.inputRowErr : null]}>
                  <View style={s.flag}>
                    <Text style={s.flagEmoji}>🇮🇳</Text>
                    <Text style={s.dial}>+91</Text>
                  </View>
                  <View style={s.divider} />
                  <TextInput
                    style={s.input}
                    value={phone}
                    onChangeText={(v) => {
                      setPhone(v.replace(/\D/g, "").slice(0, 10));
                      if (error) setError("");
                    }}
                    placeholder="10-digit mobile"
                    placeholderTextColor="#B0B8C1"
                    keyboardType="phone-pad"
                    maxLength={10}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => phoneValid && handleSendOtp()}
                  />
                </View>

                {error ? (
                  <View style={s.errRow}>
                    <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                    <Text style={s.errText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.submit, (!phoneValid || phoneLoading) && { opacity: 0.5 }]}
                  onPress={handleSendOtp}
                  disabled={!phoneValid || phoneLoading}
                  activeOpacity={0.85}
                >
                  {phoneLoading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="send" size={14} color="#fff" />
                        <Text style={s.submitText}>Send OTP</Text>
                      </>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={[s.inputRow, error ? s.inputRowErr : null]}>
                  <Ionicons name="keypad-outline" size={18} color="#8696a0" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[s.input, { letterSpacing: 8, fontSize: 18, fontWeight: "700" }]}
                    value={otp}
                    onChangeText={(v) => {
                      setOtp(v.replace(/\D/g, "").slice(0, 6));
                      if (error) setError("");
                    }}
                    placeholder="�? �? �? �? �? �?"
                    placeholderTextColor="#cdd5dd"
                    keyboardType="number-pad"
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={() => otpValid && handleVerifyOtp()}
                    autoFocus
                  />
                </View>

                {error ? (
                  <View style={s.errRow}>
                    <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                    <Text style={s.errText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.submit, (!otpValid || otpLoading) && { opacity: 0.5 }]}
                  onPress={handleVerifyOtp}
                  disabled={!otpValid || otpLoading}
                  activeOpacity={0.85}
                >
                  {otpLoading
                    ? <ActivityIndicator color="#fff" />
                    : <>
                        <Ionicons name="checkmark-circle" size={14} color="#fff" />
                        <Text style={s.submitText}>Verify & Continue</Text>
                      </>}
                </TouchableOpacity>

                <View style={s.otpFooter}>
                  <TouchableOpacity
                    onPress={() => { setStep("phone"); setOtp(""); setError(""); }}
                    activeOpacity={0.7}
                  >
                    <Text style={s.editPhone}>�? Change number</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resendIn > 0 || phoneLoading}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.resend, resendIn > 0 && { color: "#c4c9d0" }]}>
                      {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            <TouchableOpacity onPress={onCancel} style={s.cancel} activeOpacity={0.7}>
              <Text style={s.cancelText}>Not now</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  overlayTap: { flex: 1 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "92%",
  },
  scrollPad: {
    paddingHorizontal: 24, paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
  },
  handle: {
    alignSelf: "center",
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: "#e4ebf0", marginBottom: 12,
  },

  header: { alignItems: "center", marginBottom: 20 },
  icon: {
    width: 54, height: 54, borderRadius: 16, marginBottom: 14,
    backgroundColor: "#f0fffe", borderWidth: 1, borderColor: "#a5f3fc",
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#101720", textAlign: "center", marginBottom: 6 },
  subtitle: { fontSize: 13, color: "#8696a0", textAlign: "center", lineHeight: 19, paddingHorizontal: 8 },

  inputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#E4EBF0",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: "#fff",
  },
  inputRowErr: { borderColor: "#ef4444" },
  flag: { flexDirection: "row", alignItems: "center", gap: 4 },
  flagEmoji: { fontSize: 17 },
  dial: { fontSize: 14, fontWeight: "600", color: "#101720" },
  divider: { width: 1, height: 20, backgroundColor: "#E4EBF0", marginHorizontal: 10 },
  input: { flex: 1, fontSize: 15, color: "#111", padding: 0 },

  errRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  errText: { fontSize: 12, color: "#ef4444", fontWeight: "500" },

  submit: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#02023E", borderRadius: 14, paddingVertical: 14,
    marginTop: 14,
  },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  otpFooter: {
    flexDirection: "row", justifyContent: "space-between",
    paddingTop: 14, marginTop: 2,
  },
  editPhone: { fontSize: 13, color: "#8696a0", fontWeight: "700" },
  resend: { fontSize: 13, color: "#02023E", fontWeight: "800" },

  cancel: { alignItems: "center", paddingVertical: 14, marginTop: 6 },
  cancelText: { fontSize: 13, color: "#8696a0", fontWeight: "600" },
});
