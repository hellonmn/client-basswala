/**
 * app/cart.tsx
 * Cart screen — review equipment items, adjust quantity/days, and check out.
 * Submits an equipment-only booking via bookingApi.create (no captainDJId).
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCart } from "../context/CartContext";
import { useAuth } from "../context/AuthContext";
import { useLocation } from "../context/LocationContext";
import { useLoginGate } from "../components/LoginGate";
import { usePhoneGate } from "../components/PhoneGate";
import { bookingApi } from "../services/userApi";
import { DateField, TimeField } from "../components/DateTimePickerField";
import SmartImage from "../components/SmartImage";
import AddressPicker from "../components/AddressPicker";
import { SavedAddress } from "../types/address";
import { computeDurationHours, validateBookingTimes } from "../utils/bookingTime";
import { usePayForBooking, useBookingFee } from "../services/bookingPayment";
import { useAlert } from "../components/AppAlert";

// ─── Field (module-level so it keeps a stable identity across re-renders,
//      which prevents the TextInput from losing focus on every keystroke) ──
const Field = React.memo(function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
}) {
  return (
    <View style={f.field}>
      <Text style={f.label}>{label}</Text>
      <TextInput
        style={f.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8696a0"
        keyboardType={keyboardType}
      />
    </View>
  );
});

export default function CartScreen() {
  const router = useRouter();
  const { items, captain, itemCount, subtotal, updateQuantity, updateDays, removeItem, clear } = useCart();
  const { isAuthenticated } = useAuth();
  const { location } = useLocation();
  const { ensureLogin } = useLoginGate();
  const { ensurePhone } = usePhoneGate();
  const payForBooking = usePayForBooking();
  const BOOKING_FEE = useBookingFee();
  const { alert: appAlert, confirm } = useAlert();

  const [showCheckout, setShowCheckout] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<SavedAddress | null>(null);
  const [form, setForm] = useState({
    eventType: "Private Party",
    eventDate: "",
    startTime: "18:00",
    endTime: "23:00",
    durationHours: "5",
    guestCount: "",
    specialRequests: "",
  });

  const handleCheckout = async () => {
    const loggedIn = await ensureLogin();
    if (!loggedIn) return;
    const ok = await ensurePhone();
    if (!ok) return;
    setShowCheckout(true);
  };

  const duration = computeDurationHours(form.startTime, form.endTime) || 1;

  const handleSubmit = async () => {
    if (!captain) {
      await appAlert({ title: "Error", message: "Cart is empty.", tone: "error" });
      return;
    }
    if (!form.eventDate) {
      await appAlert({ title: "Required", message: "Please pick the event date.", tone: "warning" });
      return;
    }
    if (!selectedAddress) {
      await appAlert({
        title: "Delivery address needed",
        message: "Please select or add a delivery address to continue.",
        tone: "warning",
      });
      return;
    }

    const timeErrors = validateBookingTimes({
      startTime: form.startTime,
      endTime: form.endTime,
      durationHours: duration,
      minimumHours: 1,
    });
    if (timeErrors.length > 0) {
      await appAlert({ title: "Check event times", message: timeErrors.join("\n"), tone: "warning" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await bookingApi.create({
        captainId: captain.id,
        equipmentItems: items.map((i) => ({
          equipmentId: i.id,
          quantity: i.quantity,
          days: i.days,
        })),
        eventType: form.eventType,
        eventDate: form.eventDate,
        startTime: form.startTime,
        endTime: form.endTime,
        durationHours: duration,
        guestCount: form.guestCount ? parseInt(form.guestCount) : undefined,
        specialRequests: form.specialRequests || undefined,
        deliveryLocation: {
          latitude: Number(selectedAddress.latitude),
          longitude: Number(selectedAddress.longitude),
          street: selectedAddress.street || undefined,
          city: selectedAddress.city,
          state: selectedAddress.state || undefined,
          zipCode: selectedAddress.zipCode || undefined,
          country: selectedAddress.country || undefined,
        },
      });

      if (!res.success) {
        await appAlert({ title: "Error", message: res.message || "Failed to create booking", tone: "error" });
        return;
      }

      const bookingId = res.data?.id;
      if (!bookingId) {
        await appAlert({ title: "Error", message: "Booking was created but no ID was returned", tone: "error" });
        return;
      }

      // ── Collect the ₹499 advance via Razorpay ─────────────────────────
      // Booking is confirmed only on successful payment. If payment fails
      // or the user dismisses, we roll back the booking so it doesn't
      // linger in a half-created state.
      const pay = await payForBooking(bookingId);

      if (pay.paid) {
        clear();
        setShowCheckout(false);
        const view = await confirm({
          title: "Booking Confirmed!",
          message: `Your equipment booking #${bookingId} is confirmed and paid.`,
          confirmText: "View Bookings",
          cancelText: "Done",
          tone: "success",
        });
        if (view) router.replace("/my-bookings" as any);
        else router.back();
      } else {
        // Roll back the booking — best-effort.
        try { await bookingApi.cancel(bookingId); } catch {}
        if (pay.cancelled) {
          await appAlert({
            title: "Payment cancelled",
            message: `You cancelled the ₹${BOOKING_FEE} payment, so the booking was not created. You can try again any time.`,
            tone: "info",
          });
        } else {
          await appAlert({
            title: "Payment failed",
            message: pay.message || "Your payment did not go through, so the booking was not created. Please try again.",
            tone: "error",
          });
        }
      }
    } catch (err: any) {
      await appAlert({
        title: "Error",
        message: err.response?.data?.message || err.message || "Failed to create booking",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <SafeAreaView style={s.container} edges={["top"]}>
        <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
          {/* Top bar */}
          <View style={s.topBar}>
            <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color="#101720" />
            </TouchableOpacity>
            <Text style={s.topBarTitle}>Your Cart</Text>
            {items.length > 0 ? (
              <TouchableOpacity
                style={s.iconBtn}
                onPress={async () => {
                  const ok = await confirm({
                    title: "Clear cart?",
                    message: "Remove all items from your cart?",
                    confirmText: "Clear",
                    cancelText: "Cancel",
                    destructive: true,
                  });
                  if (ok) clear();
                }}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 42 }} />
            )}
          </View>

          {items.length === 0 ? (
            <View style={s.emptyWrap}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="cart-outline" size={60} color="#c4c9d0" />
              </View>
              <Text style={s.emptyTitle}>Your cart is empty</Text>
              <Text style={s.emptySub}>Browse captains and add equipment to build your own package.</Text>
              <TouchableOpacity
                style={s.browseBtn}
                onPress={() => router.back()}
                activeOpacity={0.85}
              >
                <LinearGradient colors={["#02023E", "#02023E"]} style={s.browseBtnGrad}>
                  <Text style={s.browseBtnText}>Browse Captains</Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 180 }}>
                {/* Captain header */}
                {captain && (
                  <View style={s.captainHeader}>
                    <View style={s.captainHeaderIcon}>
                      <Ionicons name="storefront-outline" size={16} color="#02023E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.captainHeaderLabel}>ORDERING FROM</Text>
                      <Text style={s.captainHeaderName}>
                        {captain.businessName || "Captain"}
                        {captain.locationCity ? ` · ${captain.locationCity}` : ""}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Items */}
                <View style={{ paddingHorizontal: 16 }}>
                  {items.map((item) => {
                    const lineTotal = Number(item.dailyRate) * item.quantity * item.days;
                    const maxStock = Number(item.maxStock ?? Number.MAX_SAFE_INTEGER);
                    const atMax = item.quantity >= maxStock;
                    return (
                      <View key={item.id} style={s.itemCard}>
                        <View style={s.itemTop}>
                          <SmartImage
                            uri={item.images?.[0]}
                            style={s.itemImageWrap as any}
                            kind="equipment"
                            label={item.name}
                            iconSize={22}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                            <Text style={s.itemCat} numberOfLines={1}>
                              {item.category}
                              {item.brand ? " · " + item.brand : ""}
                            </Text>
                            <Text style={s.itemRate}>
                              ₹{Number(item.dailyRate).toLocaleString()}
                              <Text style={{ fontSize: 10, color: "#8696a0" }}> /day</Text>
                            </Text>
                            {typeof item.maxStock === "number" && (
                              <Text style={s.itemStock}>
                                <Ionicons name="cube-outline" size={10} color="#8696a0" />{" "}
                                {item.maxStock} in stock
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity onPress={() => removeItem(item.id)} style={s.removeBtn}>
                            <Ionicons name="close" size={16} color="#ef4444" />
                          </TouchableOpacity>
                        </View>

                        <View style={s.itemControls}>
                          {/* Qty */}
                          <View style={s.control}>
                            <Text style={s.controlLabel}>QTY</Text>
                            <View style={s.stepper}>
                              <TouchableOpacity
                                style={s.stepBtn}
                                onPress={() => updateQuantity(item.id, item.quantity - 1)}
                              >
                                <Ionicons name="remove" size={14} color="#02023E" />
                              </TouchableOpacity>
                              <Text style={s.stepValue}>{item.quantity}</Text>
                              <TouchableOpacity
                                style={[s.stepBtn, atMax && { opacity: 0.4 }]}
                                onPress={() => !atMax && updateQuantity(item.id, item.quantity + 1)}
                                disabled={atMax}
                              >
                                <Ionicons name="add" size={14} color="#02023E" />
                              </TouchableOpacity>
                            </View>
                          </View>
                          {/* Days */}
                          <View style={s.control}>
                            <Text style={s.controlLabel}>DAYS</Text>
                            <View style={s.stepper}>
                              <TouchableOpacity
                                style={s.stepBtn}
                                onPress={() => updateDays(item.id, item.days - 1)}
                              >
                                <Ionicons name="remove" size={14} color="#02023E" />
                              </TouchableOpacity>
                              <Text style={s.stepValue}>{item.days}</Text>
                              <TouchableOpacity
                                style={s.stepBtn}
                                onPress={() => updateDays(item.id, item.days + 1)}
                              >
                                <Ionicons name="add" size={14} color="#02023E" />
                              </TouchableOpacity>
                            </View>
                          </View>
                          <View style={{ flex: 1, alignItems: "flex-end" }}>
                            <Text style={s.lineTotalLabel}>TOTAL</Text>
                            <Text style={s.lineTotal}>₹{lineTotal.toLocaleString()}</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Bottom checkout bar */}
              <View style={s.bottomBar}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bottomBarLabel}>{itemCount} item{itemCount > 1 ? "s" : ""} · Subtotal</Text>
                  <Text style={s.bottomBarSubtotal}>₹{subtotal.toLocaleString()}</Text>
                </View>
                <TouchableOpacity style={s.checkoutBtn} onPress={handleCheckout} activeOpacity={0.85}>
                  <LinearGradient colors={["#02023E", "#02023E"]} style={s.checkoutBtnGrad}>
                    <Text style={s.checkoutBtnText}>Checkout</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </>
          )}
        </LinearGradient>
      </SafeAreaView>

      {/* Checkout modal */}
      <Modal visible={showCheckout} transparent animationType="slide" onRequestClose={() => setShowCheckout(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
        <View style={f.overlay}>
          <View style={f.sheet}>
            <View style={f.topRow}>
              <View>
                <Text style={f.title}>Checkout</Text>
                <Text style={f.sub}>{itemCount} items · ₹{subtotal.toLocaleString()}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCheckout(false)} style={f.closeBtn}>
                <Ionicons name="close" size={20} color="#101720" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={f.field}>
                <Text style={f.label}>Event Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {["Wedding", "Birthday", "Corporate", "Private Party", "Club", "Other"].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setForm((p) => ({ ...p, eventType: t }))}
                        style={[f.chip, form.eventType === t && f.chipActive]}
                        activeOpacity={0.8}
                      >
                        <Text style={[f.chipText, form.eventType === t && f.chipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              <DateField
                label="Event Date *"
                value={form.eventDate}
                onChange={(v) => setForm((p) => ({ ...p, eventDate: v }))}
              />

              <View style={f.row}>
                <View style={{ flex: 1 }}>
                  <TimeField
                    label="Start Time"
                    value={form.startTime}
                    onChange={(v) => setForm((p) => ({ ...p, startTime: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TimeField
                    label="End Time"
                    value={form.endTime}
                    onChange={(v) => setForm((p) => ({ ...p, endTime: v }))}
                  />
                </View>
              </View>
              {/* Duration auto-computed from start/end and locked */}
              <View style={f.field}>
                <Text style={f.label}>DURATION</Text>
                <View style={f.durationChip}>
                  <Ionicons name="time-outline" size={16} color="#02023E" />
                  <Text style={f.durationText}>
                    {duration} {duration === 1 ? "hour" : "hours"}
                  </Text>
                </View>
              </View>

              <AddressPicker value={selectedAddress} onChange={setSelectedAddress} />

              <Field label="Special Requests" value={form.specialRequests}
                onChangeText={(v: string) => setForm((p) => ({ ...p, specialRequests: v }))}
                placeholder="Any setup requests..." />

              {/* Order summary */}
              <View style={f.summary}>
                <Text style={f.summaryTitle}>Order Summary</Text>
                {items.map((item) => (
                  <View key={item.id} style={f.summaryRow}>
                    <Text style={f.summaryKey} numberOfLines={1}>
                      {item.name} × {item.quantity} × {item.days}d
                    </Text>
                    <Text style={f.summaryVal}>
                      ₹{(Number(item.dailyRate) * item.quantity * item.days).toLocaleString()}
                    </Text>
                  </View>
                ))}
                <View style={[f.summaryRow, f.summaryTotalRow]}>
                  <Text style={f.summaryTotalKey}>Subtotal</Text>
                  <Text style={f.summaryTotalVal}>₹{subtotal.toLocaleString()}</Text>
                </View>
                <Text style={f.balanceNote}>
                  Balance is collected by the captain on the event day.
                </Text>
                {/* Advance booking fee charged now */}
                <View style={f.feeCallout}>
                  <View style={f.feeCalloutLeft}>
                    <Ionicons name="flash" size={14} color="#02023E" />
                    <View style={{ flex: 1 }}>
                      <Text style={f.feeCalloutLabel}>Pay now to confirm</Text>
                      <Text style={f.feeCalloutSub}>Non-refundable booking fee</Text>
                    </View>
                  </View>
                  <Text style={f.feeCalloutValue}>₹{BOOKING_FEE.toLocaleString()}</Text>
                </View>
              </View>

              <TouchableOpacity style={f.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
                <LinearGradient colors={["#02023E", "#02023E"]} style={f.submitBtnGrad}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="lock-closed" size={18} color="#fff" />
                      <Text style={f.submitBtnText}>Pay ₹{BOOKING_FEE} & Confirm</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  iconBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  topBarTitle: { fontSize: 18, fontWeight: "800", color: "#101720" },

  // Empty
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 120, height: 120, borderRadius: 36, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginBottom: 20,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: "#101720" },
  emptySub: { fontSize: 13, color: "#8696a0", textAlign: "center", marginTop: 6, lineHeight: 19 },
  browseBtn: { marginTop: 24, borderRadius: 16, overflow: "hidden" },
  browseBtnGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 14, paddingHorizontal: 24 },
  browseBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },

  // Captain header
  captainHeader: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 16, marginBottom: 12,
    padding: 14, backgroundColor: "#f0fffe", borderRadius: 14,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  captainHeaderIcon: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  captainHeaderLabel: { fontSize: 10, fontWeight: "800", color: "#02023E", letterSpacing: 0.5 },
  captainHeaderName: { fontSize: 14, fontWeight: "800", color: "#101720", marginTop: 2 },

  // Item
  itemCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: "#eef0f3",
  },
  itemTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  itemImageWrap: {
    width: 62, height: 62, borderRadius: 14,
    backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  itemImage: { width: "100%", height: "100%" },
  itemName: { fontSize: 14, fontWeight: "800", color: "#101720" },
  itemCat: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  itemRate: { fontSize: 13, fontWeight: "800", color: "#02023E", marginTop: 4 },
  itemStock: { fontSize: 10, color: "#8696a0", fontWeight: "600", marginTop: 3 },
  removeBtn: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: "#fef2f2",
    alignItems: "center", justifyContent: "center",
  },

  itemControls: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "#f4f4f4",
  },
  control: { alignItems: "flex-start" },
  controlLabel: { fontSize: 9, fontWeight: "800", color: "#8696a0", letterSpacing: 0.3, marginBottom: 4 },
  stepper: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f0fffe", borderRadius: 10, padding: 3,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  stepBtn: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  stepValue: { fontSize: 12, fontWeight: "800", color: "#101720", minWidth: 22, textAlign: "center" },
  lineTotalLabel: { fontSize: 9, fontWeight: "800", color: "#8696a0", letterSpacing: 0.3 },
  lineTotal: { fontSize: 16, fontWeight: "800", color: "#02023E", marginTop: 2 },

  // Bottom bar
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  bottomBarLabel: { fontSize: 11, color: "#8696a0", fontWeight: "600" },
  bottomBarSubtotal: { fontSize: 22, fontWeight: "800", color: "#02023E", marginTop: 2 },
  checkoutBtn: { borderRadius: 14, overflow: "hidden" },
  checkoutBtnGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 14, paddingHorizontal: 22 },
  checkoutBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});

// Checkout modal styles
const f = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingTop: 16, maxHeight: "92%",
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "800", color: "#101720" },
  sub: { fontSize: 13, color: "#8696a0", fontWeight: "600", marginTop: 3 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#f4f8ff", alignItems: "center", justifyContent: "center",
  },
  field: { marginBottom: 14 },
  label: { fontSize: 11, fontWeight: "700", color: "#5a6169", marginBottom: 7, letterSpacing: 0.3 },
  input: {
    borderWidth: 1, borderColor: "#eef0f3", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#101720",
  },
  row: { flexDirection: "row", gap: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "#f4f8ff", borderWidth: 1, borderColor: "#eef0f3",
  },
  chipActive: { backgroundColor: "#02023E", borderColor: "#02023E" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#8696a0" },
  chipTextActive: { color: "#fff" },
  summary: {
    backgroundColor: "#f8fafc", borderRadius: 16, padding: 14,
    marginTop: 8, marginBottom: 16, borderWidth: 1, borderColor: "#eef0f3",
  },
  summaryTitle: { fontSize: 13, fontWeight: "800", color: "#101720", marginBottom: 10 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  summaryKey: { fontSize: 12, color: "#5a6169", fontWeight: "500", flex: 1, marginRight: 8 },
  summaryVal: { fontSize: 12, fontWeight: "700", color: "#101720" },
  summaryTotalRow: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#eef0f3" },
  summaryTotalKey: { fontSize: 15, fontWeight: "800", color: "#101720" },
  summaryTotalVal: { fontSize: 18, fontWeight: "800", color: "#02023E" },
  balanceNote: {
    fontSize: 10, color: "#8696a0", fontWeight: "500",
    textAlign: "right", marginTop: 3,
  },
  feeCallout: {
    flexDirection: "row", alignItems: "center",
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  feeCalloutLeft: {
    flexDirection: "row", alignItems: "center", gap: 8, flex: 1,
  },
  feeCalloutLabel: { fontSize: 12, fontWeight: "800", color: "#101720" },
  feeCalloutSub: { fontSize: 10, color: "#8696a0", fontWeight: "600", marginTop: 1 },
  feeCalloutValue: { fontSize: 20, fontWeight: "800", color: "#02023E" },
  durationChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f0fffe", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  durationText: { fontSize: 14, fontWeight: "800", color: "#02023E" },
  submitBtn: { borderRadius: 16, overflow: "hidden" },
  submitBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 8 },
  submitBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
