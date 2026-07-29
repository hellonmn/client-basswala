/**
 * app/wallet/index.tsx  —  Basswala Wallet
 *
 * Sections:
 *   1. Balance card  (wallet balance + promo credits)
 *   2. Quick actions  (Add Money · Refunds · Pay with Wallet)
 *   3. Recent transactions  (from /payments/history)
 *   4. Promo / offers strip
 *
 * "Add Money" → opens a bottom-sheet that creates a Razorpay order
 *   and shows a UPI collect input (same pattern as BookingBottomSheet).
 *
 * All amounts from /payments/history come from the backend in rupees
 * (Payment.amount stores DECIMAL rupees, not paise).
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Modal,
  Platform,
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
import { apiService } from "../../services/api";
import { getFeatureFlags } from "../../services/appConfig";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveAmount(raw: any): number {
  // Backend stores Payment.amount as DECIMAL rupees. No paise conversion.
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return "—"; }
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Txn {
  id: string | number;
  label: string;
  sub: string;
  amount: number;
  type: "credit" | "debit";
  status: "success" | "pending" | "failed" | "refunded";
  date: string;
  time: string;
  paymentId?: string;
  method?: string;
}

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  success:  { color: "#16a34a", bg: "#f0fdf4", label: "Paid" },
  pending:  { color: "#f59e0b", bg: "#fffbeb", label: "Pending" },
  failed:   { color: "#dc2626", bg: "#fef2f2", label: "Failed" },
  refunded: { color: "#8b5cf6", bg: "#f5f3ff", label: "Refunded" },
};

const METHOD_ICON: Record<string, string> = {
  upi:         "phone-portrait-outline",
  card:        "card-outline",
  netbanking:  "laptop-outline",
  wallet:      "wallet-outline",
  cod:         "cash-outline",
  cash:        "cash-outline",
  default:     "receipt-outline",
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skel({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      width: w as any, height: h, borderRadius: r, backgroundColor: "#e5e7eb",
      opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
    }} />
  );
}

// ─── Add Money Sheet ──────────────────────────────────────────────────────────

const QUICK_AMOUNTS = [199, 499, 999, 1999];

function AddMoneySheet({ visible, onClose, onSuccess }: {
  visible: boolean; onClose: () => void; onSuccess: (amount: number) => void;
}) {
  const [amount, setAmount]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState("");
  const slideY = useRef(new Animated.Value(600)).current;
  const overlayOp = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      setAmount(""); setError("");
      Animated.parallel([
        Animated.spring(slideY,   { toValue: 0, tension: 70, friction: 13, useNativeDriver: true }),
        Animated.timing(overlayOp,{ toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY,    { toValue: 600, duration: 280, useNativeDriver: true }),
        Animated.timing(overlayOp, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const handleAdd = async () => {
    const amt = parseInt(amount);
    if (!amt || amt < 10) { setError("Minimum add amount is ₹10."); return; }
    if (amt > 50000)       { setError("Maximum add amount is ₹50,000."); return; }
    // Wallet top-up is temporarily disabled until the real Razorpay payment
    // flow is wired in. The previous behaviour ("simulate success") let
    // users add money without paying — fixed by short-circuiting here.
    setError(
      "Wallet top-up is coming soon. For now, you can pay the booking advance " +
      "directly at checkout — no top-up needed."
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[am.overlay, { opacity: overlayOp }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { Keyboard.dismiss(); onClose(); }} />
      </Animated.View>
      <Animated.View style={[am.sheet, { transform: [{ translateY: slideY }] }]}>
        {/* Handle */}
        <View style={am.handleZone}><View style={am.handle} /></View>

        <Text style={am.title}>Add Money to Wallet</Text>
        <Text style={am.sub}>Instantly available for bookings</Text>

        {/* Quick amounts */}
        <View style={am.quickRow}>
          {QUICK_AMOUNTS.map(q => (
            <TouchableOpacity key={q} style={[am.quickChip, amount === String(q) && am.quickChipOn]}
              onPress={() => { setAmount(String(q)); setError(""); }} activeOpacity={0.8}>
              <Text style={[am.quickChipText, amount === String(q) && am.quickChipTextOn]}>₹{q}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom amount */}
        <View style={am.inputWrap}>
          <Text style={am.inputPrefix}>₹</Text>
          <TextInput
            style={am.input}
            value={amount}
            onChangeText={v => { setAmount(v.replace(/\D/g, "")); setError(""); }}
            placeholder="Enter amount"
            placeholderTextColor="#c4c9d0"
            keyboardType="number-pad"
          />
          {!!amount && <TouchableOpacity onPress={() => setAmount("")}>
            <Ionicons name="close-circle" size={18} color="#c4c9d0" />
          </TouchableOpacity>}
        </View>

        {!!error && (
          <View style={am.errorRow}>
            <Ionicons name="alert-circle-outline" size={14} color="#dc2626" />
            <Text style={am.errorText}>{error}</Text>
          </View>
        )}

        {/* UPI note */}
        <View style={am.noteRow}>
          <Ionicons name="information-circle-outline" size={14} color="#02023E" />
          <Text style={am.noteText}>Payments are processed securely via Razorpay. UPI · Card · Netbanking supported.</Text>
        </View>

        <TouchableOpacity
          style={[am.addBtn, (!amount || loading) && am.addBtnOff]}
          onPress={handleAdd}
          disabled={!amount || loading}
          activeOpacity={0.88}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : <><Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={am.addBtnText}>Add {amount ? `₹${amount}` : "Money"}</Text></>
          }
        </TouchableOpacity>

        <View style={{ height: Platform.OS === "ios" ? 24 : 12 }} />
      </Animated.View>
    </Modal>
  );
}

