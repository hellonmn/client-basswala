/**
 * PaymentScreen.tsx — Swiggy-style payment UI
 *
 * Layout mirrors the Swiggy pattern from screenshots:
 *   • Header with order summary line (item count · total · savings)
 *   • "Pay by any UPI App" section with vertical list (radio rows)
 *   • "Credit & Debit Cards" section
 *   • "More Payment Options" section (COD etc.)
 *   • Sticky bottom pay bar
 *
 * New:
 *   • planeAnimation.json plays as a full-screen overlay while booking processes
 *   • All original Razorpay logic (UPI Intent · Collect + polling · Card · COD) preserved
 *   • Zero emojis — Ionicons throughout
 *   • Bottom nav hidden via `onSheetOpen` callback pattern (see BookingBottomSheet)
 */

import { Ionicons } from "@expo/vector-icons";
import LottieView from "lottie-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiService } from "../services/api";
import {
  InstalledUPIApp,
  PaymentResult,
  RazorpayCustomUI,
} from "../services/razorpay-customui.service";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#f5f5f5",
  white: "#ffffff",
  primary: "#fc8019", // Swiggy orange
  primaryLight: "#fff3eb",
  primaryBorder: "#ffd4b0",
  teal: "#02023E",
  tealLight: "#eaf8f8",
  tealBorder: "#b2e8e8",
  text: "#1c1c1e",
  textSoft: "#6b7280",
  muted: "#9ca3af",
  border: "#e5e7eb",
  divider: "#f0f0f0",
  success: "#1ba672",
  successLight: "#e8f8f1",
  error: "#e02020",
  errorLight: "#fef2f2",
  amber: "#d97706",
  amberLight: "#fffbeb",
  sectionBg: "#ffffff",
  headerBg: "#ffffff",
};

// ─── UPI App brand meta ─────────────────────────────────────────────────────────
const APP_BRAND: Record<
  string,
  { label: string; color: string; letter: string }
> = {
  "com.google.android.apps.nbu.paisa.user": {
    label: "Google Pay",
    color: "#4285F4",
    letter: "G",
  },
  "com.phonepe.app": { label: "PhonePe", color: "#5F259F", letter: "P" },
  "net.one97.paytm": { label: "Paytm", color: "#00BAF2", letter: "₹" },
  "in.org.npci.upiapp": { label: "BHIM", color: "#FF6B00", letter: "B" },
  "com.amazon.mShop.android.shopping": {
    label: "Amazon Pay",
    color: "#FF9900",
    letter: "A",
  },
};

type Tab = "upi_app" | "upi_id" | "card" | "cod";
type CollectStatus =
  | "idle"
  | "requesting"
  | "pending"
  | "success"
  | "failed"
  | "expired";

interface Props {
  orderId: string;
  amount: number;
  contact: string;
  email: string;
  accentColor?: string;
  onBack: () => void;
  onResult: (result: PaymentResult & { method: Tab }) => void;
  /** Called with true when sheet opens, false when it closes — parent hides bottom nav */
  onSheetVisibilityChange?: (visible: boolean) => void;
}

const TIMEOUT_SEC = 120;

