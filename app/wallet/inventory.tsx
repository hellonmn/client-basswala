import React, { useState } from "react";
import {
  Dimensions,
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

const { width } = Dimensions.get("window");

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type EquipmentStatus = "available" | "rented" | "maintenance";

interface Equipment {
  id: string;
  name: string;
  category: string;
  icon: string;
  status: EquipmentStatus;
  quantity: number;
  rented: number;
  pricePerDay: number;
  totalEarned: number;
  condition: "excellent" | "good" | "fair";
}

// â”€â”€â”€ Mock Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const inventoryItems: Equipment[] = [
  {
    id: "EQ-001",
    name: "Pioneer CDJ-3000",
    category: "DJ Player",
    icon: "disc-outline",
    status: "rented",
    quantity: 2,
    rented: 2,
    pricePerDay: 2500,
    totalEarned: 45000,
    condition: "excellent",
  },
  {
    id: "EQ-002",
    name: "Allen & Heath Xone:96",
    category: "DJ Mixer",
    icon: "options-outline",
    status: "available",
    quantity: 1,
    rented: 0,
    pricePerDay: 1800,
    totalEarned: 28000,
    condition: "excellent",
  },
  {
    id: "EQ-003",
    name: "QSC K12.2 Speaker",
    category: "Speaker",
    icon: "volume-high-outline",
    status: "available",
    quantity: 4,
    rented: 0,
    pricePerDay: 1200,
    totalEarned: 62000,
    condition: "good",
  },
  {
    id: "EQ-004",
    name: "Shure SM58 Mic",
    category: "Microphone",
    icon: "mic-outline",
    status: "rented",
    quantity: 6,
    rented: 3,
    pricePerDay: 400,
    totalEarned: 18500,
    condition: "good",
  },
  {
    id: "EQ-005",
    name: "Chauvet DJ Intimidator",
    category: "Lighting",
    icon: "flashlight-outline",
    status: "maintenance",
    quantity: 3,
    rented: 0,
    pricePerDay: 900,
    totalEarned: 22000,
    condition: "fair",
  },
  {
    id: "EQ-006",
    name: "Denon SC6000M",
    category: "DJ Player",
    icon: "disc-outline",
    status: "available",
    quantity: 2,
    rented: 0,
    pricePerDay: 2200,
    totalEarned: 31000,
    condition: "excellent",
  },
  {
    id: "EQ-007",
    name: "Hazer 1500W Machine",
    category: "FX",
    icon: "cloud-outline",
    status: "rented",
    quantity: 2,
    rented: 1,
    pricePerDay: 600,
    totalEarned: 12000,
    condition: "good",
  },
];

const categories = ["All", "DJ Player", "DJ Mixer", "Speaker", "Microphone", "Lighting", "FX"];

const summaryStats = [
  { label: "Total Items", value: "24", icon: "hardware-chip-outline", color: "#02023E", bg: "#f0fffe" },
  { label: "Rented Out", value: "6", icon: "swap-horizontal-outline", color: "#f59e0b", bg: "#fffbeb" },
  { label: "Available", value: "15", icon: "checkmark-circle-outline", color: "#22c55e", bg: "#f0fdf4" },
  { label: "In Repair", value: "3", icon: "construct-outline", color: "#ef4444", bg: "#fef2f2" },
];

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getStatusConfig = (status: EquipmentStatus) => {
  switch (status) {
    case "available":
      return { label: "Available", color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0" };
    case "rented":
      return { label: "Rented", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" };
    case "maintenance":
      return { label: "In Repair", color: "#ef4444", bg: "#fef2f2", border: "#fecaca" };
  }
};

const getConditionDots = (condition: Equipment["condition"]) => {
  const total = 3;
  const filled = condition === "excellent" ? 3 : condition === "good" ? 2 : 1;
  const color = condition === "excellent" ? "#02023E" : condition === "good" ? "#22c55e" : "#f59e0b";
  return { filled, total, color };
};

// â”€â”€â”€ Equipment Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const EquipmentCard = ({ item }: { item: Equipment }) => {
  const statusCfg = getStatusConfig(item.status);
  const cond = getConditionDots(item.condition);
  const utilization = item.quantity > 0 ? Math.round((item.rented / item.quantity) * 100) : 0;

  return (
    <TouchableOpacity style={styles.equipCard} activeOpacity={0.88}>
      {/* Left icon */}
      <View style={styles.equipIconCol}>
        <LinearGradient colors={["#f0fffe", "#e0f7f6"]} style={styles.equipIconWrap}>
          <Ionicons name={item.icon as any} size={22} color="#02023E" />
        </LinearGradient>
        {/* Condition dots */}
        <View style={styles.conditionDots}>
          {Array.from({ length: cond.total }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.condDot,
                { backgroundColor: i < cond.filled ? cond.color : "#eef0f3" },
              ]}
            />
          ))}
        </View>
      </View>

      {/* Body */}
      <View style={styles.equipBody}>
        <View style={styles.equipTitleRow}>
          <Text style={styles.equipName} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg, borderColor: statusCfg.border }]}>
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </View>
        </View>

        <Text style={styles.equipCategory}>{item.category}  Â·  ID: {item.id}</Text>

        {/* Progress bar */}
        <View style={styles.utilizationRow}>
          <View style={styles.utilizationBar}>
            <View style={[styles.utilizationFill, { width: `${utilization}%` as any, backgroundColor: utilization > 0 ? "#02023E" : "#eef0f3" }]} />
          </View>
          <Text style={styles.utilizationText}>{item.rented}/{item.quantity} rented</Text>
        </View>

        <View style={styles.equipFooter}>
          <View style={styles.equipPriceRow}>
            <Ionicons name="pricetag-outline" size={12} color="#8696a0" />
            <Text style={styles.equipPrice}>â‚¹{item.pricePerDay.toLocaleString()}/day</Text>
          </View>
          <Text style={styles.equipEarned}>â‚¹{item.totalEarned.toLocaleString()} earned</Text>
        </View>
      </View>

      {/* Chevron */}
      <Ionicons name="chevron-forward" size={16} color="#c4c9d0" style={{ alignSelf: "center" }} />
    </TouchableOpacity>
  );
};

