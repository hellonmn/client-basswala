import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  RefreshControl,
  NativeSyntheticEvent,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { servicesApi, bookingApi, chatApi } from "../services/userApi";
import SmartImage from "../components/SmartImage";
import CaptainAvatar from "../components/CaptainAvatar";
import PressableScale from "../components/PressableScale";
import { useAuth } from "../context/AuthContext";
import { useLoginGate } from "../components/LoginGate";
import { usePhoneGate } from "../components/PhoneGate";
import { shareDJ } from "../utils/share";
import { useLocation } from "../context/LocationContext";
import { useSaved } from "../context/SavedContext";
import { DateField, TimeField } from "../components/DateTimePickerField";
import AddressPicker from "../components/AddressPicker";
import { SavedAddress } from "../types/address";
import { computeDurationHours, validateBookingTimes } from "../utils/bookingTime";
import { sanitizeInt } from "../utils/input";
import { usePayForBooking, useBookingFee } from "../services/bookingPayment";
import { useAlert } from "../components/AppAlert";

// BOOKING_FEE used to be hardcoded here. It's now admin-editable from
// /admin/settings → Booking Fee. Use the `useBookingFee()` hook inside
// any component that displays the fee, so changes go live without a release.

const { width } = Dimensions.get("window");

interface EquipmentItem {
  id: number;
  name: string;
  category: string;
  brand?: string;
  dailyRate: number;
  hourlyRate?: number;
  images?: string[];
  isAvailable?: boolean;
  quantity?: number;          // total units owned
  availableQuantity?: number; // units currently in stock
}

interface CaptainDJ {
  id: number;
  name: string;
  bio?: string;
  genres: string[];
  experienceYears: number;
  hourlyRate: number;
  minimumHours: number;
  currency: string;
  isAvailable: boolean;
  specializations: string[];
  ratingAverage: number;
  ratingCount: number;
  images: string[];
  profilePicture?: string;
  equipment?: number[];
  equipmentDetails?: EquipmentItem[]; // populated by backend
  captain?: {
    id: number;
    businessName?: string;
    locationCity?: string;
    locationState?: string;
    latitude?: number;
    longitude?: number;
  };
}

// ─── Skeleton shimmer ─────────────────────────────────────────────────────────
const useShimmer = () => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);
  return anim.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.8] });
};

const SkBox = ({ w, h, radius = 10, style }: { w: any; h: number; radius?: number; style?: any }) => {
  const opacity = useShimmer();
  return (
    <Animated.View
      style={[
        { width: w, height: h, borderRadius: radius, backgroundColor: "#dce3ed", opacity },
        style,
      ]}
    />
  );
};

const DJDetailSkeleton = () => (
  <View style={{ padding: 20, alignItems: "center" }}>
    <SkBox w={100} h={100} radius={32} style={{ marginBottom: 14 }} />
    <SkBox w={200} h={24} radius={8} style={{ marginBottom: 8 }} />
    <SkBox w={140} h={14} radius={6} style={{ marginBottom: 14 }} />
    <View style={{ flexDirection: "row", gap: 8 }}>
      <SkBox w={120} h={30} radius={15} />
      <SkBox w={100} h={30} radius={15} />
    </View>

    {/* Stats */}
    <View style={{ flexDirection: "row", gap: 0, marginTop: 22, backgroundColor: "#fff", borderRadius: 20, padding: 16, alignSelf: "stretch", borderWidth: 1, borderColor: "#eef0f3" }}>
      <View style={{ flex: 1, alignItems: "center", gap: 6 }}>
        <SkBox w={60} h={22} radius={6} />
        <SkBox w={50} h={10} radius={5} />
      </View>
      <View style={{ flex: 1, alignItems: "center", gap: 6 }}>
        <SkBox w={60} h={22} radius={6} />
        <SkBox w={50} h={10} radius={5} />
      </View>
      <View style={{ flex: 1, alignItems: "center", gap: 6 }}>
        <SkBox w={60} h={22} radius={6} />
        <SkBox w={50} h={10} radius={5} />
      </View>
    </View>

    {/* Sections */}
    <View style={{ alignSelf: "stretch", marginTop: 20, gap: 10 }}>
      <SkBox w={100} h={18} radius={8} />
      <SkBox w="100%" h={70} radius={16} />
      <SkBox w="100%" h={70} radius={16} />
    </View>
  </View>
);

// ─── Field (module-level — stable identity prevents TextInput remount
//     which was causing the keyboard to dismiss after every keystroke) ──
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
    <View style={bS.field}>
      <Text style={bS.label}>{label}</Text>
      <TextInput
        style={bS.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8696a0"
        keyboardType={keyboardType}
      />
    </View>
  );
});