export default function PaymentScreen({
  orderId,
  amount,
  contact,
  email,
  accentColor = "#fc8019",
  onBack,
  onResult,
}: Props) {
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>("upi_app");
  const [upiApps, setUpiApps] = useState<InstalledUPIApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<InstalledUPIApp | null>(null);
  const [paying, setPaying] = useState(false);
  const [showPlane, setShowPlane] = useState(false); // �? plane overlay

  // UPI ID collect
  const [vpa, setVpa] = useState("");
  const [vpaValid, setVpaValid] = useState(false);
  const [collectStatus, setCollectStatus] = useState<CollectStatus>("idle");
  const [pollCountdown, setPollCountdown] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Card
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Expanded sections
  const [upiExpanded, setUpiExpanded] = useState(true);
  const lottieRef = useRef<LottieView>(null);

  // ── Shimmer ─────────────────────────────────────────────────────────────
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  const shimmerOp = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.85],
  });

  // ── Load UPI apps ────────────────────────────────────────────────────────
  useEffect(() => {
    RazorpayCustomUI.getInstalledUPIApps()
      .then((apps) => {
        setUpiApps(apps);
        if (apps.length > 0) setSelectedApp(apps[0]);
        else setTab("upi_id");
      })
      .finally(() => setAppsLoading(false));
  }, []);

  // ── VPA validation ───────────────────────────────────────────────────────
  useEffect(() => {
    setVpaValid(/^[\w.\-_]{2,}@[\w]{2,}$/.test(vpa.trim()));
  }, [vpa]);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      pollRef.current && clearInterval(pollRef.current);
      countdownRef.current && clearInterval(countdownRef.current);
    },
    [],
  );

  // ── Polling ──────────────────────────────────────────────────────────────
  const startPolling = (paymentId: string) => {
    setCollectStatus("pending");
    setPollCountdown(TIMEOUT_SEC);
    countdownRef.current = setInterval(() => {
      setPollCountdown((c) => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 4000;
      try {
        const res = await apiService.getUPIPaymentStatus(paymentId);
        if (res.status === "captured" || res.status === "authorized") {
          clearInterval(pollRef.current!);
          clearInterval(countdownRef.current!);
          setCollectStatus("success");
          try {
            await apiService.verifyPayment({
              orderId,
              paymentId,
              signature: "",
            });
          } catch (_) {}
          onResult({ success: true, paymentId, orderId, method: "upi_id" });
          return;
        }
        if (res.status === "failed") {
          clearInterval(pollRef.current!);
          clearInterval(countdownRef.current!);
          setCollectStatus("failed");
          setPaying(false);
          return;
        }
      } catch (_) {}
      if (elapsed >= TIMEOUT_SEC * 1000) {
        clearInterval(pollRef.current!);
        clearInterval(countdownRef.current!);
        setCollectStatus("expired");
        setPaying(false);
      }
    }, 4000);
  };

  const cancelCollect = () => {
    pollRef.current && clearInterval(pollRef.current);
    countdownRef.current && clearInterval(countdownRef.current);
    setCollectStatus("idle");
    setPaying(false);
  };

  // ── Main pay handler ─────────────────────────────────────────────────────
  const handlePay = useCallback(async () => {
    if (!orderId) {
      Alert.alert("Not Ready", "Payment order not set up yet.");
      return;
    }

    // Show plane animation overlay immediately
    setShowPlane(true);
    setTimeout(() => lottieRef.current?.play(), 80);
    setPaying(true);

    try {
      if (tab === "upi_app") {
        if (!selectedApp) {
          setShowPlane(false);
          setPaying(false);
          Alert.alert("Select App", "Tap a UPI app first.");
          return;
        }
        const result = await RazorpayCustomUI.payViaUPIIntent({
          orderId,
          amount,
          contact,
          email,
          packageName: selectedApp.package_name,
        });
        if (result.success && result.paymentId) {
          try {
            await apiService.verifyPayment({
              orderId,
              paymentId: result.paymentId,
              signature: result.signature ?? "",
            });
          } catch (_) {}
        }
        setShowPlane(false);
        onResult({ ...result, method: "upi_app" });
        setPaying(false);
      } else if (tab === "upi_id") {
        if (!vpaValid) {
          setShowPlane(false);
          setPaying(false);
          Alert.alert("Invalid UPI ID", "Enter a valid ID like name@okaxis");
          return;
        }
        setCollectStatus("requesting");
        const result = await RazorpayCustomUI.payViaUPICollect({
          orderId,
          amount,
          contact,
          email,
          vpa: vpa.trim(),
        });
        setShowPlane(false);
        if (result.success && result.paymentId) {
          try {
            await apiService.verifyPayment({
              orderId,
              paymentId: result.paymentId,
              signature: result.signature ?? "",
            });
          } catch (_) {}
          setCollectStatus("success");
          onResult({ ...result, method: "upi_id" });
        } else if (result.dismissed) {
          setCollectStatus("idle");
          setPaying(false);
        } else {
          setCollectStatus("failed");
          setPaying(false);
        }
      } else if (tab === "card") {
        const [mm, yy] = cardExpiry.split("/");
        if (!cardNumber || !cardName || !mm || !yy || !cardCvv) {
          setShowPlane(false);
          setPaying(false);
          Alert.alert("Incomplete", "Fill in all card details.");
          return;
        }
        const result = await RazorpayCustomUI.payViaCard({
          orderId,
          amount,
          contact,
          email,
          card: {
            number: cardNumber.replace(/\s/g, ""),
            name: cardName,
            expiry_month: mm.trim(),
            expiry_year: yy.trim(),
            cvv: cardCvv,
          },
        });
        if (result.success && result.paymentId) {
          try {
            await apiService.verifyPayment({
              orderId,
              paymentId: result.paymentId,
              signature: result.signature ?? "",
            });
          } catch (_) {}
        }
        setShowPlane(false);
        onResult({ ...result, method: "card" });
        setPaying(false);
      } else {
        // COD — brief plane moment then confirm
        setTimeout(() => {
          setShowPlane(false);
          onResult({ success: true, method: "cod" });
        }, 2200);
      }
    } catch (err: any) {
      setShowPlane(false);
      onResult({ success: false, error: err?.message, method: tab });
      setPaying(false);
    }
  }, [
    tab,
    orderId,
    amount,
    contact,
    email,
    selectedApp,
    vpa,
    vpaValid,
    cardNumber,
    cardName,
    cardExpiry,
    cardCvv,
  ]);

  const isPending = collectStatus === "pending";
  const cardBrand = cardNumber.startsWith("4")
    ? "VISA"
    : cardNumber.startsWith("5")
      ? "MC"
      : cardNumber.startsWith("6")
        ? "RUPAY"
        : cardNumber.startsWith("3")
          ? "AMEX"
          : "";

  const payBtnLabel =
    tab === "cod"
      ? `Confirm Booking  ₹${amount.toLocaleString("en-IN")}`
      : `Pay  ₹${amount.toLocaleString("en-IN")}`;

  return (
    <View style={[ps.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={C.headerBg} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <View style={ps.header}>
        <TouchableOpacity
          style={ps.backBtn}
          onPress={onBack}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={ps.headerTitle}>Payment Options</Text>
          <View style={ps.headerSubRow}>
            <Text style={ps.headerSub}>
              1 item · Total: ₹{amount.toLocaleString("en-IN")}{" "}
            </Text>
            <Text style={ps.headerSavings}>Secured checkout</Text>
          </View>
        </View>
      </View>

      {/* ── Scroll body ──────────────────────────────────────────────────── */}
      <ScrollView
        style={ps.scroll}
        contentContainerStyle={[
          ps.scrollContent,
          { paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* �?�? UPI APPS section �?�? */}
        <View style={ps.section}>
          <View style={ps.sectionHeaderRow}>
            <View style={ps.upiLogoRow}>
              <Ionicons name="flash" size={16} color={C.primary} />
              <Text style={ps.sectionTitle}>Pay by any UPI App</Text>
            </View>
          </View>

          <View style={ps.sectionCard}>
            {/* Skeleton */}
            {appsLoading &&
              [0, 1, 2].map((i) => (
                <View key={i}>
                  {i > 0 && <View style={ps.rowDivider} />}
                  <Animated.View
                    style={[ps.skeletonRow, { opacity: shimmerOp }]}
                  >
                    <View style={ps.skeletonIcon} />
                    <View style={ps.skeletonText} />
                    <View style={ps.skeletonRadio} />
                  </Animated.View>
                </View>
              ))}

            {/* No apps */}
            {!appsLoading && upiApps.length === 0 && (
              <TouchableOpacity
                style={ps.upiRow}
                onPress={() => setTab("upi_id")}
                activeOpacity={0.7}
              >
                <View style={[ps.appIconFallback, { backgroundColor: C.teal }]}>
                  <Ionicons name="at-outline" size={18} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={ps.upiRowLabel}>UPI ID / Handle</Text>
                  <Text style={ps.upiRowSub}>
                    No UPI apps detected — use ID instead
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.muted} />
              </TouchableOpacity>
            )}

            {/* App list */}
            {!appsLoading &&
              upiApps.map((app, idx) => {
                const brand = APP_BRAND[app.package_name];
                const label = brand?.label ?? app.app_name;
                const color = brand?.color ?? C.teal;
                const selected =
                  tab === "upi_app" &&
                  selectedApp?.package_name === app.package_name;

                return (
                  <View key={app.package_name}>
                    {idx > 0 && <View style={ps.rowDivider} />}
                    <TouchableOpacity
                      style={[ps.upiRow, selected && ps.upiRowActive]}
                      onPress={() => {
                        setTab("upi_app");
                        setSelectedApp(app);
                      }}
                      activeOpacity={0.7}
                    >
                      {app.app_icon ? (
                        <Image
                          source={{
                            uri: `data:image/png;base64,${app.app_icon}`,
                          }}
                          style={ps.appIcon}
                          resizeMode="contain"
                        />
                      ) : (
                        <View
                          style={[
                            ps.appIconFallback,
                            { backgroundColor: color },
                          ]}
                        >
                          <Text style={ps.appIconLetter}>
                            {brand?.letter ?? label.charAt(0)}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={[ps.upiRowLabel, selected && { color }]}>
                          {label}
                        </Text>
                        {selected && (
                          <Text style={[ps.upiRowSub, { color }]}>
                            Selected
                          </Text>
                        )}
                      </View>
                      <View
                        style={[ps.radio, selected && { borderColor: color }]}
                      >
                        {selected && (
                          <View
                            style={[ps.radioDot, { backgroundColor: color }]}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })}

            {/* UPI ID entry row */}
            {!appsLoading && upiApps.length > 0 && (
              <>
                <View style={ps.rowDivider} />
                <TouchableOpacity
                  style={[ps.upiRow, tab === "upi_id" && ps.upiRowActive]}
                  onPress={() => setTab("upi_id")}
                  activeOpacity={0.7}
                >
                  <View
                    style={[ps.appIconFallback, { backgroundColor: "#e5e7eb" }]}
                  >
                    <Ionicons name="at-outline" size={18} color={C.textSoft} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        ps.upiRowLabel,
                        tab === "upi_id" && { color: C.teal },
                      ]}
                    >
                      Pay via UPI ID
                    </Text>
                    <Text style={ps.upiRowSub}>Enter your UPI handle</Text>
                  </View>
                  <View
                    style={[
                      ps.radio,
                      tab === "upi_id" && { borderColor: C.teal },
                    ]}
                  >
                    {tab === "upi_id" && (
                      <View
                        style={[ps.radioDot, { backgroundColor: C.teal }]}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              </>
            )}

            {/* UPI ID input panel */}
            {tab === "upi_id" && collectStatus !== "pending" && (
              <View style={ps.upiInputPanel}>
                <View
                  style={[
                    ps.inputRow,
                    focusedField === "vpa" && { borderColor: C.teal },
                  ]}
                >
                  <Ionicons
                    name="at-outline"
                    size={16}
                    color={focusedField === "vpa" ? C.teal : C.muted}
                  />
                  <TextInput
                    style={ps.input}
                    value={vpa}
                    onChangeText={setVpa}
                    onFocus={() => setFocusedField("vpa")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="yourname@okaxis"
                    placeholderTextColor={C.muted}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                  />
                  {vpa.length > 0 && (
                    <Ionicons
                      name={vpaValid ? "checkmark-circle" : "close-circle"}
                      size={18}
                      color={vpaValid ? C.success : C.error}
                    />
                  )}
                </View>
                <View style={ps.chipRow}>
                  {["@okaxis", "@oksbi", "@okicici", "@ybl"].map((sx) => (
                    <TouchableOpacity
                      key={sx}
                      style={ps.chip}
                      onPress={() =>
                        setVpa(
                          (v) => (v.includes("@") ? v.split("@")[0] : v) + sx,
                        )
                      }
                      activeOpacity={0.7}
                    >
                      <Text style={ps.chipText}>{sx}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {collectStatus === "requesting" && (
                  <View style={ps.reqRow}>
                    <ActivityIndicator size="small" color={C.teal} />
                    <Text style={ps.reqText}>Sending collect request…</Text>
                  </View>
                )}
              </View>
            )}

            {/* Collect pending */}
            {tab === "upi_id" && collectStatus === "pending" && (
              <View style={ps.pendingPanel}>
                <Animated.View
                  style={[
                    ps.pulseRing2,
                    {
                      opacity: shimmer.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.07, 0.16],
                      }),
                    },
                  ]}
                />
                <Animated.View
                  style={[
                    ps.pulseRing1,
                    {
                      opacity: shimmer.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.1, 0.22],
                      }),
                    },
                  ]}
                />
                <View style={ps.pulseCore}>
                  <Ionicons
                    name="phone-portrait-outline"
                    size={22}
                    color={C.teal}
                  />
                </View>
                <Text style={ps.pendingTitle}>Check your UPI app</Text>
                <Text style={ps.pendingVpa}>{vpa}</Text>
                <Text style={ps.pendingHint}>
                  Approve the ₹{amount.toLocaleString("en-IN")} request
                </Text>
                <View
                  style={[
                    ps.timerPill,
                    pollCountdown < 30 && { borderColor: C.error + "50" },
                  ]}
                >
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color={pollCountdown < 30 ? C.error : C.muted}
                  />
                  <Text
                    style={[
                      ps.timerText,
                      pollCountdown < 30 && { color: C.error },
                    ]}
                  >
                    Expires in {pollCountdown}s
                  </Text>
                </View>
                <TouchableOpacity onPress={cancelCollect} style={ps.cancelBtn}>
                  <Ionicons
                    name="close-circle-outline"
                    size={13}
                    color={C.error}
                  />
                  <Text style={ps.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Collect result */}
            {tab === "upi_id" &&
              (collectStatus === "failed" || collectStatus === "expired") && (
                <View style={ps.resultPanel}>
                  <Ionicons
                    name="close-circle-outline"
                    size={32}
                    color={C.error}
                  />
                  <Text style={ps.resultTitle}>
                    {collectStatus === "expired"
                      ? "Request Expired"
                      : "Payment Declined"}
                  </Text>
                  <TouchableOpacity
                    style={ps.retryBtn}
                    onPress={() => setCollectStatus("idle")}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="refresh-outline" size={13} color={C.teal} />
                    <Text style={ps.retryText}>Try Again</Text>
                  </TouchableOpacity>
                </View>
              )}
          </View>
        </View>

        {/* �?�? CARDS section �?�? */}
        <View style={ps.section}>
          <Text style={ps.sectionTitle}>Credit &amp; Debit Cards</Text>
          <View style={ps.sectionCard}>
            <TouchableOpacity
              style={[ps.upiRow, tab === "card" && ps.upiRowActive]}
              onPress={() => setTab("card")}
              activeOpacity={0.7}
            >
              <View
                style={[ps.appIconFallback, { backgroundColor: "#eff6ff" }]}
              >
                <Ionicons name="card-outline" size={18} color="#3b82f6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    ps.upiRowLabel,
                    tab === "card" && { color: "#3b82f6" },
                  ]}
                >
                  Add / Use Card
                </Text>
                <Text style={ps.upiRowSub}>
                  Visa · Mastercard · RuPay · Amex
                </Text>
              </View>
              <View
                style={[ps.radio, tab === "card" && { borderColor: "#3b82f6" }]}
              >
                {tab === "card" && (
                  <View style={[ps.radioDot, { backgroundColor: "#3b82f6" }]} />
                )}
              </View>
            </TouchableOpacity>

            {/* Card form */}
            {tab === "card" && (
              <View style={ps.upiInputPanel}>
                {/* Number */}
                <View
                  style={[
                    ps.inputRow,
                    focusedField === "cardNum" && { borderColor: "#3b82f6" },
                  ]}
                >
                  <Ionicons
                    name="card-outline"
                    size={16}
                    color={focusedField === "cardNum" ? "#3b82f6" : C.muted}
                  />
                  <TextInput
                    style={[ps.input, { flex: 1 }]}
                    value={cardNumber}
                    onChangeText={(v) => {
                      const d = v.replace(/\D/g, "").slice(0, 16);
                      setCardNumber(d.replace(/(\d{4})(?=\d)/g, "$1 "));
                    }}
                    onFocus={() => setFocusedField("cardNum")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Card number"
                    placeholderTextColor={C.muted}
                    keyboardType="numeric"
                  />
                  {cardBrand !== "" && (
                    <View style={ps.brandPill}>
                      <Text style={ps.brandText}>{cardBrand}</Text>
                    </View>
                  )}
                </View>
                {/* Name */}
                <View
                  style={[
                    ps.inputRow,
                    focusedField === "cardName" && { borderColor: "#3b82f6" },
                  ]}
                >
                  <Ionicons
                    name="person-outline"
                    size={16}
                    color={focusedField === "cardName" ? "#3b82f6" : C.muted}
                  />
                  <TextInput
                    style={ps.input}
                    value={cardName}
                    onChangeText={setCardName}
                    onFocus={() => setFocusedField("cardName")}
                    onBlur={() => setFocusedField(null)}
                    placeholder="Name on card"
                    placeholderTextColor={C.muted}
                    autoCapitalize="characters"
                  />
                </View>
                {/* Expiry + CVV */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View
                    style={[
                      ps.inputRow,
                      { flex: 1 },
                      focusedField === "exp" && { borderColor: "#3b82f6" },
                    ]}
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={16}
                      color={focusedField === "exp" ? "#3b82f6" : C.muted}
                    />
                    <TextInput
                      style={ps.input}
                      value={cardExpiry}
                      onChangeText={(v) => {
                        const d = v.replace(/\D/g, "").slice(0, 4);
                        setCardExpiry(
                          d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d,
                        );
                      }}
                      onFocus={() => setFocusedField("exp")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="MM / YY"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                    />
                  </View>
                  <View
                    style={[
                      ps.inputRow,
                      { width: 110 },
                      focusedField === "cvv" && { borderColor: "#3b82f6" },
                    ]}
                  >
                    <Ionicons
                      name="lock-closed-outline"
                      size={16}
                      color={focusedField === "cvv" ? "#3b82f6" : C.muted}
                    />
                    <TextInput
                      style={ps.input}
                      value={cardCvv}
                      onChangeText={(v) =>
                        setCardCvv(v.replace(/\D/g, "").slice(0, 4))
                      }
                      onFocus={() => setFocusedField("cvv")}
                      onBlur={() => setFocusedField(null)}
                      placeholder="CVV"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                      secureTextEntry
                    />
                  </View>
                </View>
                <View style={ps.encryptNote}>
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={12}
                    color={C.teal}
                  />
                  <Text style={ps.encryptText}>
                    Card details encrypted end-to-end
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* �?�? MORE PAYMENT OPTIONS �?�? */}
        <View style={ps.section}>
          <Text style={ps.sectionTitle}>More Payment Options</Text>
          <View style={ps.sectionCard}>
            {/* COD */}
            <TouchableOpacity
              style={[ps.upiRow, tab === "cod" && ps.upiRowActive]}
              onPress={() => setTab("cod")}
              activeOpacity={0.7}
            >
              <View
                style={[ps.appIconFallback, { backgroundColor: "#fffbeb" }]}
              >
                <Ionicons name="cash-outline" size={18} color={C.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[ps.upiRowLabel, tab === "cod" && { color: C.amber }]}
                >
                  Pay on Delivery
                </Text>
                <Text style={ps.upiRowSub}>
                  Pay in cash when equipment arrives
                </Text>
              </View>
              <View
                style={[ps.radio, tab === "cod" && { borderColor: C.amber }]}
              >
                {tab === "cod" && (
                  <View style={[ps.radioDot, { backgroundColor: C.amber }]} />
                )}
              </View>
            </TouchableOpacity>

            {/* COD expanded info */}
            {tab === "cod" && (
              <View style={ps.codPanel}>
                <View style={ps.rowDivider} />
                <View style={ps.codBadge}>
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={C.success}
                  />
                  <Text style={ps.codBadgeText}>
                    No advance payment required
                  </Text>
                </View>
                {[
                  {
                    icon: "cube-outline" as const,
                    text: "Booking confirmed instantly",
                  },
                  {
                    icon: "bicycle-outline" as const,
                    text: "Equipment delivered to you",
                  },
                  {
                    icon: "cash-outline" as const,
                    text: `Pay ₹${amount.toLocaleString("en-IN")} on receipt`,
                  },
                ].map((s, i) => (
                  <View key={i} style={ps.codStep}>
                    <View style={ps.codStepIcon}>
                      <Ionicons name={s.icon} size={13} color={C.amber} />
                    </View>
                    <Text style={ps.codStepText}>{s.text}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky pay bar ──────────────────────────────────────────────── */}
      {!isPending && (
        <View
          style={[
            ps.payBar,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <TouchableOpacity
            style={[ps.payBtn, paying && { opacity: 0.65 }]}
            onPress={handlePay}
            disabled={paying}
            activeOpacity={0.88}
          >
            {paying && !showPlane ? (
              <View style={ps.payBtnInner}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={ps.payBtnText}>Processing…</Text>
              </View>
            ) : (
              <View style={ps.payBtnInner}>
                <Text style={ps.payBtnText}>{payBtnLabel}</Text>
                <View style={ps.payBtnIcon}>
                  <Ionicons
                    name={tab === "cod" ? "checkmark" : "lock-closed"}
                    size={14}
                    color="#fff"
                  />
                </View>
              </View>
            )}
          </TouchableOpacity>
          <View style={ps.rzpRow}>
            <Ionicons
              name="shield-checkmark-outline"
              size={11}
              color={C.muted}
            />
            <Text style={ps.rzpText}>256-bit SSL · Powered by Razorpay</Text>
          </View>
        </View>
      )}

      {/* ── Plane animation overlay ─────────────────────────────────────── */}
      {showPlane && (
        <View style={ps.planeOverlay}>
          <View style={ps.planeBg}>
            <LottieView
              ref={lottieRef}
              source={require("../assets/animations/planeAnimation.json")}
              style={ps.planeLottie}
              autoPlay={false}
              loop
              speed={1}
            />
            <Text style={ps.planeTitle}>Processing Payment</Text>
            <Text style={ps.planeSub}>Please wait, do not close the app…</Text>
            <View style={ps.planeAmtPill}>
              <Ionicons name="lock-closed" size={12} color={C.teal} />
              <Text style={ps.planeAmt}>
                ₹{amount.toLocaleString("en-IN")} · Secured
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const ps = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1 },
  scrollContent: { paddingVertical: 12 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: C.headerBg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: C.text,
    letterSpacing: -0.3,
  },
  headerSubRow: { flexDirection: "row", alignItems: "center", marginTop: 2 },
  headerSub: { fontSize: 12, color: C.textSoft, fontWeight: "500" },
  headerSavings: { fontSize: 12, color: C.teal, fontWeight: "700" },

  // Section
  section: { marginBottom: 10 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  upiLogoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: C.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    letterSpacing: -0.2,
  },
  sectionCard: {
    backgroundColor: C.sectionBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.divider,
    marginLeft: 64,
  },

  // Skeleton
  skeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.border,
  },
  skeletonText: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.border,
  },
  skeletonRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.border,
  },

  // UPI row
  upiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  upiRowActive: { backgroundColor: "#fafafa" },
  appIcon: { width: 40, height: 40, borderRadius: 10 },
  appIconFallback: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  appIconLetter: { fontSize: 17, fontWeight: "900", color: "#fff" },
  upiRowLabel: { fontSize: 14, fontWeight: "600", color: C.text },
  upiRowSub: { fontSize: 12, color: C.muted, fontWeight: "500", marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border,
    justifyContent: "center",
    alignItems: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },

  // UPI ID input
  upiInputPanel: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: C.white,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: C.text,
    fontWeight: "500",
    padding: 0,
  },
  brandPill: {
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  brandText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#3b82f6",
    letterSpacing: 0.4,
  },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: C.tealLight,
    borderWidth: 1,
    borderColor: C.tealBorder,
  },
  chipText: { fontSize: 11, fontWeight: "700", color: C.teal },
  reqRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  reqText: { fontSize: 12, color: C.muted },
  encryptNote: { flexDirection: "row", alignItems: "center", gap: 6 },
  encryptText: { fontSize: 11, color: C.muted, fontWeight: "500" },

  // Pending collect
  pendingPanel: {
    alignItems: "center",
    padding: 24,
    gap: 10,
    backgroundColor: C.tealLight,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.tealBorder,
    position: "relative",
    overflow: "hidden",
  },
  pulseRing2: {
    position: "absolute",
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: C.teal,
    top: 10,
  },
  pulseRing1: {
    position: "absolute",
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: C.teal,
    top: 21,
  },
  pulseCore: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: C.white,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  pendingTitle: { fontSize: 16, fontWeight: "800", color: C.text },
  pendingVpa: { fontSize: 13, fontWeight: "700", color: C.teal },
  pendingHint: { fontSize: 12, color: C.textSoft, fontWeight: "500" },
  timerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.white,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  timerText: { fontSize: 12, fontWeight: "600", color: C.muted },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  cancelText: { fontSize: 12, color: C.error, fontWeight: "600" },

  resultPanel: { alignItems: "center", padding: 24, gap: 10 },
  resultTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: C.tealLight,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.tealBorder,
  },
  retryText: { fontSize: 13, fontWeight: "700", color: C.teal },

  // COD
  codPanel: { paddingHorizontal: 16, paddingBottom: 16 },
  codBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: C.successLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    marginTop: 12,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  codBadgeText: { fontSize: 12, fontWeight: "700", color: C.success },
  codStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  codStepIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#fffbeb",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  codStepText: { fontSize: 13, color: C.textSoft, fontWeight: "500", flex: 1 },

  // Pay bar
  payBar: {
    backgroundColor: C.white,
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  payBtn: {
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: C.primary,
  },
  payBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  payBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.2,
  },
  payBtnIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  rzpRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 10,
  },
  rzpText: { fontSize: 11, color: C.muted, fontWeight: "500" },

  // Plane overlay
  planeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.96)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  planeBg: {
    width: "80%",
    alignItems: "center",
    gap: 10,
  },
  planeLottie: { width: 220, height: 220 },
  planeTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: C.text,
    letterSpacing: -0.4,
  },
  planeSub: {
    fontSize: 13,
    color: C.textSoft,
    fontWeight: "500",
    textAlign: "center",
  },
  planeAmtPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: C.tealLight,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.tealBorder,
    marginTop: 6,
  },
  planeAmt: { fontSize: 13, fontWeight: "700", color: C.teal },
});
