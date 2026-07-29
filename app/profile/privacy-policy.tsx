/**
 * app/profile/privacy-policy.tsx — Privacy Policy screen
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  Animated,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const SECTIONS = [
  {
    icon: "information-circle-outline",
    title: "Information We Collect",
    body: "We collect information you provide directly to us when you register for an account, book a DJ, or contact support. This includes your name, email address, phone number, date of birth, and location. We also automatically collect certain usage data such as device identifiers, IP addresses, and app activity logs to improve your experience.",
  },
  {
    icon: "swap-horizontal-outline",
    title: "How We Use Your Information",
    body: "Your information is used to provide and improve our services, process bookings, send you service-related communications, personalise your in-app experience, and comply with legal obligations. We do not sell your personal data to third parties. We may share data with DJ service providers strictly as necessary to fulfil your bookings.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Data Security",
    body: "We implement industry-standard technical and organisational measures to protect your personal data against unauthorised access, alteration, disclosure, or destruction. All data in transit is encrypted using TLS 1.2 or higher. Sensitive credentials are stored using one-way hashing algorithms.",
  },
  {
    icon: "people-outline",
    title: "Sharing With Third Parties",
    body: "Basswala may share your data with trusted third-party vendors who assist in operating our platform (e.g., payment processors, cloud infrastructure providers). These partners are contractually bound to keep your information confidential and use it solely for the purpose of providing their services to us.",
  },
  {
    icon: "location-outline",
    title: "Location Data",
    body: "With your permission, we collect precise location data to show nearby DJ services and improve booking relevance. You may revoke location permissions at any time through your device settings. Disabling location access may limit certain features of the app.",
  },
  {
    icon: "finger-print-outline",
    title: "Your Rights",
    body: "You have the right to access, correct, or delete your personal data at any time. You may also object to or restrict certain processing activities. To exercise these rights, contact us at privacy@basswala.in. We will respond to all valid requests within 30 days.",
  },
  {
    icon: "refresh-outline",
    title: "Changes to This Policy",
    body: "We may update this Privacy Policy from time to time. When we do, we will notify you via the app or email. Continued use of Basswala after changes are posted constitutes your acceptance of the revised policy.",
  },
  {
    icon: "mail-outline",
    title: "Contact Us",
    body: "If you have questions or concerns about this Privacy Policy or how your data is handled, please reach out to our dedicated privacy team at privacy@basswala.in or write to us at Basswala Technologies Pvt. Ltd., Jaipur, Rajasthan, India.",
  },
];

function PolicyCard({ icon, title, body, index }: {
  icon: string; title: string; body: string; index: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 380,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 380,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[pc.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={pc.iconRow}>
        <View style={pc.iconBox}>
          <Ionicons name={icon as any} size={18} color="#02023E" />
        </View>
        <Text style={pc.title}>{title}</Text>
      </View>
      <Text style={pc.body}>{body}</Text>
    </Animated.View>
  );
}

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#101720" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 42 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>

        {/* Hero banner */}
        <LinearGradient colors={["#02023E", "#02023E"]} style={s.heroBanner}>
          <View style={s.heroIconCircle}>
            <Ionicons name="shield-checkmark" size={34} color="#fff" />
          </View>
          <Text style={s.heroTitle}>Your Privacy Matters</Text>
          <Text style={s.heroSub}>
            We're committed to being transparent about how we handle your data.
          </Text>
          <View style={s.heroPill}>
            <Ionicons name="time-outline" size={12} color="#02023E" />
            <Text style={s.heroPillText}>Last updated: January 2025</Text>
          </View>
        </LinearGradient>

        {/* Policy sections */}
        {SECTIONS.map((sec, i) => (
          <PolicyCard key={i} index={i} icon={sec.icon} title={sec.title} body={sec.body} />
        ))}

        <Text style={s.footer}>© 2025 Basswala Technologies Pvt. Ltd. All rights reserved.</Text>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: "#f4f8ff" },
  header:       { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14, backgroundColor: "#f4f8ff", borderBottomWidth: 1, borderBottomColor: "#eef0f3" },
  backBtn:      { width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  headerTitle:  { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  scroll:       { paddingHorizontal: 20, paddingTop: 20 },

  heroBanner:   { borderRadius: 22, padding: 24, alignItems: "center", marginBottom: 20 },
  heroIconCircle:{ width: 64, height: 64, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.2)", justifyContent: "center", alignItems: "center", marginBottom: 14 },
  heroTitle:    { fontSize: 20, fontWeight: "800", color: "#fff", letterSpacing: -0.3, marginBottom: 8 },
  heroSub:      { fontSize: 13, color: "rgba(255,255,255,0.85)", textAlign: "center", lineHeight: 19, fontWeight: "500", marginBottom: 14 },
  heroPill:     { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  heroPillText: { fontSize: 11, fontWeight: "700", color: "#02023E" },

  footer:       { textAlign: "center", fontSize: 11, color: "#c4c9d0", fontWeight: "500", marginTop: 8 },
});

const pc = StyleSheet.create({
  card:    { backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: "#eef0f3", padding: 18, marginBottom: 12 },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#f0fafa", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#d0f0ef" },
  title:   { fontSize: 15, fontWeight: "800", color: "#101720", flex: 1, letterSpacing: -0.2 },
  body:    { fontSize: 13, color: "#6b7280", lineHeight: 21, fontWeight: "500" },
});