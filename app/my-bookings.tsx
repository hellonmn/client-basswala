import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { bookingApi } from "../services/userApi";
import { useAuth } from "../context/AuthContext";
import { useAlert } from "../components/AppAlert";

const { width } = Dimensions.get("window");

interface Booking {
  id: number;
  status: string;
  paymentStatus: string;
  eventType: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  guestCount?: number;
  specialRequests?: string;
  deliveryCity?: string;
  deliveryStreet?: string;
  djFee: number;
  equipmentFee: number;
  deliveryFee: number;
  totalAmount: number;
  rating?: number;
  review?: string;
  createdAt: string;
  cancellationReason?: string;
  // Captain-supplied delivery person (populated on Dispatch)
  deliveryPersonName?: string;
  deliveryPersonPhone?: string;
  otp?: string;
  captain?: { id: number; businessName?: string; phone?: string; locationCity?: string };
  dj?: { id: number; name: string };
  equipmentItems?: any[];
}

/**
 * Friendly Blinkit-style status copy for a booking. Same logic as the
 * detail screen — kept here too so the bookings list cards can show the
 * personalised headline (e.g. "Ramesh is on the way") without the user
 * having to tap into a card.
 */
function getStatusMessage(booking: Pick<Booking, "status" | "deliveryPersonName" | "cancellationReason" | "otp">): {
  emoji: string; headline: string; sub: string;
} {
  const dp = booking.deliveryPersonName;
  switch (booking.status) {
    case "Pending":
      return { emoji: "⏳", headline: "Waiting for captain to confirm", sub: "We've sent your booking to the captain." };
    case "Confirmed":
      return { emoji: "🎶", headline: "Your order is getting packed", sub: "The captain is preparing your gear." };
    case "Dispatched":
    case "Equipment Dispatched":
      return {
        emoji: "🚚",
        headline: dp ? `${dp} is on the way` : "Your order is on the way",
        sub: dp ? "Tap to call them anytime." : "Captain is heading to your venue.",
      };
    case "Arrived":
      return {
        emoji: "📍",
        headline: dp ? `${dp} has arrived` : "Captain has arrived",
        sub: `Share OTP ${booking.otp || "******"} to confirm delivery.`,
      };
    case "Delivered":
      return { emoji: "✅", headline: "Setup delivered", sub: "Enjoy your event." };
    case "In Progress":
      return { emoji: "🎶", headline: "Event in progress", sub: "Your captain is on-site." };
    case "Completed":
      return { emoji: "🎉", headline: "Booking completed", sub: "Tap to leave a review." };
    case "Cancelled":
      return {
        emoji: "❌",
        headline: "Booking cancelled",
        sub: booking.cancellationReason ? `Reason: ${booking.cancellationReason}` : "Refund processed within 5–7 days.",
      };
    default:
      return { emoji: "📦", headline: booking.status, sub: "" };
  }
}

