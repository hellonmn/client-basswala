/**
 * components/LoginGate.tsx
 *
 * Lazy login bottom sheet — shown the moment an unauthenticated user tries
 * to do something that needs an account (book, view profile, open cart, etc.).
 *
 * Auth options inside the sheet:
 *   1. Phone + OTP (primary, via 2factor.in)
 *   2. Continue with Google
 */

import { Ionicons } from "@expo/vector-icons";
import * as AppleAuthentication from "expo-apple-authentication";
import React, {
  createContext, useContext, useEffect, useRef, useState, ReactNode,
} from "react";
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { otpApi } from "../services/userApi";

const isWeb = Platform.OS === "web";

type Resolver = (ok: boolean) => void;

interface LoginGateCtx {
  ensureLogin: () => Promise<boolean>;
}

const Ctx = createContext<LoginGateCtx>({ ensureLogin: async () => true });

export function useLoginGate() {
  return useContext(Ctx);
}

export function LoginGateProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);

  useEffect(() => {
    if (visible && isAuthenticated) {
      setVisible(false);
      const r = resolverRef.current;
      resolverRef.current = null;
      if (r) r(true);
    }
  }, [isAuthenticated, visible]);

  const ensureLogin = (): Promise<boolean> => {
    if (isAuthenticated) return Promise.resolve(true);
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
    <Ctx.Provider value={{ ensureLogin }}>
      {children}
      <LoginSheet
        visible={visible}
        onCancel={() => handleClose(false)}
        onSignedIn={() => handleClose(true)}
      />
    </Ctx.Provider>
  );
}

const GoogleIcon = ({ size = 18 }: { size?: number }) => {
  const Svg = require("react-native-svg").default;
  const { Path } = require("react-native-svg");
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </Svg>
  );
};

