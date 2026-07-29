/**
 * BookingFlowScreen.tsx — REDESIGNED
 *
 * Changes:
 *  1. Contact step removed — uses logged-in user's details by default
 *  2. "Add another contact person" optional card on Delivery step
 *  3. After payment: 5s success screen → auto-creates rental → receipt modal
 *  4. Receipt modal shows full order details + payment ID
 *  5. Steps: Delivery (0) → Payment (1) → Review/Receipt (2)
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  Easing,
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
import { apiService } from "../services/api";
import PaymentStep from "./paymentStep";

const { width } = Dimensions.get("window");

// ─── Types ─────────────────────────────────────────────────────────────────────

type DeliveryMethod = "delivery" | "pickup";

interface ContactOverride {
  enabled: boolean;
  name: string;
  phone: string;
  email: string;
}

interface BookingState {
  deliveryMethod: DeliveryMethod;
  address: string;
  landmark: string;
  pincode: string;
  contactOverride: ContactOverride;
}

interface PaymentResult {
  success: boolean;
  method: "upi_app" | "upi_id" | "card" | "cod";
  paymentId?: string;
  orderId?: string;
  signature?: string;
  dismissed?: boolean;
  error?: string;
}

interface RentalReceipt {
  rentalId: string;
  equipmentName: string;
  days: number;
  totalAmount: number;
  paymentMethod: string;
  paymentId?: string;
  deliveryMethod: string;
  address: string;
  contactName: string;
  contactPhone: string;
  createdAt: string;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const equipmentData: any = {
  "1": {
    id: "1",
    name: "Pioneer DDJ-1000",
    category: "DJ Controller",
    price: 150,
    deposit: 500,
    vendor: "BeatBox Rentals",
    vendorPhone: "+91 98765 43210",
    pickupAddress: "Shop 7, MI Road, Jaipur",
  },
};

// Simulated logged-in user — replace with real data from auth context/store
const CURRENT_USER = {
  name: "Arjun Sharma",
  phone: "9876543210",
  email: "arjun@example.com",
};

const SAVED_ADDRESSES = [
  { id: "1", label: "Home", icon: "home-outline", address: "42, Shyam Nagar, Jaipur, 302019", pincode: "302019" },
  { id: "2", label: "Work", icon: "business-outline", address: "Plot 9, Malviya Nagar, Jaipur, 302017", pincode: "302017" },
  { id: "3", label: "Other", icon: "location-outline", address: "15, Vaishali Nagar, Jaipur, 302021", pincode: "302021" },
];

// ─── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <View style={si.row}>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <React.Fragment key={i}>
            <View style={[si.dot, done && si.dotDone, current && si.dotCurrent]}>
              {done
                ? <Ionicons name="checkmark" size={12} color="#fff" />
                : <Text style={[si.dotText, current && si.dotTextCurrent]}>{i + 1}</Text>
              }
            </View>
            {i < total - 1 && <View style={[si.line, done && si.lineDone]} />}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const si = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flex: 1 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#eef0f3", justifyContent: "center", alignItems: "center", borderWidth: 1.5, borderColor: "#d1d5db" },
  dotDone: { backgroundColor: "#02023E", borderColor: "#02023E" },
  dotCurrent: { backgroundColor: "#101720", borderColor: "#101720" },
  dotText: { fontSize: 11, fontWeight: "800", color: "#8696a0" },
  dotTextCurrent: { color: "#fff" },
  line: { flex: 1, height: 2, backgroundColor: "#eef0f3", marginHorizontal: 4 },
  lineDone: { backgroundColor: "#02023E" },
});

// ─── Payment Success Screen ────────────────────────────────────────────────────

function PaymentSuccessScreen({ method, amount, onDone }: {
  method: string; amount: number; onDone: () => void;
}) {
  const scale   = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // Entry animation
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Progress bar
    Animated.timing(progress, {
      toValue: 1, duration: 5000, easing: Easing.linear, useNativeDriver: false,
    }).start();

    // Countdown
    const iv = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(iv); return 0; }
        return c - 1;
      });
    }, 1000);

    // Auto-proceed after 5s
    const t = setTimeout(onDone, 5000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, []);

  const methodLabel: Record<string, string> = {
    upi_app: "UPI App", upi_id: "UPI ID", card: "Card", cod: "Cash on Delivery",
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1], outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View style={[ss.root, { opacity }]}>
      <LinearGradient colors={["#f0fdf4", "#dcfce7", "#f0fdf4"]} style={ss.grad}>

        {/* Animated checkmark */}
        <Animated.View style={[ss.iconWrap, { transform: [{ scale }] }]}>
          <LinearGradient colors={["#22c55e", "#16a34a"]} style={ss.iconGrad}>
            <Ionicons name="checkmark" size={52} color="#fff" />
          </LinearGradient>
        </Animated.View>

        <Text style={ss.title}>Payment Successful!</Text>
        <Text style={ss.amount}>₹{amount.toLocaleString("en-IN")}</Text>
        <View style={ss.methodBadge}>
          <Ionicons name="shield-checkmark" size={14} color="#16a34a" />
          <Text style={ss.methodText}>Paid via {methodLabel[method] ?? method}</Text>
        </View>

        <Text style={ss.sub}>Creating your booking…</Text>

        <View style={ss.progressTrack}>
          <Animated.View style={[ss.progressFill, { width: progressWidth }]} />
        </View>
        <Text style={ss.countdown}>Continuing in {countdown}s</Text>

        <TouchableOpacity style={ss.skipBtn} onPress={onDone} activeOpacity={0.8}>
          <Text style={ss.skipText}>Continue now →</Text>
        </TouchableOpacity>
      </LinearGradient>
    </Animated.View>
  );
}

