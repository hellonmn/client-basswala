/**
 * app/(auth)/login.tsx — Basswala User Login (Phone OTP + Google)
 */

import { useAuth } from "@/context/AuthContext";
import { otpApi } from "@/services/userApi";
import * as AppleAuthentication from "expo-apple-authentication";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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

const { height: H } = Dimensions.get("window");
const isWeb = Platform.OS === "web";

// ─── Google "G" logo ───────────────────────────────────────────────────────
const GoogleIcon = ({ size = 20 }: { size?: number }) => {
  const Svg = require("react-native-svg").default;
  const { Path } = require("react-native-svg");
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
};

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithOtp, loginWithGoogle, loginWithApple } = useAuth();

  const [step, setStep] = useState<"phone" | "sending" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [resendIn, setResendIn] = useState(0);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // Apple's guideline requires the button only where it's supported (iOS 13+).
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "ios") return;
    AppleAuthentication.isAvailableAsync()
      .then(setIsAppleAvailable)
      .catch(() => setIsAppleAvailable(false));
  }, []);
  const [formError, setFormError] = useState("");
  const [googleError, setGoogleError] = useState("");
  
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [otpFocused, setOtpFocused] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

  const phoneClean = phone.replace(/\D/g, "");
  const phoneValid = phoneClean.length === 10 && /^[6-9]/.test(phoneClean);
  const otpClean = otp.replace(/\D/g, "");
  const otpValid = otpClean.length === 6;

  // Resend countdown ticker
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

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
    setLoading(true);
    setStep("sending");
    const startedAt = Date.now();

    try {
      const res = await otpApi.send(phoneClean);
      const elapsed = Date.now() - startedAt;
      const minDelay = 1400;
      if (elapsed < minDelay) {
        await new Promise((r) => setTimeout(r, minDelay - elapsed));
      }

      if (!res?.success || !res?.sessionId) {
        setFormError(res?.message || "Could not send OTP. Try again.");
        setStep("phone");
        return;
      }
      setSessionId(res.sessionId);
      setOtp("");
      setResendIn(30);
      setStep("otp");
    } catch (e: any) {
      setFormError(describeError(e));
      setStep("phone");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (forcedCode?: string) => {
    setFormError("");
    const codeToVerify = forcedCode || otpClean;
    if (codeToVerify.length !== 6) {
      setFormError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const res = await otpApi.login(phoneClean, codeToVerify, sessionId);
      if (!res?.success || !res?.token) {
        setFormError(res?.message || "Invalid OTP. Try again.");
        return;
      }
      await loginWithOtp(res.token, res.user);
    } catch (e: any) {
      setFormError(describeError(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    await handleSendOtp();
  };

  const handleEditPhone = () => {
    setStep("phone");
    setOtp("");
    setSessionId("");
    setFormError("");
  };

  const handleGoogleLogin = async () => {
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

  const handleAppleLogin = async () => {
    setFormError("");
    setGoogleError("");
    setAppleLoading(true);
    try {
      await loginWithApple();
    } catch (e: any) {
      // ERR_REQUEST_CANCELED = user dismissed the Apple sheet — not an error.
      const code = String(e?.code || "");
      const msg = String(e?.message || "");
      if (code.includes("CANCELED") || msg.toLowerCase().includes("cancel")) return;
      setGoogleError(describeError(e));
    } finally {
      setAppleLoading(false);
    }
  };

  // ── Phone step ───────────────────────────────────────────────────────────
  if (step === "phone") {
    return (
      <SafeAreaView style={lx.root} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" translucent={false} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={lx.mainCentre}>
          <View style={lx.brandWrap}>
            <Image source={require("../../assets/images/logo.png")} style={lx.brandLogo} resizeMode="contain" />
            <Text style={lx.brandName}>basswala</Text>
            <Text style={lx.heading}>Let's get started!</Text>
          </View>

          <View style={[
            lx.inputPill, 
            formError ? lx.inputPillErr : null,
            phoneFocused && !formError ? lx.inputPillFocused : null
          ]}>
            <Text style={lx.flagEmoji}>🇮🇳</Text>
            <Text style={lx.dialCode}>+91</Text>
            <View style={lx.flagDivider} />
            <TextInput
              style={[lx.input, isWeb && { outline: 'none' } as any]}
              value={phone}
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              onChangeText={(v) => {
                setPhone(v.replace(/\D/g, "").slice(0, 10));
                if (formError) setFormError("");
              }}
              placeholder="Mobile number"
              placeholderTextColor="#B0B8C1"
              keyboardType="phone-pad"
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={() => phoneValid && handleSendOtp()}
            />
            {phoneValid && (
              <View style={lx.tickCircle}>
                <Ionicons name="checkmark" size={14} color="#fff" />
              </View>
            )}
          </View>

          {formError ? (
            <View style={lx.errorRow}>
              <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
              <Text style={lx.errorText}>{formError}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[lx.primaryBtn, (!phoneValid || loading) && lx.primaryBtnOff]}
            onPress={handleSendOtp}
            disabled={!phoneValid || loading}
            activeOpacity={0.9}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={lx.primaryBtnText}>Send OTP</Text>}
          </TouchableOpacity>

          <View style={lx.dividerRow}>
            <View style={lx.dividerLine} />
            <Text style={lx.dividerText}>Or sign in with</Text>
            <View style={lx.dividerLine} />
          </View>

          {/* Apple's HIG: Sign in with Apple is shown above other providers on iOS. */}
          {isAppleAvailable && (
            <TouchableOpacity
              style={[
                lx.socialBtn,
                { marginBottom: 12, backgroundColor: "#000000", borderColor: "#000000" },
                appleLoading && { opacity: 0.6 },
              ]}
              onPress={handleAppleLogin}
              disabled={appleLoading}
              activeOpacity={0.85}
            >
              {appleLoading
                ? <ActivityIndicator color="#ffffff" size="small" />
                : <>
                    <Ionicons name="logo-apple" size={20} color="#ffffff" />
                    <Text style={[lx.socialBtnText, { color: "#ffffff" }]}>Continue with Apple</Text>
                  </>}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[lx.socialBtn, googleLoading && { opacity: 0.6 }]}
            onPress={handleGoogleLogin}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            {googleLoading
              ? <ActivityIndicator color="#101720" size="small" />
              : <>
                  <GoogleIcon size={20} />
                  <Text style={lx.socialBtnText}>Continue with Google</Text>
                </>}
          </TouchableOpacity>

          {googleError ? (
            <View style={lx.googleErrBox}>
              <Ionicons name="cloud-offline-outline" size={14} color="#ef4444" />
              <Text style={lx.errorText}>{googleError}</Text>
            </View>
          ) : null}
        </View>
        </ScrollView>

        <View style={lx.footer}>
          <Text style={lx.footerMuted}>Just looking around? </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(tabs)" as any)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={lx.footerLink}>Skip for now</Text>
          </TouchableOpacity>
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Sending step ───────────────────────────────────────────────────────
  if (step === "sending") {
    return (
      <SafeAreaView style={s.cleanRoot} edges={["top"]}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" translucent={false} />
        <View style={s.cleanContent}>
          <View style={s.callPuck}>
            <Ionicons name="call" size={32} color="#02023E" />
            <View style={s.callPulse} />
          </View>
          <ActivityIndicator size="small" color="#02023E" style={{ marginBottom: 18 }} />
          <Text style={s.cleanTitle}>Sending you the code…</Text>
          <Text style={s.cleanSub}>
            We're texting a 6-digit code to <Text style={{ fontWeight: "800", color: "#101720" }}>+91 {phoneClean}</Text>.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── OTP step ────────────────────────────────────────────────────────────
  const otpArr = otpClean.split("");
  return (
    <SafeAreaView style={s.cleanRoot} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" translucent={false} />

      <View style={s.cleanHeader}>
        <TouchableOpacity onPress={handleEditPhone} style={s.backBtn} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={20} color="#101720" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={s.cleanContent}>
        <View style={s.cleanIconPuck}>
          <Ionicons name="keypad" size={28} color="#02023E" />
        </View>

        <Text style={s.cleanTitle}>Enter the 6-digit code</Text>
        <Text style={s.cleanSub}>
          We texted <Text style={{ fontWeight: "800", color: "#101720" }}>+91 {phoneClean}</Text> with your one-time code.{" "}
          <Text style={s.cleanSubLink} onPress={handleEditPhone}>Change number</Text>
        </Text>

        <TouchableOpacity 
          style={s.otpBoxRow} 
          activeOpacity={1} 
          onPress={() => otpInputRef.current?.focus()}
        >
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <View 
              key={idx} 
              style={[
                s.otpBox, 
                otpArr[idx] ? s.otpBoxFilled : null,
                otpFocused && otpArr.length === idx ? s.otpBoxActive : null,
                formError ? s.otpBoxError : null
              ]}
            >
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
          <View style={s.errorRow}>
            <Ionicons name="alert-circle-outline" size={13} color="#ef4444" />
            <Text style={s.errorText}>{formError}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[s.cta, (!otpValid || loading) && s.ctaOff, { marginTop: 24 }]}
          onPress={() => handleVerifyOtp()}
          disabled={!otpValid || loading}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={["#5cf6f9", "#02023E"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={s.ctaGrad}
          >
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.ctaText}>Verify & Continue</Text>}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleResend}
          disabled={resendIn > 0 || loading}
          style={s.resendBtn}
          activeOpacity={0.7}
        >
          <Text style={[s.resendText, resendIn > 0 && { color: "#c4c9d0" }]}>
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Didn't get the SMS? Resend"}
          </Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const lx = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff", paddingHorizontal: 24 },
  mainCentre: { flex: 1, justifyContent: "center" },
  brandWrap: { alignItems: "center", marginBottom: 28 },
  brandLogo: { width: 56, height: 56, marginBottom: 8 },
  brandName: { fontSize: 13, fontWeight: "700", color: "#101720", letterSpacing: 2.5, textTransform: "lowercase", opacity: 0.9 },
  heading: { fontSize: 26, fontWeight: "800", color: "#101720", letterSpacing: -0.6, textAlign: 'center' },
  inputPill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f7f9fb", borderWidth: 1.5, borderColor: "#eef0f3",
    borderRadius: 999, paddingHorizontal: 18, height: 56,
  },
  inputPillErr: { borderColor: "#ef4444", backgroundColor: "#fef2f2" },
  inputPillFocused: { borderColor: "#02023E" },
  flagEmoji: { fontSize: 20 },
  dialCode: { fontSize: 15, fontWeight: "700", color: "#101720" },
  flagDivider: { width: 1, height: 22, backgroundColor: "#e4ebf0", marginHorizontal: 4 },
  input: { flex: 1, fontSize: 16, color: "#101720", fontWeight: "500", padding: 0 },
  tickCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center" },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, marginLeft: 10 },
  errorText: { fontSize: 12, color: "#ef4444", fontWeight: "500", flex: 1 },
  primaryBtn: {
    backgroundColor: "#02023E", height: 56, borderRadius: 999,
    alignItems: "center", justifyContent: "center", marginTop: 18,
    shadowColor: "#02023E", shadowOpacity: 0.25, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  primaryBtnOff: { opacity: 0.45, shadowOpacity: 0 },
  primaryBtnText: { fontSize: 16, fontWeight: "800", color: "#ffffff", letterSpacing: 0.2 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#eef0f3" },
  dividerText: { fontSize: 12, color: "#8696a0", fontWeight: "500" },
  socialBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    height: 56, borderRadius: 999, backgroundColor: "#ffffff",
    borderWidth: 1.5, borderColor: "#eef0f3",
  },
  socialBtnText: { fontSize: 14, fontWeight: "700", color: "#101720", letterSpacing: -0.1 },
  googleErrBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1,
    borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, marginTop: 12,
  },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16 },
  footerMuted: { fontSize: 13, color: "#8696a0", fontWeight: "500" },
  footerLink: { fontSize: 13, color: "#02023E", fontWeight: "800" },
});

const s = StyleSheet.create({
  cleanRoot: { flex: 1, backgroundColor: "#ffffff" },
  cleanHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  cleanContent: { flex: 1, paddingHorizontal: 28, paddingBottom: 32, alignItems: "center", justifyContent: "center" },
  cleanIconPuck: {
    width: 72, height: 72, borderRadius: 22, backgroundColor: "#f0fffe",
    borderWidth: 1, borderColor: "#a5f3fc", justifyContent: "center", alignItems: "center", marginBottom: 20,
  },
  callPuck: {
    width: 92, height: 92, borderRadius: 30, backgroundColor: "#f0fffe",
    borderWidth: 1, borderColor: "#a5f3fc", justifyContent: "center", alignItems: "center", marginBottom: 24,
  },
  callPulse: { position: "absolute", width: 110, height: 110, borderRadius: 36, borderWidth: 2, borderColor: "rgba(6,243,249,0.25)" },
  cleanTitle: { fontSize: 22, fontWeight: "800", color: "#101720", letterSpacing: -0.5, marginBottom: 10, textAlign: "center" },
  cleanSub: { fontSize: 14, color: "#6B7A8A", textAlign: "center", lineHeight: 21, paddingHorizontal: 6, marginBottom: 28 },
  cleanSubLink: { color: "#02023E", fontWeight: "800" },
  
  otpBoxRow: { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingHorizontal: 4 },
  otpBox: {
    width: 42, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: "#eef0f3",
    backgroundColor: "#f7f9fb", alignItems: "center", justifyContent: "center",
  },
  otpBoxFilled: { borderColor: "#eef0f3", backgroundColor: "#fff" },
  otpBoxActive: { borderColor: "#02023E", backgroundColor: "#fff" },
  otpBoxError: { borderColor: "#ef4444", backgroundColor: "#fef2f2" },
  otpText: { fontSize: 20, fontWeight: "800", color: "#101720" },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 12 },
  errorText: { fontSize: 12, color: "#ef4444", fontWeight: "500", flex: 1 },
  cta: {
    borderRadius: 14, overflow: "hidden", width: '100%',
    shadowColor: "#02023E", shadowOpacity: 0.25, shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 }, elevation: 4,
  },
  ctaOff: { opacity: 0.4, shadowOpacity: 0 },
  ctaGrad: { paddingVertical: 15, alignItems: "center", justifyContent: "center" },
  ctaText: { fontSize: 16, fontWeight: "700", color: "#fff", letterSpacing: 0.3 },
  resendBtn: { alignSelf: "center", paddingVertical: 12, marginTop: 12 },
  resendText: { fontSize: 13, fontWeight: "700", color: "#02023E" },
});