// ─── Transaction Card ─────────────────────────────────────────────────────────

function TxnCard({ txn, onPress }: { txn: Txn; onPress: () => void }) {
  const sm = STATUS_META[txn.status] ?? STATUS_META.pending;
  const icon = METHOD_ICON[txn.method ?? "default"] ?? METHOD_ICON.default;

  return (
    <TouchableOpacity style={s.txnCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[s.txnIconBox, { backgroundColor: txn.type === "credit" ? "#f0fdf4" : "#f4f8ff" }]}>
        <Ionicons name={icon as any} size={20} color={txn.type === "credit" ? "#16a34a" : "#02023E"} />
      </View>
      <View style={s.txnBody}>
        <Text style={s.txnLabel} numberOfLines={1}>{txn.label}</Text>
        <Text style={s.txnSub}>{txn.sub}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[s.txnAmt, { color: txn.type === "credit" ? "#16a34a" : "#101720" }]}>
          {txn.type === "credit" ? "+" : "−"}₹{txn.amount.toLocaleString("en-IN")}
        </Text>
        <View style={[s.statusPill, { backgroundColor: sm.bg }]}>
          <Text style={[s.statusPillText, { color: sm.color }]}>{sm.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function WalletScreen() {
  const router = useRouter();

  const [balance,     setBalance]     = useState(0);
  const [promoCredit, setPromoCredit] = useState(0);
  const [txns,        setTxns]        = useState<Txn[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [showAdd,     setShowAdd]     = useState(false);
  const [showTxn,     setShowTxn]     = useState<Txn | null>(null);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [comingSoon,  setComingSoon]  = useState<boolean | null>(null);

  // Admin can flip a "Coming Soon" flag on the wallet from the admin
  // panel — used while we polish the top-up + payout flow. While the
  // flag is loading we render nothing tall enough to flash, so swap
  // to a tiny placeholder by holding the spinner state until we know.
  React.useEffect(() => {
    let cancelled = false;
    getFeatureFlags().then(f => { if (!cancelled) setComingSoon(!!f.walletComingSoon); });
    return () => { cancelled = true; };
  }, []);

  const mapTxn = (p: any, idx: number): Txn => {
    const amt     = resolveAmount(p.amount ?? p.totalAmount ?? 0);
    const isDebit = ["success","pending","created"].includes((p.status ?? "").toLowerCase());
    const method  = (p.paymentMethod ?? p.method ?? "default").toLowerCase();
    const label   = p.notes?.description
      ?? (isDebit ? "Booking Payment" : "Wallet Credit");
    const sub     = p.razorpayPaymentId
      ? `${fmtDate(p.createdAt)} · ${p.razorpayPaymentId.slice(-8)}`
      : fmtDate(p.createdAt ?? p.paidAt ?? "");

    let status: Txn["status"] = "pending";
    const st = (p.status ?? "").toLowerCase();
    if (st === "success" || st === "captured")  status = "success";
    else if (st === "failed")                   status = "failed";
    else if (st === "refunded")                 status = "refunded";

    return {
      id: p.id ?? idx,
      label,
      sub,
      amount: amt,
      type: isDebit ? "debit" : "credit",
      status,
      date: fmtDate(p.createdAt ?? p.paidAt ?? ""),
      time: fmtTime(p.createdAt ?? p.paidAt ?? ""),
      paymentId: p.razorpayPaymentId ?? p.paymentId,
      method,
    };
  };

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);
    try {
      const res  = await apiService.getPaymentHistory({ limit: 50 });
      const list: any[] = Array.isArray(res?.payments ?? res?.data ?? res)
        ? (res?.payments ?? res?.data ?? res)
        : [];
      const mapped = list.map(mapTxn);
      setTxns(mapped);

      // Derive balance: credits - debits of successful payments
      const spent = mapped
        .filter(t => t.type === "debit" && t.status === "success")
        .reduce((a, t) => a + t.amount, 0);
      const credited = mapped
        .filter(t => t.type === "credit" && t.status === "success")
        .reduce((a, t) => a + t.amount, 0);
      setBalance(Math.max(0, credited - spent));
      setPromoCredit(49); // promo credits — static for now
    } catch (err) {
      console.error("Wallet load failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAddSuccess = (amt: number) => {
    // Intentionally no-op — wallet top-up is temporarily gated. The previous
    // implementation incremented the local balance without an actual payment,
    // which let users fake-credit themselves until the next reload.
    // When real top-up ships, this should call the backend's confirm-topup
    // endpoint and reload the txn list — never trust a client-side bump.
  };

  const totalBalance = balance + promoCredit;

  // ── "Coming Soon" curtain ──────────────────────────────────────────────
  // When the admin flips walletComingSoon on, we render an apology
  // screen instead of the live wallet. Users can still go back; the
  // refund / payout entry points elsewhere in the app still work
  // because they don't pass through this screen.
  if (comingSoon === true) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="#02023E" />
        <SafeAreaView style={s.root} edges={["top"]}>
          <LinearGradient colors={["#02023E", "#04c9ce", "#057e7d"]} style={cs.gradient}>
            <View style={cs.headerRow}>
              <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={s.headerTitle}>Wallet</Text>
              <View style={{ width: 42 }} />
            </View>

            <View style={cs.body}>
              <View style={cs.iconRing}>
                <Ionicons name="wallet-outline" size={48} color="#fff" />
              </View>
              <Text style={cs.title}>Wallet is Coming Soon</Text>
              <Text style={cs.sub}>
                We're polishing the wallet experience — instant top-ups,
                refunds and offers. In the meantime you can pay the booking
                advance directly at checkout, no top-up needed.
              </Text>

              <TouchableOpacity
                style={cs.cta}
                activeOpacity={0.88}
                onPress={() => router.replace("/(tabs)/home" as any)}
              >
                <Ionicons name="home-outline" size={18} color="#02023E" />
                <Text style={cs.ctaText}>Back to Home</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={cs.ghost}
                activeOpacity={0.85}
                onPress={() => router.push("/wallet/refund" as any)}
              >
                <Ionicons name="refresh-outline" size={16} color="rgba(255,255,255,0.9)" />
                <Text style={cs.ghostText}>Need a refund? Contact support</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#02023E" />
      <SafeAreaView style={s.root} edges={["top"]}>

        {/* ── Teal header ── */}
        <LinearGradient colors={["#02023E","#04c9ce","#057e7d"]} style={s.header}>
          <View style={s.headerRow}>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Basswala Wallet</Text>
            <TouchableOpacity style={s.headerIcon} onPress={() => router.push("/wallet/refund" as any)} activeOpacity={0.8}>
              <Ionicons name="refresh-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Balance card */}
          <View style={s.balanceCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={s.balanceLabel}>Total Balance</Text>
              <TouchableOpacity onPress={() => setBalanceVisible(v => !v)} activeOpacity={0.8}>
                <Ionicons name={balanceVisible ? "eye-outline" : "eye-off-outline"} size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <Skel w={140} h={44} r={8} />
            ) : (
              <Text style={s.balanceAmt}>
                {balanceVisible ? `₹${totalBalance.toLocaleString("en-IN")}` : "₹••••••"}
              </Text>
            )}

            <View style={s.balanceBreakRow}>
              <View style={s.balanceBreakItem}>
                <Ionicons name="wallet-outline" size={12} color="rgba(255,255,255,0.6)" />
                <Text style={s.balanceBreakLabel}>Cash Balance</Text>
                <Text style={s.balanceBreakValue}>
                  {balanceVisible ? `₹${balance.toLocaleString("en-IN")}` : "₹••••"}
                </Text>
              </View>
              <View style={s.balanceBreakDivider} />
              <View style={s.balanceBreakItem}>
                <Ionicons name="gift-outline" size={12} color="rgba(255,255,255,0.6)" />
                <Text style={s.balanceBreakLabel}>Promo Credits</Text>
                <Text style={s.balanceBreakValue}>
                  {balanceVisible ? `₹${promoCredit.toLocaleString("en-IN")}` : "₹••••"}
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* ── Quick actions — only the ones that actually work ── */}
        <View style={s.actionsRow}>
          {[
            { icon: "add-circle-outline",    label: "Add Money", color: "#02023E", onPress: () => setShowAdd(true) },
            { icon: "refresh-circle-outline", label: "Refunds",   color: "#8b5cf6", onPress: () => router.push("/wallet/refund" as any) },
          ].map((a) => (
            <TouchableOpacity key={a.label} style={s.actionItem} onPress={a.onPress} activeOpacity={0.8}>
              <View style={[s.actionCircle, { backgroundColor: a.color + "15", borderColor: a.color + "30" }]}>
                <Ionicons name={a.icon as any} size={22} color={a.color} />
              </View>
              <Text style={s.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Transactions ── */}
        <View style={s.txnHeader}>
          <Text style={s.txnHeaderTitle}>Transactions</Text>
          {txns.length > 5 && (
            <TouchableOpacity><Text style={s.seeAll}>See All</Text></TouchableOpacity>
          )}
        </View>

        {loading ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
            {[1,2,3,4].map(i => (
              <View key={i} style={[s.txnCard, { gap: 10, flexDirection: "row", alignItems: "center" }]}>
                <Skel w={44} h={44} r={14} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skel w="70%" h={14} r={5} />
                  <Skel w="45%" h={11} r={4} />
                </View>
                <View style={{ alignItems: "flex-end", gap: 6 }}>
                  <Skel w={60} h={16} r={5} />
                  <Skel w={44} h={20} r={10} />
                </View>
              </View>
            ))}
          </ScrollView>
        ) : txns.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}><Ionicons name="receipt-outline" size={36} color="#02023E" /></View>
            <Text style={s.emptyTitle}>No transactions yet</Text>
            <Text style={s.emptySub}>Your payment history will appear here once you make a booking.</Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={["#02023E"]} />}
          >
            {txns.map(txn => (
              <TxnCard key={txn.id} txn={txn} onPress={() => setShowTxn(txn)} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* ── Add Money Sheet ── */}
      <AddMoneySheet visible={showAdd} onClose={() => setShowAdd(false)} onSuccess={handleAddSuccess} />

      {/* ── Transaction Detail Modal ── */}
      {showTxn && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setShowTxn(null)}>
          <View style={td.overlay}>
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTxn(null)} />
            <View style={td.card}>
              <View style={td.topRow}>
                <Text style={td.title}>Transaction Details</Text>
                <TouchableOpacity onPress={() => setShowTxn(null)}>
                  <Ionicons name="close" size={22} color="#101720" />
                </TouchableOpacity>
              </View>

              <View style={td.amtRow}>
                <Text style={[td.amt, { color: showTxn.type === "credit" ? "#16a34a" : "#101720" }]}>
                  {showTxn.type === "credit" ? "+" : "−"}₹{showTxn.amount.toLocaleString("en-IN")}
                </Text>
                <View style={[td.statusPill, { backgroundColor: (STATUS_META[showTxn.status]?.bg ?? "#f4f8ff") }]}>
                  <Text style={[td.statusText, { color: STATUS_META[showTxn.status]?.color ?? "#8696a0" }]}>
                    {STATUS_META[showTxn.status]?.label ?? "Unknown"}
                  </Text>
                </View>
              </View>

              {[
                { label: "Description", value: showTxn.label },
                { label: "Date",        value: `${showTxn.date} · ${showTxn.time}` },
                { label: "Method",      value: (showTxn.method ?? "—").toUpperCase() },
                ...(showTxn.paymentId ? [{ label: "Payment ID", value: showTxn.paymentId }] : []),
              ].map(row => (
                <View key={row.label} style={td.row}>
                  <Text style={td.rowLabel}>{row.label}</Text>
                  <Text style={td.rowValue} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}

              {showTxn.status === "success" && showTxn.type === "debit" && (
                <TouchableOpacity style={td.refundBtn}
                  onPress={() => { setShowTxn(null); router.push("/wallet/refund" as any); }}
                  activeOpacity={0.85}>
                  <Ionicons name="refresh-outline" size={16} color="#8b5cf6" />
                  <Text style={td.refundBtnText}>Request Refund</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={td.closeBtn} onPress={() => setShowTxn(null)} activeOpacity={0.85}>
                <Text style={td.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:               { flex: 1, backgroundColor: "#f4f8ff" },

  // Header
  header:             { paddingBottom: 24 },
  headerRow:          { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 20 },
  backBtn:            { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },
  headerTitle:        { flex: 1, textAlign: "center", fontSize: 18, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  headerIcon:         { width: 38, height: 38, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.18)", justifyContent: "center", alignItems: "center" },

  // Balance card (sits inside header)
  balanceCard:        { marginHorizontal: 20, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 22, padding: 20, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  balanceLabel:       { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, marginBottom: 4 },
  balanceAmt:         { fontSize: 44, fontWeight: "800", color: "#fff", letterSpacing: -2, marginBottom: 16 },
  balanceBreakRow:    { flexDirection: "row", alignItems: "center" },
  balanceBreakItem:   { flex: 1, gap: 3 },
  balanceBreakDivider:{ width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.25)", marginHorizontal: 16 },
  balanceBreakLabel:  { fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: "600" },
  balanceBreakValue:  { fontSize: 14, fontWeight: "800", color: "#fff" },

  // Quick actions
  actionsRow:         { flexDirection: "row", marginHorizontal: 20, marginTop: -16, backgroundColor: "#fff", borderRadius: 20, padding: 16, borderWidth: 1, borderColor: "#eef0f3", marginBottom: 14, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  actionItem:         { flex: 1, alignItems: "center", gap: 8 },
  actionCircle:       { width: 50, height: 50, borderRadius: 16, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  actionLabel:        { fontSize: 11, fontWeight: "700", color: "#101720" },

  // Promo strip
  promoStrip:         { marginHorizontal: 20, borderRadius: 16, overflow: "hidden", marginBottom: 16 },
  promoGrad:          { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  promoIconBox:       { width: 40, height: 40, borderRadius: 13, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  promoTitle:         { fontSize: 13, fontWeight: "700", color: "#15803d", marginBottom: 2 },
  promoSub:           { fontSize: 11, color: "#166534", fontWeight: "500" },

  // Transactions header
  txnHeader:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, marginBottom: 10 },
  txnHeaderTitle:     { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  seeAll:             { fontSize: 13, color: "#02023E", fontWeight: "600" },

  // Transaction card
  txnCard:            { flexDirection: "row", alignItems: "center", backgroundColor: "#fff", borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#eef0f3" },
  txnIconBox:         { width: 44, height: 44, borderRadius: 14, justifyContent: "center", alignItems: "center", marginRight: 12 },
  txnBody:            { flex: 1, gap: 3 },
  txnLabel:           { fontSize: 14, fontWeight: "700", color: "#101720", letterSpacing: -0.2 },
  txnSub:             { fontSize: 11, color: "#8696a0", fontWeight: "500" },
  txnAmt:             { fontSize: 15, fontWeight: "800", letterSpacing: -0.4 },
  statusPill:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusPillText:     { fontSize: 10, fontWeight: "700" },

  // Empty
  empty:              { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyIcon:          { width: 80, height: 80, borderRadius: 26, backgroundColor: "#f0fafa", justifyContent: "center", alignItems: "center", marginBottom: 16, borderWidth: 1, borderColor: "#d0f0ef" },
  emptyTitle:         { fontSize: 18, fontWeight: "800", color: "#101720", marginBottom: 8 },
  emptySub:           { fontSize: 13, color: "#8696a0", textAlign: "center", lineHeight: 20 },
});

// Add money sheet styles
const am = StyleSheet.create({
  overlay:       { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(16,23,32,0.46)" },
  sheet:         { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, borderWidth: 1, borderBottomWidth: 0, borderColor: "#eef0f3" },
  handleZone:    { paddingTop: 12, paddingBottom: 8, alignItems: "center" },
  handle:        { width: 44, height: 4, borderRadius: 2, backgroundColor: "#d1d5db" },
  title:         { fontSize: 20, fontWeight: "800", color: "#101720", letterSpacing: -0.4, marginBottom: 4 },
  sub:           { fontSize: 13, color: "#8696a0", fontWeight: "500", marginBottom: 22 },
  quickRow:      { flexDirection: "row", gap: 10, marginBottom: 16 },
  quickChip:     { flex: 1, paddingVertical: 12, borderRadius: 14, backgroundColor: "#f4f8ff", alignItems: "center", borderWidth: 1.5, borderColor: "#eef0f3" },
  quickChipOn:   { backgroundColor: "#f0fafa", borderColor: "#02023E" },
  quickChipText: { fontSize: 14, fontWeight: "700", color: "#374151" },
  quickChipTextOn:{ color: "#02023E" },
  inputWrap:     { flexDirection: "row", alignItems: "center", backgroundColor: "#f9fafb", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1.5, borderColor: "#e5e7eb", marginBottom: 12 },
  inputPrefix:   { fontSize: 20, fontWeight: "800", color: "#101720", marginRight: 8 },
  input:         { flex: 1, fontSize: 20, fontWeight: "700", color: "#101720" },
  errorRow:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  errorText:     { fontSize: 13, color: "#dc2626", fontWeight: "600" },
  noteRow:       { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#f0fafa", borderRadius: 12, padding: 12, marginBottom: 18, borderWidth: 1, borderColor: "#d0f0ef" },
  noteText:      { flex: 1, fontSize: 12, color: "#374151", lineHeight: 17, fontWeight: "500" },
  addBtn:        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#02023E", borderRadius: 18, paddingVertical: 17 },
  addBtnOff:     { opacity: 0.4 },
  addBtnText:    { fontSize: 16, fontWeight: "800", color: "#fff" },
});

// Transaction detail modal styles
const td = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: "rgba(16,23,32,0.5)", justifyContent: "flex-end" },
  card:         { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: Platform.OS === "ios" ? 36 : 24, borderWidth: 1, borderBottomWidth: 0, borderColor: "#eef0f3" },
  topRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title:        { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  amtRow:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  amt:          { fontSize: 32, fontWeight: "800", letterSpacing: -1 },
  statusPill:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText:   { fontSize: 12, fontWeight: "700" },
  row:          { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#f9fafb" },
  rowLabel:     { fontSize: 13, color: "#8696a0", fontWeight: "600" },
  rowValue:     { fontSize: 13, fontWeight: "700", color: "#101720", maxWidth: "55%", textAlign: "right" },
  refundBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, backgroundColor: "#f5f3ff", borderRadius: 14, paddingVertical: 13, borderWidth: 1, borderColor: "#ddd6fe" },
  refundBtnText:{ fontSize: 14, fontWeight: "700", color: "#8b5cf6" },
  closeBtn:     { marginTop: 10, backgroundColor: "#101720", borderRadius: 16, paddingVertical: 15, alignItems: "center" },
  closeBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});

// "Coming Soon" curtain styles. Lives next to the main wallet styles
// so any visual tweak (gradient, ring colour) can be made in one place.
const cs = StyleSheet.create({
  gradient: { flex: 1 },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconRing: {
    width: 120, height: 120, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.35)",
    alignItems: "center", justifyContent: "center", marginBottom: 24,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#fff", textAlign: "center", letterSpacing: -0.3, marginBottom: 12 },
  sub:   { fontSize: 14, color: "rgba(255,255,255,0.78)", textAlign: "center", lineHeight: 22, fontWeight: "500", marginBottom: 32 },
  cta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#fff", borderRadius: 16,
    paddingHorizontal: 24, paddingVertical: 14,
    marginBottom: 14,
  },
  ctaText: { fontSize: 15, fontWeight: "800", color: "#02023E", letterSpacing: -0.2 },
  ghost: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  ghostText: { fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: "600" },
});