const STATUS_CFG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  Pending:              { color: "#f59e0b", bg: "#fffbeb", border: "#fde68a", icon: "time-outline" },
  Confirmed:            { color: "#02023E", bg: "#f0fffe", border: "#a5f3fc", icon: "checkmark-circle-outline" },
  "Equipment Dispatched": { color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe", icon: "car-outline" },
  "In Progress":        { color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", icon: "play-circle-outline" },
  Completed:            { color: "#8696a0", bg: "#f8fafc", border: "#e2e8f0", icon: "checkmark-done-outline" },
  Cancelled:            { color: "#ef4444", bg: "#fef2f2", border: "#fecaca", icon: "close-circle-outline" },
};

const fmt = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// ─── Review Modal ─────────────────────────────────────────────────────────────
const ReviewModal = ({
  visible, bookingId, onClose, onSubmit,
}: { visible: boolean; bookingId: number; onClose: () => void; onSubmit: (rating: number, review: string) => void }) => {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    onSubmit(rating, review);
    setSubmitting(false);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={rvS.overlay}>
        <View style={rvS.sheet}>
          <Text style={rvS.title}>Rate Your Experience</Text>
          <View style={rvS.stars}>
            {[1, 2, 3, 4, 5].map(s => (
              <TouchableOpacity key={s} onPress={() => setRating(s)}>
                <Ionicons name={s <= rating ? "star" : "star-outline"} size={36} color={s <= rating ? "#f59e0b" : "#d1d5db"} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={rvS.field}>
            <Text style={rvS.label}>Write a review (optional)</Text>
            <TextInput
              style={rvS.textarea}
              value={review}
              onChangeText={setReview}
              placeholder="Tell others about your experience..."
              placeholderTextColor="#8696a0"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
          <View style={rvS.btns}>
            <TouchableOpacity style={rvS.cancelBtn} onPress={onClose}>
              <Text style={rvS.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rvS.submitBtn} onPress={handleSubmit} disabled={submitting}>
              <LinearGradient colors={["#02023E", "#02023E"]} style={rvS.submitBtnGrad}>
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={rvS.submitBtnText}>Submit Review</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Booking Detail Modal ─────────────────────────────────────────────────────
const DetailModal = ({
  visible, booking, onClose, onCancel, onReview,
}: {
  visible: boolean; booking: Booking | null;
  onClose: () => void; onCancel: () => void; onReview: () => void;
}) => {
  if (!booking) return null;
  const cfg = STATUS_CFG[booking.status] || STATUS_CFG.Pending;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={dmS.overlay}>
        <View style={dmS.sheet}>
          <View style={dmS.handle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={dmS.header}>
              <View>
                <Text style={dmS.eventType}>{booking.eventType}</Text>
                <Text style={dmS.bookingId}>Booking #{booking.id}</Text>
              </View>
              <View style={[dmS.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                <Ionicons name={cfg.icon as any} size={13} color={cfg.color} />
                <Text style={[dmS.statusText, { color: cfg.color }]}>{booking.status}</Text>
              </View>
            </View>

            {/* Captain */}
            {booking.captain ? (
              <View style={dmS.section}>
                <Text style={dmS.sectionTitle}>SERVICE PROVIDER</Text>
                <View style={dmS.infoCard}>
                  <View style={dmS.row}>
                    <Ionicons name="storefront-outline" size={16} color="#02023E" style={dmS.rowIcon} />
                    <Text style={dmS.rowText}>{booking.captain.businessName || "Captain"}</Text>
                    {booking.captain.phone ? (
                      <TouchableOpacity style={dmS.callBtn}>
                        <Ionicons name="call-outline" size={16} color="#02023E" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {booking.captain.locationCity ? (
                    <View style={dmS.row}>
                      <Ionicons name="location-outline" size={16} color="#8696a0" style={dmS.rowIcon} />
                      <Text style={dmS.rowText}>{booking.captain.locationCity}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* DJ */}
            {booking.dj ? (
              <View style={dmS.section}>
                <Text style={dmS.sectionTitle}>DJ</Text>
                <View style={dmS.infoCard}>
                  <View style={dmS.row}>
                    <Ionicons name="musical-notes-outline" size={16} color="#02023E" style={dmS.rowIcon} />
                    <Text style={dmS.rowText}>{booking.dj.name}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Event Details */}
            <View style={dmS.section}>
              <Text style={dmS.sectionTitle}>EVENT DETAILS</Text>
              <View style={dmS.infoCard}>
                <View style={dmS.row}>
                  <Ionicons name="calendar-outline" size={16} color="#8696a0" style={dmS.rowIcon} />
                  <Text style={dmS.rowText}>{fmt(booking.eventDate)}</Text>
                </View>
                <View style={dmS.row}>
                  <Ionicons name="time-outline" size={16} color="#8696a0" style={dmS.rowIcon} />
                  <Text style={dmS.rowText}>{booking.startTime} – {booking.endTime} ({booking.durationHours}h)</Text>
                </View>
                {booking.deliveryCity ? (
                  <View style={dmS.row}>
                    <Ionicons name="location-outline" size={16} color="#8696a0" style={dmS.rowIcon} />
                    <Text style={dmS.rowText}>{booking.deliveryStreet ? `${booking.deliveryStreet}, ` : ""}{booking.deliveryCity}</Text>
                  </View>
                ) : null}
                {booking.specialRequests ? (
                  <View style={dmS.row}>
                    <Ionicons name="chatbubble-outline" size={16} color="#8696a0" style={dmS.rowIcon} />
                    <Text style={dmS.rowText}>{booking.specialRequests}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            {/* Pricing */}
            <View style={dmS.section}>
              <Text style={dmS.sectionTitle}>PRICING</Text>
              <View style={dmS.infoCard}>
                {Number(booking.djFee) > 0 ? (
                  <View style={dmS.priceRow}><Text style={dmS.priceKey}>DJ Fee</Text><Text style={dmS.priceVal}>₹{Number(booking.djFee).toLocaleString()}</Text></View>
                ) : null}
                {Number(booking.equipmentFee) > 0 ? (
                  <View style={dmS.priceRow}><Text style={dmS.priceKey}>Equipment Fee</Text><Text style={dmS.priceVal}>₹{Number(booking.equipmentFee).toLocaleString()}</Text></View>
                ) : null}
                {Number(booking.deliveryFee) > 0 ? (
                  <View style={dmS.priceRow}><Text style={dmS.priceKey}>Delivery Fee</Text><Text style={dmS.priceVal}>₹{Number(booking.deliveryFee).toLocaleString()}</Text></View>
                ) : null}
                <View style={[dmS.priceRow, dmS.totalRow]}>
                  <Text style={dmS.totalKey}>Total</Text>
                  <Text style={dmS.totalVal}>₹{Number(booking.totalAmount).toLocaleString()}</Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={dmS.actions}>
              {booking.status === "Completed" && !booking.rating ? (
                <TouchableOpacity style={dmS.reviewBtn} onPress={onReview} activeOpacity={0.8}>
                  <LinearGradient colors={["#f59e0b", "#d97706"]} style={dmS.reviewBtnGrad}>
                    <Ionicons name="star-outline" size={16} color="#fff" />
                    <Text style={dmS.reviewBtnText}>Leave a Review</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : null}
              {!["Completed", "Cancelled"].includes(booking.status) ? (
                <TouchableOpacity style={dmS.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
                  <Text style={dmS.cancelBtnText}>Cancel Booking</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={dmS.closeBtn} onPress={onClose}>
                <Text style={dmS.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Booking Card ─────────────────────────────────────────────────────────────
const BookingCard = ({ booking, onPress }: { booking: Booking; onPress: () => void }) => {
  const cfg = STATUS_CFG[booking.status] || STATUS_CFG.Pending;
  const msg = getStatusMessage(booking);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopLeft}>
          <Text style={styles.cardEvent}>{booking.eventType}</Text>
          <Text style={styles.cardId}>#{booking.id} · Booked {fmt(booking.createdAt)}</Text>
        </View>
        <View style={[styles.cardStatus, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
          <Text style={[styles.cardStatusText, { color: cfg.color }]}>{booking.status}</Text>
        </View>
      </View>

      {/* Blinkit-style friendly status banner. Skipped on terminal states
          (Completed/Cancelled) where the status pill above already tells
          the user everything they need. */}
      {!["Completed", "Cancelled"].includes(booking.status) && (
        <View style={[styles.statusBanner, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
          <Text style={styles.statusBannerEmoji}>{msg.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusBannerHeadline, { color: cfg.color }]} numberOfLines={1}>
              {msg.headline}
            </Text>
            {msg.sub ? <Text style={styles.statusBannerSub} numberOfLines={1}>{msg.sub}</Text> : null}
          </View>
        </View>
      )}

      {booking.dj ? (
        <View style={styles.cardRow}>
          <Ionicons name="musical-notes-outline" size={14} color="#8696a0" />
          <Text style={styles.cardRowText}>DJ: {booking.dj.name}</Text>
        </View>
      ) : null}

      {booking.captain?.businessName ? (
        <View style={styles.cardRow}>
          <Ionicons name="storefront-outline" size={14} color="#8696a0" />
          <Text style={styles.cardRowText}>{booking.captain.businessName}</Text>
        </View>
      ) : null}

      <View style={styles.cardRow}>
        <Ionicons name="calendar-outline" size={14} color="#8696a0" />
        <Text style={styles.cardRowText}>{fmt(booking.eventDate)} · {booking.startTime}</Text>
      </View>

      {booking.deliveryCity ? (
        <View style={styles.cardRow}>
          <Ionicons name="location-outline" size={14} color="#8696a0" />
          <Text style={styles.cardRowText}>{booking.deliveryCity}</Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.cardAmount}>₹{Number(booking.totalAmount).toLocaleString()}</Text>
        {booking.status === "Completed" && booking.rating ? (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color="#f59e0b" />
            <Text style={styles.ratingText}>{booking.rating}/5</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color="#c4c9d0" />
      </View>
    </TouchableOpacity>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MyBookingsScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { alert: appAlert, confirm } = useAlert();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const STATUSES = ["All", "Pending", "Confirmed", "Equipment Dispatched", "In Progress", "Completed", "Cancelled"];

  const fetchBookings = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const res = await bookingApi.getMyBookings({
        status: selectedStatus !== "All" ? selectedStatus : undefined,
      });
      if (res.success) setBookings(res.data || []);
    } catch (err: any) {
      console.error("fetchBookings error:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStatus, isAuthenticated]);

  useEffect(() => { setLoading(true); fetchBookings(); }, [selectedStatus]);

  const handleCancel = async () => {
    if (!selectedBooking) return;
    const ok = await confirm({
      title: "Cancel Booking?",
      message: "Are you sure you want to cancel this booking? This cannot be undone.",
      confirmText: "Yes, cancel",
      cancelText: "Keep booking",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await bookingApi.cancel(selectedBooking.id);
      if (res.success) {
        setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, status: "Cancelled" } : b));
        setSelectedBooking(prev => prev ? { ...prev, status: "Cancelled" } : null);
        await appAlert({ title: "Cancelled", message: "Your booking has been cancelled.", tone: "success" });
      }
    } catch (err: any) {
      await appAlert({ title: "Error", message: err.message || "Failed to cancel", tone: "error" });
    }
  };

  const handleReviewSubmit = async (rating: number, review: string) => {
    if (!selectedBooking) return;
    try {
      const res = await bookingApi.addReview(selectedBooking.id, { rating, review });
      if (res.success) {
        setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, rating } : b));
        await appAlert({ title: "Thank you!", message: "Your review has been submitted.", tone: "success" });
      }
    } catch (err: any) {
      await appAlert({ title: "Error", message: err.message || "Failed to submit review", tone: "error" });
    }
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
          <Ionicons name="calendar-outline" size={64} color="#c4c9d0" />
          <Text style={{ fontSize: 20, fontWeight: "800", color: "#101720", marginTop: 16, marginBottom: 8 }}>
            Sign in to view bookings
          </Text>
          <Text style={{ fontSize: 14, color: "#8696a0", textAlign: "center", marginBottom: 24 }}>
            Create an account or sign in to track your DJ bookings
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: "#02023E", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 16 }}
            onPress={() => router.push("/(auth)/login" as any)}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>

          <View style={styles.topBar}>
            <Text style={styles.topBarTitle}>My Bookings</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{bookings.length}</Text>
            </View>
          </View>

          {/* Status filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
            {STATUSES.map(s => (
              <TouchableOpacity
                key={s}
                onPress={() => setSelectedStatus(s)}
                style={[styles.filterChip, selectedStatus === s && styles.filterChipActive]}
                activeOpacity={0.8}
              >
                {s !== "All" ? (
                  <View style={[styles.filterDot, { backgroundColor: STATUS_CFG[s]?.color || "#8696a0" }, selectedStatus !== s && { opacity: 0.5 }]} />
                ) : null}
                <Text style={[styles.filterChipText, selectedStatus === s && styles.filterChipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <View style={styles.loader}><ActivityIndicator size="large" color="#02023E" /></View>
          ) : (
            <FlatList
              data={bookings}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <BookingCard
                  booking={item}
                  onPress={() => { setSelectedBooking(item); setShowDetail(true); }}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={52} color="#c4c9d0" />
                  <Text style={styles.emptyTitle}>No bookings yet</Text>
                  <Text style={styles.emptySub}>
                    {selectedStatus === "All"
                      ? "Browse DJs and make your first booking!"
                      : `No ${selectedStatus} bookings`}
                  </Text>
                  {selectedStatus === "All" ? (
                    <TouchableOpacity
                      style={styles.browseDJsBtn}
                      onPress={() => router.push("/djs" as any)}
                    >
                      <Text style={styles.browseDJsBtnText}>Browse DJs</Text>
                      <Ionicons name="arrow-forward" size={14} color="#02023E" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              }
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} tintColor="#02023E" />}
            />
          )}
        </LinearGradient>
      </SafeAreaView>

      <DetailModal
        visible={showDetail}
        booking={selectedBooking}
        onClose={() => setShowDetail(false)}
        onCancel={handleCancel}
        onReview={() => { setShowDetail(false); setShowReview(true); }}
      />

      <ReviewModal
        visible={showReview}
        bookingId={selectedBooking?.id || 0}
        onClose={() => setShowReview(false)}
        onSubmit={handleReviewSubmit}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },
  topBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  topBarTitle: { fontSize: 26, fontWeight: "800", color: "#101720", letterSpacing: -0.5, flex: 1 },
  countBadge: { backgroundColor: "#02023E", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  filterScroll: { maxHeight: 52 },
  filterContent: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  filterChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef0f3",
  },
  filterChipActive: { backgroundColor: "#101720", borderColor: "#101720" },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
  filterChipText: { fontSize: 12, fontWeight: "700", color: "#8696a0" },
  filterChipTextActive: { color: "#fff" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 120, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#eef0f3" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  cardTopLeft: { flex: 1 },
  cardEvent: { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  cardId: { fontSize: 12, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  cardStatus: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1,
  },
  cardStatusText: { fontSize: 11, fontWeight: "800" },

  // Blinkit-style banner — narrow status hero embedded inside each card.
  // Sits between the header and the meta rows so it's the first thing
  // the eye lands on after the event title.
  statusBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1,
    marginBottom: 10,
  },
  statusBannerEmoji: { fontSize: 18 },
  statusBannerHeadline: {
    fontSize: 13.5, fontWeight: "800", letterSpacing: -0.2,
  },
  statusBannerSub: {
    fontSize: 11, color: "#6b7280", fontWeight: "500", marginTop: 1,
  },

  cardRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 5 },
  cardRowText: { fontSize: 13, color: "#5a6169", fontWeight: "500" },
  cardFooter: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f0f0f0",
  },
  cardAmount: { fontSize: 18, fontWeight: "800", color: "#02023E", letterSpacing: -0.4 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 13, fontWeight: "700", color: "#101720" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#101720" },
  emptySub: { fontSize: 14, color: "#8696a0", textAlign: "center", paddingHorizontal: 20 },
  browseDJsBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    backgroundColor: "#f0fffe", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  browseDJsBtnText: { fontSize: 14, fontWeight: "700", color: "#02023E" },
});

const dmS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 12, maxHeight: "90%",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#e5e7eb", alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  eventType: { fontSize: 22, fontWeight: "800", color: "#101720", letterSpacing: -0.5 },
  bookingId: { fontSize: 13, color: "#8696a0", fontWeight: "500", marginTop: 3 },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: "800" },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 1,
    textTransform: "uppercase", marginBottom: 8,
  },
  infoCard: { backgroundColor: "#f8fafc", borderRadius: 14, padding: 12, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowIcon: {},
  rowText: { flex: 1, fontSize: 14, color: "#101720", fontWeight: "500" },
  callBtn: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: "#f0fffe",
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#a5f3fc",
  },
  priceRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  priceKey: { fontSize: 13, color: "#8696a0", fontWeight: "500" },
  priceVal: { fontSize: 13, fontWeight: "700", color: "#101720" },
  totalRow: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#eef0f3" },
  totalKey: { fontSize: 15, fontWeight: "700", color: "#101720" },
  totalVal: { fontSize: 18, fontWeight: "800", color: "#02023E", letterSpacing: -0.4 },
  actions: { gap: 10, marginTop: 8, paddingBottom: 16 },
  reviewBtn: { borderRadius: 14, overflow: "hidden" },
  reviewBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 8 },
  reviewBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  cancelBtn: {
    paddingVertical: 14, borderRadius: 14, alignItems: "center",
    borderWidth: 1.5, borderColor: "#fecaca", backgroundColor: "#fff5f5",
  },
  cancelBtnText: { fontSize: 15, fontWeight: "700", color: "#ef4444" },
  closeBtn: {
    paddingVertical: 14, borderRadius: 14, alignItems: "center",
    backgroundColor: "#f4f8ff", borderWidth: 1, borderColor: "#eef0f3",
  },
  closeBtnText: { fontSize: 15, fontWeight: "700", color: "#8696a0" },
});

const rvS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingTop: 16 },
  title: { fontSize: 22, fontWeight: "800", color: "#101720", marginBottom: 20, textAlign: "center" },
  stars: { flexDirection: "row", justifyContent: "center", gap: 12, marginBottom: 24 },
  field: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: "700", color: "#5a6169", marginBottom: 7 },
  textarea: {
    borderWidth: 1, borderColor: "#eef0f3", borderRadius: 12,
    padding: 14, minHeight: 90,
  },
  btns: { flexDirection: "row", gap: 12 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center",
    backgroundColor: "#f4f8ff", borderWidth: 1, borderColor: "#eef0f3",
  },
  cancelBtnText: { fontSize: 14, fontWeight: "700", color: "#8696a0" },
  submitBtn: { flex: 2, borderRadius: 14, overflow: "hidden" },
  submitBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  submitBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});