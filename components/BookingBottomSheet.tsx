/**
 * BookingBottomSheet.tsx — With Full Razorpay Integration (FIXED)
 *
 * FIXES:
 *  1. createRazorpayOrder now calls backend via api.post('/payments/create-order')
 *     instead of the non-existent RazorpayCustomUI.createOrder()
 *  2. Amount sent to backend in RUPEES (499) — backend converts to paise
 *  3. Amount passed to payViaUPICollect in RUPEES — service converts to paise
 *  4. Duplicate CTA button removed from review step (sticky bar is single source)
 *  5. isOrderLoading guard prevents double-tap
 *  6. Error is cleared when user switches payment method or edits UPI ID
 *  7. dismissed state handled gracefully
 */

import { Ionicons } from "@expo/vector-icons";
import LottieView from "lottie-react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Keyboard,
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
import { RazorpayCustomUI } from "../services/razorpay-customui.service";
import api, { bookingApi } from "../services/userApi"; // ✅ FIXED: import base api instance
import { useBookingFee } from "../services/bookingPayment";

const { height } = Dimensions.get("window");

export interface Equipment {
  id: string;
  name: string;
  category: string;
  price: number;
  minimumHours?: number;
  [key: string]: any;
}

export interface RentalReceipt {
  bookingId?: string | number;
  djName: string;
  hours: number;
  totalAmount: number;
  bookingAmount: number;
  eventDate: string;
  eventType: string;
  paymentId?: string;
}

interface Props {
  visible: boolean;
  equipment: Equipment | null;
  days: number;
  captainId?: number;
  onClose: () => void;
  onBooked: (receipt: RentalReceipt) => void;
  onViewBookings: () => void;
}

type Step = "details" | "review" | "payment" | "processing" | "success";
type PayMethod = "upi_collect" | "cash";

const EVENT_TYPES = [
  "Wedding", "Birthday", "Corporate", "Club Night",
  "House Party", "College Fest", "Other",
];
// Booking fee is now admin-editable from /admin/settings → Booking Fee.
// Components inside this sheet read it via the useBookingFee() hook.