function LoginSheet({
  visible, onCancel, onSignedIn,
}: {
  visible: boolean;
  onCancel: () => void;
  onSignedIn: () => void;
}) {
  const { loginWithOtp, loginWithGoogle, loginWithApple } = useAuth();

  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const [phoneLoading, setPhoneLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const [formError, setFormError] = useState("");
  const [googleError, setGoogleError] = useState("");
  
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setIsAppleAvailable)
      .catch(() => setIsAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (!visible) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setSessionId("");
      setResendIn(0);
      setPhoneLoading(false);
      setOtpLoading(false);
      setGoogleLoading(false);
      setAppleLoading(false);
      setFormError("");
      setGoogleError("");
    }
  }, [visible]);

  const handleApple = async () => {
    setFormError("");
    setGoogleError("");
    setAppleLoading(true);
    try {
      await loginWithApple();
      onSignedIn();
    } catch (e: any) {
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      if (code.includes("CANCELED") || msg.toLowerCase().includes("cancel")) return;
      setGoogleError(describeError(e));
    } finally {
      setAppleLoading(false);
    }
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const phoneClean = phone.replace(/\D/g, "");
  const phoneValid = phoneClean.length === 10 && /^[6-9]/.test(phoneClean);
  const otpClean = otp.replace(/\D/g, "");
  const otpValid = otpClean.length === 6;

  const describeError = (e: any): string => {
    const raw = e?.response?.data?.message || e?.message || String(e || "");
    if (/network error|Network request failed|ECONNREFUSED|ENOTFOUND|Failed to fetch/i.test(raw)) {
      return "Can't reach Basswala servers. Check your internet and try again.";
    }
    return raw || "Something went wrong. Please try again.";
  };

  const handleSendOtp = async () => {
    setFormError("");
    setGoogleError("");
    if (!phoneValid) {
      setFormError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setPhoneLoading(true);
    try {
      const res = await otpApi.send(phoneClean);
      if (!res?.success || !res?.sessionId) {
        setFormError(res?.message || "Could not send OTP. Try again.");
        return;
      }
      setSessionId(res.sessionId);
      setStep("otp");
      setOtp("");
      setResendIn(30);
    } catch (e: any) {
      setFormError(describeError(e));
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleVerifyOtp = async (forcedCode?: string) => {
    setFormError("");
    const codeToVerify = forcedCode || otpClean;
    if (codeToVerify.length !== 6) {
      setFormError("Enter the 6-digit code.");
      return;
    }
    setOtpLoading(true);
    try {
      const res = await otpApi.login(phoneClean, codeToVerify, sessionId);
      if (!res?.success || !res?.token) {
        setFormError(res?.message || "Invalid OTP. Try again.");
        return;
      }
      await loginWithOtp(res.token, res.user);
      onSignedIn();
    } catch (e: any) {
      setFormError(describeError(e));
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    await handleSendOtp();
  };

  const handleGoogle = async () => {
    setFormError("");
    setGoogleError("");
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg.includes("popup-closed") || msg.toLowerCase().includes("cancel")) return;
      setGoogleError(describeError(e));
    } finally {
      setGoogleLoading(false);
    }
  };

  const otpArr = otpClean.split("");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.overlay}>
        <Pressable style={s.overlayTap} onPress={() => { Keyboard.dismiss(); onCancel(); }} />
        <View style={s.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollPad} bounces={false}>
            <View style={s.handle} />

            <View style={s.header}>
              <View style={s.brandPuck}>
                <Ionicons name={step === "otp" ? "keypad" : "sparkles"} size={20} color="#02023E" />
              </View>
              <Text style={s.title}>{step === "phone" ? "Sign in to continue" : "Enter the OTP"}</Text>
              <Text style={s.subtitle}>
                {step === "phone"
                  ? "We'll text you a one-time code — your bookings and chats follow you across devices."
                  : `Sent to +91 ${phoneClean}. Code expires in a few minutes.`}
              </Text>
            </View>

            {step === "phone" ? (
              <>
                <View style={[
                  s.inputRow, 
                  formError ? s.inputRowErr : null,
                  phoneFocused && !formError ? s.inputRowFocused : null
                ]}>
                  <View style={s.flag}>
                    <Text style={s.flagEmoji}>🇮🇳</Text>
                    <Text style={s.dial}>+91</Text>
                  </View>
                  <View style={s.flagDivider} />
                  <TextInput
                    style={[s.input, isWeb && { outline: 'none' } as any]}
                    value={phone}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    onChangeText={(v) => {
                      setPhone(v.replace(/\D/g, "").slice(0, 10));
                      if (formError) setFormError("");
                    }}
                    placeholder="10-digit mobile"
                    placeholderTextColor="#B0B8C1"
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={() => phoneValid && handleSendOtp()}
                    autoFocus
                  />
                </View>

                {formError ? (
                  <View style={s.errBox}>
                    <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                    <Text style={s.errText}>{formError}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.submit, (!phoneValid || phoneLoading) && { opacity: 0.5 }]}
                  onPress={handleSendOtp}
                  disabled={!phoneValid || phoneLoading}
                  activeOpacity={0.88}
                >
                  {phoneLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="send" size={14} color="#fff" />
                        <Text style={s.submitText}>Send OTP</Text>
                      </>}
                </TouchableOpacity>

                <View style={s.dividerRow}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>or</Text>
                  <View style={s.dividerLine} />
                </View>

                {isAppleAvailable && (
                  <TouchableOpacity
                    style={[s.appleBtn, appleLoading && { opacity: 0.6 }]}
                    onPress={handleApple}
                    disabled={appleLoading}
                    activeOpacity={0.88}
                  >
                    {appleLoading ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="logo-apple" size={18} color="#ffffff" />
                        <Text style={s.appleText}>Continue with Apple</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[s.googleBtn, googleLoading && { opacity: 0.6 }]}
                  onPress={handleGoogle}
                  disabled={googleLoading}
                  activeOpacity={0.88}
                >
                  {googleLoading ? (
                    <ActivityIndicator color="#101720" size="small" />
                  ) : (
                    <>
                      <GoogleIcon />
                      <Text style={s.googleText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                {googleError ? (
                  <View style={s.errBox}>
                    <Ionicons name="cloud-offline-outline" size={13} color="#ef4444" />
                    <Text style={s.errText}>{googleError}</Text>
                  </View>
                ) : null}

                <TouchableOpacity onPress={onCancel} style={s.cancel} activeOpacity={0.7}>
                  <Text style={s.cancelText}>Maybe later</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={s.otpBoxRow} activeOpacity={1} onPress={() => otpInputRef.current?.focus()}>
                  {[0, 1, 2, 3, 4, 5].map((idx) => (
                    <View key={idx} style={[
                      s.otpBox,
                      otpArr[idx] ? s.otpBoxFilled : null,
                      otpFocused && otpArr.length === idx ? s.otpBoxActive : null,
                      formError ? s.otpBoxError : null
                    ]}>
                      <Text style={s.otpText}>{otpArr[idx] || ""}</Text>
                    </View>
                  ))}
                </TouchableOpacity>

                <TextInput
                  ref={otpInputRef}
                  style={[s.hiddenInput, isWeb && { outline: 'none' } as any]}
                  value={otp}
                  onFocus={() => setOtpFocused(true)}
                  onBlur={() => setOtpFocused(false)}
                  onChangeText={(v) => {
                    const clean = v.replace(/\D/g, "").slice(0, 6);
                    setOtp(clean);
                    if (formError) setFormError("");
                    if (clean.length === 6) {
                      handleVerifyOtp(clean);
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />

                {formError ? (
                  <View style={s.errBox}>
                    <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
                    <Text style={s.errText}>{formError}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.submit, (!otpValid || otpLoading) && { opacity: 0.5 }, { marginTop: 24 }]}
                  onPress={() => handleVerifyOtp()}
                  disabled={!otpValid || otpLoading}
                  activeOpacity={0.88}
                >
                  {otpLoading
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <>
                        <Ionicons name="checkmark-circle" size={14} color="#fff" />
                        <Text style={s.submitText}>Verify & Continue</Text>
                      </>}
                </TouchableOpacity>

                <View style={s.otpFooter}>
                  <TouchableOpacity onPress={() => { setStep("phone"); setOtp(""); setFormError(""); }} activeOpacity={0.7}>
                    <Text style={s.editPhone}>�? Change number</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleResend} disabled={resendIn > 0 || phoneLoading} activeOpacity={0.7}>
                    <Text style={[s.resend, resendIn > 0 && { color: "#c4c9d0" }]}>
                      {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.55)", justifyContent: "flex-end" },
  overlayTap: { flex: 1 },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%" },
  scrollPad: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 36 : 22 },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#e4ebf0", marginBottom: 12 },
  header: { alignItems: "center", marginBottom: 20, marginTop: 4 },
  brandPuck: { width: 52, height: 52, borderRadius: 16, marginBottom: 14, backgroundColor: "#f0fffe", borderWidth: 1, borderColor: "#a5f3fc", alignItems: "center", justifyContent: "center" },
  title: { fontSize: 19, fontWeight: "800", color: "#101720", letterSpacing: -0.3, marginBottom: 6 },
  subtitle: { fontSize: 13, color: "#6B7A8A", textAlign: "center", lineHeight: 19, paddingHorizontal: 4 },
  inputRow: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E4EBF0", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#fff" },
  inputRowErr: { borderColor: "#ef4444" },
  inputRowFocused: { borderColor: "#02023E" },
  input: { flex: 1, fontSize: 14, color: "#101720", padding: 0 },
  flag: { flexDirection: "row", alignItems: "center", gap: 4 },
  flagEmoji: { fontSize: 17 },
  dial: { fontSize: 14, fontWeight: "700", color: "#101720" },
  flagDivider: { width: 1, height: 20, backgroundColor: "#E4EBF0", marginHorizontal: 10 },
  errBox: { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12, marginTop: 10 },
  errText: { flex: 1, fontSize: 12, color: "#ef4444", fontWeight: "500" },
  submit: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#02023E", borderRadius: 14, paddingVertical: 14, marginTop: 14 },
  submitText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#eef0f3" },
  dividerText: { fontSize: 11, color: "#8696a0", fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E4EBF0", borderRadius: 14, paddingVertical: 14 },
  googleText: { fontSize: 14, fontWeight: "700", color: "#101720", letterSpacing: -0.1 },
  appleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#000000", borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
  appleText: { fontSize: 14, fontWeight: "700", color: "#ffffff", letterSpacing: -0.1 },
  cancel: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  cancelText: { fontSize: 13, color: "#8696a0", fontWeight: "600" },
  
  otpBoxRow: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  otpBox: { width: 42, height: 52, borderRadius: 12, borderWidth: 1.5, borderColor: "#E4EBF0", backgroundColor: "#f7f9fb", alignItems: "center", justifyContent: "center" },
  otpBoxFilled: { backgroundColor: "#fff", borderColor: "#E4EBF0" },
  otpBoxActive: { backgroundColor: "#fff", borderColor: "#02023E" },
  otpBoxError: { backgroundColor: "#fef2f2", borderColor: "#ef4444" },
  otpText: { fontSize: 18, fontWeight: "800", color: "#101720" },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },

  otpFooter: { flexDirection: "row", justifyContent: "space-between", paddingTop: 14, paddingBottom: 6, marginTop: 4 },
  editPhone: { fontSize: 13, color: "#8696a0", fontWeight: "700" },
  resend: { fontSize: 13, color: "#02023E", fontWeight: "800" },
});
