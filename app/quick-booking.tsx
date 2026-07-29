/**
 * app/quick-booking.tsx
 *
 * Step 2 + 3 of the Quick Booking flow.
 *
 * The home tab's BookDJTab handles the calendar (dates). Once the user
 * locks in a date range, we navigate here with `startDate` + `endDate`
 * search params. This screen lists available DJs and walks the user
 * through Review & Confirm + payment.
 *
 * Splitting these out of the home tab keeps the home shorter and gives
 * the booking flow a dedicated full-screen feel (back button, focused
 * header, sticky CTA).
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLoginGate } from "../components/LoginGate";
import { usePhoneGate } from "../components/PhoneGate";
import { useAlert } from "../components/AppAlert";
import { bookingApi, servicesApi, userApi } from "../services/userApi";
import { usePayForBooking } from "../services/bookingPayment";
import { SavedAddress } from "../types/address";

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000) + 1;

type Phase = "pick" | "confirm";

export default function QuickBookingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ startDate?: string; endDate?: string }>();
  const start = String(params.startDate || "");
  const end = String(params.endDate || "");

  const { ensureLogin } = useLoginGate();
  const { ensurePhone } = usePhoneGate();
  const { alert: appAlert, confirm } = useAlert();
  const payForBooking = usePayForBooking();

  const [phase, setPhase] = useState<Phase>("pick");
  const [defaultAddress, setDefaultAddress] = useState<SavedAddress | null>(null);
  const [loadingDJs, setLoadingDJs] = useState(true);
  const [djs, setDjs] = useState<any[]>([]);
  const [picked, setPicked] = useState<any | null>(null);
  const [expandedDJ, setExpandedDJ] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);

  const nights = start && end ? daysBetween(start, end) : 0;
  const total = picked ? Math.round(Number(picked.hourlyRate) || 0) * nights * 8 : 0;

  // Bail back to home if the URL params are missing — shouldn't happen in
  // normal flow, but guards against deep-link weirdness.
  useEffect(() => {
    if (!start || !end) router.replace("/(tabs)" as any);
  }, [start, end]);

  // Load default address (used at confirm time)
  useEffect(() => {
    (async () => {
      try {
        const res = await userApi.getSavedAddresses();
        if (res?.success) {
          const list: SavedAddress[] = res.data || [];
          setDefaultAddress(list.find((a) => a.isDefault) || list[0] || null);
        }
      } catch { /* handled at confirm time */ }
    })();
  }, []);

  // Fetch DJs available for the chosen range
  useEffect(() => {
    if (!start || !end) return;
    let cancelled = false;
    (async () => {
      setLoadingDJs(true);
      try {
        const res = await servicesApi.getAllDJs({ startDate: start, endDate: end });
        if (cancelled) return;
        setDjs(res.success && Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) setDjs([]);
      } finally {
        if (!cancelled) setLoadingDJs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [start, end]);

  const handleConfirm = async () => {
    if (!picked || !start || !end) return;
    if (!picked.captain?.id) {
      await appAlert({ title: "Unavailable", message: "This DJ's captain info is missing. Please refresh.", tone: "warning" });
      return;
    }
    const loggedIn = await ensureLogin();
    if (!loggedIn) return;
    const phoneOk = await ensurePhone();
    if (!phoneOk) return;
    if (!defaultAddress) {
      const addNow = await confirm({
        title: "Delivery address needed",
        message: "Add a delivery address so we can confirm your booking.",
        confirmText: "Add address",
        cancelText: "Cancel",
      });
      if (addNow) router.push("/profile/addresses" as any);
      return;
    }

    setBooking(true);
    try {
      const res = await bookingApi.create({
        captainId: picked.captain.id,
        captainDJId: picked.id,
        eventType: "Private Party",
        eventDate: start,
        startTime: "18:00",
        endTime: "22:00",
        durationHours: Math.max(8, nights * 8),
        deliveryLocation: {
          latitude: Number(defaultAddress.latitude),
          longitude: Number(defaultAddress.longitude),
          street: defaultAddress.street || undefined,
          city: defaultAddress.city,
          state: defaultAddress.state || undefined,
          zipCode: defaultAddress.zipCode || undefined,
          country: defaultAddress.country || undefined,
        },
      });

      if (!res?.success) {
        await appAlert({ title: "Error", message: res?.message || "Failed to create booking", tone: "error" });
        return;
      }
      const bookingId = res.data?.id;
      if (!bookingId) {
        await appAlert({ title: "Error", message: "Booking was created but no ID was returned", tone: "error" });
        return;
      }

      // Booking is confirmed only on successful payment; roll back otherwise.
      const pay = await payForBooking(bookingId);
      if (pay.paid) {
        await appAlert({
          title: "Booking Confirmed!",
          message: "Your booking is reserved. The captain will confirm shortly.",
          tone: "success",
        });
        router.replace("/(tabs)/bookings" as any);
      } else {
        try { await bookingApi.cancel(bookingId); } catch {}
        if (pay.cancelled) {
          await appAlert({
            title: "Payment cancelled",
            message: "You cancelled the advance payment, so the booking was not created. You can try again any time.",
            tone: "info",
          });
        } else {
          await appAlert({
            title: "Payment failed",
            message: pay.message || "Your payment did not go through, so the booking was not created.",
            tone: "error",
          });
        }
      }
    } catch (err: any) {
      console.error("Booking failed:", err);
      await appAlert({
        title: "Error",
        message: err.response?.data?.message || err.message || "Failed to create booking",
        tone: "error",
      });
    } finally {
      setBooking(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <SafeAreaView style={s.root} edges={["top"]}>
        <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
          {/* Header */}
          <View style={s.header}>
            <TouchableOpacity
              style={s.backBtn}
              onPress={() => {
                if (phase === "confirm") setPhase("pick");
                else router.back();
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={20} color="#101720" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>
                {phase === "pick" ? "Choose your DJ" : "Review & Confirm"}
              </Text>
              <Text style={s.headerSub}>
                {start} → {end} · {nights} night{nights !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
          >
            {phase === "pick" ? (
              loadingDJs ? (
                <View style={s.loadBox}>
                  <ActivityIndicator size="large" color="#02023E" />
                  <Text style={s.loadText}>Checking availability…</Text>
                </View>
              ) : djs.length === 0 ? (
                <View style={s.loadBox}>
                  <Ionicons name="search-outline" size={40} color="#8696a0" />
                  <Text style={s.loadText}>No DJs available for these dates. Try different dates.</Text>
                  <TouchableOpacity style={s.changeDatesBtn} onPress={() => router.back()} activeOpacity={0.85}>
                    <Text style={s.changeDatesText}>Pick different dates</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                djs.map((item) => {
                  const isExpanded = expandedDJ === item.id.toString();
                  const isSelected = picked?.id === item.id;
                  let genres: string[] = [];
                  try {
                    genres = typeof item.genres === "string" ? JSON.parse(item.genres) : (item.genres || []);
                    if (!Array.isArray(genres)) genres = [];
                  } catch { genres = []; }

                  return (
                    <View key={item.id} style={[s.djCard, isSelected && s.djCardOn]}>
                      <TouchableOpacity
                        style={s.djCardRow}
                        onPress={() => setExpandedDJ(isExpanded ? null : item.id.toString())}
                        activeOpacity={0.85}
                      >
                        <View style={s.djAvatar}>
                          <Text style={s.djAvatarText}>{item.name?.charAt(0) || "D"}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={s.djRow}>
                            <Text style={s.djName}>{item.name}</Text>
                            {isSelected && (
                              <View style={s.selectedBadge}>
                                <Text style={s.selectedBadgeText}>Selected</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.djGenre}>{genres.join(", ") || "DJ"}</Text>
                          <View style={s.djMeta}>
                            <Ionicons name="star" size={11} color="#FFC107" />
                            <Text style={s.djRating}>{parseFloat(item.ratingAverage || 0).toFixed(1)}</Text>
                            <Text style={s.djReviews}>({item.ratingCount || 0})</Text>
                            {item.captain?.locationCity && (
                              <View style={s.tag}>
                                <Text style={s.tagText}>{item.captain.locationCity}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <View style={s.priceCol}>
                          <Text style={s.djPrice}>₹{Math.round(Number(item.hourlyRate) || 0).toLocaleString()}</Text>
                          <Text style={s.djPriceUnit}>/hr</Text>
                          <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color="#8696a0" style={{ marginTop: 6 }} />
                        </View>
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={s.djDetail}>
                          <View style={s.djDetailDivider} />
                          <Text style={s.djDetailLabel}>Specialties</Text>
                          <View style={s.djTagRow}>
                            {genres.map((t) => (
                              <View key={t} style={s.djDetailTag}>
                                <Text style={s.djDetailTagText}>{t}</Text>
                              </View>
                            ))}
                          </View>
                          <View style={s.djStatsRow}>
                            <View style={s.djStat}>
                              <Text style={s.djStatVal}>{parseFloat(item.ratingAverage || 0).toFixed(1)}</Text>
                              <Text style={s.djStatLbl}>Rating</Text>
                            </View>
                            <View style={s.djStatDivider} />
                            <View style={s.djStat}>
                              <Text style={s.djStatVal}>{item.ratingCount || 0}</Text>
                              <Text style={s.djStatLbl}>Events</Text>
                            </View>
                            <View style={s.djStatDivider} />
                            <View style={s.djStat}>
                              <Text style={s.djStatVal}>₹{Math.round(Number(item.hourlyRate) || 0).toLocaleString()}</Text>
                              <Text style={s.djStatLbl}>Per Hour</Text>
                            </View>
                          </View>
                          {item.bio ? <Text style={s.djBio}>{item.bio}</Text> : null}
                          <TouchableOpacity
                            style={s.djSelectBtn}
                            onPress={() => { setPicked(item); setExpandedDJ(null); }}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                            <Text style={s.djSelectBtnText}>{isSelected ? "Selected ✓" : "Select this DJ"}</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )
            ) : (
              picked && (
                <>
                  <View style={s.confirmCard}>
                    <View style={s.confirmAvatar}>
                      <Text style={s.confirmAvatarText}>{picked.name?.charAt(0) || "D"}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.confirmName}>{picked.name}</Text>
                      <Text style={s.confirmGenre}>
                        {Array.isArray(picked.genres) ? picked.genres.join(", ") : "DJ"}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <Ionicons name="star" size={12} color="#FFC107" />
                        <Text style={s.confirmRating}>
                          {parseFloat(picked.ratingAverage || 0).toFixed(1)} · {picked.ratingCount || 0} reviews
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setPhase("pick")} style={s.changeBtn}>
                      <Text style={s.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.breakdown}>
                    {[
                      { l: "Event from", v: start },
                      { l: "Event to", v: end },
                      { l: "Duration", v: `${nights} night${nights !== 1 ? "s" : ""}` },
                      { l: "Rate/hr", v: `₹${Math.round(Number(picked.hourlyRate) || 0).toLocaleString()}` },
                      { l: "Est. hours", v: `~8 hrs/day` },
                    ].map((r) => (
                      <View key={r.l} style={s.breakRow}>
                        <Text style={s.breakL}>{r.l}</Text>
                        <Text style={s.breakV}>{r.v}</Text>
                      </View>
                    ))}
                    <View style={s.breakLine} />
                    <View style={s.breakRow}>
                      <Text style={[s.breakL, { fontWeight: "700", color: "#101720" }]}>Estimated Total</Text>
                      <Text style={s.breakTotal}>₹{total.toLocaleString()}</Text>
                    </View>
                  </View>

                  <View style={s.noteRow}>
                    <Ionicons name="information-circle-outline" size={14} color="#8696a0" />
                    <Text style={s.noteText}>Final price confirmed on booking. 20% advance required.</Text>
                  </View>
                </>
              )
            )}
          </ScrollView>

          {/* Sticky bottom CTA — only when a DJ is picked or on confirm step */}
          {phase === "pick" && picked && (
            <View style={s.stickyBar}>
              <View style={s.stickyMeta}>
                <Text style={s.stickyName} numberOfLines={1}>{picked.name}</Text>
                <Text style={s.stickyPrice}>
                  ₹{Math.round(Number(picked.hourlyRate) || 0).toLocaleString()} /hr · {nights} night{nights !== 1 ? "s" : ""}
                </Text>
              </View>
              <TouchableOpacity style={s.stickyBtn} onPress={() => setPhase("confirm")} activeOpacity={0.88}>
                <Text style={s.stickyBtnText}>Review Booking</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}

          {phase === "confirm" && picked && (
            <View style={s.stickyBar}>
              <View style={s.stickyMeta}>
                <Text style={s.stickyName} numberOfLines={1}>Total</Text>
                <Text style={s.stickyPrice}>₹{total.toLocaleString()}</Text>
              </View>
              <TouchableOpacity
                style={[s.stickyBtn, booking && { opacity: 0.55 }]}
                disabled={booking}
                onPress={handleConfirm}
                activeOpacity={0.88}
              >
                {booking ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={s.stickyBtnText}>Confirm & Pay</Text>
                    <Ionicons name="lock-closed" size={14} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </LinearGradient>
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: "#8696a0", fontWeight: "600", marginTop: 2 },

  loadBox: { alignItems: "center", paddingVertical: 60, gap: 12 },
  loadText: { fontSize: 14, color: "#8696a0", fontWeight: "600", textAlign: "center", paddingHorizontal: 20 },
  changeDatesBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: "#02023E", borderRadius: 14,
  },
  changeDatesText: { color: "#fff", fontWeight: "700", fontSize: 14 },

  // DJ list cards
  djCard: {
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1, borderColor: "#eef0f3",
    marginBottom: 12, overflow: "hidden",
  },
  djCardOn: { borderColor: "#02023E", borderWidth: 2 },
  djCardRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  djAvatar: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: "#02023E",
    justifyContent: "center", alignItems: "center",
  },
  djAvatarText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  djRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  djName: { fontSize: 15, fontWeight: "800", color: "#101720", letterSpacing: -0.2 },
  djGenre: { fontSize: 12, color: "#8696a0", fontWeight: "600", marginTop: 2 },
  djMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6, flexWrap: "wrap" },
  djRating: { fontSize: 12, color: "#101720", fontWeight: "700" },
  djReviews: { fontSize: 11, color: "#8696a0", fontWeight: "600" },
  tag: { backgroundColor: "#f4f8ff", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  tagText: { fontSize: 10, color: "#02023E", fontWeight: "700" },
  priceCol: { alignItems: "flex-end", minWidth: 64 },
  djPrice: { fontSize: 16, fontWeight: "800", color: "#02023E", letterSpacing: -0.3 },
  djPriceUnit: { fontSize: 10, color: "#8696a0", fontWeight: "600" },
  selectedBadge: { backgroundColor: "#02023E", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  selectedBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },

  djDetail: { padding: 14, paddingTop: 0 },
  djDetailDivider: { height: 1, backgroundColor: "#eef0f3", marginBottom: 14 },
  djDetailLabel: {
    fontSize: 11, fontWeight: "700", color: "#8696a0",
    letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8,
  },
  djTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
  djDetailTag: { backgroundColor: "#f4f8ff", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  djDetailTagText: { fontSize: 11, fontWeight: "700", color: "#02023E" },
  djStatsRow: {
    flexDirection: "row", backgroundColor: "#f8fafc", borderRadius: 14,
    padding: 14, marginBottom: 12,
  },
  djStat: { flex: 1, alignItems: "center" },
  djStatDivider: { width: 1, backgroundColor: "#e6eaf0" },
  djStatVal: { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.2 },
  djStatLbl: { fontSize: 10, color: "#8696a0", fontWeight: "600", marginTop: 2 },
  djBio: { fontSize: 12, color: "#5b6877", lineHeight: 18, marginBottom: 12 },
  djSelectBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#02023E", borderRadius: 14, paddingVertical: 12,
  },
  djSelectBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // Confirm card
  confirmCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1, borderColor: "#eef0f3",
    padding: 14, marginBottom: 16,
  },
  confirmAvatar: {
    width: 60, height: 60, borderRadius: 18,
    backgroundColor: "#02023E",
    justifyContent: "center", alignItems: "center",
  },
  confirmAvatarText: { color: "#fff", fontWeight: "800", fontSize: 22 },
  confirmName: { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  confirmGenre: { fontSize: 12, color: "#8696a0", fontWeight: "600", marginTop: 2 },
  confirmRating: { fontSize: 11, color: "#5b6877", fontWeight: "600" },
  changeBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: "#f4f8ff", borderRadius: 10,
  },
  changeBtnText: { color: "#02023E", fontWeight: "700", fontSize: 12 },

  breakdown: {
    backgroundColor: "#fff", borderRadius: 18,
    borderWidth: 1, borderColor: "#eef0f3",
    padding: 16, marginBottom: 12,
  },
  breakRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 6 },
  breakL: { fontSize: 13, color: "#5b6877", fontWeight: "500" },
  breakV: { fontSize: 13, color: "#101720", fontWeight: "700" },
  breakLine: { height: 1, backgroundColor: "#eef0f3", marginVertical: 8 },
  breakTotal: { fontSize: 18, fontWeight: "800", color: "#02023E", letterSpacing: -0.3 },

  noteRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4, marginBottom: 12 },
  noteText: { fontSize: 11, color: "#8696a0", fontWeight: "500", flex: 1 },

  // Sticky bottom CTA
  stickyBar: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12, paddingBottom: 18,
    backgroundColor: "#fff",
    borderTopWidth: 1, borderTopColor: "#eef0f3",
    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  stickyMeta: { flex: 1 },
  stickyName: { fontSize: 13, color: "#8696a0", fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  stickyPrice: { fontSize: 17, color: "#101720", fontWeight: "800", marginTop: 2 },
  stickyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#02023E",
    paddingHorizontal: 22, paddingVertical: 14,
    borderRadius: 16, minWidth: 170,
  },
  stickyBtnText: { fontSize: 15, fontWeight: "800", color: "#fff", letterSpacing: 0.2 },
});