const ss = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f0fdf4" },
  grad: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 16 },
  iconWrap: { marginBottom: 8 },
  iconGrad: { width: 104, height: 104, borderRadius: 36, justifyContent: "center", alignItems: "center", shadowColor: "#16a34a", shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  title: { fontSize: 28, fontWeight: "800", color: "#101720", letterSpacing: -0.5 },
  amount: { fontSize: 40, fontWeight: "800", color: "#16a34a", letterSpacing: -1 },
  methodBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "#bbf7d0" },
  methodText: { fontSize: 13, fontWeight: "700", color: "#16a34a" },
  sub: { fontSize: 14, color: "#4b6585", fontWeight: "500", marginTop: 8 },
  progressTrack: { width: "80%", height: 4, backgroundColor: "#bbf7d0", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: "#16a34a", borderRadius: 2 },
  countdown: { fontSize: 12, color: "#8696a0", fontWeight: "500" },
  skipBtn: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 14, backgroundColor: "#16a34a" },
  skipText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});

// ─── Receipt Modal ─────────────────────────────────────────────────────────────

function ReceiptModal({ receipt, visible, onClose }: { receipt: RentalReceipt; visible: boolean; onClose: () => void }) {
  const payLabel: Record<string, string> = {
    upi_app: "UPI App", upi_id: "UPI ID", card: "Card", cod: "Cash on Delivery",
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={rm.overlay}>
        <View style={rm.sheet}>
          {/* Header */}
          <LinearGradient colors={["#101720", "#1e2d3d"]} style={rm.header}>
            <View style={rm.headerIcon}>
              <Ionicons name="receipt-outline" size={24} color="#02023E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={rm.headerTitle}>Booking Confirmed!</Text>
              <Text style={rm.headerId}>Order: {receipt.rentalId}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={rm.closeBtn}>
              <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </LinearGradient>

          <ScrollView style={rm.body} showsVerticalScrollIndicator={false}>
            {/* Amount */}
            <View style={rm.amountRow}>
              <Text style={rm.amountLabel}>Total Paid</Text>
              <Text style={rm.amountVal}>₹{receipt.totalAmount.toLocaleString("en-IN")}</Text>
              <View style={rm.paidBadge}>
                <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
                <Text style={rm.paidText}>
                  {receipt.paymentMethod === "cod" ? "Pay on Delivery" : "Payment Confirmed"}
                </Text>
              </View>
            </View>

            {/* Equipment */}
            <View style={rm.section}>
              <Text style={rm.sectionTitle}>Equipment</Text>
              <View style={rm.card}>
                <Row icon="cube-outline"    label="Item"     value={receipt.equipmentName} />
                <Divider />
                <Row icon="calendar-outline" label="Duration" value={`${receipt.days} day${receipt.days > 1 ? "s" : ""}`} />
              </View>
            </View>

            {/* Payment */}
            <View style={rm.section}>
              <Text style={rm.sectionTitle}>Payment</Text>
              <View style={rm.card}>
                <Row icon="card-outline" label="Method" value={payLabel[receipt.paymentMethod] ?? receipt.paymentMethod} />
                {receipt.paymentId && (
                  <>
                    <Divider />
                    <Row icon="receipt-outline" label="Payment ID" value={receipt.paymentId} small />
                  </>
                )}
                <Divider />
                <Row icon="time-outline" label="Date" value={new Date(receipt.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
              </View>
            </View>

            {/* Delivery */}
            <View style={rm.section}>
              <Text style={rm.sectionTitle}>Delivery</Text>
              <View style={rm.card}>
                <Row icon={receipt.deliveryMethod === "delivery" ? "cube-outline" : "walk-outline"} label="Type" value={receipt.deliveryMethod === "delivery" ? "Home Delivery" : "Self Pickup"} />
                <Divider />
                <Row icon="location-outline" label="Address" value={receipt.address} />
              </View>
            </View>

            {/* Contact */}
            <View style={rm.section}>
              <Text style={rm.sectionTitle}>Contact</Text>
              <View style={rm.card}>
                <Row icon="person-outline" label="Name"  value={receipt.contactName} />
                <Divider />
                <Row icon="call-outline"   label="Phone" value={receipt.contactPhone} />
              </View>
            </View>

            <View style={rm.rzpBadge}>
              <Ionicons name="shield-checkmark" size={14} color="#02023E" />
              <Text style={rm.rzpText}>Secured by Razorpay · 256-bit SSL</Text>
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>

          {/* CTA */}
          <View style={rm.footer}>
            <TouchableOpacity style={rm.doneBtn} onPress={onClose} activeOpacity={0.88}>
              <LinearGradient colors={["#101720", "#1e2d3d"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={rm.doneBtnGrad}>
                <Text style={rm.doneBtnText}>View My Bookings</Text>
                <View style={rm.doneBtnIcon}>
                  <Ionicons name="arrow-forward" size={16} color="#101720" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Row({ icon, label, value, small }: { icon: string; label: string; value: string; small?: boolean }) {
  return (
    <View style={rm.row}>
      <View style={rm.rowIcon}><Ionicons name={icon as any} size={15} color="#02023E" /></View>
      <Text style={rm.rowLabel}>{label}</Text>
      <Text style={[rm.rowValue, small && { fontSize: 11 }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}
function Divider() { return <View style={rm.divider} />; }

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#f4f8ff", borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: "92%", overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 12, padding: 20, paddingTop: 24 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(12,173,171,0.15)", justifyContent: "center", alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  headerId: { fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: "600", marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)", justifyContent: "center", alignItems: "center" },
  body: { paddingHorizontal: 16 },
  amountRow: { alignItems: "center", paddingVertical: 24, gap: 8 },
  amountLabel: { fontSize: 12, color: "#8696a0", fontWeight: "600", letterSpacing: 0.5 },
  amountVal: { fontSize: 42, fontWeight: "800", color: "#101720", letterSpacing: -1 },
  paidBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#f0fdf4", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: "#bbf7d0" },
  paidText: { fontSize: 12, fontWeight: "700", color: "#16a34a" },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.8, marginBottom: 8, paddingLeft: 2 },
  card: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#eef0f3", overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  rowIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: "#f0fafa", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#d0f0ef" },
  rowLabel: { fontSize: 13, color: "#8696a0", fontWeight: "600", flex: 1 },
  rowValue: { fontSize: 13, fontWeight: "700", color: "#101720", flex: 2, textAlign: "right" },
  divider: { height: 1, backgroundColor: "#f4f8ff", marginHorizontal: 14 },
  rzpBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, backgroundColor: "#f0fafa", borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#d0f0ef" },
  rzpText: { fontSize: 12, color: "#02023E", fontWeight: "700" },
  footer: { padding: 16, paddingBottom: Platform.OS === "ios" ? 32 : 16, borderTopWidth: 1, borderTopColor: "#eef0f3" },
  doneBtn: { borderRadius: 18, overflow: "hidden" },
  doneBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  doneBtnText: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  doneBtnIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#02023E", justifyContent: "center", alignItems: "center" },
});

// ─── Field helper ──────────────────────────────────────────────────────────────

const Field = ({ label, value, onChangeText, placeholder, keyboardType, icon, editable = true }: any) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={[styles.fieldBox, !editable && styles.fieldBoxDisabled]}>
      {icon && <Ionicons name={icon} size={17} color="#8696a0" style={{ marginRight: 4 }} />}
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#c4c9d0"
        keyboardType={keyboardType || "default"}
        editable={editable}
      />
    </View>
  </View>
);

const SectionLabel = ({ icon, title, sub }: { icon: string; title: string; sub?: string }) => (
  <View style={styles.secLabel}>
    <View style={styles.secLabelIcon}><Ionicons name={icon as any} size={18} color="#02023E" /></View>
    <View>
      <Text style={styles.secLabelTitle}>{title}</Text>
      {sub && <Text style={styles.secLabelSub}>{sub}</Text>}
    </View>
  </View>
);

// ─── Main Screen ───────────────────────────────────────────────────────────────

type ScreenPhase = "flow" | "payment_success" | "done";

export default function BookingFlowScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const days  = parseInt((params.days as string) || "1");
  const equip = equipmentData[params.id as string] || equipmentData["1"];
  const total = equip.price * days;
  const grand = total + equip.deposit;

  const STEPS = ["Delivery", "Payment", "Review"];

  const [step, setStep]                   = useState(0);
  const [phase, setPhase]                 = useState<ScreenPhase>("flow");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isConfirming, setIsConfirming]   = useState(false);
  const [razorpayOrderId, setRazorpayOrderId] = useState("");
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(null);
  const [receipt, setReceipt]             = useState<RentalReceipt | null>(null);
  const [showReceipt, setShowReceipt]     = useState(false);

  const [booking, setBooking] = useState<BookingState>({
    deliveryMethod: "delivery",
    address: "",
    landmark: "",
    pincode: "",
    contactOverride: { enabled: false, name: "", phone: "", email: "" },
  });
  const [selectedSavedAddr, setSelectedSavedAddr] = useState<string | null>(null);

  const slideX  = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animateTo = (next: number, direction: 1 | -1) => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideX,  { toValue: -30 * direction, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      slideX.setValue(30 * direction);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(slideX,  { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    });
  };

  const goBack = () => {
    if (step === 0) { router.back(); return; }
    animateTo(step - 1, -1);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { goBack(); return true; });
    return () => sub.remove();
  }, [step]);

  const canNext = () => {
    if (step === 0) return booking.deliveryMethod === "pickup" || booking.address.length > 5;
    if (step === 1) return false; // PaymentStep owns its CTA
    return true;
  };

  // ── Create Razorpay order ──────────────────────────────────────────────────
  const createRazorpayOrder = async (): Promise<boolean> => {
    try {
      setIsCreatingOrder(true);
      const res = await apiService.createPaymentOrder(grand);
      if (!res?.orderId) throw new Error("No order ID returned");
      setRazorpayOrderId(res.orderId);
      setRazorpayKeyId(res.keyId || "");
      return true;
    } catch (err: any) {
      Alert.alert("Payment Setup Failed", err.message || "Could not create payment order.");
      return false;
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const handleNext = async () => {
    if (step === 0) {
      const ok = await createRazorpayOrder();
      if (ok) animateTo(1, 1);
      return;
    }
    if (step === 1) return; // PaymentStep handles this
    handleConfirmBooking();
  };

  // ── Called after payment success screen finishes (5s or skip) ─────────────
  const handleAfterPaymentSuccess = async () => {
    setPhase("flow");
    setIsConfirming(true);

    const contact = booking.contactOverride.enabled && booking.contactOverride.name
      ? booking.contactOverride
      : { name: CURRENT_USER.name, phone: CURRENT_USER.phone, email: CURRENT_USER.email };

    try {
      const res = await apiService.createRental({
        equipmentId:     equip.id,
        startDate:       new Date().toISOString(),
        endDate:         new Date(Date.now() + days * 86_400_000).toISOString(),
        deliveryAddress: booking.deliveryMethod === "delivery" ? booking.address : equip.pickupAddress,
        paymentId:       paymentResult?.paymentId,
        paymentMethod:   paymentResult?.method,
        razorpayOrderId,
      });

      const rentalId = res?.rental?.id ?? `RNT-${Date.now()}`;
      setReceipt({
        rentalId,
        equipmentName:  equip.name,
        days,
        totalAmount:    grand,
        paymentMethod:  paymentResult?.method ?? "cod",
        paymentId:      paymentResult?.paymentId,
        deliveryMethod: booking.deliveryMethod,
        address:        booking.deliveryMethod === "delivery" ? booking.address : equip.pickupAddress,
        contactName:    contact.name,
        contactPhone:   contact.phone,
        createdAt:      new Date().toISOString(),
      });

      animateTo(2, 1); // go to Review step
      setTimeout(() => setShowReceipt(true), 400); // show receipt after transition
    } catch (err: any) {
      Alert.alert("Booking Failed", err.message || "Could not create booking.");
    } finally {
      setIsConfirming(false);
    }
  };

  // ── handleConfirmBooking for step 3 CTA ───────────────────────────────────
  const handleConfirmBooking = () => {
    setShowReceipt(true);
  };

  const update = (key: keyof BookingState, val: any) =>
    setBooking((b) => ({ ...b, [key]: val }));
  const updateContact = (key: keyof ContactOverride, val: any) =>
    setBooking((b) => ({ ...b, contactOverride: { ...b.contactOverride, [key]: val } }));

  const stepMeta = [
    { title: "Delivery Details", sub: "How do you want to receive it?" },
    { title: "Payment Method",   sub: "Choose how you'd like to pay" },
    { title: "Review & Confirm", sub: "Double-check before booking" },
  ];

  const ctaLabel = step === 2
    ? "View Receipt"
    : isCreatingOrder ? "Setting up payment…" : `Continue to ${STEPS[step + 1]}`;

  const paymentMethodLabel: Record<string, string> = {
    upi_app: "UPI App", upi_id: "UPI ID", card: "Card", cod: "Cash on Delivery",
  };

  const contactPerson = booking.contactOverride.enabled && booking.contactOverride.name
    ? booking.contactOverride
    : CURRENT_USER;

  // ── Payment success phase ──────────────────────────────────────────────────
  if (phase === "payment_success" && paymentResult) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="dark-content" backgroundColor="#f0fdf4" />
        {isConfirming && (
          <View style={styles.confirmingOverlay}>
            <ActivityIndicator size="large" color="#16a34a" />
            <Text style={styles.confirmingText}>Creating your booking…</Text>
          </View>
        )}
        <PaymentSuccessScreen
          method={paymentResult.method}
          amount={grand}
          onDone={handleAfterPaymentSuccess}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />

      {/* Header */}
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={20} color="#101720" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{stepMeta[step].title}</Text>
            <StepIndicator step={step} total={STEPS.length} />
          </View>
          <View style={styles.stepCount}>
            <Text style={styles.stepCountText}>{step + 1}/{STEPS.length}</Text>
          </View>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` as any }]} />
        </View>
      </SafeAreaView>

      {/* Summary pill */}
      <View style={styles.summaryPill}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryName} numberOfLines={1}>{equip.name}</Text>
          <Text style={styles.summaryMeta}>{days} day{days > 1 ? "s" : ""} · {equip.category}</Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.summaryTotal}>₹{grand}</Text>
          <Text style={styles.summaryTotalSub}>incl. deposit</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={{ opacity, transform: [{ translateX: slideX }] }}
          keyboardShouldPersistTaps="handled"
        >

          {/* �?�?�?�?�?�?�?�?�?�?�?�?�?�?�? STEP 0: DELIVERY �?�?�?�?�?�?�?�?�?�?�?�?�?�?�? */}
          {step === 0 && (
            <View style={styles.stepContainer}>
              <SectionLabel icon="cube-outline" title="Delivery Method" />
              <View style={styles.methodRow}>
                {(["delivery", "pickup"] as DeliveryMethod[]).map((m) => {
                  const on = booking.deliveryMethod === m;
                  return (
                    <TouchableOpacity
                      key={m} style={[styles.methodCard, on && styles.methodCardOn]}
                      onPress={() => update("deliveryMethod", m)} activeOpacity={0.85}
                    >
                      <View style={[styles.methodIconBox, on && styles.methodIconBoxOn]}>
                        <Ionicons name={m === "delivery" ? "cube-outline" : "walk-outline"} size={24} color={on ? "#02023E" : "#8696a0"} />
                      </View>
                      <Text style={[styles.methodTitle, on && styles.methodTitleOn]}>
                        {m === "delivery" ? "Home Delivery" : "Self Pickup"}
                      </Text>
                      <Text style={styles.methodSub}>
                        {m === "delivery" ? "Delivered to your address" : "Pickup from vendor"}
                      </Text>
                      {on && <View style={styles.methodCheck}><Ionicons name="checkmark" size={12} color="#fff" /></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {booking.deliveryMethod === "pickup" && (
                <View style={styles.pickupCard}>
                  <Ionicons name="location" size={18} color="#02023E" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickupTitle}>Pickup Location</Text>
                    <Text style={styles.pickupAddr}>{equip.pickupAddress}</Text>
                    <Text style={styles.pickupHours}>Available 10 AM – 7 PM</Text>
                  </View>
                </View>
              )}

              {booking.deliveryMethod === "delivery" && (
                <>
                  <SectionLabel icon="bookmark-outline" title="Saved Addresses" sub="Tap to use" />
                  {SAVED_ADDRESSES.map((addr) => {
                    const on = selectedSavedAddr === addr.id;
                    return (
                      <TouchableOpacity key={addr.id}
                        style={[styles.savedAddrCard, on && styles.savedAddrCardOn]}
                        onPress={() => { setSelectedSavedAddr(addr.id); update("address", addr.address); update("pincode", addr.pincode); }}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.savedAddrIcon, on && styles.savedAddrIconOn]}>
                          <Ionicons name={addr.icon as any} size={18} color={on ? "#02023E" : "#8696a0"} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.savedAddrLabel, on && styles.savedAddrLabelOn]}>{addr.label}</Text>
                          <Text style={styles.savedAddrText} numberOfLines={1}>{addr.address}</Text>
                        </View>
                        {on && <Ionicons name="checkmark-circle" size={20} color="#02023E" />}
                      </TouchableOpacity>
                    );
                  })}

                  <SectionLabel icon="location-outline" title="Enter Address" sub="Or type a new one" />
                  <Field label="Full Address *" value={booking.address} onChangeText={(v: string) => { update("address", v); setSelectedSavedAddr(null); }} placeholder="House/Flat no., Street, Area" icon="home-outline" />
                  <View style={styles.fieldRow}>
                    <View style={{ flex: 1 }}>
                      <Field label="Landmark" value={booking.landmark} onChangeText={(v: string) => update("landmark", v)} placeholder="Near..." icon="navigate-outline" />
                    </View>
                    <View style={{ width: 120 }}>
                      <Field label="Pincode *" value={booking.pincode} onChangeText={(v: string) => update("pincode", v)} placeholder="302019" keyboardType="numeric" icon="mail-outline" />
                    </View>
                  </View>
                </>
              )}

              {/* ── Contact Person Section ── */}
              <SectionLabel icon="person-outline" title="Contact Person" sub="Who will receive the equipment?" />

              {/* Default user card */}
              <View style={styles.userDefaultCard}>
                <View style={styles.userDefaultAvatar}>
                  <Text style={styles.userDefaultInitial}>{CURRENT_USER.name.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userDefaultName}>{CURRENT_USER.name}</Text>
                  <Text style={styles.userDefaultPhone}>{CURRENT_USER.phone}</Text>
                </View>
                <View style={styles.userDefaultBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#02023E" />
                  <Text style={styles.userDefaultBadgeText}>You</Text>
                </View>
              </View>

              {/* Toggle for different contact */}
              <TouchableOpacity
                style={[styles.addContactBtn, booking.contactOverride.enabled && styles.addContactBtnOn]}
                onPress={() => updateContact("enabled", !booking.contactOverride.enabled)}
                activeOpacity={0.85}
              >
                <Ionicons
                  name={booking.contactOverride.enabled ? "person-remove-outline" : "person-add-outline"}
                  size={18}
                  color={booking.contactOverride.enabled ? "#f87171" : "#02023E"}
                />
                <Text style={[styles.addContactText, booking.contactOverride.enabled && styles.addContactTextOn]}>
                  {booking.contactOverride.enabled ? "Remove alternate contact" : "Add different contact person"}
                </Text>
                <Ionicons
                  name={booking.contactOverride.enabled ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#8696a0"
                />
              </TouchableOpacity>

              {booking.contactOverride.enabled && (
                <View style={styles.contactOverrideCard}>
                  <Text style={styles.contactOverrideHint}>This person will receive and sign for the equipment</Text>
                  <Field label="Full Name *" value={booking.contactOverride.name} onChangeText={(v: string) => updateContact("name", v)} placeholder="Contact person's name" icon="person-outline" />
                  <Field label="Mobile Number *" value={booking.contactOverride.phone} onChangeText={(v: string) => updateContact("phone", v.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" keyboardType="phone-pad" icon="call-outline" />
                  <Field label="Email (optional)" value={booking.contactOverride.email} onChangeText={(v: string) => updateContact("email", v)} placeholder="their@email.com" keyboardType="email-address" icon="mail-outline" />
                </View>
              )}

              <View style={styles.noticeCard}>
                <Ionicons name="information-circle-outline" size={16} color="#02023E" />
                <Text style={styles.noticeText}>
                  {booking.deliveryMethod === "delivery"
                    ? "A small delivery fee applies based on distance. Final amount is shown on the booking summary."
                    : "No delivery charges for self-pickup. Please carry a valid ID."}
                </Text>
              </View>
            </View>
          )}

          {/* �?�?�?�?�?�?�?�?�?�?�?�?�?�?�? STEP 1: PAYMENT �?�?�?�?�?�?�?�?�?�?�?�?�?�?�? */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <PaymentStep
                orderId={razorpayOrderId}
                amount={grand}
                contact={contactPerson.phone}
                email={contactPerson.email || "guest@basswala.in"}
                keyId={razorpayKeyId || undefined}
                onResult={(result) => {
                  if (result.success) {
                    setPaymentResult(result);
                    setPhase("payment_success"); // show 5s success screen
                  } else if (!result.dismissed) {
                    Alert.alert("Payment Failed", result.error ?? "Please try again.");
                  }
                }}
              />
            </View>
          )}

          {/* �?�?�?�?�?�?�?�?�?�?�?�?�?�?�? STEP 2: REVIEW �?�?�?�?�?�?�?�?�?�?�?�?�?�?�? */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <LinearGradient colors={["#101720", "#1e2d3d"]} style={styles.summaryCard}>
                <Text style={styles.summaryCardTitle}>Booking Summary</Text>
                <View style={styles.summaryCardDivider} />
                <View style={styles.summaryCardRow}><Text style={styles.summaryCardKey}>Equipment</Text><Text style={styles.summaryCardVal}>{equip.name}</Text></View>
                <View style={styles.summaryCardRow}><Text style={styles.summaryCardKey}>Duration</Text><Text style={styles.summaryCardVal}>{days} day{days > 1 ? "s" : ""}</Text></View>
                <View style={styles.summaryCardRow}><Text style={styles.summaryCardKey}>Rental</Text><Text style={styles.summaryCardVal}>₹{equip.price} × {days} = ₹{total}</Text></View>
                <View style={styles.summaryCardRow}><Text style={styles.summaryCardKey}>Deposit</Text><Text style={styles.summaryCardVal}>₹{equip.deposit}</Text></View>
                <View style={styles.summaryCardDivider} />
                <View style={styles.summaryCardRow}>
                  <Text style={[styles.summaryCardKey, { color: "#fff", fontWeight: "800" }]}>Grand Total</Text>
                  <Text style={[styles.summaryCardVal, { color: "#02023E", fontSize: 20, fontWeight: "800" }]}>₹{grand}</Text>
                </View>
              </LinearGradient>

              <SectionLabel icon="wallet-outline" title="Payment" />
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}><Ionicons name="card-outline" size={16} color="#02023E" /></View>
                  <Text style={styles.infoKey}>Method</Text>
                  <Text style={styles.infoVal}>{paymentMethodLabel[paymentResult?.method ?? "cod"]}</Text>
                </View>
                {paymentResult?.paymentId && (
                  <>
                    <View style={styles.infoDivider} />
                    <View style={styles.infoRow}>
                      <View style={styles.infoIconBox}><Ionicons name="receipt-outline" size={16} color="#02023E" /></View>
                      <Text style={styles.infoKey}>Payment ID</Text>
                      <Text style={[styles.infoVal, { fontSize: 11 }]} numberOfLines={1}>{paymentResult.paymentId}</Text>
                    </View>
                  </>
                )}
              </View>

              <SectionLabel icon="cube-outline" title="Delivery" />
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}><Ionicons name={booking.deliveryMethod === "delivery" ? "cube-outline" : "walk-outline"} size={16} color="#02023E" /></View>
                  <Text style={styles.infoKey}>Method</Text>
                  <Text style={styles.infoVal}>{booking.deliveryMethod === "delivery" ? "Home Delivery" : "Self Pickup"}</Text>
                </View>
                {booking.address ? (
                  <>
                    <View style={styles.infoDivider} />
                    <View style={styles.infoRow}>
                      <View style={styles.infoIconBox}><Ionicons name="location-outline" size={16} color="#02023E" /></View>
                      <Text style={styles.infoKey}>Address</Text>
                      <Text style={[styles.infoVal, { flex: 1, textAlign: "right" }]} numberOfLines={2}>{booking.address}</Text>
                    </View>
                  </>
                ) : null}
              </View>

              <SectionLabel icon="person-outline" title="Contact" />
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}><Ionicons name="person-outline" size={16} color="#02023E" /></View>
                  <Text style={styles.infoKey}>Name</Text>
                  <Text style={styles.infoVal}>{contactPerson.name}</Text>
                </View>
                <View style={styles.infoDivider} />
                <View style={styles.infoRow}>
                  <View style={styles.infoIconBox}><Ionicons name="call-outline" size={16} color="#02023E" /></View>
                  <Text style={styles.infoKey}>Phone</Text>
                  <Text style={styles.infoVal}>{contactPerson.phone}</Text>
                </View>
              </View>

              <View style={styles.razorpayBadge}>
                <Ionicons name="shield-checkmark" size={15} color="#02023E" />
                <Text style={styles.razorpayBadgeText}>Secured by Razorpay · 256-bit SSL</Text>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </Animated.ScrollView>

        {/* Bottom CTA — hidden on step 1 (PaymentStep owns its button) */}
        {step !== 1 && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={[styles.nextBtn, (!canNext() || isConfirming || isCreatingOrder) && styles.nextBtnOff]}
              onPress={handleNext}
              disabled={!canNext() || isConfirming || isCreatingOrder}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={canNext() && !isConfirming && !isCreatingOrder ? ["#101720", "#1e2d3d"] : ["#e5e7eb", "#e5e7eb"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.nextBtnGrad}
              >
                {isConfirming || isCreatingOrder ? (
                  <View style={{ flex: 1, alignItems: "center", flexDirection: "row", gap: 10 }}>
                    <ActivityIndicator size="small" color="#02023E" />
                    <Text style={styles.nextBtnText}>{isCreatingOrder ? "Setting up payment…" : "Confirming booking…"}</Text>
                  </View>
                ) : (
                  <View>
                    <Text style={[styles.nextBtnText, !canNext() && styles.nextBtnTextOff]}>{ctaLabel}</Text>
                    {step === 2 && <Text style={styles.nextBtnSub}>{days} day{days > 1 ? "s" : ""} · ₹{grand}</Text>}
                  </View>
                )}
                {!isConfirming && !isCreatingOrder && (
                  <View style={[styles.nextArrow, !canNext() && styles.nextArrowOff]}>
                    <Ionicons name={step === 2 ? "receipt-outline" : "arrow-forward"} size={18} color={canNext() ? "#101720" : "#c4c9d0"} />
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Receipt Modal */}
      {receipt && (
        <ReceiptModal
          receipt={receipt}
          visible={showReceipt}
          onClose={() => {
            setShowReceipt(false);
            router.replace("/(tabs)/bookings");
          }}
        />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  confirmingOverlay: { position: "absolute", inset: 0, zIndex: 99, backgroundColor: "rgba(240,253,244,0.85)", justifyContent: "center", alignItems: "center", gap: 14 },
  confirmingText: { fontSize: 15, fontWeight: "700", color: "#16a34a" },

  headerWrap: { backgroundColor: "#f4f8ff", borderBottomWidth: 1, borderBottomColor: "#eef0f3" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  headerCenter: { flex: 1, gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  stepCount: { backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: "#eef0f3" },
  stepCountText: { fontSize: 12, fontWeight: "700", color: "#8696a0" },
  progressBg: { height: 3, backgroundColor: "#eef0f3" },
  progressFill: { height: 3, backgroundColor: "#02023E", borderRadius: 2 },

  summaryPill: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 12, marginBottom: 4, backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#eef0f3", gap: 12 },
  summaryLeft: { flex: 1 },
  summaryName: { fontSize: 14, fontWeight: "700", color: "#101720", marginBottom: 2 },
  summaryMeta: { fontSize: 12, color: "#8696a0", fontWeight: "500" },
  summaryRight: { alignItems: "flex-end" },
  summaryTotal: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.4 },
  summaryTotalSub: { fontSize: 10, color: "#8696a0", fontWeight: "500" },

  scrollContent: { paddingBottom: 16 },
  stepContainer: { paddingHorizontal: 16, paddingTop: 12 },

  secLabel: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, marginTop: 20 },
  secLabelIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#f0fafa", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#d0f0ef" },
  secLabelTitle: { fontSize: 15, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  secLabelSub: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 1 },

  methodRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
  methodCard: { flex: 1, backgroundColor: "#fff", borderRadius: 18, padding: 16, alignItems: "center", borderWidth: 1.5, borderColor: "#eef0f3", gap: 6, position: "relative" },
  methodCardOn: { borderColor: "#02023E", backgroundColor: "#f0fafa" },
  methodIconBox: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center" },
  methodIconBoxOn: { backgroundColor: "#e8fffe" },
  methodTitle: { fontSize: 13, fontWeight: "700", color: "#101720", textAlign: "center" },
  methodTitleOn: { color: "#02023E" },
  methodSub: { fontSize: 11, color: "#8696a0", fontWeight: "500", textAlign: "center", lineHeight: 15 },
  methodCheck: { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: "#02023E", justifyContent: "center", alignItems: "center" },

  pickupCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "#f0fafa", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#d0f0ef", marginBottom: 8 },
  pickupTitle: { fontSize: 13, fontWeight: "700", color: "#101720", marginBottom: 2 },
  pickupAddr: { fontSize: 13, color: "#4b6585", fontWeight: "500" },
  pickupHours: { fontSize: 11, color: "#02023E", fontWeight: "600", marginTop: 4 },

  savedAddrCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: "#eef0f3" },
  savedAddrCardOn: { borderColor: "#02023E", backgroundColor: "#f0fafa" },
  savedAddrIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  savedAddrIconOn: { backgroundColor: "#e8fffe", borderColor: "#d0f0ef" },
  savedAddrLabel: { fontSize: 13, fontWeight: "700", color: "#101720", marginBottom: 2 },
  savedAddrLabelOn: { color: "#02023E" },
  savedAddrText: { fontSize: 12, color: "#8696a0", fontWeight: "500" },

  fieldWrap: { marginBottom: 10 },
  fieldLabel: { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.5, marginBottom: 6 },
  fieldBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: "#eef0f3", gap: 8 },
  fieldBoxDisabled: { backgroundColor: "#f9fafb" },
  fieldInput: { flex: 1, fontSize: 14, color: "#101720", fontWeight: "500" },
  fieldRow: { flexDirection: "row", gap: 10 },

  // User default card
  userDefaultCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#f0fafa", borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: "#d0f0ef", marginBottom: 10 },
  userDefaultAvatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: "#02023E", justifyContent: "center", alignItems: "center" },
  userDefaultInitial: { fontSize: 18, fontWeight: "800", color: "#fff" },
  userDefaultName: { fontSize: 14, fontWeight: "700", color: "#101720" },
  userDefaultPhone: { fontSize: 12, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  userDefaultBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: "#d0f0ef" },
  userDefaultBadgeText: { fontSize: 11, fontWeight: "700", color: "#02023E" },

  // Add contact button
  addContactBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: "#eef0f3", marginBottom: 10 },
  addContactBtnOn: { borderColor: "#fca5a5", backgroundColor: "#fff5f5" },
  addContactText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#02023E" },
  addContactTextOn: { color: "#f87171" },

  // Contact override card
  contactOverrideCard: { backgroundColor: "#fff", borderRadius: 18, padding: 14, borderWidth: 1, borderColor: "#eef0f3", marginBottom: 10 },
  contactOverrideHint: { fontSize: 12, color: "#8696a0", fontWeight: "500", marginBottom: 12 },

  noticeCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#f0fafa", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#d0f0ef", marginTop: 8 },
  noticeText: { flex: 1, fontSize: 12, color: "#4b6585", fontWeight: "500", lineHeight: 18 },

  infoCard: { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#eef0f3", overflow: "hidden" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 13 },
  infoIconBox: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#f0fafa", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#d0f0ef" },
  infoKey: { fontSize: 13, color: "#8696a0", fontWeight: "600", flex: 1 },
  infoVal: { fontSize: 13, fontWeight: "700", color: "#101720" },
  infoDivider: { height: 1, backgroundColor: "#f4f8ff", marginHorizontal: 14 },

  summaryCard: { borderRadius: 20, padding: 20, marginBottom: 4 },
  summaryCardTitle: { fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.6)", letterSpacing: 0.5, marginBottom: 14 },
  summaryCardDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 10 },
  summaryCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  summaryCardKey: { fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: "500" },
  summaryCardVal: { fontSize: 13, fontWeight: "700", color: "#fff" },

  razorpayBadge: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 12, marginBottom: 4, backgroundColor: "#f0fafa", borderRadius: 12, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: "#d0f0ef" },
  razorpayBadgeText: { fontSize: 12, color: "#02023E", fontWeight: "700" },

  bottomBar: { paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 24 : 14, paddingTop: 10, backgroundColor: "#f4f8ff", borderTopWidth: 1, borderTopColor: "#eef0f3" },
  nextBtn: { borderRadius: 18, overflow: "hidden" },
  nextBtnOff: { opacity: 0.6 },
  nextBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  nextBtnText: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  nextBtnTextOff: { color: "#8696a0" },
  nextBtnSub: { fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: "500", marginTop: 1 },
  nextArrow: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  nextArrowOff: { backgroundColor: "#f4f8ff" },
});