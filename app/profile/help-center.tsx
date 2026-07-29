/**
 * app/profile/help-center.tsx — Help Centre screen
 *
 * Features:
 *  - Searchable FAQ accordion
 *  - Category filter chips
 *  - Quick action cards (Contact, WhatsApp, Email)
 *  - Animated accordion expand/collapse
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { getSupportContact, whatsappLink, type SupportContact } from "../../services/appConfig";
import {
  Animated,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CATEGORIES = ["All", "Bookings", "Payments", "DJs", "Account", "Technical"];

const FAQS = [
  { cat: "Bookings", q: "How do I book a DJ?", a: "Browse DJs on the Explore tab, tap a DJ profile you like, choose your event date and details, then tap 'Book Now'. You'll receive a confirmation once the DJ accepts your request." },
  { cat: "Bookings", q: "Can I cancel a booking?", a: "Yes. Go to My Bookings, select the booking, and tap 'Cancel'. Cancellations made more than 48 hours before the event are fully refunded. Late cancellations may incur a fee as per our cancellation policy." },
  { cat: "Bookings", q: "What happens if my DJ cancels?", a: "If a DJ cancels, you'll be notified immediately and receive a full refund within 3–5 business days. Our support team will also help you find an alternative DJ for your event." },
  { cat: "Payments", q: "What payment methods are accepted?", a: "We accept UPI (GPay, PhonePe, Paytm), credit/debit cards (Visa, Mastercard, RuPay), and net banking. All transactions are secured by Razorpay." },
  { cat: "Payments", q: "When is my card charged?", a: "Your payment is held in escrow at the time of booking confirmation. Funds are released to the DJ only after your event is successfully completed." },
  { cat: "Payments", q: "How do I get a refund?", a: "Eligible refunds are processed within 3–5 business days to your original payment method. You can track refund status in the Payments section of your profile." },
  { cat: "DJs", q: "How are DJs verified on Basswala?", a: "Every DJ on Basswala goes through identity verification, portfolio review, and a quality assessment before being listed. Verified badges indicate DJs who have completed our full verification process." },
  { cat: "DJs", q: "Can I see a DJ's past reviews?", a: "Yes! Every DJ profile shows ratings and reviews from previous clients. You can filter reviews by event type to find the most relevant feedback for your needs." },
  { cat: "DJs", q: "Can I message a DJ before booking?", a: "Absolutely. Tap 'Message' on any DJ's profile to start a conversation before committing to a booking. Most DJs respond within a few hours." },
  { cat: "Account", q: "How do I update my profile?", a: "Go to Profile → Edit Profile to update your name, phone number, and date of birth. Your email address is linked to your account and cannot be changed." },
  { cat: "Account", q: "I forgot my password. What do I do?", a: "On the login screen, tap 'Forgot Password' and enter your registered email. You'll receive a reset link within a few minutes. Check your spam folder if it doesn't arrive." },
  { cat: "Account", q: "How do I delete my account?", a: "To delete your account, email us at support@basswala.in from your registered email address. Account deletion is permanent and removes all your data within 30 days." },
  { cat: "Technical", q: "The app is crashing. What should I do?", a: "Try force-closing and reopening the app. If the issue persists, check for updates in the App Store or Play Store. You can also try clearing the app cache in your device settings." },
  { cat: "Technical", q: "I'm not receiving notifications.", a: "Check that notifications are enabled for Basswala in your device Settings → Notifications. Also ensure you're connected to the internet. Toggle notifications off and on to refresh permissions." },
];

function AccordionItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const animHeight = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(14)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 40, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const toggle = () => {
    const toValue = open ? 0 : 1;
    Animated.parallel([
      Animated.spring(animHeight, { toValue, useNativeDriver: false, tension: 80, friction: 10 }),
      Animated.timing(rotateAnim, { toValue, duration: 200, useNativeDriver: true }),
    ]).start();
    setOpen(!open);
  };

  const maxHeight = animHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });
  const opacity   = animHeight.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 1] });
  const rotate    = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <Animated.View style={[ac.wrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <TouchableOpacity style={ac.row} onPress={toggle} activeOpacity={0.78}>
        <View style={ac.qDot} />
        <Text style={ac.q}>{q}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={17} color="#8696a0" />
        </Animated.View>
      </TouchableOpacity>
      <Animated.View style={{ maxHeight, overflow: "hidden", opacity }}>
        <Text style={ac.a}>{a}</Text>
      </Animated.View>
    </Animated.View>
  );
}

export default function HelpCenterScreen() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [contact, setContact] = useState<SupportContact | null>(null);

  // Pull admin-controlled support details so the WhatsApp / Email
  // quick-action cards open the right destination.
  useEffect(() => {
    let cancelled = false;
    getSupportContact().then(c => { if (!cancelled) setContact(c); });
    return () => { cancelled = true; };
  }, []);
  const supportEmail = contact?.email || "support@basswala.in";
  const supportWa    = contact?.whatsapp || "";

  const filtered = FAQS.filter(f => {
    const matchCat = activeCategory === "All" || f.cat === activeCategory;
    const matchSearch = search.trim() === "" ||
      f.q.toLowerCase().includes(search.toLowerCase()) ||
      f.a.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#101720" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Help Centre</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Hero */}
        <LinearGradient colors={["#101720", "#1e2a3a"]} style={s.heroBanner}>
          <Text style={s.heroEmoji}>👋</Text>
          <Text style={s.heroTitle}>How can we help?</Text>
          <Text style={s.heroSub}>Search our knowledge base or browse FAQs below</Text>

          {/* Search */}
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={17} color="#8696a0" />
            <TextInput
              style={s.searchInput}
              placeholder="Search for answers..."
              placeholderTextColor="#a0aab4"
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Ionicons name="close-circle" size={17} color="#c4c9d0" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        {/* Quick actions */}
        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickCard} activeOpacity={0.82}
            onPress={() => router.push("/profile/tickets" as any)}>
            <LinearGradient colors={["#f0fafa","#e6f7f7"]} style={s.quickGrad}>
              <View style={[s.quickIcon, { backgroundColor: "#d0f0ef" }]}>
                <Ionicons name="ticket-outline" size={22} color="#02023E" />
              </View>
              <Text style={s.quickLabel}>My Tickets</Text>
              <Text style={s.quickSub}>Track your requests</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.quickCard} activeOpacity={0.82}
            onPress={() => {
              const url = supportWa ? whatsappLink(supportWa) : "";
              if (url) Linking.openURL(url).catch(() => {});
            }}>
            <LinearGradient colors={["#f0fff4","#e6fdf0"]} style={s.quickGrad}>
              <View style={[s.quickIcon, { backgroundColor: "#bbf7d0" }]}>
                <Ionicons name="logo-whatsapp" size={22} color="#16a34a" />
              </View>
              <Text style={s.quickLabel}>WhatsApp</Text>
              <Text style={s.quickSub}>Quick response</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={s.quickCard} activeOpacity={0.82}
            onPress={() => Linking.openURL(`mailto:${supportEmail}`).catch(() => {})}>
            <LinearGradient colors={["#f5f3ff","#ede9fe"]} style={s.quickGrad}>
              <View style={[s.quickIcon, { backgroundColor: "#ddd6fe" }]}>
                <Ionicons name="mail-outline" size={22} color="#7c3aed" />
              </View>
              <Text style={s.quickLabel}>Email Us</Text>
              <Text style={s.quickSub} numberOfLines={1}>{supportEmail}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Category chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsScroll} style={s.chipsWrap}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity key={cat}
              style={[s.chip, activeCategory === cat && s.chipActive]}
              onPress={() => setActiveCategory(cat)} activeOpacity={0.8}>
              <Text style={[s.chipText, activeCategory === cat && s.chipTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* FAQ label */}
        <View style={s.faqHeader}>
          <Text style={s.faqTitle}>
            {filtered.length} {filtered.length === 1 ? "result" : "results"}
          </Text>
        </View>

        {/* FAQs */}
        <View style={s.faqCard}>
          {filtered.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyEmoji}>�?</Text>
              <Text style={s.emptyText}>No results for "{search}"</Text>
              <Text style={s.emptySub}>Try different keywords or contact our support team</Text>
            </View>
          ) : (
            filtered.map((faq, i) => (
              <React.Fragment key={i}>
                <AccordionItem q={faq.q} a={faq.a} index={i} />
                {i < filtered.length - 1 && <View style={s.divider} />}
              </React.Fragment>
            ))
          )}
        </View>

        {/* Bottom CTA */}
        <View style={s.bottomCta}>
          <Text style={s.bottomCtaText}>Still need help?</Text>
          <TouchableOpacity style={s.bottomCtaBtn}
            onPress={() => router.push("/profile/ticket/new" as any)} activeOpacity={0.85}>
            <Ionicons name="ticket-outline" size={16} color="#fff" />
            <Text style={s.bottomCtaBtnText}>Raise a Ticket</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: "#f4f8ff" },
  header:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#f4f8ff", borderBottomWidth: 1, borderBottomColor: "#eef0f3" },
  backBtn:        { width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  headerTitle:    { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  scroll:         { paddingHorizontal: 20, paddingTop: 20 },

  heroBanner:     { borderRadius: 22, padding: 24, marginBottom: 16, alignItems: "center" },
  heroEmoji:      { fontSize: 32, marginBottom: 8 },
  heroTitle:      { fontSize: 22, fontWeight: "800", color: "#fff", letterSpacing: -0.4, marginBottom: 6 },
  heroSub:        { fontSize: 13, color: "rgba(255,255,255,0.65)", fontWeight: "500", marginBottom: 18 },
  searchBox:      { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, width: "100%" },
  searchInput:    { flex: 1, fontSize: 14, color: "#101720", fontWeight: "500" },

  quickRow:       { flexDirection: "row", gap: 10, marginBottom: 16 },
  quickCard:      { flex: 1, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "#eef0f3" },
  quickGrad:      { padding: 14, alignItems: "center", gap: 6 },
  quickIcon:      { width: 44, height: 44, borderRadius: 14, justifyContent: "center", alignItems: "center", marginBottom: 2 },
  quickLabel:     { fontSize: 12, fontWeight: "800", color: "#101720", textAlign: "center" },
  quickSub:       { fontSize: 10, color: "#8696a0", fontWeight: "600", textAlign: "center" },

  chipsWrap:      { marginBottom: 14 },
  chipsScroll:    { gap: 8, paddingRight: 4 },
  chip:           { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef0f3" },
  chipActive:     { backgroundColor: "#101720", borderColor: "#101720" },
  chipText:       { fontSize: 13, fontWeight: "700", color: "#8696a0" },
  chipTextActive: { color: "#fff" },

  faqHeader:      { marginBottom: 10 },
  faqTitle:       { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.8, textTransform: "uppercase", paddingLeft: 4 },
  faqCard:        { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#eef0f3", overflow: "hidden", marginBottom: 16 },
  divider:        { height: 1, backgroundColor: "#f3f4f6", marginHorizontal: 16 },

  emptyWrap:      { alignItems: "center", padding: 32 },
  emptyEmoji:     { fontSize: 36, marginBottom: 12 },
  emptyText:      { fontSize: 15, fontWeight: "700", color: "#101720", marginBottom: 6 },
  emptySub:       { fontSize: 13, color: "#8696a0", textAlign: "center", lineHeight: 19 },

  bottomCta:      { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#eef0f3", padding: 20, alignItems: "center", gap: 14, marginBottom: 4 },
  bottomCtaText:  { fontSize: 15, fontWeight: "700", color: "#101720" },
  bottomCtaBtn:   { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#101720", borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 },
  bottomCtaBtnText:{ fontSize: 14, fontWeight: "800", color: "#fff" },
});

const ac = StyleSheet.create({
  wrap:  { paddingHorizontal: 16, paddingVertical: 14 },
  row:   { flexDirection: "row", alignItems: "center", gap: 10 },
  qDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: "#02023E", flexShrink: 0 },
  q:     { flex: 1, fontSize: 14, fontWeight: "700", color: "#101720", lineHeight: 20 },
  a:     { fontSize: 13, color: "#6b7280", lineHeight: 21, fontWeight: "500", marginTop: 12, paddingLeft: 16 },
});