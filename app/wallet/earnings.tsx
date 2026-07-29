import React, { useState } from "react";
import {
  Dimensions,
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

const { width } = Dimensions.get("window");

// â”€â”€â”€ Mock Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const earningsSummary = {
  today: 4500,
  thisWeek: 28500,
  thisMonth: 95000,
  pending: 12000,
  totalTrips: 88,
  onlineHours: "9.5",
  avgTrip: 1575,
};

type Period = "weekly" | "monthly";

const chartData: Record<Period, { label: string; amount: number; trips: number }[]> = {
  weekly: [
    { label: "Mon", amount: 3200, trips: 8 },
    { label: "Tue", amount: 4800, trips: 12 },
    { label: "Wed", amount: 2900, trips: 7 },
    { label: "Thu", amount: 5100, trips: 14 },
    { label: "Fri", amount: 6400, trips: 18 },
    { label: "Sat", amount: 7200, trips: 21 },
    { label: "Sun", amount: 3800, trips: 9 },
  ],
  monthly: [
    { label: "Wk 1", amount: 22000, trips: 52 },
    { label: "Wk 2", amount: 28500, trips: 61 },
    { label: "Wk 3", amount: 19800, trips: 47 },
    { label: "Wk 4", amount: 24700, trips: 58 },
  ],
};

const recentTrips = [
  {
    id: "TR-8821",
    time: "2:45 PM",
    eventName: "Wedding Reception",
    client: "Priya Mehta",
    location: "Malviya Nagar, Jaipur",
    fare: 15000,
    tip: 500,
    status: "completed",
  },
  {
    id: "TR-8820",
    time: "12:10 PM",
    eventName: "Birthday Party",
    client: "Amit Kumar",
    location: "Vaishali Nagar, Jaipur",
    fare: 8500,
    tip: 200,
    status: "completed",
  },
  {
    id: "TR-8819",
    time: "10:30 AM",
    eventName: "Corporate Event",
    client: "Tech Solutions Pvt Ltd",
    location: "C-Scheme, Jaipur",
    fare: 25000,
    tip: 1000,
    status: "completed",
  },
  {
    id: "TR-8818",
    time: "8:05 AM",
    eventName: "DJ Night",
    client: "Club Luxe",
    location: "MI Road, Jaipur",
    fare: 18000,
    tip: 750,
    status: "completed",
  },
];

const statCards = [
  { label: "Total Trips", value: String(earningsSummary.totalTrips), icon: "musical-notes-outline", color: "#02023E", bg: "#f0fffe" },
  { label: "Online Hours", value: earningsSummary.onlineHours + "h", icon: "time-outline", color: "#22c55e", bg: "#f0fdf4" },
  { label: "Avg. Trip", value: "â‚¹" + earningsSummary.avgTrip.toLocaleString(), icon: "trending-up-outline", color: "#f59e0b", bg: "#fffbeb" },
  { label: "Rating", value: "4.9", icon: "star-outline", color: "#6366f1", bg: "#eef2ff" },
];

// â”€â”€â”€ Bar Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BAR_HEIGHT = 120;

