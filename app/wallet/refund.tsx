/**
 * app/wallet/refund.tsx — Refund Request (contact support)
 *
 * Automated refunds require bank account details that the Basswala user
 * app doesn't currently collect, so this screen intentionally does NOT
 * execute a refund flow on its own. Instead it:
 *
 *   1. Explains the refund policy at a glance
 *   2. Lists the user's refundable bookings (cancelled / completed)
 *   3. Provides WhatsApp / email / phone quick-actions so the support
 *      team can process the refund manually against the original
 *      payment method
 *
 * Once we add a "Payout method" screen (UPI ID or bank account), this
 * page can be swapped back to an automated flow using the existing
 * backend refund endpoints.
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { bookingApi } from "../../services/userApi";
import { getSupportContact, type SupportContact } from "../../services/appConfig";

interface Booking {
  id: number | string;
  eventType: string;
  eventDate: string;
  totalAmount: number;
  status: string;
}

function rupees(raw: any): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function RefundScreen() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<SupportContact | null>(null);

  // Admin-controlled contact details. Loaded once on mount; falls
  // back to the bundled defaults inside appConfig if the network is
  // down so the screen still renders something useful offline.
  React.useEffect(() => {
    let cancelled = false;
    getSupportContact().then(c => { if (!cancelled) setContact(c); });
    return () => { cancelled = true; };
  }, []);

  const supportEmail    = contact?.email    || "support@basswala.in";
  const supportPhone    = contact?.phone    || "";
  const supportWhatsapp = contact?.whatsapp || "";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await bookingApi.getMyBookings({});
      if (res?.success && Array.isArray(res.data)) {
        const refundable = res.data
          .filter((b: any) => ["Cancelled", "Completed"].includes(b.status))
          .map(
            (b: any): Booking => ({
              id: b.id,
              eventType: b.eventType ?? "Booking",
              eventDate: b.eventDate,
              totalAmount: rupees(b.totalAmount),
              status: b.status,
            })
          );
        setBookings(refundable);
      }
    } catch {
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openWhatsApp = (bookingId?: string | number) => {
    const message = bookingId
      ? `Hi Basswala team, I'd like to request a refund for booking #${bookingId}.`
      : `Hi Basswala team, I'd like to request a refund.`;
    if (!supportWhatsapp) {
      Alert.alert("WhatsApp unavailable", "Please use Email or Call instead.");
      return;
    }
    const url = `https://wa.me/${supportWhatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(
        "WhatsApp not installed",
        `Please message us manually at +${supportWhatsapp}`
      )
    );
  };

  const openEmail = (bookingId?: string | number) => {
    const subject = bookingId
      ? `Refund request — booking #${bookingId}`
      : `Refund request`;
    const body = bookingId
      ? `Hi Basswala team,\n\nI'd like to request a refund for booking #${bookingId}.\n\nReason: \n\nThanks.`
      : `Hi Basswala team,\n\nI'd like to request a refund.\n\nReason: \n\nThanks.`;
    const url = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert("Email not available", `Please email us at ${supportEmail}`)
    );
  };

  const openPhone = () => {
    if (!supportPhone) {
      Alert.alert("Phone unavailable", "Please use WhatsApp or Email instead.");
      return;
    }
    const cleaned = supportPhone.replace(/[^\d+]/g, "");
    Linking.openURL(`tel:${cleaned}`).catch(() =>
      Alert.alert("Unable to call", `Please call us at ${supportPhone}`)
    );
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#101720" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Refunds</Text>
          <View style={{ width: 42 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Hero explanation */}
          <View style={s.heroCard}>
            <View style={s.heroIcon}>
              <Ionicons name="refresh-circle-outline" size={30} color="#02023E" />
            </View>
            <Text style={s.heroTitle}>Need a refund?</Text>
            <Text style={s.heroSub}>
              Our support team processes refunds manually back to your saved
              payout method. Just reach out with your booking ID — most
              refunds are approved within 24 hours.
            </Text>
            <TouchableOpacity
              style={s.payoutLink}
              onPress={() => router.push("/profile/payout-methods" as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="card-outline" size={14} color="#02023E" />
              <Text style={s.payoutLinkText}>Manage Payout Methods</Text>
              <Ionicons name="chevron-forward" size={14} color="#02023E" />
            </TouchableOpacity>
          </View>

          {/* Quick actions — only render channels the admin has filled in */}
          <Text style={s.sectionLabel}>Contact Support</Text>
          <View style={s.actionsGrid}>
            {!!supportWhatsapp && (
              <TouchableOpacity
                style={[s.actionCard, { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }]}
                onPress={() => openWhatsApp()}
                activeOpacity={0.85}
              >
                <Ionicons name="logo-whatsapp" size={24} color="#16a34a" />
                <Text style={[s.actionLabel, { color: "#16a34a" }]}>WhatsApp</Text>
                <Text style={s.actionSub}>{contact?.whatsappHours || "Fastest response"}</Text>
              </TouchableOpacity>
            )}
            {!!supportEmail && (
              <TouchableOpacity
                style={[s.actionCard, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}
                onPress={() => openEmail()}
                activeOpacity={0.85}
              >
                <Ionicons name="mail-outline" size={24} color="#2563eb" />
                <Text style={[s.actionLabel, { color: "#2563eb" }]}>Email</Text>
                <Text style={s.actionSub} numberOfLines={1}>{supportEmail}</Text>
              </TouchableOpacity>
            )}
            {!!supportPhone && (
              <TouchableOpacity
                style={[s.actionCard, { backgroundColor: "#fef3c7", borderColor: "#fde68a" }]}
                onPress={openPhone}
                activeOpacity={0.85}
              >
                <Ionicons name="call-outline" size={24} color="#d97706" />
                <Text style={[s.actionLabel, { color: "#d97706" }]}>Call Us</Text>
                <Text style={s.actionSub}>{contact?.phoneHours || "Mon–Sat, 10am–6pm"}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Refund policy */}
          <Text style={s.sectionLabel}>Refund Policy</Text>
          <View style={s.policyCard}>
            <PolicyRow
              icon="checkmark-circle"
              color="#22c55e"
              title="Cancelled bookings"
              desc="Full refund if cancelled at least 48 hours before the event."
            />
            <PolicyRow
              icon="alert-circle"
              color="#f59e0b"
              title="Late cancellations"
              desc="Partial refund available for cancellations under 48 hours — subject to review."
            />
            <PolicyRow
              icon="information-circle"
              color="#6366f1"
              title="Service disputes"
              desc="If the DJ didn't show up or the service was unsatisfactory, contact support with details."
            />
            <PolicyRow
              icon="time"
              color="#02023E"
              title="Processing time"
              desc="Approved refunds reach your original payment method within 5–7 business days."
            />
          </View>

          {/* Refundable bookings */}
          <Text style={s.sectionLabel}>
            Your Bookings {bookings.length > 0 && `(${bookings.length})`}
          </Text>
          {loading ? (
            <View style={s.loadingCard}>
              <ActivityIndicator color="#02023E" />
            </View>
          ) : bookings.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="receipt-outline" size={36} color="#c4c9d0" />
              <Text style={s.emptyTitle}>No refundable bookings</Text>
              <Text style={s.emptySub}>
                Cancelled or completed bookings will show up here.
              </Text>
            </View>
          ) : (
            bookings.map((b) => (
              <View key={b.id} style={s.bookingCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bookingTitle} numberOfLines={1}>
                    {b.eventType} · #{b.id}
                  </Text>
                  <Text style={s.bookingMeta}>
                    {fmtDate(b.eventDate)} · {b.status}
                  </Text>
                  <Text style={s.bookingAmount}>
                    ₹{b.totalAmount.toLocaleString("en-IN")}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.bookingCta}
                  onPress={() => openWhatsApp(b.id)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                  <Text style={s.bookingCtaText}>Request</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

// ─── Components ───────────────────────────────────────────────────────────────
function PolicyRow({
  icon,
  color,
  title,
  desc,
}: {
  icon: any;
  color: string;
  title: string;
  desc: string;
}) {
  return (
    <View style={p.row}>
      <View style={[p.iconCircle, { backgroundColor: color + "15" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={p.title}>{title}</Text>
        <Text style={p.desc}>{desc}</Text>
      </View>
    </View>
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
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  scroll: { paddingHorizontal: 20, paddingTop: 20 },

  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eef0f3",
    marginBottom: 24,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#f0fffe",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#a5f3fc",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#101720",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  heroSub: {
    fontSize: 13,
    color: "#8696a0",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 8,
    fontWeight: "500",
  },
  payoutLink: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 14,
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: "#f0fffe", borderRadius: 12,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  payoutLinkText: { fontSize: 12, fontWeight: "800", color: "#02023E" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8696a0",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 12,
    paddingLeft: 4,
  },

  actionsGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
  },
  actionLabel: { fontSize: 13, fontWeight: "800", marginTop: 4 },
  actionSub: { fontSize: 10, color: "#8696a0", fontWeight: "500", textAlign: "center" },

  policyCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eef0f3",
    marginBottom: 24,
  },

  loadingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: "#101720", marginTop: 6 },
  emptySub: { fontSize: 12, color: "#8696a0", textAlign: "center", fontWeight: "500" },

  bookingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eef0f3",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bookingTitle: { fontSize: 14, fontWeight: "800", color: "#101720" },
  bookingMeta: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  bookingAmount: { fontSize: 15, fontWeight: "800", color: "#02023E", marginTop: 4 },
  bookingCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#16a34a",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  bookingCtaText: { fontSize: 12, fontWeight: "800", color: "#fff" },
});

const p = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 10,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 13, fontWeight: "800", color: "#101720" },
  desc: { fontSize: 12, color: "#8696a0", fontWeight: "500", marginTop: 2, lineHeight: 17 },
});
