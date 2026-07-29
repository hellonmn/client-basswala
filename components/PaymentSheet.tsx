/**
 * components/PaymentSheet.tsx
 *
 * In-app payment modal — replaces the old "open Razorpay payment link in
 * a browser tab" flow with a fully native UPI Collect bottom sheet.
 *
 *   1. Caller invokes  usePaymentSheet().pay({ bookingId, amount })
 *   2. We create a Razorpay Order via  POST /payments/create-order
 *   3. We show a clean modal asking for the user's UPI ID
 *   4. RazorpayCustomUI.payViaUPICollect fires the collect request to the
 *      user's UPI app — they approve in Google Pay / PhonePe / etc.
 *   5. We poll Razorpay for status. On success we call
 *      POST /services/bookings/:id/mark-paid to flip the booking to Paid.
 *
 * The whole flow stays inside our app — no browser, no in-app webview, no
 * Razorpay branding. Just like Zepto / Zomato.
 *
 * Mount the provider once at the root layout:
 *   <PaymentSheetProvider> ... </PaymentSheetProvider>
 *
 * Use it via:
 *   const { pay } = usePaymentSheet();
 *   const ok = await pay({ bookingId: 42, amount: 499 });
 */

import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext, ReactNode, useContext, useEffect, useRef, useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
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
import { useAuth } from "../context/AuthContext";
import api, { bookingApi } from "../services/userApi";
import {
  InstalledUPIApp,
  RazorpayCustomUI,
  UPI_APP_META,
} from "../services/razorpay-customui.service";

// ─── Types ─────────────────────────────────────────────────────────────────
interface PayParams {
  bookingId: number;
  amount: number;             // in rupees
  description?: string;       // line shown in the sheet header
  notes?: Record<string, any>;
}

interface PayResult {
  success: boolean;
  paid: boolean;
  cancelled?: boolean;
  message?: string;
}

type Resolver = (r: PayResult) => void;

interface PaymentSheetCtx {
  pay: (params: PayParams) => Promise<PayResult>;
}

const Ctx = createContext<PaymentSheetCtx>({
  pay: async () => ({ success: false, paid: false, message: "PaymentSheetProvider not mounted" }),
});

export function usePaymentSheet() {
  return useContext(Ctx);
}

/**
 * Convert Razorpay's verbose JSON error blobs into a single human sentence.
 *
 * Hard requirement: this function MUST NEVER let raw JSON / stack traces /
 * developer-mode dumps leak into the UI. Even in production builds. If the
 * input looks like JSON, we extract the description; if extraction fails we
 * fall back to a generic friendly message rather than dumping the blob.
 */