const EarningsChart = ({ period, onChangePeriod }: { period: Period; onChangePeriod: (p: Period) => void }) => {
  const data = chartData[period];
  const max = Math.max(...data.map((d) => d.amount));
  const total = data.reduce((s, d) => s + d.amount, 0);

  return (
    <View style={styles.sectionCard}>
      {/* Header row */}
      <View style={styles.chartHeader}>
        <View>
          <Text style={styles.sectionTitle}>Earnings Overview</Text>
          <Text style={styles.chartTotal}>â‚¹{total.toLocaleString()}</Text>
        </View>
        <View style={styles.pillRow}>
          {(["weekly", "monthly"] as Period[]).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => onChangePeriod(p)}
              style={[styles.pill, period === p && styles.pillActive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, period === p && styles.pillTextActive]}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Bars */}
      <View style={styles.barsContainer}>
        {data.map((d, i) => {
          const barH = Math.max(8, (d.amount / max) * BAR_HEIGHT);
          const isHighest = d.amount === max;
          return (
            <View key={i} style={styles.barWrapper}>
              <View style={[styles.barTrack, { height: BAR_HEIGHT }]}>
                {isHighest ? (
                  <LinearGradient
                    colors={["#02023E", "#02023E"]}
                    style={[styles.bar, { height: barH }]}
                  />
                ) : (
                  <View style={[styles.bar, styles.barInactive, { height: barH }]} />
                )}
              </View>
              <Text style={styles.barLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

// â”€â”€â”€ Trip Row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TripRow = ({ trip }: { trip: typeof recentTrips[0] }) => (
  <TouchableOpacity style={styles.tripCard} activeOpacity={0.88}>
    <View style={styles.tripIconWrap}>
      <LinearGradient colors={["#f0fffe", "#e0f7f6"]} style={styles.tripIcon}>
        <Ionicons name="musical-notes" size={20} color="#02023E" />
      </LinearGradient>
    </View>

    <View style={styles.tripBody}>
      <View style={styles.tripTitleRow}>
        <Text style={styles.tripEventName} numberOfLines={1}>{trip.eventName}</Text>
        <Text style={styles.tripFare}>â‚¹{trip.fare.toLocaleString()}</Text>
      </View>
      <View style={styles.tripMeta}>
        <Ionicons name="person-outline" size={12} color="#8696a0" />
        <Text style={styles.tripMetaText}>{trip.client}</Text>
        <Text style={styles.tripDot}>Â·</Text>
        <Ionicons name="time-outline" size={12} color="#8696a0" />
        <Text style={styles.tripMetaText}>{trip.time}</Text>
      </View>
      <View style={styles.tripMeta}>
        <Ionicons name="location-outline" size={12} color="#8696a0" />
        <Text style={styles.tripMetaText} numberOfLines={1}>{trip.location}</Text>
      </View>
    </View>

    {trip.tip > 0 && (
      <View style={styles.tipBadge}>
        <Text style={styles.tipText}>+â‚¹{trip.tip}</Text>
        <Text style={styles.tipLabel}> tip</Text>
      </View>
    )}
  </TouchableOpacity>
);

// â”€â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CaptainEarningsScreen() {
  const [period, setPeriod] = useState<Period>("weekly");

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <LinearGradient
          colors={["#f4f8ff", "#eef1f9", "#ffffff"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        >
          {/* â”€â”€ Top Bar â”€â”€ */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={20} color="#101720" />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Earnings</Text>
            <TouchableOpacity style={styles.backBtn} activeOpacity={0.7}>
              <Ionicons name="download-outline" size={20} color="#101720" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* â”€â”€ Hero Earnings Card â”€â”€ */}
            <View style={styles.heroSection}>
              <LinearGradient
                colors={["#02023E", "#02023E"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.earningsCard}
              >
                <View style={styles.earningsHeader}>
                  <View>
                    <Text style={styles.earningsLabel}>TOTAL EARNED TODAY</Text>
                    <Text style={styles.earningsAmount}>
                      â‚¹{earningsSummary.today.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.earningsIconWrap}>
                    <Ionicons name="wallet-outline" size={28} color="#fff" />
                  </View>
                </View>

                <View style={styles.earningsGrid}>
                  <View style={styles.earningsItem}>
                    <Text style={styles.earningsItemLabel}>This Week</Text>
                    <Text style={styles.earningsItemValue}>
                      â‚¹{earningsSummary.thisWeek.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.earningsDivider} />
                  <View style={styles.earningsItem}>
                    <Text style={styles.earningsItemLabel}>This Month</Text>
                    <Text style={styles.earningsItemValue}>
                      â‚¹{earningsSummary.thisMonth.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.withdrawButton} activeOpacity={0.88}>
                  <Text style={styles.withdrawButtonText}>
                    Withdraw â‚¹{earningsSummary.pending.toLocaleString()}
                  </Text>
                  <Ionicons name="arrow-forward" size={16} color="#02023E" />
                </TouchableOpacity>
              </LinearGradient>
            </View>

            {/* â”€â”€ Stat Cards â”€â”€ */}
            <View style={styles.statsSection}>
              <View style={styles.statsGrid}>
                {statCards.map((s, i) => (
                  <TouchableOpacity key={i} style={styles.statCard} activeOpacity={0.8}>
                    <View style={[styles.statIconWrap, { backgroundColor: s.bg }]}>
                      <Ionicons name={s.icon as any} size={20} color={s.color} />
                    </View>
                    <Text style={styles.statValue}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* â”€â”€ Earnings Chart â”€â”€ */}
            <View style={styles.chartSection}>
              <EarningsChart period={period} onChangePeriod={setPeriod} />
            </View>

            {/* â”€â”€ Recent Trips â”€â”€ */}
            <View style={styles.tripsSection}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitleLg}>Recent Bookings</Text>
                  <Text style={styles.sectionSub}>Your earning history</Text>
                </View>
                <TouchableOpacity style={styles.seeAllBtn} activeOpacity={0.7}>
                  <Text style={styles.seeAll}>See All</Text>
                  <Ionicons name="arrow-forward" size={12} color="#02023E" />
                </TouchableOpacity>
              </View>

              {recentTrips.map((trip) => (
                <TripRow key={trip.id} trip={trip} />
              ))}
            </View>

            {/* â”€â”€ Payout Info Banner â”€â”€ */}
            <View style={styles.payoutBannerSection}>
              <TouchableOpacity activeOpacity={0.88}>
                <LinearGradient
                  colors={["#101720", "#1e2d3d"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.payoutBanner}
                >
                  <View>
                    <Text style={styles.payoutBannerTitle}>Instant Payouts ðŸ’¸</Text>
                    <Text style={styles.payoutBannerSub}>
                      Link your bank account to withdraw instantly
                    </Text>
                  </View>
                  <View style={styles.payoutArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#101720" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomSpacing} />
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>
    </>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },
  scrollContent: { paddingBottom: 16 },

  // â”€â”€ Top Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eef0f3",
  },
  topBarTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#101720",
    letterSpacing: -0.4,
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

  // â”€â”€ Hero Earnings Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  heroSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    marginBottom: 20,
  },
  earningsCard: {
    padding: 20,
    borderRadius: 22,
    shadowColor: "#02023E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 7,
  },
  earningsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  earningsLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "700",
    marginBottom: 6,
    letterSpacing: 0.8,
  },
  earningsAmount: {
    fontSize: 36,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -1.2,
  },
  earningsIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  earningsGrid: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  earningsItem: { flex: 1 },
  earningsDivider: {
    width: 1,
    height: 36,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  earningsItemLabel: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "600",
    marginBottom: 5,
  },
  earningsItemValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },
  withdrawButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  withdrawButtonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#02023E",
  },

  // â”€â”€ Stat Cards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  statsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minWidth: (width - 60) / 2,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  statIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#101720",
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: "#8696a0",
    fontWeight: "600",
  },

  // â”€â”€ Chart â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  chartSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#8696a0",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  chartTotal: {
    fontSize: 22,
    fontWeight: "800",
    color: "#101720",
    letterSpacing: -0.6,
  },
  pillRow: {
    flexDirection: "row",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#f4f8ff",
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  pillActive: {
    backgroundColor: "#02023E",
    borderColor: "#02023E",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8696a0",
  },
  pillTextActive: {
    color: "#fff",
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  barWrapper: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  barTrack: {
    width: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    borderRadius: 7,
  },
  barInactive: {
    backgroundColor: "#eef0f3",
  },
  barLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8696a0",
  },

  // â”€â”€ Trips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tripsSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitleLg: {
    fontSize: 20,
    fontWeight: "800",
    color: "#101720",
    letterSpacing: -0.4,
  },
  sectionSub: {
    fontSize: 12,
    color: "#8696a0",
    fontWeight: "500",
    marginTop: 2,
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: "600",
    color: "#02023E",
  },
  tripCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eef0f3",
    gap: 12,
  },
  tripIconWrap: {
    flexShrink: 0,
  },
  tripIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  tripBody: {
    flex: 1,
    gap: 3,
  },
  tripTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  tripEventName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#101720",
    letterSpacing: -0.2,
    flex: 1,
    marginRight: 8,
  },
  tripFare: {
    fontSize: 15,
    fontWeight: "800",
    color: "#02023E",
    letterSpacing: -0.3,
  },
  tripMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tripMetaText: {
    fontSize: 12,
    color: "#8696a0",
    fontWeight: "500",
    flex: 1,
  },
  tripDot: {
    fontSize: 12,
    color: "#c4c9d0",
  },
  tipBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    flexShrink: 0,
  },
  tipText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#22c55e",
  },
  tipLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#22c55e",
  },

  // â”€â”€ Payout Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  payoutBannerSection: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  payoutBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 18,
  },
  payoutBannerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 3,
  },
  payoutBannerSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
  },
  payoutArrow: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },

  bottomSpacing: { height: 20 },
});