export default function BookingBottomSheet({
  visible,
  equipment,
  days,
  captainId = 1,
  onClose,
  onBooked,
  onViewBookings,
}: Props) {
  const { user } = useAuth();
  const BOOKING_FEE = useBookingFee();
  const lottieRef = useRef<LottieView>(null);

  const translateY = useRef(new Animated.Value(height)).current;
  const overlayOp = useRef(new Animated.Value(0)).current;

  const [step, setStep] = useState<Step>("details");
  const [error, setError] = useState("");
  const [processLabel, setProcessLabel] = useState("");

  // Form Data
  const [eventType, setEventType] = useState("Wedding");
  const [eventDate, setEventDate] = useState(new Date().toISOString().split("T")[0]);
  const [startTime, setStartTime] = useState("18:00");
  const [guestCount, setGuestCount] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [hours, setHours] = useState(days);

  // Payment
  const [payMethod, setPayMethod] = useState<PayMethod>("upi_collect");
  const [upiCollectId, setUpiCollectId] = useState("");
  const [razorpayOrderId, setRazorpayOrderId] = useState("");
  const [isOrderLoading, setIsOrderLoading] = useState(false);

  const minHours = equipment?.minimumHours ?? 3;

  useEffect(() => {
    setHours(Math.max(days, minHours));
  }, [days, minHours]);

  // ── Sheet Animation ───────────────────────────────────────────────────────

  const openSheet = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, tension: 72, friction: 13, useNativeDriver: true }),
      Animated.timing(overlayOp, { toValue: 1, duration: 280, useNativeDriver: true }),
    ]).start();
  }, []);

  const closeSheet = useCallback((cb?: () => void) => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(translateY, { toValue: height, duration: 300, useNativeDriver: true }),
      Animated.timing(overlayOp, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start(() => cb?.());
  }, []);

  useEffect(() => {
    if (visible) {
      resetForm();
      openSheet();
    } else {
      closeSheet();
    }
  }, [visible]);

  const resetForm = () => {
    setStep("details");
    setError("");
    setEventType("Wedding");
    setEventDate(new Date().toISOString().split("T")[0]);
    setStartTime("18:00");
    setGuestCount("");
    setSpecialRequests("");
    setPayMethod("upi_collect");
    setUpiCollectId("");
    setRazorpayOrderId("");
    setIsOrderLoading(false);
  };

  // ── Back Handler ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step === "processing") return true;
      if (step === "payment") {
        Alert.alert("Cancel Payment?", "Your progress will be lost.", [
          { text: "Stay", style: "cancel" },
          { text: "Go Back", style: "destructive", onPress: () => { setError(""); setStep("review"); } },
        ]);
        return true;
      }
      if (step === "review") {
        setStep("details");
        return true;
      }
      closeSheet(onClose);
      return true;
    });
    return () => sub.remove();
  }, [visible, step]);

  // ── Success Animation ─────────────────────────────────────────────────────

  useEffect(() => {
    if (step === "success") {
      setTimeout(() => lottieRef.current?.play(), 300);
    }
  }, [step]);

  // ── Computed Values ───────────────────────────────────────────────────────

  const pricePerHour = equipment?.price ?? 0;
  const totalServiceAmount = pricePerHour * hours;

  const endTime = (() => {
    const [h, m] = startTime.split(":").map(Number);
    const d = new Date();
    d.setHours(h + hours, m);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  })();

  // ── Create Razorpay Order (FIXED) ─────────────────────────────────────────
  //
  //  Previously called RazorpayCustomUI.createOrder() which doesn't exist.
  //  Now correctly calls the backend POST /api/payments/create-order.
  //  Amount is sent in RUPEES — paymentController.js multiplies by 100 for paise.

  const createRazorpayOrder = async () => {
    if (isOrderLoading) return; // prevent double-tap
    setIsOrderLoading(true);
    setError("");

    try {
      const res = await api.post("/payments/create-order", {
        amount: BOOKING_FEE,         // ✅ 499 rupees — backend does *100 → 49900 paise
        currency: "INR",
        notes: {
          purpose: "Booking confirmation fee",
          eventType,
          eventDate,
        },
      });

      // Backend returns: { success, orderId, amount, currency, keyId }
      const orderId = res.data?.orderId;
      if (!orderId) throw new Error("Order ID missing in server response");

      setRazorpayOrderId(orderId);
      setStep("payment");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Could not create payment order. Please try again.";
      setError(msg);
    } finally {
      setIsOrderLoading(false);
    }
  };

  // ── Finalize Booking after successful payment ─────────────────────────────

  const finalizeBooking = async (paymentId: string) => {
    setStep("processing");
    setProcessLabel("Creating your booking...");

    try {
      const res = await bookingApi.create({
        captainId,
        captainDJId: parseInt(equipment!.id),
        eventType,
        eventDate,
        startTime,
        endTime,
        durationHours: hours,
        guestCount: guestCount ? parseInt(guestCount) : undefined,
        specialRequests: specialRequests.trim() || undefined,
        deliveryLocation: {
          latitude: 26.9124,
          longitude: 75.7873,
          city: "Jaipur",
        },
      });

      if (res.success) {
        const bookingId = res.data?.id || res.data?.bookingId;
        setStep("success");
        onBooked({
          bookingId,
          djName: equipment!.name,
          hours,
          totalAmount: totalServiceAmount,
          bookingAmount: BOOKING_FEE,
          eventDate,
          eventType,
          paymentId,
        });
      } else {
        throw new Error(res.message || "Booking creation failed");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create booking. Please contact support.";
      setError(msg);
      setStep("payment");
    }
  };

  // ── Handle Payment Submission (FIXED) ────────────────────────────────────
  //
  //  Amount passed to payViaUPICollect in RUPEES (499).
  //  The service does Math.round(params.amount * 100) internally → 49900 paise.

  const handleSubmitPayment = async () => {
    if (payMethod === "cash") {
      await finalizeBooking("CASH");
      return;
    }

    // UPI Collect
    if (!razorpayOrderId) {
      setError("Payment order not ready. Please go back and try again.");
      return;
    }

    const trimmedVpa = upiCollectId.trim();
    if (!trimmedVpa.includes("@")) {
      setError("Please enter a valid UPI ID (e.g. name@upi)");
      return;
    }

    setStep("processing");
    setProcessLabel("Sending UPI collect request...");

    try {
      const result = await RazorpayCustomUI.payViaUPICollect({
        orderId: razorpayOrderId,
        amount: BOOKING_FEE,         // ✅ 499 rupees — service does *100 → 49900 paise
        vpa: trimmedVpa,
        contact: user?.phone || "",
        email: user?.email || "",
      });

      if (result.success && result.paymentId) {
        await finalizeBooking(result.paymentId);
      } else if (result.dismissed) {
        setError("Payment was dismissed. Please try again.");
        setStep("payment");
      } else {
        throw new Error(result.error || "UPI payment failed");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Payment failed. Please try again.";
      setError(msg);
      setStep("payment");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!equipment) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <KeyboardAvoidingView
        style={StyleSheet.absoluteFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Backdrop */}
        <Animated.View style={[s.overlay, { opacity: overlayOp }]}>
          <TouchableOpacity
            style={{ flex: 1 }}
            onPress={() => step !== "processing" && closeSheet(onClose)}
          />
        </Animated.View>

        {/* Sheet */}
        <Animated.View style={[s.sheet, { transform: [{ translateY }] }]}>
          <View style={s.handleZone}><View style={s.handle} /></View>

          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>
              {step === "details"     ? "Book DJ"             :
               step === "review"     ? "Review & Pay"        :
               step === "payment"    ? "Secure Payment"      :
               step === "processing" ? "Processing..."       :
                                       "Booking Confirmed! 🎉"}
            </Text>
          </View>

          {/* ── DETAILS STEP ──────────────────────────────────────────── */}
          {step === "details" && (
            <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
              {/* Price Summary */}
              <View style={s.priceSummary}>
                <View>
                  <Text style={s.psLabel}>RATE</Text>
                  <Text style={s.psValue}>₹{pricePerHour}/hr</Text>
                </View>
                <View style={s.psDivider} />
                <View style={s.hourSel}>
                  <Text style={s.psLabel}>HOURS</Text>
                  <View style={s.hourRow}>
                    <TouchableOpacity
                      style={[s.hourBtn, hours <= minHours && s.hourBtnOff]}
                      onPress={() => setHours(h => Math.max(minHours, h - 1))}
                      disabled={hours <= minHours}
                    >
                      <Ionicons name="remove" size={16} color={hours <= minHours ? "#c4c9d0" : "#fff"} />
                    </TouchableOpacity>
                    <Text style={s.hourNum}>{hours}</Text>
                    <TouchableOpacity style={s.hourBtn} onPress={() => setHours(h => h + 1)}>
                      <Ionicons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={s.psDivider} />
                <View>
                  <Text style={s.psLabel}>TOTAL</Text>
                  <Text style={[s.psValue, { color: "#02023E" }]}>₹{totalServiceAmount}</Text>
                </View>
              </View>

              {/* Event Type */}
              <Text style={s.fieldLabel}>Event Type</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chipRow}
              >
                {EVENT_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.chip, eventType === t && s.chipOn]}
                    onPress={() => setEventType(t)}
                  >
                    <Text style={[s.chipText, eventType === t && s.chipTextOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Date */}
              <Text style={s.fieldLabel}>Event Date</Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  value={eventDate}
                  onChangeText={setEventDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>

              {/* Start Time */}
              <Text style={s.fieldLabel}>Start Time</Text>
              <View style={s.inputWrap}>
                <TextInput
                  style={s.input}
                  value={startTime}
                  onChangeText={setStartTime}
                  placeholder="18:00"
                />
              </View>
              <Text style={s.fieldHint}>Ends at {endTime} • {hours} hours</Text>

              {/* Special Requests */}
              <Text style={s.fieldLabel}>Special Requests (optional)</Text>
              <View style={[s.inputWrap, { height: 80 }]}>
                <TextInput
                  style={[s.input, { height: 70, textAlignVertical: "top" }]}
                  value={specialRequests}
                  onChangeText={setSpecialRequests}
                  placeholder="Song preferences, setup needs..."
                  multiline
                />
              </View>

              <TouchableOpacity style={s.ctaBtn} onPress={() => setStep("review")}>
                <Text style={s.ctaBtnText}>Continue to Review</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </ScrollView>
          )}

          {/* ── REVIEW STEP ────────────────────────────────────────────── */}
          {step === "review" && (
            <ScrollView style={s.body}>
              <View style={s.reviewCard}>
                <Text style={s.reviewTitle}>Booking Summary</Text>
                <Text style={s.reviewDJ}>{equipment.name}</Text>
                <Text style={s.reviewDetail}>{eventType} • {eventDate} • {startTime}–{endTime}</Text>
                <Text style={s.reviewDetail}>{hours} hours • Service: ₹{totalServiceAmount}</Text>
              </View>

              <View style={s.payNowBox}>
                <Text style={s.payNowTitle}>Booking Confirmation Fee</Text>
                <Text style={s.payNowAmt}>₹{BOOKING_FEE}</Text>
                <Text style={s.payNowSub}>Rest paid at venue after service</Text>
              </View>
              {/* No duplicate CTA here — sticky bar below handles it */}
            </ScrollView>
          )}

          {/* ── PAYMENT STEP ───────────────────────────────────────────── */}
          {step === "payment" && (
            <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
              <View style={s.payAmountHeader}>
                <Text style={s.payAmountBig}>₹{BOOKING_FEE}</Text>
                <Text style={s.payAmountSub}>Booking Confirmation Fee</Text>
              </View>

              {/* Method Tabs */}
              <View style={s.methodTabs}>
                {(["upi_collect", "cash"] as PayMethod[]).map((m) => (
                  <TouchableOpacity
                    key={m}
                    style={[s.methodTab, payMethod === m && s.methodTabOn]}
                    onPress={() => { setPayMethod(m); setError(""); }}
                  >
                    <Ionicons
                      name={m === "upi_collect" ? "phone-portrait-outline" : "cash-outline"}
                      size={18}
                      color={payMethod === m ? "#02023E" : "#8696a0"}
                    />
                    <Text style={[s.methodTabText, payMethod === m && s.methodTabTextOn]}>
                      {m === "upi_collect" ? "UPI Collect" : "Pay at Venue"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* UPI Input */}
              {payMethod === "upi_collect" && (
                <View style={s.methodBody}>
                  <Text style={s.methodTitle}>Enter your UPI ID</Text>
                  <Text style={s.methodHint}>A collect request will be sent to your UPI app</Text>
                  <View style={s.inputWrap}>
                    <TextInput
                      style={s.input}
                      value={upiCollectId}
                      onChangeText={(t) => { setUpiCollectId(t); setError(""); }}
                      placeholder="yourname@upi"
                      autoCapitalize="none"
                      keyboardType="email-address"
                    />
                  </View>
                </View>
              )}

              {/* Cash Notice */}
              {payMethod === "cash" && (
                <View style={s.methodBody}>
                  <View style={s.cashNotice}>
                    <Ionicons name="information-circle-outline" size={20} color="#f59e0b" />
                    <Text style={s.cashNoticeText}>
                      Booking will be confirmed. Please pay ₹{BOOKING_FEE} at the venue before the event starts.
                    </Text>
                  </View>
                </View>
              )}

              {!!error && <Text style={s.errorText}>{error}</Text>}
            </ScrollView>
          )}

          {/* ── PROCESSING STEP ────────────────────────────────────────── */}
          {step === "processing" && (
            <View style={s.processingContainer}>
              <ActivityIndicator size="large" color="#02023E" />
              <Text style={s.processingText}>{processLabel}</Text>
            </View>
          )}

          {/* ── SUCCESS STEP ───────────────────────────────────────────── */}
          {step === "success" && (
            <View style={s.successContainer}>
              <LottieView
                ref={lottieRef}
                source={require("../assets/animations/success.json")}
                autoPlay
                loop={false}
                style={s.successLottie}
              />
              <Text style={s.successTitle}>Booking Confirmed!</Text>
              <Text style={s.successSub}>You'll receive a confirmation shortly.</Text>
              <TouchableOpacity
                style={s.viewBookingsBtn}
                onPress={() => { closeSheet(); onViewBookings(); }}
              >
                <Text style={s.viewBookingsText}>View My Bookings</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STICKY FOOTER ──────────────────────────────────────────── */}
          {(step === "review" || step === "payment") && (
            <View style={s.stickyBar}>
              <TouchableOpacity
                style={[s.stickyBtn, isOrderLoading && s.stickyBtnDisabled]}
                onPress={step === "review" ? createRazorpayOrder : handleSubmitPayment}
                disabled={isOrderLoading}
              >
                {isOrderLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={s.stickyBtnText}>
                    {step === "review"
                      ? `Pay ₹${BOOKING_FEE} to Confirm`
                      : payMethod === "cash"
                        ? "Confirm Cash Booking"
                        : "Pay via UPI"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(16,23,32,0.5)" },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    height: height * 0.93, backgroundColor: "#fff",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: "#eef0f3",
  },
  handleZone: { paddingTop: 12, alignItems: "center" },
  handle: { width: 44, height: 4, backgroundColor: "#d1d5db", borderRadius: 2 },

  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#101720" },

  body: { flex: 1 },

  priceSummary: {
    flexDirection: "row", justifyContent: "space-between",
    margin: 20, backgroundColor: "#f4f8ff",
    borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#eef0f3",
  },
  psLabel: { fontSize: 10, fontWeight: "700", color: "#8696a0" },
  psValue: { fontSize: 20, fontWeight: "800", color: "#101720" },
  psDivider: { width: 1, height: 40, backgroundColor: "#e5e7eb" },
  hourSel: { alignItems: "center" },
  hourRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  hourBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: "#101720", justifyContent: "center", alignItems: "center",
  },
  hourBtnOff: { backgroundColor: "#e5e7eb" },
  hourNum: { fontSize: 18, fontWeight: "800", color: "#101720" },

  fieldLabel: {
    fontSize: 12, fontWeight: "700", color: "#6b7280",
    marginHorizontal: 20, marginTop: 16, marginBottom: 8,
  },
  inputWrap: {
    marginHorizontal: 20, backgroundColor: "#f9fafb",
    borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: "#e5e7eb",
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 13, color: "#101720" },
  fieldHint: { marginHorizontal: 20, marginTop: 6, fontSize: 12, color: "#02023E" },

  chipRow: { paddingHorizontal: 20, gap: 8, flexDirection: "row" },
  chip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: "#f4f8ff", borderWidth: 1, borderColor: "#e5e7eb",
  },
  chipOn: { backgroundColor: "#101720", borderColor: "#101720" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  chipTextOn: { color: "#fff" },

  ctaBtn: {
    backgroundColor: "#101720", borderRadius: 18, paddingVertical: 17,
    margin: 20, flexDirection: "row", alignItems: "center",
    justifyContent: "center", gap: 8,
  },
  ctaBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },

  reviewCard: {
    margin: 20, backgroundColor: "#f9fafb",
    borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#eef0f3",
  },
  reviewTitle: { fontSize: 13, fontWeight: "700", color: "#8696a0" },
  reviewDJ: { fontSize: 18, fontWeight: "800", color: "#101720" },
  reviewDetail: { fontSize: 14, color: "#6b7280", marginTop: 6 },

  payNowBox: {
    margin: 20, padding: 16, backgroundColor: "#fffbeb",
    borderRadius: 16, borderWidth: 1, borderColor: "#fbbf24", alignItems: "center",
  },
  payNowTitle: { fontSize: 15, fontWeight: "800", color: "#101720" },
  payNowAmt: { fontSize: 28, fontWeight: "800", color: "#02023E", marginTop: 4 },
  payNowSub: { fontSize: 12, color: "#8696a0", marginTop: 4 },

  payAmountHeader: { alignItems: "center", paddingVertical: 20 },
  payAmountBig: { fontSize: 48, fontWeight: "800", color: "#101720" },
  payAmountSub: { fontSize: 14, color: "#8696a0" },

  methodTabs: { flexDirection: "row", marginHorizontal: 20, gap: 8 },
  methodTab: {
    flex: 1, padding: 14, borderRadius: 16,
    backgroundColor: "#f4f8ff", alignItems: "center", gap: 6,
  },
  methodTabOn: { backgroundColor: "#fff", borderWidth: 2, borderColor: "#02023E" },
  methodTabText: { fontSize: 13, fontWeight: "600", color: "#8696a0" },
  methodTabTextOn: { color: "#02023E" },

  methodBody: { padding: 20 },
  methodTitle: { fontSize: 14, fontWeight: "700", color: "#101720", marginBottom: 4 },
  methodHint: { fontSize: 12, color: "#8696a0", marginBottom: 12 },

  cashNotice: {
    flexDirection: "row", gap: 10, backgroundColor: "#fffbeb",
    borderRadius: 12, padding: 14, borderWidth: 1,
    borderColor: "#fbbf24", alignItems: "flex-start",
  },
  cashNoticeText: { flex: 1, fontSize: 13, color: "#92400e", lineHeight: 20 },

  stickyBar: { padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eef0f3" },
  stickyBtn: { backgroundColor: "#02023E", borderRadius: 18, paddingVertical: 16, alignItems: "center" },
  stickyBtnDisabled: { opacity: 0.6 },
  stickyBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  processingContainer: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16 },
  processingText: { fontSize: 16, fontWeight: "600", color: "#101720" },

  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  successLottie: { width: 180, height: 180 },
  successTitle: { fontSize: 24, fontWeight: "800", color: "#101720", marginTop: 20 },
  successSub: { fontSize: 14, color: "#8696a0", marginTop: 8 },
  viewBookingsBtn: {
    marginTop: 40, backgroundColor: "#02023E",
    paddingVertical: 16, paddingHorizontal: 40, borderRadius: 18,
  },
  viewBookingsText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  errorText: { color: "#ef4444", textAlign: "center", marginHorizontal: 20, marginTop: 8, fontSize: 14 },
});