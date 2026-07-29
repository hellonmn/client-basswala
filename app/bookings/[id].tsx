/**
 * app/bookings/[id].tsx
 * User Booking Detail — New Flow:
 * Pending → Confirmed → Dispatched → Arrived (OTP) → Delivered (Pay) → Completed
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
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
import LottieView from "lottie-react-native";
import { bookingApi, paymentApi } from "../../services/userApi";
import { apiService } from "../../services/api";
import PaymentStep from "../paymentStep";
import SmartImage from "../../components/SmartImage";
import PressableScale from "../../components/PressableScale";
import { useAlert } from "../../components/AppAlert";
import { requestPlayStoreReview } from "../../services/appHealth";

// ─── Status Config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: string; label: string }> = {
  Pending:    { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "time-outline", label: "Pending" },
  Confirmed:  { color: "#02023E", bg: "#f0fffe", border: "#a5f3fc", icon: "checkmark-circle-outline", label: "Confirmed" },
  Dispatched: { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "car-outline", label: "Dispatched" },
  Arrived:    { color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", icon: "location-outline", label: "Arrived" },
  Delivered:  { color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", icon: "cube-outline", label: "Delivered" },
  Completed:  { color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", icon: "checkmark-done-outline", label: "Completed" },
  Cancelled:  { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", icon: "close-circle-outline", label: "Cancelled" },
};

// Timeline steps in order
const TIMELINE_STEPS = [
  { key: "Pending", label: "Booking Created", desc: "Request submitted" },
  { key: "Confirmed", label: "Confirmed", desc: "Captain accepted your booking" },
  { key: "Dispatched", label: "Dispatched", desc: "Equipment on the way" },
  { key: "Arrived", label: "Arrived", desc: "Captain arrived at your location" },
  { key: "Delivered", label: "Delivered", desc: "Equipment handed over" },
  { key: "Completed", label: "Completed", desc: "Booking completed" },
];

const STATUS_ORDER = ["Pending", "Confirmed", "Dispatched", "Arrived", "Delivered", "Completed"];

function safeParseArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string" && val.trim()) {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

// Payment methods removed — using Razorpay payment link

export default function UserBookingDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const bookingId = parseInt(id as string);
  const { alert: appAlert, confirm } = useAlert();

  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [payOrderId, setPayOrderId] = useState<string | null>(null);
  const [payKeyId, setPayKeyId] = useState<string | null>(null);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Review modal (auto-opens after Completed transition for un-reviewed bookings)
  const [showReview, setShowReview] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const lottieRef = useRef<LottieView>(null);

  const headerBg = scrollY.interpolate({ inputRange: [180, 240], outputRange: ["rgba(244,248,255,0)", "rgba(244,248,255,1)"], extrapolate: "clamp" });
  const headerTitleOpacity = scrollY.interpolate({ inputRange: [180, 240], outputRange: [0, 1], extrapolate: "clamp" });

  // ─── Fetch booking ──────────────────────────────────────────────────────
  const fetchBooking = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await bookingApi.getById(bookingId);
      if (res.success && res.data) {
        setBooking((prev: any) => {
          // First transition to Completed → success popup, and queue the
          // review modal to auto-open right after (if not already reviewed).
          if (prev && prev.status !== "Completed" && res.data.status === "Completed") {
            setShowSuccess(true);
            setTimeout(() => lottieRef.current?.play(), 400);
            // Auto-prompt for review ~3s after success animation, only
            // if the user hasn't rated this booking yet.
            if (!res.data.rating) {
              setTimeout(() => {
                setShowSuccess(false);
                setShowReview(true);
              }, 3200);
            }
          }
          return res.data;
        });
      } else if (!silent) {
        Alert.alert("Not Found", "This booking does not exist.");
        router.back();
      }
    } catch (err: any) {
      if (!silent) { Alert.alert("Error", err.message || "Failed to load booking"); router.back(); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!bookingId) return;
    fetchBooking();
    const interval = setInterval(() => fetchBooking(true), 4000);
    return () => clearInterval(interval);
  }, [bookingId]);

  // ─── Helpers ──────────────────────────────────────────────────────────
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };

  const openGoogleMaps = () => {
    if (!booking?.deliveryLatitude || !booking?.deliveryLongitude) return;
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${booking.deliveryLatitude},${booking.deliveryLongitude}&travelmode=driving`);
  };

  // Submit a star rating + optional text review for this booking. On a
  // strong rating (4+), opportunistically trigger Play Store's native
  // in-app review card too — the user just had a positive experience,
  // best moment to ask them to rate the app itself.
  const submitReview = async () => {
    if (!booking) return;
    if (reviewRating < 1) {
      await appAlert({ title: "Pick a rating", message: "Tap a star from 1 to 5.", tone: "warning" });
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await bookingApi.addReview(booking.id, {
        rating: reviewRating,
        review: reviewText.trim() || undefined,
      });
      if (res?.success) {
        setShowReview(false);
        setBooking((prev: any) => prev ? { ...prev, rating: reviewRating, review: reviewText } : prev);
        await appAlert({
          title: "Thanks for the feedback!",
          message: "Your review helps other customers and the captain.",
          tone: "success",
        });
        // High rating → ask the user to rate Basswala itself on the
        // Play Store. Best UX: do this AFTER our own success toast so
        // the OS prompt doesn't stack on top of our modal.
        if (reviewRating >= 4) {
          setTimeout(() => { requestPlayStoreReview().catch(() => {}); }, 800);
        }
      } else {
        await appAlert({
          title: "Couldn't submit review",
          message: res?.message || "Please try again in a moment.",
          tone: "error",
        });
      }
    } catch (err: any) {
      await appAlert({
        title: "Couldn't submit review",
        message: err?.response?.data?.message || err?.message || "Network error.",
        tone: "error",
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const callDJ = async () => {
    // Prefer the DJ's number, then fall back to the captain (service provider),
    // whose phone is always set — so equipment-only bookings and DJs without a
    // listed number can still reach someone.
    const phone =
      booking?.dj?.phone || booking?.captainDJ?.phone || booking?.captain?.phone;
    if (!phone) {
      await appAlert({ title: "No Contact", message: "Contact number is not available.", tone: "warning" });
      return;
    }
    Linking.openURL(`tel:${String(phone).replace(/[^0-9+]/g, "")}`);
  };

  const cancelBooking = async () => {
    const ok = await confirm({
      title: "Cancel Booking?",
      message: "Are you sure you want to cancel this booking? This cannot be undone.",
      confirmText: "Yes, cancel",
      cancelText: "Keep booking",
      destructive: true,
    });
    if (!ok) return;
    setCancelling(true);
    try {
      const res = await bookingApi.cancel(bookingId);
      if (res.success) {
        await appAlert({ title: "Cancelled", message: "Booking has been cancelled.", tone: "success" });
        fetchBooking();
      } else {
        await appAlert({ title: "Error", message: res.message || "Cannot cancel", tone: "error" });
      }
    } catch (err: any) {
      await appAlert({ title: "Error", message: err.response?.data?.message || "Failed to cancel", tone: "error" });
    } finally {
      setCancelling(false);
    }
  };

  // Create Razorpay order and show in-app payment UI
  const startPayment = async () => {
    setCreatingOrder(true);
    try {
      const amountToPay = typeof booking.remainingAmount !== "undefined"
        ? Number(booking.remainingAmount || 0)
        : Number(booking.totalAmount || 0);
      const res = await apiService.createPaymentOrder(amountToPay);
      if (res.success && res.orderId) {
        setPayOrderId(res.orderId);
        setPayKeyId(res.keyId || null);
        setShowPaymentStep(true);
      } else {
        Alert.alert("Error", "Could not create payment order");
      }
    } catch (err: any) {
      Alert.alert("Error", err.response?.data?.message || err.message || "Failed to start payment");
    } finally {
      setCreatingOrder(false);
    }
  };

  // Called when PaymentStep returns a result
  const handlePaymentResult = async (result: any) => {
    setShowPaymentStep(false);
    setPayOrderId(null);
    setPayKeyId(null);

    if (result.success && result.paymentId) {
      // Confirm with backend
      try {
        await bookingApi.confirmDeliveryPayment(bookingId, {
          razorpay_payment_id: result.paymentId,
          razorpay_order_id: result.orderId,
          razorpay_signature: result.signature || "",
          paymentMethod: result.method || "online",
        });
      } catch (_) {}

      setShowSuccess(true);
      setTimeout(() => lottieRef.current?.play(), 400);
      await fetchBooking(true);
    }
    // If dismissed/failed, do nothing — user can retry
  };

  // ─── Rental window ──────────────────────────────────────────────────────
  const getRentalWindow = () => {
    if (!booking) return null;
    const eqItems = safeParseArray(booking.equipmentItems);
    const maxDays = eqItems.reduce((max: number, item: any) => Math.max(max, parseInt(item.days) || 1), 1);
    const eventDate = new Date(booking.eventDate);
    const returnDate = new Date(eventDate);
    returnDate.setDate(returnDate.getDate() + maxDays);
    const now = new Date();
    const daysLeft = Math.ceil((returnDate.getTime() - now.getTime()) / 86400000);
    return { maxDays, returnDate, daysLeft };
  };

  // ─── Loading / Not found ──────────────────────────────────────────────
  if (loading && !booking) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#02023E" />
        <Text style={styles.loadingText}>Loading booking details...</Text>
      </SafeAreaView>
    );
  }

  if (!booking) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={{ fontSize: 18, color: "#ef4444" }}>Booking not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: "#02023E", fontWeight: "700" }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const cfg = STATUS_CONFIG[booking.status] || STATUS_CONFIG.Pending;
  const djName = booking.dj?.name || booking.captainDJ?.name || "DJ Booking";
  const hourlyRate = booking.dj?.hourlyRate || booking.captainDJ?.hourlyRate || 0;
  const canCancel = ["Pending", "Confirmed"].includes(booking.status);
  const currentIdx = STATUS_ORDER.indexOf(booking.status);
  const rw = getRentalWindow();

  // DJ meta for the hero overlay + progress for the status hero
  const djObj: any = booking.dj || booking.captainDJ || {};
  const djRating = parseFloat(djObj.ratingAverage) || 0;
  const djGenres = safeParseArray(djObj.genres).slice(0, 3);
  const isCancelled = booking.status === "Cancelled";
  const progressPct = isCancelled ? 0 : Math.round((Math.max(0, currentIdx) / (STATUS_ORDER.length - 1)) * 100);
  const djPhone = booking.dj?.phone || booking.captainDJ?.phone || booking.captain?.phone;

  // ── Blinkit-style live status message ──
  // Each status maps to a friendly headline + subline that mirrors what
  // Blinkit / Zepto / Swiggy show on the order tracking screen.
  // When status === Dispatched and we have a delivery person on the booking,
  // the subline personalises it: "Ramesh is on the way for your order".
  const getStatusMessage = (): { headline: string; sub: string; emoji: string } => {
    const dp = booking.deliveryPersonName;
    switch (booking.status) {
      case "Pending":
        return {
          emoji: "⏳",
          headline: "Waiting for captain to confirm",
          sub: "We've sent your booking to the captain. They'll confirm within a few minutes.",
        };
      case "Confirmed":
        return {
          emoji: "🎶",
          headline: "Your order is getting packed",
          sub: "The captain is preparing your gear / DJ setup. You'll be notified once it's on the way.",
        };
      case "Dispatched":
        return {
          emoji: "🚚",
          headline: dp ? `${dp} is on the way` : "Your order is on the way",
          sub: dp
            ? `${dp} has picked up your order and is heading to your location. You can call them anytime.`
            : "The captain has dispatched your gear and is on the way to your venue.",
        };
      case "Arrived":
        return {
          emoji: "📍",
          headline: dp ? `${dp} has arrived` : "Captain has arrived",
          sub: `Share the OTP (${booking.otp || "******"}) with the captain to confirm delivery.`,
        };
      case "Delivered":
        return {
          emoji: "✅",
          headline: "Setup delivered",
          sub: "Your equipment is in. Enjoy the event — the captain will return at the end to pick everything up.",
        };
      case "Completed":
        return {
          emoji: "🎉",
          headline: "Booking completed",
          sub: "Hope your event went great. Tap below to leave a review for the captain.",
        };
      case "Cancelled":
        return {
          emoji: "❌",
          headline: "Booking cancelled",
          sub: booking.cancellationReason
            ? `Reason: ${booking.cancellationReason}`
            : "This booking has been cancelled. Any refund will be processed within 5–7 business days.",
        };
      default:
        return { emoji: "📦", headline: booking.status, sub: "" };
    }
  };
  const statusMsg = getStatusMessage();

  // Show the delivery person card from Dispatched onward (until Completed),
  // since the captain has assigned someone and the customer should know
  // who their point of contact is even after delivery, in case of issues.
  const showDeliveryPersonCard =
    !!booking.deliveryPersonName &&
    ["Dispatched", "Arrived", "Delivered"].includes(booking.status);

  const callDeliveryPerson = () => {
    if (!booking.deliveryPersonPhone) return;
    Linking.openURL(`tel:${booking.deliveryPersonPhone}`).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        <View style={styles.statusBarSpacer} />

        {/* Hero Image + overlay (rating · genres) */}
        <View style={styles.heroContainer}>
          <SmartImage
            uri={booking.dj?.profilePicture || booking.captainDJ?.profilePicture || ""}
            style={styles.heroImg}
            kind="dj"
            label={djName}
            iconSize={56}
          />
          {djRating > 0 && (
            <View style={styles.heroRatingPill}>
              <Ionicons name="star" size={12} color="#fff" />
              <Text style={styles.heroRatingText}>{djRating.toFixed(1)}</Text>
            </View>
          )}
          <LinearGradient
            colors={["transparent", "rgba(16,23,32,0.85)"]}
            style={styles.heroScrim}
            pointerEvents="none"
          />
          <View style={styles.heroOverlay}>
            <Text style={styles.heroName} numberOfLines={1}>{djName}</Text>
            {djGenres.length > 0 ? (
              <View style={styles.heroGenreRow}>
                {djGenres.map((g: string) => (
                  <View key={g} style={styles.heroGenreChip}>
                    <Text style={styles.heroGenreText}>{g}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.heroSubText}>{booking.eventType || "DJ Service"}</Text>
            )}
          </View>
        </View>

        <View style={styles.content}>
          {/* Status hero (active bookings) OR a single consolidated
              cancellation card (cancelled bookings) — never both, so the
              user doesn't see two stacked "cancelled" banners. */}
          {!isCancelled ? (
            <View style={[bs.statusHero, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
              <View style={bs.statusHeroRow}>
                <View style={[bs.statusEmojiWrap, { backgroundColor: "#fff" }]}>
                  <Ionicons name={cfg.icon as any} size={26} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[bs.statusHeadline, { color: cfg.color }]} numberOfLines={2}>
                    {statusMsg.headline}
                  </Text>
                  <Text style={bs.statusSub} numberOfLines={3}>{statusMsg.sub}</Text>
                </View>
                <Text style={[bs.statusPct, { color: cfg.color }]}>{progressPct}%</Text>
              </View>
              <View style={bs.progressTrack}>
                <View style={[bs.progressFill, { width: `${Math.max(6, progressPct)}%`, backgroundColor: cfg.color }]} />
              </View>
            </View>
          ) : (
            <View style={bs.cancelCard}>
              <View style={bs.statusHeroRow}>
                <View style={[bs.statusEmojiWrap, { backgroundColor: "#fff" }]}>
                  <Ionicons name="close-circle" size={26} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={bs.cancelTitle}>
                    Booking cancelled{booking.cancelledBy ? ` by ${booking.cancelledBy === "user" ? "you" : String(booking.cancelledBy)}` : ""}
                  </Text>
                  {booking.cancelledAt ? (
                    <Text style={bs.cancelMeta}>
                      {new Date(booking.cancelledAt).toLocaleString("en-IN", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={bs.cancelBody}>
                {booking.cancellationReason
                  ? `Reason: ${booking.cancellationReason}`
                  : "Any refund will be processed within 5–7 business days."}
              </Text>
            </View>
          )}

          {/* ── Delivery person card — only shows from Dispatched onward,
              once the captain has named someone. Big call-to-action button
              so the customer can reach them instantly. ── */}
          {showDeliveryPersonCard && (
            <View style={bs.deliveryCard}>
              <View style={bs.deliveryRow}>
                <View style={bs.deliveryAvatar}>
                  <Text style={bs.deliveryAvatarText}>
                    {(booking.deliveryPersonName || "?")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={bs.deliveryLabel}>YOUR DELIVERY PARTNER</Text>
                  <Text style={bs.deliveryName} numberOfLines={1}>
                    {booking.deliveryPersonName}
                  </Text>
                  {booking.deliveryPersonPhone ? (
                    <Text style={bs.deliveryPhone}>
                      +91 {booking.deliveryPersonPhone}
                    </Text>
                  ) : null}
                </View>
                {booking.deliveryPersonPhone ? (
                  <TouchableOpacity
                    style={bs.deliveryCallBtn}
                    onPress={callDeliveryPerson}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="call" size={18} color="#fff" />
                    <Text style={bs.deliveryCallText}>Call</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          )}

          {/* Title */}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{booking.eventType || "DJ Booking"}</Text>
            {hourlyRate ? <Text style={styles.category}>₹{Number(hourlyRate).toLocaleString()}/hr · {djName}</Text> : null}
          </View>

          {/* ── OTP Section: Show when status is Arrived ── */}
          {booking.status === "Arrived" && booking.otp && (
            <View style={[styles.section, { borderWidth: 2, borderColor: "#8b5cf6" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: "#f5f3ff", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="key" size={20} color="#8b5cf6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "800", color: "#101720" }}>Delivery OTP</Text>
                  <Text style={{ fontSize: 12, color: "#8696a0" }}>Share this code with the captain</Text>
                </View>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: "#8b5cf6", borderRadius: 16, paddingVertical: 16, alignItems: "center" }}
                onPress={() => setShowOtpModal(true)}
                activeOpacity={0.85}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18, letterSpacing: 2 }}>Show OTP</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Pay Now: Show when status is Delivered & not paid ── */}
          {booking.status === "Delivered" && booking.paymentStatus !== "Paid" && (
            <View style={[styles.section, { borderWidth: 2, borderColor: "#22c55e", alignItems: "center" }]}>
              <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Ionicons name="wallet" size={28} color="#22c55e" />
              </View>
              <Text style={{ fontSize: 13, color: "#8696a0", marginBottom: 4 }}>Amount Due</Text>
              <Text style={{ fontSize: 32, fontWeight: "800", color: "#101720", marginBottom: 4 }}>
                ₹{Number(typeof booking.remainingAmount !== "undefined" ? booking.remainingAmount : (booking.totalAmount || 0)).toLocaleString()}
              </Text>
              <Text style={{ fontSize: 12, color: "#8696a0", marginBottom: 20, textAlign: "center" }}>
                Pay via UPI, Card, or scan captain's QR
              </Text>
              <TouchableOpacity
                style={[{ width: "100%", borderRadius: 16, overflow: "hidden" }, creatingOrder && { opacity: 0.6 }]}
                onPress={startPayment}
                disabled={creatingOrder}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#22c55e", "#16a34a"]} style={{ paddingVertical: 16, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                  {creatingOrder ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="card-outline" size={20} color="#fff" />
                      <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>
                        Pay ₹{Number(typeof booking.remainingAmount !== "undefined" ? booking.remainingAmount : (booking.totalAmount || 0)).toLocaleString()}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              <Text style={{ fontSize: 11, color: "#8696a0", marginTop: 10, textAlign: "center" }}>
                Or scan QR from captain's device
              </Text>
            </View>
          )}

          {/* ── Payment Done Badge ── */}
          {booking.paymentStatus === "Paid" && (
            <View style={[styles.section, { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                <Text style={{ fontSize: 16, fontWeight: "800", color: "#22c55e", flex: 1 }}>Payment Received</Text>
                {booking.paymentMethod && (
                  <Text style={{ fontSize: 13, color: "#8696a0" }}>via {booking.paymentMethod}</Text>
                )}
              </View>
            </View>
          )}

          {/* ── Rental Window: Show when Delivered ── */}
          {(booking.status === "Delivered" || booking.status === "Completed") && rw && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>EQUIPMENT RENTAL</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: rw.daysLeft > 0 ? "#f0fdf4" : "#fef2f2", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="timer-outline" size={24} color={rw.daysLeft > 0 ? "#22c55e" : "#ef4444"} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 20, fontWeight: "800", color: rw.daysLeft > 0 ? "#22c55e" : "#ef4444" }}>
                    {booking.status === "Completed" ? "Completed" : rw.daysLeft > 0 ? `${rw.daysLeft} day${rw.daysLeft === 1 ? "" : "s"} left` : "Overdue"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#8696a0", marginTop: 2 }}>
                    {rw.maxDays} day rental • Return by: {formatDate(rw.returnDate.toISOString())}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Event Details ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>EVENT DETAILS</Text>
            <View style={styles.infoRow}>
              <Ionicons name="calendar-outline" size={20} color="#02023E" />
              <Text style={styles.infoLabel}>Date</Text>
              <Text style={styles.infoValue}>{formatDate(booking.eventDate)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="time-outline" size={20} color="#02023E" />
              <Text style={styles.infoLabel}>Time</Text>
              <Text style={styles.infoValue}>{booking.startTime} – {booking.endTime}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="hourglass-outline" size={20} color="#02023E" />
              <Text style={styles.infoLabel}>Duration</Text>
              <Text style={styles.infoValue}>{booking.durationHours} hours</Text>
            </View>
          </View>

          {/* ── Delivery Address ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DELIVERY ADDRESS</Text>
            <View style={styles.addressCard}>
              <Ionicons name="location-outline" size={22} color="#02023E" />
              <Text style={styles.addressText}>
                {booking.deliveryStreet ? booking.deliveryStreet + ", " : ""}
                {booking.deliveryCity}, {booking.deliveryState}
              </Text>
            </View>
          </View>

          {/* ── DJ / Vendor ── */}
          {(booking.dj || booking.captainDJ) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>DJ / VENDOR</Text>
              <View style={styles.vendorCard}>
                <Text style={styles.vendorName}>{booking.dj?.name || booking.captainDJ?.name}</Text>
                <PressableScale style={styles.callButton} scaleTo={0.94} onPress={callDJ}>
                  <Ionicons name="call" size={18} color="#fff" />
                  <Text style={styles.callButtonText}>Call</Text>
                </PressableScale>
              </View>
            </View>
          )}

          {/* ── Horizontal stepper ── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BOOKING PROGRESS</Text>
            {isCancelled ? (
              <View style={styles.stepCancelled}>
                <Ionicons name="close-circle" size={18} color="#ef4444" />
                <Text style={styles.stepCancelledText}>This booking was cancelled</Text>
              </View>
            ) : (
              <>
                <View style={styles.stepperRow}>
                  {TIMELINE_STEPS.map((step, idx) => {
                    const stepIdx = STATUS_ORDER.indexOf(step.key);
                    const isReached = stepIdx <= currentIdx;
                    const isCurrent = step.key === booking.status;
                    const last = TIMELINE_STEPS.length - 1;
                    const shortLabels = ["Created", "Confirmed", "Dispatched", "Arrived", "Delivered", "Done"];
                    return (
                      <View key={step.key} style={styles.stepCol}>
                        {idx > 0 && (
                          <View style={[styles.stepLineLeft, { backgroundColor: currentIdx >= idx ? "#02023E" : "#e5e7eb" }]} />
                        )}
                        {idx < last && (
                          <View style={[styles.stepLineRight, { backgroundColor: currentIdx >= idx + 1 ? "#02023E" : "#e5e7eb" }]} />
                        )}
                        <View style={[
                          styles.stepDot,
                          isReached ? styles.stepDotReached : styles.stepDotIdle,
                          isCurrent && styles.stepDotCurrent,
                        ]}>
                          {isReached
                            ? <Ionicons name="checkmark" size={12} color="#fff" />
                            : <View style={styles.stepDotInner} />}
                        </View>
                        <Text style={[styles.stepLabel, isReached && styles.stepLabelReached]} numberOfLines={2}>
                          {shortLabels[idx]}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Current step detail */}
                <View style={styles.stepCurrentCard}>
                  <View style={styles.stepCurrentDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepCurrentLabel}>
                      {TIMELINE_STEPS[Math.max(0, currentIdx)]?.label || "Booking Created"}
                    </Text>
                    <Text style={styles.stepCurrentDesc}>
                      {TIMELINE_STEPS[Math.max(0, currentIdx)]?.desc || "Request submitted"}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          {canCancel && (
            <PressableScale
              style={styles.cancelBookingBtn}
              onPress={cancelBooking}
              disabled={cancelling}
              scaleTo={0.97}
            >
              <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
              <Text style={styles.cancelBookingText}>{cancelling ? "Cancelling..." : "Cancel Booking"}</Text>
            </PressableScale>
          )}

          <View style={{ height: 130 }} />
        </View>
      </Animated.ScrollView>

      {/* ── Floating Header ── */}
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <Animated.View style={[styles.headerInner, { backgroundColor: headerBg }]}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#101720" />
          </TouchableOpacity>
          <Animated.Text style={[styles.headerTitleText, { opacity: headerTitleOpacity }]} numberOfLines={1}>
            {djName}
          </Animated.Text>
        </Animated.View>
      </SafeAreaView>

      {/* ── OTP Modal ── */}
      <Modal visible={showOtpModal} transparent animationType="fade">
        <View style={styles.otpModalOverlay}>
          <View style={styles.otpModal}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#f5f3ff", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 }}>
              <Ionicons name="key" size={28} color="#8b5cf6" />
            </View>
            <Text style={styles.otpModalTitle}>Your Delivery OTP</Text>
            <Text style={styles.otpModalSubtitle}>Share this code with the captain to confirm delivery</Text>
            <Text style={styles.otpDisplay}>{booking?.otp || "—— ——"}</Text>
            <TouchableOpacity style={styles.closeOtpBtn} onPress={() => setShowOtpModal(false)}>
              <Text style={styles.closeOtpText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── In-App Payment Modal ── */}
      <Modal visible={showPaymentStep && !!payOrderId} animationType="slide" onRequestClose={() => { setShowPaymentStep(false); setPayOrderId(null); }}>
        <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f8ff" }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eef0f3" }}>
            <TouchableOpacity onPress={() => { setShowPaymentStep(false); setPayOrderId(null); }} style={{ padding: 8 }}>
              <Ionicons name="close" size={22} color="#101720" />
            </TouchableOpacity>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: "800", color: "#101720", marginLeft: 8 }}>
              Pay ₹{Number(typeof booking?.remainingAmount !== "undefined" ? booking.remainingAmount : (booking?.totalAmount || 0)).toLocaleString()}
            </Text>
          </View>
          <PaymentStep
            orderId={payOrderId!}
            amount={Number(typeof booking?.remainingAmount !== "undefined" ? booking.remainingAmount : (booking?.totalAmount || 0))}
            contact={booking?.user?.phone || ""}
            email={booking?.user?.email || ""}
            keyId={payKeyId || undefined}
            onResult={handlePaymentResult}
          />
        </SafeAreaView>
      </Modal>

      {/* ── Success Animation Modal ── */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <View style={styles.successOverlay}>
          <View style={styles.successContent}>
            <TouchableOpacity style={styles.successCloseBtn} onPress={() => setShowSuccess(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color="#8696a0" />
            </TouchableOpacity>
            <LottieView
              ref={lottieRef}
              source={require("../../assets/animations/success.json")}
              autoPlay
              loop={false}
              style={styles.successLottie}
            />
            <Text style={styles.successTitle}>
              {booking?.paymentStatus === "Paid" ? "Payment Received!" : "Booking Completed!"}
            </Text>
            <Text style={styles.successSubtitle}>
              {booking?.paymentStatus === "Paid" ? "Your payment has been confirmed" : "Thank you for choosing Basswala"}
            </Text>
            <TouchableOpacity
              style={styles.viewBookingsBtn}
              onPress={() => { setShowSuccess(false); router.push("/(tabs)/bookings"); }}
            >
              <Text style={styles.viewBookingsText}>View My Bookings</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Review Modal — auto-opens after Completed transition ── */}
      <Modal
        visible={showReview}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReview(false)}
      >
        <View style={rv.overlay}>
          <View style={rv.card}>
            <TouchableOpacity
              style={rv.closeBtn}
              onPress={() => setShowReview(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color="#8696a0" />
            </TouchableOpacity>

            <View style={rv.iconWrap}>
              <Ionicons name="star" size={28} color="#f59e0b" />
            </View>
            <Text style={rv.title}>How was your booking?</Text>
            <Text style={rv.body}>
              {booking?.dj?.name || booking?.captainDJ?.name
                ? `Rate your experience with ${booking.dj?.name || booking.captainDJ?.name}.`
                : "Your feedback helps other customers."}
            </Text>

            <View style={rv.starsRow}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setReviewRating(n)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name={n <= reviewRating ? "star" : "star-outline"}
                    size={36}
                    color={n <= reviewRating ? "#f59e0b" : "#cfd8dc"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={rv.input}
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Tell other customers about your experience (optional)…"
              placeholderTextColor="#8696a0"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              maxLength={500}
            />

            <View style={rv.actionsRow}>
              <TouchableOpacity
                style={rv.skipBtn}
                onPress={() => setShowReview(false)}
                disabled={submittingReview}
                activeOpacity={0.85}
              >
                <Text style={rv.skipText}>Maybe later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[rv.submitBtn, submittingReview && { opacity: 0.6 }]}
                onPress={submitReview}
                disabled={submittingReview}
                activeOpacity={0.88}
              >
                {submittingReview ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={16} color="#fff" />
                    <Text style={rv.submitText}>Submit review</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Bottom Bar — contextual ── */}
      <SafeAreaView edges={["bottom"]} style={styles.bottomWrap}>
        <View style={styles.bottomBar}>
          {isCancelled ? (
            <PressableScale style={styles.bookBtn} scaleTo={0.97} onPress={() => router.push("/(tabs)/explore" as any)}>
              <Ionicons name="search" size={19} color="#fff" />
              <Text style={styles.bookBtnLabel}>Book another DJ</Text>
            </PressableScale>
          ) : (
            <>
              <PressableScale style={styles.bookBtn} scaleTo={0.96} onPress={openGoogleMaps}>
                <Ionicons name="map" size={20} color="#fff" />
                <Text style={styles.bookBtnLabel}>Navigate</Text>
              </PressableScale>
              <PressableScale style={styles.bookBtn} scaleTo={0.96} onPress={callDJ}>
                <Ionicons name="call" size={20} color="#fff" />
                <Text style={styles.bookBtnLabel}>Call DJ</Text>
              </PressableScale>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  statusBarSpacer: { height: 30 },

  heroContainer: { margin: 2, height: 260, borderRadius: 28, overflow: "hidden", backgroundColor: "#e5e7eb", position: "relative" },
  heroImg: { width: "100%", height: "100%" },
  heroRatingPill: {
    position: "absolute", top: 14, right: 14,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#1ba672", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
  },
  heroRatingText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  heroScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 130 },
  heroOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 18 },
  heroName: { fontSize: 24, fontWeight: "800", color: "#fff", letterSpacing: -0.5 },
  heroSubText: { fontSize: 13, color: "rgba(255,255,255,0.85)", fontWeight: "600", marginTop: 4 },
  heroGenreRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  heroGenreChip: { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  heroGenreText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  content: { paddingTop: 8, paddingHorizontal: 16 },

  statusRow: { flexDirection: "row", justifyContent: "center", marginTop: 20, marginBottom: 12 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 30, borderWidth: 1 },
  statusText: { fontSize: 15, fontWeight: "700" },

  titleBlock: { paddingHorizontal: 4, paddingTop: 12 },
  title: { fontSize: 24, fontWeight: "800", color: "#101720", letterSpacing: -0.6 },
  category: { fontSize: 15, color: "#8696a0", marginTop: 4 },

  section: { marginTop: 12, backgroundColor: "#fff", padding: 20, borderRadius: 18, borderWidth: 1, borderColor: "#e4e9f1" },
  sectionTitle: { fontSize: 13, fontWeight: "800", color: "#8696a0", letterSpacing: 0.6, marginBottom: 12 },

  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f3f8" },
  infoLabel: { flex: 1, fontSize: 15, color: "#5a6169" },
  infoValue: { fontSize: 15, fontWeight: "600", color: "#101720" },

  addressCard: { flexDirection: "row", gap: 12, backgroundColor: "#f8fafc", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#eef2f7" },
  addressText: { flex: 1, fontSize: 15, lineHeight: 22, color: "#374151" },

  vendorCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8fafc", padding: 16, borderRadius: 16, borderWidth: 1, borderColor: "#eef2f7" },
  vendorName: { fontSize: 17, fontWeight: "700", color: "#101720" },
  callButton: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#02023E", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  callButtonText: { color: "#fff", fontWeight: "700" },

  // Horizontal stepper
  stepperRow: { flexDirection: "row", marginBottom: 4 },
  stepCol: { flex: 1, alignItems: "center", position: "relative" },
  stepLineLeft: { position: "absolute", top: 11, left: 0, right: "50%", height: 2.5 },
  stepLineRight: { position: "absolute", top: 11, left: "50%", right: 0, height: 2.5 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", zIndex: 1 },
  stepDotIdle: { backgroundColor: "#e5e7eb" },
  stepDotReached: { backgroundColor: "#02023E" },
  stepDotCurrent: { borderWidth: 3, borderColor: "#a5f3fc" },
  stepDotInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" },
  stepLabel: { fontSize: 9.5, fontWeight: "700", color: "#a8b0bd", marginTop: 7, textAlign: "center", lineHeight: 12 },
  stepLabelReached: { color: "#101720" },
  stepCurrentCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#f0fffe", borderRadius: 14, padding: 12, marginTop: 14,
    borderWidth: 1, borderColor: "#cdeeee",
  },
  stepCurrentDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#04c9ce" },
  stepCurrentLabel: { fontSize: 14, fontWeight: "800", color: "#02023E" },
  stepCurrentDesc: { fontSize: 12, color: "#5a6b7b", fontWeight: "500", marginTop: 1 },
  stepCancelled: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fef2f2", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#fecaca" },
  stepCancelledText: { fontSize: 13, fontWeight: "700", color: "#dc2626" },

  // Inline cancel
  cancelBookingBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5, borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  cancelBookingText: { fontSize: 15, fontWeight: "700", color: "#ef4444" },

  // Header
  headerWrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 100 },
  headerInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  headerBtn: { width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.88)", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "rgba(238,240,243,0.7)" },
  headerTitleText: { flex: 1, fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },

  // Bottom
  bottomWrap: { backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eef0f3" },
  bottomBar: { flexDirection: "row", padding: 16, gap: 12 },
  bookBtn: { flex: 1, height: 52, borderRadius: 16, backgroundColor: "#101720", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  bookBtnLabel: { fontSize: 16, fontWeight: "800", color: "#fff" },

  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, color: "#8696a0" },

  // OTP Modal
  otpModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center" },
  otpModal: { backgroundColor: "#fff", borderRadius: 24, padding: 30, width: "85%", alignItems: "center" },
  otpModalTitle: { fontSize: 20, fontWeight: "800", color: "#101720", marginBottom: 8 },
  otpModalSubtitle: { fontSize: 14, color: "#8696a0", marginBottom: 24, textAlign: "center" },
  otpDisplay: { fontSize: 42, fontWeight: "800", letterSpacing: 12, color: "#8b5cf6", marginBottom: 30 },
  closeOtpBtn: { backgroundColor: "#f4f8ff", paddingVertical: 14, paddingHorizontal: 40, borderRadius: 16 },
  closeOtpText: { color: "#02023E", fontWeight: "700" },

  // Payment Modal
  payOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  paySheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === "ios" ? 40 : 24 },
  payGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  payOption: { width: "48%" as any, alignItems: "center", paddingVertical: 18, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1.5, borderColor: "#eef0f3", backgroundColor: "#fafbfc" },
  payIconWrap: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  payOptionText: { fontSize: 13, fontWeight: "600", color: "#546e7a" },
  payConfirmBtn: { borderRadius: 14, overflow: "hidden", marginBottom: 4 },
  payConfirmGradient: { paddingVertical: 17, alignItems: "center", justifyContent: "center" },

  // Success Modal
  successOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  successContent: { backgroundColor: "#fff", borderRadius: 28, padding: 40, alignItems: "center", width: "88%" },
  successLottie: { width: 180, height: 180 },
  successTitle: { fontSize: 24, fontWeight: "800", color: "#101720", marginTop: 20 },
  successSubtitle: { fontSize: 15, color: "#8696a0", marginTop: 8, marginBottom: 40 },
  viewBookingsBtn: { backgroundColor: "#02023E", paddingVertical: 16, paddingHorizontal: 50, borderRadius: 18 },
  viewBookingsText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  successCloseBtn: { position: "absolute", top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center" },
});

// ─── Blinkit-style status hero + delivery card ────────────────────────────
// Kept in its own StyleSheet so the changes don't churn the (already very
// large) styles block above. Easy to delete this block + the corresponding
// JSX if we ever want to go back to the plain status badge.
const bs = StyleSheet.create({
  statusHero: {
    padding: 16, marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  statusHeroRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  cancelCard: {
    backgroundColor: "#fef2f2", borderRadius: 18, borderWidth: 1, borderColor: "#fecaca",
    padding: 16, marginBottom: 14,
  },
  cancelTitle: { fontSize: 16, fontWeight: "800", color: "#dc2626", letterSpacing: -0.2 },
  cancelMeta: { fontSize: 12, color: "#b91c1c", fontWeight: "600", marginTop: 2 },
  cancelBody: { fontSize: 13, color: "#7f1d1d", lineHeight: 19, marginTop: 12, fontWeight: "500" },
  statusPct: { fontSize: 20, fontWeight: "800", letterSpacing: -0.5 },
  progressTrack: {
    height: 6, borderRadius: 3, backgroundColor: "rgba(16,23,32,0.08)",
    marginTop: 14, overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 3 },
  statusEmojiWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  statusEmoji: { fontSize: 26 },
  statusHeadline: {
    fontSize: 16, fontWeight: "800",
    letterSpacing: -0.3, marginBottom: 3,
  },
  statusSub: {
    fontSize: 12.5, color: "#5b6877",
    lineHeight: 18, fontWeight: "500",
  },

  // Delivery partner card — separate visual layer below the status hero.
  // Tap "Call" → opens the phone dialer with the courier's number.
  deliveryCard: {
    backgroundColor: "#fff",
    borderRadius: 18, marginBottom: 14,
    padding: 14,
    borderWidth: 1, borderColor: "#eef0f3",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  deliveryRow: { flexDirection: "row", alignItems: "center" },
  deliveryAvatar: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: "#02023E",
    alignItems: "center", justifyContent: "center",
  },
  deliveryAvatarText: {
    color: "#fff", fontSize: 19, fontWeight: "800", letterSpacing: -0.5,
  },
  deliveryLabel: {
    fontSize: 10, fontWeight: "800", color: "#8696a0",
    letterSpacing: 0.7, marginBottom: 2,
  },
  deliveryName: {
    fontSize: 16, fontWeight: "800", color: "#101720",
    letterSpacing: -0.2,
  },
  deliveryPhone: {
    fontSize: 12, color: "#5b6877", fontWeight: "600", marginTop: 2,
  },
  deliveryCallBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#22c55e",
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 14,
    shadowColor: "#22c55e", shadowOpacity: 0.3, shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  deliveryCallText: { color: "#fff", fontWeight: "800", fontSize: 13 },
});

// ─── Review modal styles ────────────────────────────────────────────────
const rv = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(2,2,30,0.55)",
    alignItems: "center", justifyContent: "center", padding: 22,
  },
  card: {
    width: "100%", maxWidth: 420,
    backgroundColor: "#fff", borderRadius: 24,
    padding: 22, alignItems: "center",
  },
  closeBtn: {
    position: "absolute", top: 14, right: 14,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
    zIndex: 1,
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: "#fef3c7",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 19, fontWeight: "800", color: "#0F1626",
    textAlign: "center", letterSpacing: -0.2,
  },
  body: {
    fontSize: 13.5, color: "#5b6877",
    textAlign: "center", lineHeight: 20,
    marginTop: 8, marginBottom: 16,
    paddingHorizontal: 8,
  },
  starsRow: {
    flexDirection: "row", gap: 12,
    marginBottom: 16,
  },
  input: {
    width: "100%",
    minHeight: 80,
    borderRadius: 14,
    borderWidth: 1, borderColor: "#e6eaf0",
    backgroundColor: "#fafbfc",
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: "#101720",
  },
  actionsRow: {
    flexDirection: "row", gap: 10,
    marginTop: 16, width: "100%",
  },
  skipBtn: {
    flex: 1, height: 50, borderRadius: 14,
    backgroundColor: "#f1f3f7",
    alignItems: "center", justifyContent: "center",
  },
  skipText: { color: "#0F1626", fontSize: 14, fontWeight: "700" },
  submitBtn: {
    flex: 2, height: 50, borderRadius: 14,
    backgroundColor: "#02023E",
    flexDirection: "row", gap: 8,
    alignItems: "center", justifyContent: "center",
  },
  submitText: { color: "#fff", fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
});