// â”€â”€â”€ Main Screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CaptainInventoryScreen() {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  const filtered = inventoryItems.filter((item) => {
    const matchCat = selectedCategory === "All" || item.category === selectedCategory;
    const matchSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

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
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={20} color="#101720" />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>My Inventory</Text>
            <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="filter-outline" size={20} color="#101720" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* â”€â”€ Summary Stats â”€â”€ */}
            <View style={styles.statsSection}>
              <View style={styles.statsGrid}>
                {summaryStats.map((s, i) => (
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

            {/* â”€â”€ Search Bar â”€â”€ */}
            <View style={styles.searchSection}>
              <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
                <Ionicons name="search-outline" size={18} color="#8696a0" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search equipment..."
                  placeholderTextColor="#8696a0"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Ionicons name="close-circle" size={18} color="#c4c9d0" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* â”€â”€ Category Tabs â”€â”€ */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.categoryScroll}
              contentContainerStyle={styles.categoryContent}
            >
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.categoryChipText, selectedCategory === cat && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* â”€â”€ Equipment List â”€â”€ */}
            <View style={styles.listSection}>
              <View style={styles.listHeader}>
                <View>
                  <Text style={styles.sectionTitleLg}>Equipment</Text>
                  <Text style={styles.sectionSub}>{filtered.length} items found</Text>
                </View>
                <TouchableOpacity style={styles.addBtn} activeOpacity={0.85}>
                  <LinearGradient
                    colors={["#02023E", "#02023E"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.addBtnGrad}
                  >
                    <Ionicons name="add" size={16} color="#fff" />
                    <Text style={styles.addBtnText}>Add Item</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {filtered.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconWrap}>
                    <Ionicons name="hardware-chip-outline" size={36} color="#c4c9d0" />
                  </View>
                  <Text style={styles.emptyTitle}>No equipment found</Text>
                  <Text style={styles.emptySubtitle}>Try adjusting your search or category filter</Text>
                </View>
              ) : (
                filtered.map((item) => <EquipmentCard key={item.id} item={item} />)
              )}
            </View>

            {/* â”€â”€ Promo Banner â”€â”€ */}
            <View style={styles.bannerSection}>
              <TouchableOpacity activeOpacity={0.88}>
                <LinearGradient
                  colors={["#101720", "#1e2d3d"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.promoBanner}
                >
                  <View>
                    <Text style={styles.promoBannerTitle}>Insure Your Gear ðŸ›¡ï¸</Text>
                    <Text style={styles.promoBannerSub}>Protect equipment against damage & theft</Text>
                  </View>
                  <View style={styles.promoArrow}>
                    <Ionicons name="arrow-forward" size={18} color="#101720" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={{ height: 24 }} />
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
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eef0f3",
  },

  // â”€â”€ Stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  statsSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 18,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eef0f3",
    gap: 4,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#101720",
    letterSpacing: -0.4,
  },
  statLabel: {
    fontSize: 9,
    color: "#8696a0",
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
  },

  // â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  searchSection: {
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  searchBarFocused: {
    borderColor: "#02023E",
    shadowColor: "#02023E",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#101720",
    fontWeight: "500",
    padding: 0,
  },

  // â”€â”€ Category Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  categoryScroll: { marginBottom: 20 },
  categoryContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eef0f3",
  },
  categoryChipActive: {
    backgroundColor: "#02023E",
    borderColor: "#02023E",
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8696a0",
  },
  categoryChipTextActive: {
    color: "#fff",
  },

  // â”€â”€ List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  listSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  listHeader: {
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
  addBtn: { borderRadius: 14, overflow: "hidden" },
  addBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 5,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },

  // â”€â”€ Equipment Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  equipCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#eef0f3",
    gap: 12,
  },
  equipIconCol: {
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  equipIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  conditionDots: {
    flexDirection: "row",
    gap: 3,
  },
  condDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  equipBody: {
    flex: 1,
    gap: 6,
  },
  equipTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  equipName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#101720",
    flex: 1,
    letterSpacing: -0.2,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "800",
  },
  equipCategory: {
    fontSize: 11,
    color: "#8696a0",
    fontWeight: "600",
  },
  utilizationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  utilizationBar: {
    flex: 1,
    height: 5,
    backgroundColor: "#eef0f3",
    borderRadius: 3,
    overflow: "hidden",
  },
  utilizationFill: {
    height: "100%",
    borderRadius: 3,
  },
  utilizationText: {
    fontSize: 10,
    color: "#8696a0",
    fontWeight: "600",
    flexShrink: 0,
  },
  equipFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  equipPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  equipPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5a6169",
  },
  equipEarned: {
    fontSize: 12,
    fontWeight: "700",
    color: "#02023E",
  },

  // â”€â”€ Empty State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#f4f8ff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eef0f3",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#101720",
    letterSpacing: -0.3,
  },
  emptySubtitle: {
    fontSize: 13,
    color: "#8696a0",
    fontWeight: "500",
    textAlign: "center",
    paddingHorizontal: 20,
  },

  // â”€â”€ Promo Banner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  bannerSection: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  promoBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 18,
  },
  promoBannerTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 3,
  },
  promoBannerSub: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    fontWeight: "500",
  },
  promoArrow: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
  },
});