function prettifyPaymentError(raw?: string): string {
  const FALLBACK = "Payment couldn't be completed. Please try again.";
  if (!raw) return FALLBACK;

  // Extract a description if the input is JSON-ish.
  let desc = "";
  const looksJson = raw.trim().startsWith("{") || raw.trim().startsWith("[");
  if (looksJson) {
    try {
      const obj = JSON.parse(raw);
      desc =
        obj?.error?.description ||
        obj?.description ||
        obj?.message ||
        obj?.error?.reason ||
        "";
    } catch { /* malformed JSON — fall back below */ }
    // If it looked like JSON but we couldn't pull a description out, never
    // show the blob; show the generic message instead.
    if (!desc) return FALLBACK;
  } else {
    desc = raw;
  }

  // Map common Razorpay phrasings to friendlier copy.
  if (/already been made|already.*paid|already.*captured|order is already paid/i.test(desc)) {
    return "Looks like this payment already went through. Please check My Bookings — if it's not confirmed in a minute, contact support.";
  }
  if (/does not exist/i.test(desc)) {
    return "This payment session expired. Please close this and try the booking again.";
  }
  if (/cancelled.*payment|payment_cancelled|delay in response/i.test(desc)) {
    return "Payment was cancelled or the UPI app didn't respond. You can try again.";
  }
  if (/insufficient|balance/i.test(desc)) {
    return "Payment failed: insufficient balance.";
  }
  if (/timed? ?out|timeout/i.test(desc)) {
    return "Payment timed out. Please try again.";
  }
  // Last-resort: trim long descriptions and drop anything that still looks
  // like code (curly braces, quotes-as-quotes, etc.) so we never leak JSON.
  const clean = String(desc).replace(/[{}\[\]"]/g, "").trim();
  if (!clean) return FALLBACK;
  return clean.length > 140 ? clean.slice(0, 140) + "…" : clean;
}

// ─── Provider ──────────────────────────────────────────────────────────────
export function PaymentSheetProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [params, setParams] = useState<PayParams | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const pay = (p: PayParams): Promise<PayResult> => {
    return new Promise<PayResult>((resolve) => {
      resolverRef.current = resolve;
      setParams(p);
      setVisible(true);
    });
  };

  const close = (r: PayResult) => {
    setVisible(false);
    setParams(null);
    const fn = resolverRef.current;
    resolverRef.current = null;
    if (fn) fn(r);
  };

  return (
    <Ctx.Provider value={{ pay }}>
      {children}
      {params ? (
        <PaymentSheetModal
          visible={visible}
          params={params}
          onClose={close}
        />
      ) : null}
    </Ctx.Provider>
  );
}

// ─── Modal UI ──────────────────────────────────────────────────────────────
type Step = "creating" | "input" | "processing" | "success" | "failed";

function PaymentSheetModal({
  visible, params, onClose,
}: {
  visible: boolean;
  params: PayParams;
  onClose: (r: PayResult) => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("creating");
  const [orderId, setOrderId] = useState("");
  // The Razorpay key the BACKEND used when creating the order. We MUST use
  // this same key when opening the payment — if we use a stale frontend
  // constant, Razorpay rejects with "The id provided does not exist" because
  // the order belongs to a different merchant account.
  const [orderKeyId, setOrderKeyId] = useState<string | null>(null);
  const [vpa, setVpa] = useState("");
  const [error, setError] = useState("");

  // Installed UPI apps (Android only — iOS doesn't expose this list).
  const [upiApps, setUpiApps] = useState<InstalledUPIApp[]>([]);
  const [activeApp, setActiveApp] = useState<string | null>(null); // packageName during processing

  // Slide-in animation
  const translateY = useRef(new Animated.Value(400)).current;
  const overlay = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
      Animated.timing(overlay, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    return () => {
      // cleanup: nothing to do, but keep refs consistent
    };
  }, []);

  // Step 1 → create order + look up installed UPI apps in parallel
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Fire both requests in parallel — UPI app discovery is best-effort
      // and shouldn't block the payment from rendering.
      const [orderRes, apps] = await Promise.allSettled([
        api.post("/payments/create-order", {
          amount: params.amount,
          currency: "INR",
          notes: { bookingId: params.bookingId, ...(params.notes || {}) },
        }),
        RazorpayCustomUI.getInstalledUPIApps().catch(() => []),
      ]);

      if (cancelled) return;

      // Order is required
      if (orderRes.status !== "fulfilled") {
        const e: any = (orderRes as any).reason;
        // Surface the most specific text we have. The backend returns a
        // human `message` plus a raw `error` field — show the message,
        // and append the raw error when it adds detail, so payment
        // failures are diagnosable from the app without server logs.
        const body = e?.response?.data || {};
        const msg = body.message || e?.message || "Could not start payment.";
        const detail =
          body.error && !String(msg).includes(String(body.error))
            ? `\n(${body.error})`
            : "";
        setError(`${msg}${detail}`);
        setStep("failed");
        return;
      }
      const id = orderRes.value?.data?.orderId;
      if (!id) {
        setError("Server did not return an orderId.");
        setStep("failed");
        return;
      }
      setOrderId(id);
      // Capture the merchant key the backend used. Falls back to the
      // bundled constant only if the backend somehow didn't return one.
      const backendKey: string | undefined = orderRes.value?.data?.keyId;
      setOrderKeyId(backendKey || null);

      // Apps are optional. Show every UPI app the device exposes — even
      // ones not in our meta list (they'll just render with a letter icon).
      // Sort major apps to the front so the row leads with familiar logos.
      if (apps.status === "fulfilled" && Array.isArray(apps.value)) {
        const order = [
          "com.google.android.apps.nbu.paisa.user",
          "com.phonepe.app",
          "net.one97.paytm",
          "in.org.npci.upiapp",
          "com.amazon.mShop.android.shopping",
          "com.whatsapp",
          "com.mobikwik_new",
        ];
        const sorted = [...apps.value].sort((a, b) => {
          const ai = order.indexOf(a.package_name);
          const bi = order.indexOf(b.package_name);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
        setUpiApps(sorted);
      }

      setStep("input");
    })();
    return () => { cancelled = true; };
  }, []);

  const cancelAndClose = () => {
    onClose({ success: false, paid: false, cancelled: true, message: "Payment cancelled" });
  };

  /** Common post-payment handler used by both Intent + Collect flows. */
  const finalizePayment = async (paymentId: string, signature?: string) => {
    const verify = await bookingApi.markBookingPaidInApp(params.bookingId, {
      razorpayPaymentId: paymentId,
      razorpayOrderId: orderId,
      razorpaySignature: signature,
    });
    if (!verify?.success) {
      setError(verify?.message || "Server couldn't confirm payment. Please contact support.");
      setStep("failed");
      return;
    }
    setStep("success");
    setTimeout(() => onClose({ success: true, paid: true }), 1200);
  };

  /**
   * Ask the backend whether this order already has a captured payment.
   * Used to recover from UPI Intent's "user paid but never returned" case.
   * Returns the captured paymentId if found, or null.
   */
  const recoverCapturedPayment = async (): Promise<string | null> => {
    if (!orderId) return null;
    try {
      const r = await api.post("/payments/check-order", { orderId });
      if (r?.data?.success && r.data.paid && r.data.paymentId) {
        return r.data.paymentId as string;
      }
    } catch { /* ignore — fall through to retry */ }
    return null;
  };

  /** UPI Intent — user taps GPay / PhonePe / Paytm icon → that app opens directly. */
  const payViaIntent = async (app: InstalledUPIApp) => {
    setError("");
    if (!orderId) {
      setError("Order not ready — try again in a moment.");
      return;
    }
    setActiveApp(app.package_name);
    setStep("processing");
    try {
      const result = await RazorpayCustomUI.payViaUPIIntent({
        orderId,
        amount: params.amount,
        packageName: app.package_name,
        contact: user?.phone || "",
        email: user?.email || "",
        keyId: orderKeyId || undefined,
      });

      if (!result.success || !result.paymentId) {
        // The SDK said dismissed/failed, but UPI Intent has a known issue
        // where the user really did pay (in PhonePe/GPay) and just didn't
        // return to our app. Confirm with the backend before showing an error.
        const recoveredId = await recoverCapturedPayment();
        if (recoveredId) {
          await finalizePayment(recoveredId);
          return;
        }
        if (result.dismissed) {
          setError("Payment was dismissed before completing.");
        } else {
          setError(prettifyPaymentError(result.error));
        }
        setStep("input");
        setActiveApp(null);
        return;
      }
      await finalizePayment(result.paymentId, result.signature);
    } catch (err: any) {
      // Same recovery on hard errors — Razorpay sometimes throws even though
      // the payment landed.
      const recoveredId = await recoverCapturedPayment();
      if (recoveredId) {
        await finalizePayment(recoveredId);
        return;
      }
      setError(prettifyPaymentError(err?.message));
      setStep("input");
      setActiveApp(null);
    }
  };

  /** UPI Collect — user enters their VPA, payment request is pushed to it. */
  const payViaCollect = async () => {
    setError("");
    const trimmed = vpa.trim();
    if (!trimmed.includes("@") || trimmed.length < 5) {
      setError("Enter a valid UPI ID like name@upi");
      return;
    }
    if (!orderId) {
      setError("Order not ready — try again in a moment.");
      return;
    }

    setStep("processing");
    try {
      const result = await RazorpayCustomUI.payViaUPICollect({
        orderId,
        amount: params.amount,
        vpa: trimmed,
        contact: user?.phone || "",
        email: user?.email || "",
        keyId: orderKeyId || undefined,
      });

      if (!result.success || !result.paymentId) {
        // Same recovery as Intent flow — Razorpay rejects retries on an
        // order that already received a captured payment with messages
        // like "Payment has already been made". Fetch the captured payment
        // and finalise instead of confusing the user with that error.
        const recoveredId = await recoverCapturedPayment();
        if (recoveredId) {
          await finalizePayment(recoveredId);
          return;
        }
        if (result.dismissed) {
          setError("Payment was dismissed before completing.");
        } else {
          setError(prettifyPaymentError(result.error));
        }
        setStep("input");
        return;
      }
      await finalizePayment(result.paymentId, result.signature);
    } catch (err: any) {
      const recoveredId = await recoverCapturedPayment();
      if (recoveredId) {
        await finalizePayment(recoveredId);
        return;
      }
      setError(prettifyPaymentError(err?.message));
      setStep("input");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={cancelAndClose}>
      <View style={s.overlayWrap}>
        <Animated.View style={[s.overlayBg, { opacity: overlay }]} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
            <View style={s.handle} />

            {/* Header */}
            <View style={s.header}>
              <View style={s.titleBlock}>
                <Text style={s.title}>
                  {step === "success" ? "Payment successful" :
                    step === "processing" ? "Approve in your UPI app" :
                    "Pay with UPI"}
                </Text>
                <Text style={s.subtitle}>
                  {params.description || `Booking #${params.bookingId} · ₹${params.amount.toLocaleString("en-IN")}`}
                </Text>
              </View>
              {step !== "processing" && step !== "success" ? (
                <TouchableOpacity onPress={cancelAndClose} style={s.closeBtn} hitSlop={8}>
                  <Ionicons name="close" size={20} color="#101720" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Body */}
            {step === "creating" ? (
              <View style={s.statusBlock}>
                <ActivityIndicator size="large" color="#02023E" />
                <Text style={s.statusTitle}>Setting up secure payment…</Text>
                <Text style={s.statusSub}>This usually takes a couple of seconds.</Text>
              </View>
            ) : step === "input" ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                {/* UPI app picker — Zepto/Zomato style row of icons */}
                {upiApps.length > 0 ? (
                  <>
                    <Text style={s.label}>PAY USING</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={s.appRow}
                    >
                      {upiApps.map((app) => {
                        const meta = UPI_APP_META[app.package_name];
                        return (
                          <TouchableOpacity
                            key={app.package_name}
                            style={s.appCard}
                            onPress={() => payViaIntent(app)}
                            activeOpacity={0.85}
                          >
                            <View style={[s.appIconWrap, { backgroundColor: (meta?.color || "#101720") + "12" }]}>
                              {/* Icon priority:
                                    1. Bundled brand logo (assets/images/upi/*.png)
                                    2. SDK base64 — only if it's long enough to
                                       actually be a PNG (>100 chars)
                                    3. Coloured letter avatar */}
                              {meta?.logo ? (
                                <Image source={meta.logo} style={s.appIconImg} resizeMode="contain" />
                              ) : app.app_icon && app.app_icon.length > 100 ? (
                                <Image
                                  source={{ uri: `data:image/png;base64,${app.app_icon}` }}
                                  style={s.appIconImg}
                                  resizeMode="contain"
                                />
                              ) : (
                                <View style={[s.appIconFallback, { backgroundColor: meta?.color || "#02023E" }]}>
                                  <Text style={s.appIconLetter}>
                                    {(meta?.label || app.app_name || "U")[0].toUpperCase()}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={s.appLabel} numberOfLines={1}>
                              {meta?.label || app.app_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Divider */}
                    <View style={s.dividerRow}>
                      <View style={s.dividerLine} />
                      <Text style={s.dividerText}>or pay using a UPI ID</Text>
                      <View style={s.dividerLine} />
                    </View>
                  </>
                ) : null}

                {/* UPI ID fallback (also primary on iOS where no apps detected) */}
                {upiApps.length === 0 ? (
                  <Text style={s.label}>YOUR UPI ID</Text>
                ) : null}

                <View style={s.inputRow}>
                  <Ionicons name="at-circle-outline" size={20} color="#02023E" />
                  <TextInput
                    style={s.input}
                    value={vpa}
                    onChangeText={(v) => { setVpa(v); if (error) setError(""); }}
                    placeholder="yourname@okhdfc"
                    placeholderTextColor="#B0B8C1"
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="done"
                    onSubmitEditing={payViaCollect}
                  />
                </View>

                {error ? (
                  <View style={s.errorBox}>
                    <Ionicons name="alert-circle-outline" size={14} color="#ef4444" />
                    <Text style={s.errorText}>{error}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[s.payBtn, !vpa.trim().includes("@") && { opacity: 0.5 }]}
                  onPress={payViaCollect}
                  disabled={!vpa.trim().includes("@")}
                  activeOpacity={0.88}
                >
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                  <Text style={s.payBtnText}>Pay ₹{params.amount.toLocaleString("en-IN")}</Text>
                </TouchableOpacity>

                <View style={s.secureRow}>
                  <Ionicons name="shield-checkmark" size={12} color="#22c55e" />
                  <Text style={s.secureText}>Secured by Razorpay · Bank-grade encryption</Text>
                </View>
              </ScrollView>
            ) : step === "processing" ? (
              <View style={s.statusBlock}>
                <ActivityIndicator size="large" color="#02023E" />
                <Text style={s.statusTitle}>Waiting for your approval…</Text>
                <Text style={s.statusSub}>
                  {activeApp
                    ? `Approve the payment in ${UPI_APP_META[activeApp]?.label || "your UPI app"} and come back here. Don't close this screen.`
                    : "Open your UPI app and approve the payment request. Don't close this screen."}
                </Text>
                {activeApp ? (
                  <Text style={s.statusVpa}>
                    {UPI_APP_META[activeApp]?.label || "UPI App"}
                  </Text>
                ) : vpa ? (
                  <Text style={s.statusVpa}>{vpa}</Text>
                ) : null}
              </View>
            ) : step === "success" ? (
              <View style={s.statusBlock}>
                <View style={s.successPuck}>
                  <Ionicons name="checkmark" size={32} color="#fff" />
                </View>
                <Text style={s.statusTitle}>Payment received</Text>
                <Text style={s.statusSub}>Your booking is confirmed.</Text>
              </View>
            ) : (
              <View style={s.statusBlock}>
                <View style={s.errorPuck}>
                  <Ionicons name="close" size={28} color="#fff" />
                </View>
                <Text style={s.statusTitle}>Couldn't start payment</Text>
                <Text style={s.statusSub}>{error || "Please try again."}</Text>
                <TouchableOpacity style={s.tryAgainBtn} onPress={cancelAndClose}>
                  <Text style={s.tryAgainText}>Close</Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(16,23,32,0.55)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 36 : 24,
  },
  handle: {
    alignSelf: "center",
    width: 42, height: 4, borderRadius: 2,
    backgroundColor: "#e4ebf0", marginBottom: 12,
  },
  header: {
    flexDirection: "row", alignItems: "center",
    marginBottom: 18,
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 19, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: "#6B7A8A", marginTop: 4, fontWeight: "500" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
  },

  label: {
    fontSize: 11, fontWeight: "800", color: "#6B7A8A",
    letterSpacing: 0.6, marginBottom: 8,
  },

  // UPI App picker (Zepto-style row)
  appRow: {
    flexDirection: "row", gap: 12, paddingVertical: 4, paddingRight: 4,
  },
  appCard: {
    width: 76,
    alignItems: "center",
  },
  appIconWrap: {
    width: 64, height: 64, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  appIconImg: { width: 38, height: 38 },
  appIconFallback: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  appIconLetter: { color: "#fff", fontSize: 18, fontWeight: "800" },
  appLabel: {
    fontSize: 11, fontWeight: "700", color: "#101720",
    marginTop: 6, textAlign: "center",
  },

  // "or pay using a UPI ID" divider
  dividerRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginVertical: 18,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#eef0f3" },
  dividerText: {
    fontSize: 11, color: "#8696a0", fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#f7f9fb",
    borderWidth: 1.5, borderColor: "#eef0f3",
    borderRadius: 16, paddingHorizontal: 16, height: 56,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    fontSize: 15, color: "#101720", padding: 0,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12, color: "#6B7A8A",
    lineHeight: 18, marginTop: 10, marginBottom: 16,
  },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1, borderColor: "#fecaca",
    borderRadius: 12, padding: 10, marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 12, color: "#ef4444", fontWeight: "600" },

  payBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 56, borderRadius: 999,
    backgroundColor: "#02023E",
    shadowColor: "#02023E", shadowOpacity: 0.3,
    shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  payBtnText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },

  secureRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
    marginTop: 14,
  },
  secureText: { fontSize: 11, color: "#8696a0", fontWeight: "600" },

  statusBlock: {
    alignItems: "center", paddingVertical: 20, paddingHorizontal: 12,
  },
  statusTitle: { fontSize: 17, fontWeight: "800", color: "#101720", marginTop: 16, textAlign: "center" },
  statusSub: { fontSize: 13, color: "#6B7A8A", marginTop: 6, textAlign: "center", lineHeight: 19, paddingHorizontal: 12 },
  statusVpa: {
    marginTop: 12, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: "#f0fffe", borderWidth: 1, borderColor: "#a5f3fc",
    borderRadius: 999, fontSize: 13, fontWeight: "700", color: "#02023E",
  },

  successPuck: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#22c55e",
    alignItems: "center", justifyContent: "center",
  },
  errorPuck: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
  },

  tryAgainBtn: { marginTop: 20, paddingHorizontal: 28, paddingVertical: 12 },
  tryAgainText: { color: "#02023E", fontWeight: "700", fontSize: 14 },
});