// ─── Booking Modal ─────────────────────────────────────────────────────────────
const BookingModal = ({
  visible,
  dj,
  captainId,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  dj: CaptainDJ | null;
  captainId: number;
  onClose: () => void;
  onSuccess: (bookingId: number) => void;
}) => {
  const { location } = useLocation();
  const payForBooking = usePayForBooking();
  const BOOKING_FEE = useBookingFee();
  const { alert: appAlert } = useAlert();
  const [submitting, setSubmitting] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<SavedAddress | null>(null);
  const [form, setForm] = useState({
    eventType: "Wedding",
    eventDate: "",
    startTime: "18:00",
    endTime: "23:00",
    durationHours: "5",
    guestCount: "",
    specialRequests: "",
  });

  // ── Extra equipment (add-ons the user picks to augment the DJ package) ──
  const [captainEquipment, setCaptainEquipment] = useState<EquipmentItem[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [showExtrasPicker, setShowExtrasPicker] = useState(false);
  // Map of equipmentId → quantity selected as an extra (excludes package items)
  const [extraItems, setExtraItems] = useState<Record<number, number>>({});

  // Fetch the captain's full equipment catalogue when the modal opens
  useEffect(() => {
    if (!visible || !captainId) return;
    setLoadingExtras(true);
    servicesApi
      .getCaptainEquipment(captainId)
      .then((res: any) => {
        if (res?.success) setCaptainEquipment(res.data || []);
      })
      .catch(() => setCaptainEquipment([]))
      .finally(() => setLoadingExtras(false));
  }, [visible, captainId]);

  // Reset extras when modal closes
  useEffect(() => {
    if (!visible) setExtraItems({});
  }, [visible]);

  if (!dj) return null;

  const hourlyRate = Number(dj.hourlyRate);
  // Duration is computed from start/end and LOCKED — users can't submit
  // contradictory values like "18:00–18:30 for 5 hours". The field is
  // read-only in the UI (see below).
  const computedDuration = computeDurationHours(form.startTime, form.endTime);
  const duration = computedDuration > 0 ? computedDuration : dj.minimumHours;
  const djFee = hourlyRate * duration;

  // IDs already bundled in the DJ package — don't allow them as paid extras
  const djEquipmentDetails = Array.isArray(dj.equipmentDetails) ? dj.equipmentDetails : [];
  const packageEquipmentIds = new Set(djEquipmentDetails.map((e) => e.id));
  const addOnCatalogue = captainEquipment.filter((e) => !packageEquipmentIds.has(e.id));

  // Compute extras fee (daily rate * days — backend uses 1 day default)
  const extraDetails = Object.entries(extraItems)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const item = captainEquipment.find((e) => e.id === Number(id));
      if (!item) return null;
      const rate = Number(item.dailyRate) || 0;
      return { item, quantity: qty, itemTotal: rate * qty };
    })
    .filter(Boolean) as { item: EquipmentItem; quantity: number; itemTotal: number }[];

  // Events longer than 24h span multiple days — charge the extras accordingly.
  // Otherwise we default to 1 day (a standard evening event).
  const eventDays = Math.max(1, Math.ceil(duration / 24));
  const extrasFee = extraDetails.reduce((sum, x) => sum + x.itemTotal * eventDays, 0);
  const totalFee = djFee + extrasFee;

  const bumpExtra = (id: number, delta: number) => {
    setExtraItems((prev) => {
      const next = { ...prev };
      const current = next[id] || 0;
      // Cap the quantity at this item's real available stock
      const item = captainEquipment.find((e) => e.id === id);
      const maxStock = Number(item?.availableQuantity ?? item?.quantity ?? 0);
      const requested = current + delta;
      const updated = Math.max(0, maxStock > 0 ? Math.min(requested, maxStock) : 0);
      if (updated === 0) delete next[id];
      else next[id] = updated;
      return next;
    });
  };

  const handleSubmit = async () => {
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
      minimumHours: dj.minimumHours,
    });
    if (timeErrors.length > 0) {
      await appAlert({ title: "Check event times", message: timeErrors.join("\n"), tone: "warning" });
      return;
    }

    setSubmitting(true);
    try {
      const equipmentItemsPayload = extraDetails.map(({ item, quantity }) => ({
        equipmentId: item.id,
        quantity,
        days: eventDays,
      }));

      const res = await bookingApi.create({
        captainId,
        captainDJId: dj.id,
        equipmentItems: equipmentItemsPayload.length > 0 ? equipmentItemsPayload : undefined,
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
        onSuccess(bookingId);
      } else {
        // Roll back the booking — best-effort, ignore network errors.
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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
      <View style={bS.overlay}>
        <View style={bS.sheet}>
          <View style={bS.sheetHandle} />
          <View style={bS.topRow}>
            <View>
              <Text style={bS.title}>Book {dj.name}</Text>
              <Text style={bS.sub}>₹{hourlyRate.toLocaleString()}/hr · Min {dj.minimumHours}h</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={bS.closeBtn}>
              <Ionicons name="close" size={20} color="#101720" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={[bS.sectionHeader, { marginTop: 8 }]}>Event details</Text>
            <View style={bS.sectionCard}>
            {/* Event Type */}
            <View style={bS.field}>
              <Text style={bS.label}>Event Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {bookingApi.EVENT_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setForm(p => ({ ...p, eventType: t }))}
                      style={[bS.typeChip, form.eventType === t && bS.typeChipActive]}
                      activeOpacity={0.8}
                    >
                      <Text style={[bS.typeChipText, form.eventType === t && bS.typeChipTextActive]}>{t}</Text>
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

            <View style={bS.rowFields}>
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
            {/* Duration is auto-computed from start/end — subtle caption, not a field */}
            <View style={bS.durationNote}>
              <Ionicons name="time-outline" size={14} color="#8696a0" />
              <Text style={bS.durationNoteText}>
                Duration: {duration} {duration === 1 ? "hour" : "hours"}
              </Text>
              {duration < dj.minimumHours && (
                <Text style={bS.durationWarn}>· min {dj.minimumHours}h required</Text>
              )}
            </View>

            <View style={bS.fieldLast}>
              <Field label="Guest Count" value={form.guestCount}
                onChangeText={(v: string) => setForm(p => ({ ...p, guestCount: sanitizeInt(v, 0, 100000) }))}
                placeholder="100" keyboardType="numeric" />
            </View>
            </View>{/* end Event details card */}

            <Text style={bS.sectionHeader}>Delivery & preferences</Text>
            <View style={bS.sectionCard}>
              {/* ── Delivery Address (saved addresses) ── */}
              <AddressPicker value={selectedAddress} onChange={setSelectedAddress} />
              <View style={bS.fieldLast}>
                <Field label="Special Requests" value={form.specialRequests}
                  onChangeText={(v: string) => setForm(p => ({ ...p, specialRequests: v }))}
                  placeholder="Song preferences, dress code..." />
              </View>
            </View>{/* end delivery card */}

            <Text style={bS.sectionHeader}>Equipment & add-ons</Text>
            <View style={bS.sectionCard}>

            {/* ── Package includes (read-only) — clean green pills ── */}
            {djEquipmentDetails.length > 0 && (
              <View style={bS.field}>
                <Text style={bS.label}>Included in package</Text>
                <View style={bS.includedWrap}>
                  {djEquipmentDetails.map((item) => (
                    <View key={item.id} style={bS.includedChip}>
                      <Ionicons name="checkmark-circle" size={13} color="#16a34a" />
                      <Text style={bS.includedChipText} numberOfLines={1}>{item.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* ── Add Extra Equipment — light teal action row ── */}
            <TouchableOpacity
              style={[bS.addExtraBtn, extraDetails.length > 0 && bS.addExtraBtnActive]}
              onPress={() => setShowExtrasPicker(true)}
              activeOpacity={0.85}
            >
              <View style={bS.addExtraIconWrap}>
                <Ionicons name={extraDetails.length === 0 ? "add" : "create-outline"} size={20} color="#0a7d80" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={bS.addExtraTitle}>
                  {extraDetails.length === 0 ? "Add extra equipment" : `${extraDetails.length} extra${extraDetails.length > 1 ? "s" : ""} added`}
                </Text>
                <Text style={bS.addExtraSub}>
                  {extraDetails.length === 0
                    ? "Speakers, lights, mics & more"
                    : `+ ₹${extrasFee.toLocaleString()} · tap to edit`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#0a7d80" />
            </TouchableOpacity>

            {extraDetails.length > 0 && (
              <View style={bS.extrasList}>
                {extraDetails.map(({ item, quantity, itemTotal }) => (
                  <View key={item.id} style={bS.extraRow}>
                    <View style={bS.extraIcon}>
                      <Ionicons name="hardware-chip-outline" size={14} color="#02023E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={bS.extraName} numberOfLines={1}>{item.name}</Text>
                      <Text style={bS.extraMeta}>
                        {quantity} × ₹{Number(item.dailyRate).toLocaleString()}/day
                        {eventDays > 1 ? ` × ${eventDays}d` : ""}
                      </Text>
                    </View>
                    <Text style={bS.extraTotal}>
                      ₹{(itemTotal * eventDays).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            </View>{/* end equipment card */}

            {/* Pricing summary */}
            <Text style={bS.sectionHeader}>Price summary</Text>
            <View style={bS.priceSummary}>
              <View style={bS.priceRow}>
                <Text style={bS.priceKey}>DJ Fee ({duration}h × ₹{hourlyRate.toLocaleString()})</Text>
                <Text style={bS.priceVal}>₹{djFee.toLocaleString()}</Text>
              </View>
              {extrasFee > 0 && (
                <View style={bS.priceRow}>
                  <Text style={bS.priceKey}>Extra Equipment</Text>
                  <Text style={bS.priceVal}>₹{extrasFee.toLocaleString()}</Text>
                </View>
              )}
              <View style={[bS.priceRow, bS.totalRow]}>
                <Text style={bS.totalKey}>Estimated Total</Text>
                <Text style={bS.totalVal}>₹{totalFee.toLocaleString()}</Text>
              </View>
              <Text style={bS.remainingNote}>
                Balance is collected by the captain on the event day.
              </Text>

              {/* Booking fee (paid now) */}
              <View style={bS.feeCallout}>
                <View style={bS.feeCalloutLeft}>
                  <Ionicons name="flash" size={14} color="#02023E" />
                  <View style={{ flex: 1 }}>
                    <Text style={bS.feeCalloutLabel}>Pay now to confirm</Text>
                    <Text style={bS.feeCalloutSub}>Non-refundable booking fee</Text>
                  </View>
                </View>
                <Text style={bS.feeCalloutValue}>₹{BOOKING_FEE.toLocaleString()}</Text>
              </View>
            </View>

            <TouchableOpacity style={bS.submitBtn} onPress={handleSubmit} disabled={submitting} activeOpacity={0.8}>
              <LinearGradient colors={["#02023E", "#02023E"]} style={bS.submitBtnGrad}>
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                    <Ionicons name="lock-closed" size={18} color="#fff" />
                    <Text style={bS.submitBtnText}>Pay ₹{BOOKING_FEE} & Confirm</Text>
                  </>
                }
              </LinearGradient>
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>

      {/* ── Extras Picker Modal ── */}
      <Modal
        visible={showExtrasPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowExtrasPicker(false)}
      >
        <View style={bS.overlay}>
          <View style={bS.sheet}>
            <View style={bS.topRow}>
              <View>
                <Text style={bS.title}>Add Extra Equipment</Text>
                <Text style={bS.sub}>
                  From {dj.captain?.businessName || "this captain"}'s inventory
                </Text>
              </View>
              <TouchableOpacity onPress={() => setShowExtrasPicker(false)} style={bS.closeBtn}>
                <Ionicons name="close" size={20} color="#101720" />
              </TouchableOpacity>
            </View>

            {loadingExtras ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator size="large" color="#02023E" />
              </View>
            ) : addOnCatalogue.length === 0 ? (
              <View style={{ padding: 40, alignItems: "center", gap: 10 }}>
                <Ionicons name="hardware-chip-outline" size={44} color="#c4c9d0" />
                <Text style={{ color: "#8696a0", fontWeight: "700", fontSize: 14 }}>
                  No extra equipment available
                </Text>
                <Text style={{ color: "#8696a0", fontSize: 12, textAlign: "center" }}>
                  Everything from this captain is already in the package.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
                {addOnCatalogue.map((item) => {
                  const qty = extraItems[item.id] || 0;
                  const selected = qty > 0;
                  const stock = Number(item.availableQuantity ?? item.quantity ?? 0);
                  const outOfStock = stock <= 0;
                  const atMax = qty >= stock;
                  return (
                    <View
                      key={item.id}
                      style={[
                        bS.pickerRow,
                        selected && bS.pickerRowSelected,
                        outOfStock && { opacity: 0.55 },
                      ]}
                    >
                      <View style={[bS.pickerIcon, selected && { backgroundColor: "#02023E" }]}>
                        <Ionicons
                          name="hardware-chip-outline"
                          size={18}
                          color={selected ? "#fff" : "#02023E"}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={bS.pickerName} numberOfLines={1}>{item.name}</Text>
                        <Text style={bS.pickerMeta}>
                          {item.category}
                          {item.brand ? " · " + item.brand : ""}
                        </Text>
                        <View style={bS.stockRow}>
                          <Text style={bS.pickerPrice}>
                            ₹{Number(item.dailyRate).toLocaleString()}
                            <Text style={bS.pickerPriceUnit}> /day</Text>
                          </Text>
                          <View
                            style={[
                              bS.stockPill,
                              outOfStock
                                ? { backgroundColor: "#fef2f2", borderColor: "#fecaca" }
                                : stock <= 2
                                ? { backgroundColor: "#fffbeb", borderColor: "#fde68a" }
                                : { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
                            ]}
                          >
                            <View
                              style={[
                                bS.stockDot,
                                {
                                  backgroundColor: outOfStock
                                    ? "#ef4444"
                                    : stock <= 2
                                    ? "#f59e0b"
                                    : "#22c55e",
                                },
                              ]}
                            />
                            <Text
                              style={[
                                bS.stockText,
                                {
                                  color: outOfStock
                                    ? "#ef4444"
                                    : stock <= 2
                                    ? "#d97706"
                                    : "#16a34a",
                                },
                              ]}
                            >
                              {outOfStock
                                ? "Out of stock"
                                : stock <= 2
                                ? `Only ${stock} left`
                                : `${stock} in stock`}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {outOfStock ? (
                        <View style={bS.outBadge}>
                          <Text style={bS.outBadgeText}>N/A</Text>
                        </View>
                      ) : qty > 0 ? (
                        <View style={bS.stepper}>
                          <TouchableOpacity
                            style={bS.stepperBtn}
                            onPress={() => bumpExtra(item.id, -1)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="remove" size={16} color="#02023E" />
                          </TouchableOpacity>
                          <Text style={bS.stepperValue}>{qty}</Text>
                          <TouchableOpacity
                            style={[bS.stepperBtn, atMax && { opacity: 0.4 }]}
                            onPress={() => !atMax && bumpExtra(item.id, 1)}
                            disabled={atMax}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add" size={16} color="#02023E" />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={bS.addSmallBtn}
                          onPress={() => bumpExtra(item.id, 1)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="add" size={14} color="#fff" />
                          <Text style={bS.addSmallBtnText}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <View style={bS.extrasFooter}>
              <View style={{ flex: 1 }}>
                <Text style={bS.extrasFooterLabel}>Extras Total</Text>
                <Text style={bS.extrasFooterValue}>₹{extrasFee.toLocaleString()}</Text>
              </View>
              <TouchableOpacity
                style={[bS.submitBtn, { flex: 1 }]}
                onPress={() => setShowExtrasPicker(false)}
                activeOpacity={0.8}
              >
                <LinearGradient colors={["#02023E", "#02023E"]} style={bS.submitBtnGrad}>
                  <Ionicons name="checkmark" size={16} color="#fff" />
                  <Text style={bS.submitBtnText}>
                    Done ({extraDetails.length})
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <View style={{ height: 12 }} />
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DJDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isAuthenticated } = useAuth();
  const { ensureLogin } = useLoginGate();
  const { ensurePhone } = usePhoneGate();
  const { isDJSaved, toggleDJ } = useSaved();
  const { confirm } = useAlert();
  const djId = parseInt(params.djId as string);
  const captainId = parseInt(params.captainId as string);

  const [dj, setDj] = useState<CaptainDJ | null>(null);
  const [captainInfo, setCaptainInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const isSaved = !isNaN(djId) && isDJSaved(djId);

  const fetchDJ = React.useCallback(async () => {
    try {
      const res = await servicesApi.getAllDJs();
      let found: any = null;
      if (res.success) {
        found = (res.data || []).find((d: CaptainDJ) => d.id === djId);
        if (found) setDj(found);
      }
      // Resolve the captain id (URL param first, then the loaded DJ) and
      // fetch the full captain — needed for the "owned by" card AND for the
      // captain's `userId` which the chat API requires.
      const cid = (Number.isFinite(captainId) && captainId > 0)
        ? captainId
        : Number(found?.captain?.id);
      if (cid && Number.isFinite(cid)) {
        const capRes = await servicesApi.getCaptainById(cid);
        if (capRes?.success) setCaptainInfo(capRes.data);
      }
    } catch (err) {
      console.error("fetchDJ error:", err);
    }
  }, [djId, captainId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchDJ();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchDJ]);

  const onRefreshDJ = React.useCallback(async () => {
    setRefreshing(true);
    await fetchDJ();
    setRefreshing(false);
  }, [fetchDJ]);

  const handleBookPress = async () => {
    const loggedIn = await ensureLogin();
    if (!loggedIn) return;
    const phoneOk = await ensurePhone();
    if (!phoneOk) return;
    setShowBooking(true);
  };

  const handleBookingSuccess = async (bookingId: number) => {
    setShowBooking(false);
    const view = await confirm({
      title: "Booking Confirmed!",
      message: `Your booking #${bookingId} has been created. The captain will confirm soon.`,
      confirmText: "View My Bookings",
      cancelText: "Done",
      tone: "success",
    });
    if (view) router.push("/my-bookings" as any);
  };

  if (loading) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f4f8ff" }} edges={["top"]}>
      <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#101720" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Loading...</Text>
          <View style={{ width: 42 }} />
        </View>
        <DJDetailSkeleton />
      </LinearGradient>
    </SafeAreaView>
  );

  if (!dj) return (
    <SafeAreaView style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f4f8ff" }}>
      <Ionicons name="musical-notes-outline" size={48} color="#c4c9d0" />
      <Text style={{ fontSize: 18, fontWeight: "700", color: "#101720", marginTop: 12 }}>DJ not found</Text>
      <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
        <Text style={{ color: "#02023E", fontWeight: "600" }}>Go Back</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  const totalMin = Number(dj.hourlyRate) * dj.minimumHours;

  // Defensive JSON parsing — Sequelize JSON columns can arrive as strings
  const safeParseArray = (val: any): any[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  };
  const djGenres = safeParseArray((dj as any).genres);
  const djSpecs = safeParseArray((dj as any).specializations);
  const djPackageEquipment = Array.isArray(dj.equipmentDetails) ? dj.equipmentDetails : [];

  return (
    <>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <View style={styles.container}>
        <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
          {/* Overlay Top Bar — floats on top of the image gallery */}
          <SafeAreaView edges={["top"]} style={styles.overlayTopBarWrap} pointerEvents="box-none">
            <View style={styles.overlayTopBar}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.overlayIconBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-back" size={20} color="#101720" />
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => dj && shareDJ({
                    djId,
                    captainId: Number(dj.captain?.id ?? captainId ?? 0),
                    djName: dj.name,
                    hourlyRate: dj.hourlyRate,
                  })}
                  style={styles.overlayIconBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons name="share-social-outline" size={20} color="#101720" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => toggleDJ(djId)}
                  style={styles.overlayIconBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={isSaved ? "heart" : "heart-outline"}
                    size={20}
                    color={isSaved ? "#ef4444" : "#101720"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefreshDJ}
                tintColor="#02023E"
                colors={["#02023E"]}
              />
            }
          >
            {/* ── Image Gallery — captain-uploaded photos ── */}
            {(() => {
              // Parse uploaded images from the DJ — backend may return array OR JSON string
              let imgs: string[] = [];
              const raw: any = (dj as any).images;
              if (Array.isArray(raw)) imgs = raw;
              else if (typeof raw === "string") {
                try { const p = JSON.parse(raw); imgs = Array.isArray(p) ? p : []; } catch { imgs = []; }
              }
              imgs = imgs.filter((u) => typeof u === "string" && u.trim().length > 0);

              // Gallery empty → fall back to the captain's profile picture,
              // matching the Home screen card behaviour (some captains only
              // upload a profile photo and skip the gallery).
              if (imgs.length === 0) {
                const pfp = (dj as any).profilePicture;
                if (typeof pfp === "string" && pfp.trim().length > 0) imgs = [pfp];
              }

              // Still no image → show a single placeholder thumbnail
              if (imgs.length === 0) {
                return (
                  <View style={styles.gallery}>
                    <LinearGradient
                      colors={dj.isAvailable ? ["#02023E", "#04c9ce", "#088786"] : ["#5a6169", "#3d4652"]}
                      style={styles.galleryImg}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                    >
                      <View style={styles.placeholderInner}>
                        <Ionicons name="musical-notes" size={64} color="rgba(255,255,255,0.85)" />
                        <Text style={styles.placeholderText}>{dj.name}</Text>
                        <Text style={styles.placeholderSub}>No photos uploaded</Text>
                      </View>
                    </LinearGradient>
                    <LinearGradient
                      colors={["transparent", "rgba(16,23,32,0.85)"]}
                      style={styles.galleryGrad}
                      pointerEvents="none"
                    />
                  </View>
                );
              }

              return (
                <View style={styles.gallery}>
                  <FlatList
                    data={imgs}
                    horizontal
                    pagingEnabled
                    style={styles.galleryList}
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(_, i) => String(i)}
                    onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / width);
                      if (idx !== imgIndex) setImgIndex(idx);
                    }}
                    scrollEventThrottle={16}
                    renderItem={({ item }) => (
                      // SmartImage normalises ngrok / cross-environment
                      // hosts to the current API base and falls back to
                      // a branded placeholder if the image 404s.
                      <SmartImage uri={item} style={[styles.galleryImg, { width }]} kind="dj" label={dj.name} iconSize={64} />
                    )}
                  />
                  {/* Bottom gradient for legibility */}
                  <LinearGradient
                    colors={["transparent", "rgba(16,23,32,0.85)"]}
                    style={styles.galleryGrad}
                    pointerEvents="none"
                  />
                  {/* Dots indicator */}
                  {imgs.length > 1 && (
                    <View style={styles.galleryDots}>
                      {imgs.map((_, i) => (
                        <View
                          key={i}
                          style={[
                            styles.galleryDot,
                            i === imgIndex && styles.galleryDotActive,
                          ]}
                        />
                      ))}
                    </View>
                  )}
                  {/* Image counter */}
                  {imgs.length > 1 && (
                    <View style={styles.galleryCounter}>
                      <Ionicons name="images-outline" size={11} color="#fff" />
                      <Text style={styles.galleryCounterText}>
                        {imgIndex + 1} / {imgs.length}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            {/* ── Rounded content sheet that overlaps the hero image ── */}
            <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            {/* ── Name + meta below image ── */}
            <View style={styles.heroMetaSection}>
              <Text style={styles.heroName}>{dj.name}</Text>
              {dj.captain?.businessName ? (
                <View style={styles.heroMeta}>
                  <Ionicons name="storefront-outline" size={14} color="#8696a0" />
                  <Text style={styles.heroMetaText}>{dj.captain.businessName}</Text>
                  {dj.captain.locationCity ? <>
                    <Text style={styles.dot}>·</Text>
                    <Ionicons name="location-outline" size={14} color="#8696a0" />
                    <Text style={styles.heroMetaText}>{dj.captain.locationCity}</Text>
                  </> : null}
                </View>
              ) : null}

              {/* Rating + avail */}
              <View style={styles.badgeRow}>
                {dj.ratingCount > 0 ? (
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={12} color="#fff" />
                    <Text style={styles.ratingBadgeText}>{Number(dj.ratingAverage).toFixed(1)}</Text>
                    <Text style={styles.ratingBadgeCount}>· {dj.ratingCount} ratings</Text>
                  </View>
                ) : null}
                <View style={[styles.availBadge, { backgroundColor: dj.isAvailable ? "#f0fdf4" : "#fef2f2" }]}>
                  <View style={[styles.availDot, { backgroundColor: dj.isAvailable ? "#22c55e" : "#ef4444" }]} />
                  <Text style={[styles.availBadgeText, { color: dj.isAvailable ? "#22c55e" : "#ef4444" }]}>
                    {dj.isAvailable ? "Available" : "Currently Busy"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="pricetag" size={16} color="#0a7d80" />
                </View>
                <Text style={styles.statVal}>₹{Number(dj.hourlyRate).toLocaleString()}</Text>
                <Text style={styles.statLbl}>Per Hour</Text>
              </View>
              <View style={styles.statDiv} />
              <View style={styles.stat}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="time" size={16} color="#0a7d80" />
                </View>
                <Text style={styles.statVal}>{dj.minimumHours}h</Text>
                <Text style={styles.statLbl}>Min Hours</Text>
              </View>
              <View style={styles.statDiv} />
              <View style={styles.stat}>
                <View style={styles.statIconWrap}>
                  <Ionicons name="ribbon" size={16} color="#0a7d80" />
                </View>
                <Text style={styles.statVal}>{dj.experienceYears}yr</Text>
                <Text style={styles.statLbl}>Experience</Text>
              </View>
            </View>

            {/* Owned-by captain card — tappable, opens the captain profile */}
            {(() => {
              const cap = captainInfo || dj.captain;
              const capId = Number(captainInfo?.id ?? dj.captain?.id ?? captainId);
              if (!cap || !capId || !Number.isFinite(capId)) return null;
              const capName = cap.businessName || `${cap.user?.firstName || ""} ${cap.user?.lastName || ""}`.trim() || "Captain";
              const capLoc = cap.locationCity || cap.locationState || "";
              return (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Provided By</Text>
                  <PressableScale
                    style={styles.captainCard}
                    scaleTo={0.98}
                    onPress={() => router.push(`/captain/${capId}` as any)}
                  >
                    <CaptainAvatar
                      uri={cap.profilePicture || cap.user?.profilePicture}
                      name={capName}
                      size={48}
                      radius={15}
                      textSize={20}
                    />
                    <View style={{ flex: 1 }}>
                      <View style={styles.captainCardNameRow}>
                        <Text style={styles.captainCardName} numberOfLines={1}>{capName}</Text>
                        {cap.isVerified ? (
                          <Ionicons name="checkmark-circle" size={15} color="#1ba672" />
                        ) : null}
                      </View>
                      {capLoc ? (
                        <View style={styles.captainCardMeta}>
                          <Ionicons name="location-outline" size={12} color="#8696a0" />
                          <Text style={styles.captainCardMetaText} numberOfLines={1}>{capLoc}</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.captainCardCta}>
                      <Text style={styles.captainCardCtaText}>View</Text>
                      <Ionicons name="chevron-forward" size={14} color="#02023E" />
                    </View>
                  </PressableScale>
                </View>
              );
            })()}

            {/* Bio */}
            {dj.bio ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About</Text>
                <View style={styles.bioCard}>
                  <Text style={styles.bioText}>{dj.bio}</Text>
                </View>
              </View>
            ) : null}

            {/* Genres */}
            {djGenres.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Music Genres</Text>
                <View style={styles.tagWrap}>
                  {djGenres.map((g: string) => (
                    <View key={g} style={styles.tag}>
                      <Ionicons name="musical-note-outline" size={12} color="#02023E" />
                      <Text style={styles.tagText}>{g}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Specializations */}
            {djSpecs.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Specializes In</Text>
                <View style={styles.tagWrap}>
                  {djSpecs.map((s: string) => (
                    <View key={s} style={[styles.tag, styles.tagSpec]}>
                      <Ionicons name="star-outline" size={12} color="#6366f1" />
                      <Text style={[styles.tagText, { color: "#6366f1" }]}>{s}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {/* Package Includes */}
            {djPackageEquipment.length > 0 && (
              <View style={styles.section}>
                <View style={styles.packageHeader}>
                  <Text style={styles.sectionTitle}>Package Includes</Text>
                  <View style={styles.packageCountBadge}>
                    <Text style={styles.packageCountText}>
                      {djPackageEquipment.length} item{djPackageEquipment.length > 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
                <View style={styles.packageGrid}>
                  {djPackageEquipment.map((item) => (
                    <View key={item.id} style={styles.packageCard}>
                      <View style={styles.packageIconWrap}>
                        <Ionicons name="hardware-chip-outline" size={18} color="#02023E" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.packageName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.packageCat}>
                          {item.category}
                          {item.brand ? " · " + item.brand : ""}
                        </Text>
                      </View>
                      <View style={styles.packageCheck}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    </View>
                  ))}
                </View>
                <View style={styles.packageNote}>
                  <Ionicons name="information-circle-outline" size={13} color="#02023E" />
                  <Text style={styles.packageNoteText}>
                    All included in the hourly rate. Add more gear during checkout.
                  </Text>
                </View>
              </View>
            )}

            {/* Pricing summary — clean bill-style card */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Price Details</Text>
              <View style={styles.priceCard}>
                <View style={styles.priceCardRow}>
                  <Text style={styles.priceCardKey}>Hourly rate</Text>
                  <Text style={styles.priceCardVal}>₹{Number(dj.hourlyRate).toLocaleString()}</Text>
                </View>
                <View style={styles.priceCardRow}>
                  <Text style={styles.priceCardKey}>Minimum booking</Text>
                  <Text style={styles.priceCardVal}>{dj.minimumHours} hours</Text>
                </View>
                <View style={styles.priceCardDashed} />
                <View style={styles.priceTotalRow}>
                  <View>
                    <Text style={styles.priceTotalLabel}>Starting from</Text>
                    <Text style={styles.priceTotalSub}>
                      {dj.minimumHours}h × ₹{Number(dj.hourlyRate).toLocaleString()}
                    </Text>
                  </View>
                  <Text style={styles.priceTotalVal}>₹{totalMin.toLocaleString()}</Text>
                </View>
              </View>
            </View>

            </View>{/* ── end content sheet ── */}

            <View style={{ height: 100 }} />
          </ScrollView>

          {/* Bottom CTA — hidden while the booking modal is open so the
              chat FAB / book button / price don't bleed through under the
              modal's overlay (Android elevation lets absolutely-positioned
              children render on top of <Modal> overlays). */}
          {!showBooking && (
          <View style={styles.bottomBar}>
            <View style={styles.bottomBarLeft}>
              <Text style={styles.bottomBarLabel}>Starting from</Text>
              <Text style={styles.bottomBarPrice}>₹{totalMin.toLocaleString()}</Text>
            </View>
            {/* Chat button */}
            <PressableScale
              style={styles.chatIconBtn}
              scaleTo={0.92}
              onPress={async () => {
                // Chat needs the user to be logged in. If they aren't, the
                // backend returns 401 which used to fail silently — the
                // button looked dead. Now we surface what's wrong.
                const ok = await ensureLogin();
                if (!ok) return;
                // Resolve captainId — URL param first, then the loaded dj.
                // Web share-links sometimes drop the captainId param and we
                // were sending NaN to the backend, which rejected with
                // "captainId is required".
                const resolvedCaptainId = Number(
                  Number.isFinite(captainId) && captainId > 0
                    ? captainId
                    : dj?.captain?.id
                );
                if (!resolvedCaptainId || !Number.isFinite(resolvedCaptainId)) {
                  await confirm({
                    title: "Couldn't open chat",
                    message: "Captain details are missing on this DJ. Please refresh and try again.",
                    confirmText: "OK",
                    cancelText: "Close",
                    tone: "error",
                  });
                  return;
                }
                try {
                  // Backend needs the captain's user id (`userId`) in the body.
                  // Prefer the fully-fetched captain; fall back to the DJ's
                  // embedded captain object.
                  const captainUserId =
                    captainInfo?.userId ?? captainInfo?.user?.id ??
                    (dj?.captain as any)?.userId ?? (dj?.captain as any)?.user?.id;
                  const res = await chatApi.getOrCreateConversation(resolvedCaptainId, captainUserId);
                  if (res?.success && res.data) {
                    const cName = dj.captain?.businessName || "Captain";
                    const meta = {
                      type: "product_card",
                      productType: "dj",
                      productId: dj.id,
                      productName: dj.name,
                      productPrice: `₹${Number(dj.hourlyRate).toLocaleString()}/hr`,
                      productMeta: `${dj.minimumHours}h min · ${dj.experienceYears}yr exp`,
                    };
                    router.push({
                      pathname: "/chat/[id]",
                      params: {
                        id: res.data.id, name: cName,
                        productRef: JSON.stringify(meta),
                      },
                    } as any);
                  } else {
                    await confirm({
                      title: "Couldn't open chat",
                      message: res?.message || "Please try again in a moment.",
                      confirmText: "OK",
                      cancelText: "Close",
                      tone: "error",
                    });
                  }
                } catch (err: any) {
                  console.error("Chat:", err);
                  await confirm({
                    title: "Couldn't open chat",
                    message:
                      err?.response?.data?.message ||
                      err?.message ||
                      "Please check your internet connection and try again.",
                    confirmText: "OK",
                    cancelText: "Close",
                    tone: "error",
                  });
                }
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="chatbubble-ellipses" size={20} color="#02023E" />
            </PressableScale>
            <PressableScale
              style={[styles.bookBtn, !dj.isAvailable && styles.bookBtnOff]}
              onPress={handleBookPress}
              disabled={!dj.isAvailable}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={dj.isAvailable ? ["#02023E", "#02023E"] : ["#e5e7eb", "#e5e7eb"]}
                style={styles.bookBtnGrad}
              >
                <Text style={[styles.bookBtnText, !dj.isAvailable && styles.bookBtnTextOff]}>
                  {dj.isAvailable ? "Book Now" : "Unavailable"}
                </Text>
                {dj.isAvailable ? <Ionicons name="arrow-forward" size={16} color="#fff" /> : null}
              </LinearGradient>
            </PressableScale>
          </View>
          )}
        </LinearGradient>
      </View>

      <BookingModal
        visible={showBooking}
        dj={dj}
        captainId={captainId}
        onClose={() => setShowBooking(false)}
        onSuccess={handleBookingSuccess}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3",
  },
  topBarTitle: { fontSize: 18, fontWeight: "800", color: "#101720", flex: 1, textAlign: "center", marginHorizontal: 8 },
  scrollContent: { paddingBottom: 24 },

  heroSection: { alignItems: "center", paddingVertical: 28 },
  heroAvatar: { width: 100, height: 100, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  heroAvatarText: { fontSize: 40, fontWeight: "800", color: "#fff" },

  // Overlay top bar (floats over image gallery)
  overlayTopBarWrap: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    zIndex: 100,
  },
  overlayTopBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  overlayIconBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },

  // Image gallery — uses aspect-ratio + max-height instead of raw width
  // pinning so it stays a sensible size on desktop web (the old code froze
  // the dimensions to whatever Dimensions.get('window').width returned at
  // module load — on a 1440px monitor that meant a 1500px-tall hero).
  gallery: {
    width: "100%",
    aspectRatio: 1.2,
    maxHeight: 400,
    backgroundColor: "#101720",
    position: "relative",
    alignSelf: "center",
  },
  galleryList: {
    width: "100%",
    height: "100%",
  },
  galleryImg: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  galleryGrad: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    height: 120,
  },
  placeholderInner: {
    flex: 1, alignItems: "center", justifyContent: "center", gap: 12,
  },
  placeholderText: {
    fontSize: 24, fontWeight: "800", color: "#fff",
    textAlign: "center", paddingHorizontal: 24,
  },
  placeholderSub: {
    fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: "600",
  },
  galleryDots: {
    position: "absolute",
    bottom: 34,
    left: 0, right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  galleryDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  galleryDotActive: {
    backgroundColor: "#fff",
    width: 20,
  },
  galleryCounter: {
    position: "absolute",
    top: 16, right: 16,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(16,23,32,0.6)",
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12,
  },
  galleryCounterText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  galleryFallbackNote: {
    position: "absolute",
    top: 16, left: 16,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(16,23,32,0.6)",
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 12,
  },
  galleryFallbackText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  // Rounded content sheet overlapping the hero image
  sheet: {
    backgroundColor: "#f4f8ff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#d7dde6",
    alignSelf: "center",
    marginBottom: 4,
  },

  heroMetaSection: { alignItems: "flex-start", paddingTop: 18, paddingBottom: 8, paddingHorizontal: 20 },
  heroName: { fontSize: 26, fontWeight: "800", color: "#101720", letterSpacing: -0.5, marginBottom: 7, textAlign: "left" },
  heroMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 14 },
  heroMetaText: { fontSize: 13.5, color: "#5a6b7b", fontWeight: "600" },
  dot: { color: "#c4c9d0" },
  badgeRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  ratingBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#1ba672", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6,
  },
  ratingBadgeText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  ratingBadgeCount: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.9)" },
  availBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  availDot: { width: 7, height: 7, borderRadius: 4 },
  availBadgeText: { fontSize: 12, fontWeight: "700" },

  statsRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 20, backgroundColor: "#fff", borderRadius: 20,
    padding: 18, marginBottom: 20, borderWidth: 1, borderColor: "#e4e9f1",
    shadowColor: "#aeb6c4", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 14, elevation: 0,
  },
  stat: { flex: 1, alignItems: "center" },
  statIconWrap: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "#dff7f6", alignItems: "center", justifyContent: "center",
    marginBottom: 10,
  },
  statDiv: { width: 1, height: 56, backgroundColor: "#eef0f3", alignSelf: "center" },
  statVal: { fontSize: 19, fontWeight: "800", color: "#101720", letterSpacing: -0.4 },
  statLbl: { fontSize: 11, color: "#8696a0", fontWeight: "600", marginTop: 3 },

  section: { paddingHorizontal: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3, marginBottom: 12 },
  bioCard: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#e4e9f1",
    shadowColor: "#aeb6c4", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 14, elevation: 0,
  },
  bioText: { fontSize: 14, lineHeight: 22, color: "#4b6585", fontWeight: "500" },
  captainCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: "#e4e9f1",
    shadowColor: "#aeb6c4", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 14, elevation: 0,
  },
  captainCardNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  captainCardName: { fontSize: 15, fontWeight: "800", color: "#101720", flexShrink: 1 },
  captainCardMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 },
  captainCardMetaText: { fontSize: 12, color: "#8696a0", fontWeight: "500" },
  captainCardCta: {
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: "#f0fffe", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7,
  },
  captainCardCtaText: { fontSize: 12, fontWeight: "800", color: "#02023E" },

  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  tag: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#e8fbfa", borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9,
  },
  tagSpec: { backgroundColor: "#eef0ff" },
  tagText: { fontSize: 13, fontWeight: "700", color: "#0a7d80" },

  // Package Includes
  packageHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 12,
  },
  packageCountBadge: {
    backgroundColor: "#f0fffe", borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  packageCountText: { fontSize: 11, fontWeight: "800", color: "#02023E" },
  packageGrid: { gap: 8 },
  packageCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  packageIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
  },
  packageName: { fontSize: 14, fontWeight: "700", color: "#101720" },
  packageCat: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  packageCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#22c55e",
    alignItems: "center", justifyContent: "center",
  },
  packageNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, paddingHorizontal: 4,
  },
  packageNoteText: { fontSize: 11, color: "#02023E", fontWeight: "500", flex: 1 },

  priceCard: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: "#eef0f3",
    shadowColor: "#8a94a6", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 9, elevation: 1,
  },
  priceCardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  priceCardKey: { fontSize: 14, color: "#8696a0", fontWeight: "500" },
  priceCardVal: { fontSize: 14, fontWeight: "700", color: "#101720" },
  priceCardDashed: {
    borderBottomWidth: 1.5, borderStyle: "dashed", borderColor: "#dfe4ec",
    marginVertical: 12,
  },
  priceTotalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  priceTotalLabel: { fontSize: 15, fontWeight: "800", color: "#101720" },
  priceTotalSub: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  priceTotalVal: { fontSize: 24, fontWeight: "800", color: "#02023E", letterSpacing: -0.5 },

  bottomBar: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    backgroundColor: "#fff", gap: 12,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderTopWidth: 1, borderColor: "#eef2f7",
    shadowColor: "#aeb6c4", shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 14, elevation: 6,
  },
  bottomBarLeft: { flex: 1 },
  bottomBarLabel: { fontSize: 10, color: "#8696a0", fontWeight: "700", letterSpacing: 0.5 },
  bottomBarPrice: { fontSize: 22, fontWeight: "800", color: "#02023E", letterSpacing: -0.5 },
  chatIconBtn: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: "#f0fffe", borderWidth: 1, borderColor: "#a5f3fc",
    alignItems: "center", justifyContent: "center",
  },
  bookBtn: { flex: 2, borderRadius: 16, overflow: "hidden" },
  bookBtnOff: { opacity: 0.6 },
  bookBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, gap: 8 },
  bookBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },
  bookBtnTextOff: { color: "#8696a0" },
});

// ─── Booking Modal Styles ──────────────────────────────────────────────────────
const bS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#eef2f8", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 20, paddingTop: 10, maxHeight: "92%",
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: "#c4ccd8",
    alignSelf: "center", marginBottom: 14,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  title: { fontSize: 22, fontWeight: "800", color: "#101720", letterSpacing: -0.4 },
  sub: { fontSize: 13, color: "#8696a0", fontWeight: "500", marginTop: 3 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#fff", justifyContent: "center", alignItems: "center",
  },
  // Group heading that separates the form into digestible sections
  sectionHeader: {
    fontSize: 13, fontWeight: "800", color: "#8696a0", letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 18, marginBottom: 10, marginLeft: 4,
  },
  // White card that wraps each section's fields on the grey sheet
  sectionCard: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: "#e8edf3",
  },
  field: { marginBottom: 16 },
  fieldLast: { marginBottom: 0 },
  label: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 8, letterSpacing: 0.2 },
  input: {
    borderWidth: 1, borderColor: "#eef0f3", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#101720",
  },
  rowFields: { flexDirection: "row", gap: 12 },
  typeChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: "#f4f8ff", borderWidth: 1, borderColor: "#eef0f3",
  },
  typeChipActive: { backgroundColor: "#02023E", borderColor: "#02023E" },
  typeChipText: { fontSize: 12, fontWeight: "700", color: "#8696a0" },
  typeChipTextActive: { color: "#fff" },
  priceSummary: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    marginTop: 0, marginBottom: 18, borderWidth: 1, borderColor: "#e4e9f1",
  },
  priceRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  priceKey: { fontSize: 13, color: "#8696a0", fontWeight: "500" },
  priceVal: { fontSize: 13, fontWeight: "700", color: "#101720" },
  totalRow: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#eef0f3" },
  totalKey: { fontSize: 15, fontWeight: "700", color: "#101720" },
  totalVal: { fontSize: 18, fontWeight: "800", color: "#02023E", letterSpacing: -0.4 },
  remainingNote: {
    fontSize: 10, color: "#8696a0", fontWeight: "500",
    textAlign: "right", marginTop: 2,
  },
  feeCallout: {
    flexDirection: "row", alignItems: "center",
    marginTop: 12, paddingTop: 12, paddingBottom: 4,
    borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  feeCalloutLeft: {
    flexDirection: "row", alignItems: "center", gap: 8, flex: 1,
  },
  feeCalloutLabel: { fontSize: 12, fontWeight: "800", color: "#101720" },
  feeCalloutSub: { fontSize: 10, color: "#8696a0", fontWeight: "600", marginTop: 1 },
  feeCalloutValue: { fontSize: 20, fontWeight: "800", color: "#02023E" },
  // Auto-computed duration — subtle caption under the time row
  durationNote: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: -4, marginBottom: 16, marginLeft: 2, flexWrap: "wrap",
  },
  durationNoteText: { fontSize: 12.5, fontWeight: "700", color: "#5a6b7b" },
  durationWarn: { fontSize: 11.5, fontWeight: "700", color: "#f59e0b" },

  submitBtn: { borderRadius: 16, overflow: "hidden" },
  submitBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 17, gap: 8 },
  submitBtnText: { fontSize: 16, fontWeight: "800", color: "#fff" },

  // Included in package — light green pills
  includedWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  includedChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#f0fdf4", borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: "#bbf7d0",
  },
  includedChipText: { fontSize: 12.5, fontWeight: "700", color: "#15803d", maxWidth: 150 },

  // Add-Extras — light teal action row that fits the card aesthetic
  addExtraBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#f5fffe", borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  addExtraBtnActive: { backgroundColor: "#e8fbfa", borderColor: "#04c9ce" },
  addExtraIconWrap: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#dff7f6", alignItems: "center", justifyContent: "center",
  },
  addExtraTitle: { fontSize: 14, fontWeight: "800", color: "#101720" },
  addExtraSub: { fontSize: 11.5, fontWeight: "500", color: "#5a6b7b", marginTop: 2 },

  // Extras section
  extrasHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 10,
  },
  extrasSubLabel: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  extrasBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#f0fffe", paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 12, borderWidth: 1, borderColor: "#a5f3fc",
  },
  extrasBtnText: { fontSize: 12, fontWeight: "700", color: "#02023E" },
  extrasList: {
    backgroundColor: "#f8fafc", borderRadius: 12, padding: 10, gap: 8,
    borderWidth: 1, borderColor: "#eef0f3", marginTop: 10,
  },
  extraRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  extraIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
  },
  extraName: { fontSize: 13, fontWeight: "700", color: "#101720" },
  extraMeta: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  extraTotal: { fontSize: 13, fontWeight: "800", color: "#02023E" },

  // Picker rows
  pickerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 12, marginBottom: 8, borderRadius: 14,
    backgroundColor: "#f8fafc",
    borderWidth: 1.5, borderColor: "#eef0f3",
  },
  pickerRowSelected: { backgroundColor: "#f0fffe", borderColor: "#02023E" },
  pickerIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
  },
  pickerName: { fontSize: 14, fontWeight: "700", color: "#101720" },
  pickerMeta: { fontSize: 11, color: "#8696a0", marginTop: 2 },
  pickerPrice: { fontSize: 13, fontWeight: "800", color: "#02023E", marginTop: 3 },
  pickerPriceUnit: { fontSize: 10, color: "#8696a0", fontWeight: "600" },
  stockRow: {
    flexDirection: "row", alignItems: "center",
    gap: 8, marginTop: 4, flexWrap: "wrap",
  },
  stockPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 8, borderWidth: 1,
  },
  stockDot: { width: 5, height: 5, borderRadius: 3 },
  stockText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  outBadge: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
  },
  outBadgeText: { fontSize: 11, fontWeight: "800", color: "#ef4444" },
  addSmallBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#02023E", paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
  },
  addSmallBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  stepper: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#fff", borderRadius: 10, padding: 3,
    borderWidth: 1, borderColor: "#02023E",
  },
  stepperBtn: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
  },
  stepperValue: {
    fontSize: 13, fontWeight: "800", color: "#101720",
    minWidth: 18, textAlign: "center",
  },
  extrasFooter: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingTop: 14, marginTop: 8,
    borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  extrasFooterLabel: { fontSize: 10, color: "#8696a0", fontWeight: "700", letterSpacing: 0.3 },
  extrasFooterValue: { fontSize: 20, fontWeight: "800", color: "#02023E", marginTop: 2 },
});