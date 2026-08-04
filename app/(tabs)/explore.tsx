/**
 * explore.tsx — Dynamic version using real DJ data from backend
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated, BackHandler,
  Dimensions,
  FlatList,
  Image,
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
import { servicesApi } from "../../services/userApi";
import { useCart } from "../../context/CartContext";
import { useLocation } from "../../context/LocationContext";
import { useSaved } from "../../context/SavedContext";
import { DateField } from "../../components/DateTimePickerField";
import LocationBottomSheet from "../../components/LocationBottomSheet";
import SmartImage from "../../components/SmartImage";
import CaptainAvatar from "../../components/CaptainAvatar";
import PressableScale from "../../components/PressableScale";

const { width, height } = Dimensions.get("window");
// On desktop web a half-width tile would be ~700px which looks absurd.
// Cap at 220px so the explore grid keeps its 2-up-tile rhythm at phone
// sizes and becomes a real multi-column grid on bigger screens.
const CARD_WIDTH = Math.min(220, (width - 52) / 2);

// ─── DJ → Equipment mapper ────────────────────────────────────────────────────

interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  categoryId: string;
  price: number;
  image: string;
  rating: number;
  reviews: number;
  available: boolean;
  genres?: string[];
  locationCity?: string;
  captainId: number;
}

function mapDJToEquipment(dj: any): EquipmentItem {
  // Safely parse genres — comes as JSON string from MySQL
  let genres: string[] = [];
  try {
    genres = typeof dj.genres === "string" ? JSON.parse(dj.genres) : (dj.genres || []);
    if (!Array.isArray(genres)) genres = [];
  } catch { genres = []; }

  // Safely parse images — comes as JSON string from MySQL
  let images: string[] = [];
  try {
    images = typeof dj.images === "string" ? JSON.parse(dj.images) : (dj.images || []);
    if (!Array.isArray(images)) images = [];
  } catch { images = []; }

  const primaryGenre = genres[0] || "DJ Service";

  // Map genre to category
  let categoryId = "djs";
  const genreLower = primaryGenre.toLowerCase();
  if (genreLower.includes("bollywood") || genreLower.includes("hindi")) categoryId = "bollywood";
  else if (genreLower.includes("edm") || genreLower.includes("house") || genreLower.includes("techno")) categoryId = "edm";
  else if (genreLower.includes("hip") || genreLower.includes("rap")) categoryId = "hiphop";
  else if (genreLower.includes("lounge") || genreLower.includes("jazz")) categoryId = "lounge";
  else if (genreLower.includes("pop") || genreLower.includes("punjabi")) categoryId = "bollywood";

  return {
    id: String(dj.id),
    name: dj.name,
    category: genres.slice(0, 2).join(" / ") || "DJ Service",
    categoryId,
    price: Math.round(Number(dj.hourlyRate) || 0),
    // Prefer gallery's first image; fall back to DJ profile picture.
    // Empty string → SmartImage renders a placeholder.
    image: images[0] || dj.profilePicture || "",
    rating: parseFloat(dj.ratingAverage) || 0,
    reviews: dj.ratingCount || 0,
    // !!dj.isAvailable handles both boolean true and integer 1 from MySQL
    available: !!dj.isAvailable,
    genres,
    locationCity: dj.captain?.locationCity || dj.locationCity || "",
    captainId: Number(dj.captain?.id ?? dj.captainId ?? 0),
  };
}

const categories = [
  { id: "all",       name: "All",       icon: "grid",           bg: "#eef1f9", fg: "#02023E", accent: "#02023E" },
  { id: "bollywood", name: "Bollywood", icon: "musical-notes",  bg: "#fef3e8", fg: "#ea580c", accent: "#f97316" },
  { id: "edm",       name: "EDM",       icon: "radio",          bg: "#eef2ff", fg: "#4f46e5", accent: "#6366f1" },
  { id: "hiphop",    name: "Hip-Hop",   icon: "disc",           bg: "#fdf2f8", fg: "#db2777", accent: "#ec4899" },
  { id: "lounge",    name: "Lounge",    icon: "wine",           bg: "#fdf4ff", fg: "#a21caf", accent: "#c026d3" },
  { id: "djs",       name: "Others",    icon: "headset",        bg: "#ecfeff", fg: "#0891b2", accent: "#06b6d4" },
];

const sortOptions = [
  { id: "popular",    name: "Most Popular",       icon: "trending-up-outline"  },
  { id: "price-low",  name: "Price: Low to High", icon: "arrow-up-outline"     },
  { id: "price-high", name: "Price: High to Low", icon: "arrow-down-outline"   },
  { id: "rating",     name: "Highest Rated",      icon: "star-outline"         },
];

// ─── Sort Sheet ───────────────────────────────────────────────────────────────

const SHEET_HEIGHT = height * 0.6;

function SortSheet({ visible, selectedSort, onSelect, onClose, filterDate, setFilterDate }: {
  visible: boolean; selectedSort: string; onSelect: (id: string) => void; onClose: () => void;
  filterDate: string; setFilterDate: (v: string) => void;
}) {
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const overlayOp = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
        Animated.timing(overlayOp, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 280, useNativeDriver: true }),
        Animated.timing(overlayOp, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <Animated.View style={[ss.overlay, { opacity: overlayOp }]}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[ss.sheet, { transform: [{ translateY }] }]}>
          <View style={ss.handleZone}><View style={ss.handle} /></View>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── Date filter ── */}
            <Text style={ss.groupLabel}>CHECK AVAILABILITY</Text>
            <View style={{ paddingHorizontal: 20 }}>
              <DateField
                label=""
                value={filterDate}
                onChange={setFilterDate}
                placeholder="Any date — tap to pick"
              />
            </View>
            {!!filterDate && (
              <TouchableOpacity onPress={() => setFilterDate("")} style={ss.clearDateBtn} activeOpacity={0.8}>
                <Ionicons name="close-circle" size={14} color="#ef4444" />
                <Text style={ss.clearDateText}>Clear date</Text>
              </TouchableOpacity>
            )}

            {/* ── Sort ── */}
            <Text style={[ss.groupLabel, { marginTop: 14 }]}>SORT BY</Text>
            {sortOptions.map((opt) => {
              const active = selectedSort === opt.id;
              return (
                <TouchableOpacity key={opt.id} style={[ss.row, active && ss.rowActive]} activeOpacity={0.8}
                  onPress={() => { onSelect(opt.id); onClose(); }}>
                  <View style={[ss.iconBox, active && ss.iconBoxActive]}>
                    <Ionicons name={opt.icon as any} size={18} color={active ? "#02023E" : "#8696a0"} />
                  </View>
                  <Text style={[ss.rowText, active && ss.rowTextActive]}>{opt.name}</Text>
                  {active && <View style={ss.checkCircle}><Ionicons name="checkmark" size={14} color="#fff" /></View>}
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const ss = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(16,23,32,0.44)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, height: SHEET_HEIGHT, backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: "#eef0f3", overflow: "hidden" },
  handleZone: { paddingTop: 12, paddingBottom: 4, alignItems: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#d1d5db" },
  title: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  groupLabel: { fontSize: 12, fontWeight: "800", color: "#8696a0", letterSpacing: 0.5, paddingHorizontal: 20, marginBottom: 8, marginTop: 4 },
  clearDateBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 20, marginTop: -4, marginBottom: 4 },
  clearDateText: { fontSize: 12, fontWeight: "700", color: "#ef4444" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 13, gap: 14, borderRadius: 16, marginHorizontal: 12, marginBottom: 4 },
  rowActive: { backgroundColor: "#f4f8ff" },
  iconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  iconBoxActive: { backgroundColor: "#f0fafa", borderColor: "#d0f0ef" },
  rowText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#101720" },
  rowTextActive: { color: "#02023E", fontWeight: "700" },
  checkCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#02023E", justifyContent: "center", alignItems: "center" },
});

// ─── Equipment Card ───────────────────────────────────────────────────────────

function EquipmentCard({ item, onPress }: { item: EquipmentItem; onPress: () => void }) {
  const { isDJSaved, toggleDJ } = useSaved();
  const liked = isDJSaved(Number(item.id));

  return (
    <PressableScale style={cs.card} scaleTo={0.96} onPress={onPress}>
      <View style={cs.imgWrapper}>
        <SmartImage uri={item.image} style={cs.img} kind="dj" label={item.name} />

        {/* Rating pill (Swiggy-style) top-left */}
        {item.rating > 0 && (
          <View style={cs.ratingPill}>
            <Ionicons name="star" size={10} color="#fff" />
            <Text style={cs.ratingPillText}>{item.rating.toFixed(1)}</Text>
          </View>
        )}

        {/* Heart button top-right */}
        <TouchableOpacity
          style={cs.heart}
          activeOpacity={0.85}
          onPress={(e) => { e.stopPropagation(); toggleDJ(Number(item.id)); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Ionicons name={liked ? "heart" : "heart-outline"} size={16} color={liked ? "#ef4444" : "#101720"} />
        </TouchableOpacity>

        {/* Availability badge bottom-left */}
        <View style={[cs.availBadge, !item.available && cs.availBadgeOff]}>
          <View style={[cs.availDot, !item.available && cs.availDotOff]} />
          <Text style={cs.availText}>{item.available ? "Available" : "Booked"}</Text>
        </View>
      </View>

      <View style={cs.body}>
        <Text style={cs.name} numberOfLines={1}>{item.name}</Text>
        <Text style={cs.cat} numberOfLines={1}>{item.category}</Text>

        {item.locationCity ? (
          <View style={cs.cityRow}>
            <Ionicons name="location-outline" size={11} color="#8696a0" />
            <Text style={cs.city} numberOfLines={1}>{item.locationCity}</Text>
          </View>
        ) : null}

        <View style={cs.footer}>
          <View style={{ flex: 1 }}>
            <Text style={cs.price}>
              ₹{item.price.toLocaleString()}
              <Text style={cs.priceUnit}> /hr</Text>
            </Text>
            {item.reviews > 0 && (
              <Text style={cs.reviews}>{item.reviews} reviews</Text>
            )}
          </View>
          <View style={[cs.addBtn, !item.available && cs.addBtnOff]}>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </View>
        </View>
      </View>
    </PressableScale>
  );
}

const cs = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: "#fff",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e4e9f1",
    shadowColor: "#aeb6c4", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 12, elevation: 0,
  },
  imgWrapper: { position: "relative" },
  img: { width: "100%", height: CARD_WIDTH * 1.05, backgroundColor: "#e5e7eb" },

  ratingPill: {
    position: "absolute", top: 10, left: 10,
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#22c55e",
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 6,
  },
  ratingPillText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },

  heart: {
    position: "absolute", top: 10, right: 10,
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },

  availBadge: {
    position: "absolute", bottom: 10, left: 10,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
  },
  availBadgeOff: { backgroundColor: "rgba(16,23,32,0.8)" },
  availDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  availDotOff: { backgroundColor: "#ef4444" },
  availText: { fontSize: 9, fontWeight: "800", color: "#101720", letterSpacing: 0.3 },

  body: { padding: 12 },
  name: { fontSize: 14, fontWeight: "800", color: "#101720", letterSpacing: -0.3, marginBottom: 2 },
  cat: { fontSize: 11, color: "#8696a0", fontWeight: "600", marginBottom: 6 },
  cityRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 10 },
  city: { fontSize: 11, color: "#8696a0", fontWeight: "500", flex: 1 },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: "#f3f4f6",
    paddingTop: 10,
  },
  price: { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.4 },
  priceUnit: { fontSize: 11, color: "#8696a0", fontWeight: "600" },
  reviews: { fontSize: 10, color: "#8696a0", fontWeight: "500", marginTop: 1 },
  addBtn: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: "#02023E",
    justifyContent: "center", alignItems: "center",
  },
  addBtnOff: { backgroundColor: "#c4c9d0" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function BrowseScreen() {
  const router = useRouter();
  const { itemCount: cartItemCount } = useCart();
  const { location } = useLocation();
  const [allDJs, setAllDJs] = useState<EquipmentItem[]>([]);
  const [captains, setCaptains] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedSort, setSelectedSort] = useState("popular");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSort, setShowSort] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [filterDate, setFilterDate] = useState<string>("");

  const headerY = useRef(new Animated.Value(-20)).current;
  const headerOp = useRef(new Animated.Value(0)).current;
  const contentY = useRef(new Animated.Value(24)).current;
  const contentOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(headerY, { toValue: 0, tension: 80, friction: 12, delay: 0, useNativeDriver: true }),
      Animated.timing(headerOp, { toValue: 1, duration: 280, delay: 0, useNativeDriver: true }),
      Animated.spring(contentY, { toValue: 0, tension: 70, friction: 12, delay: 80, useNativeDriver: true }),
      Animated.timing(contentOp, { toValue: 1, duration: 320, delay: 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const fetchDJs = useCallback(async () => {
    try {
      // When user picks a date, backend filters out captains whose unavailable
      // ranges overlap — so DJs/packages become "date-aware".
      const djParams = filterDate
        ? { startDate: filterDate, endDate: filterDate }
        : undefined;
      const [djRes, capRes] = await Promise.allSettled([
        servicesApi.getAllDJs(djParams),
        servicesApi.getCaptains(),
      ]);

      if (djRes.status === "fulfilled" && djRes.value?.success) {
        const list = Array.isArray(djRes.value.data) ? djRes.value.data : [];
        setAllDJs(list.map(mapDJToEquipment));
      } else {
        setAllDJs([]);
      }

      if (capRes.status === "fulfilled" && capRes.value?.success) {
        setCaptains(capRes.value.data || []);
      }

    } catch (err) {
      console.error("[explore] Failed to fetch data:", err);
      setAllDJs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterDate]);

  useEffect(() => { fetchDJs(); }, [fetchDJs]);

  const onRefresh = () => { setRefreshing(true); fetchDJs(); };

  const items = useCallback(() => {
    let list = allDJs.filter((item) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.locationCity || "").toLowerCase().includes(q) ||
        (item.genres || []).some(g => g.toLowerCase().includes(q));
      const matchCat = selectedCategory === "all" || item.categoryId === selectedCategory;
      return matchSearch && matchCat;
    });

    switch (selectedSort) {
      case "price-low":  list = [...list].sort((a, b) => a.price - b.price); break;
      case "price-high": list = [...list].sort((a, b) => b.price - a.price); break;
      case "rating":     list = [...list].sort((a, b) => b.rating - a.rating); break;
      default:           list = [...list].sort((a, b) => b.reviews - a.reviews);
    }
    return list;
  }, [searchQuery, selectedCategory, selectedSort, allDJs]);

  const displayItems = items();
  const activeSortLabel = sortOptions.find((s) => s.id === selectedSort)?.name ?? "Sort";

  const renderCard = useCallback(
    ({ item }: { item: EquipmentItem }) => (
      <EquipmentCard
        item={item}
        onPress={() => {
          if (!item.captainId) {
            Alert.alert("Unavailable", "This DJ's captain info is missing. Please refresh and try again.");
            return;
          }
          router.push({
            pathname: "/dj-detail",
            params: { djId: item.id, captainId: item.captainId },
          } as any);
        }}
      />
    ),
    [router]
  );

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <LinearGradient
          colors={["#FFFFFF", "#F8FAFC", "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        >
          {/* Header — tight location + right-side cart */}
          <Animated.View style={[{ opacity: headerOp, transform: [{ translateY: headerY }] }]}>
            <LinearGradient
              colors={["#FFFFFF", "#ECF5FB"]}
              start={{ x: 0, y: 0.15 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}
            >
            <TouchableOpacity
              style={styles.locationWrap}
              activeOpacity={0.85}
              onPress={() => setShowLocation(true)}
            >
              <View style={styles.locationIconCircle}>
                <Ionicons name="location-sharp" size={16} color="#02023E" />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.deliverRow}>
                  <Text style={styles.deliverLabel}>BROWSING IN</Text>
                  <Ionicons name="chevron-down" size={11} color="#8696a0" />
                </View>
                <Text style={styles.locationText} numberOfLines={1}>
                  {location?.city || location?.area || "Select location"}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cartBtn}
              onPress={() => router.push("/scan" as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="qr-code-outline" size={20} color="#101720" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cartBtn}
              onPress={() => router.push("/cart" as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="cart-outline" size={20} color="#101720" />
              {cartItemCount > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            </LinearGradient>
          </Animated.View>

          {/* Fat rounded search with filter button */}
          <Animated.View style={[styles.searchRow, { opacity: headerOp, transform: [{ translateY: headerY }] }]}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color="#02023E" />
              <TextInput
                style={styles.searchInput}
                placeholder='Search "bollywood", "sound", a city…'
                placeholderTextColor="#8696a0"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {!!searchQuery ? (
                <TouchableOpacity
                  onPress={() => setSearchQuery("")}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close-circle" size={18} color="#c4c9d0" />
                </TouchableOpacity>
              ) : (
                <View style={styles.searchDivider} />
              )}
              <TouchableOpacity
                style={styles.filterInsideBtn}
                onPress={() => setShowSort(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="options-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Content */}
          <Animated.View style={[{ flex: 1 }, { opacity: contentOp, transform: [{ translateY: contentY }] }]}>
            {loading ? (
              <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                <ActivityIndicator size="large" color="#02023E" />
                <Text style={{ color: "#8696a0", marginTop: 12, fontSize: 14 }}>Loading DJs...</Text>
              </View>
            ) : (
              <FlatList
                data={displayItems}
                renderItem={renderCard}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={styles.grid}
                columnWrapperStyle={displayItems.length > 0 ? styles.gridRow : undefined}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#02023E"]} />
                }
                ListHeaderComponent={
                  <View>
                    {/* Promotional banners — admin-managed from /admin/banners.
                        Single banner: render centered (no scroll). Multiple:
                        snap-scrolling carousel. */}
                    {banners.length === 1 ? (
                      // The banner sits inside the FlatList's content padding
                      // (grid: paddingHorizontal 16), so the card must fill
                      // exactly that width — NOT screen width. alignItems
                      // centers it (and caps it on wide/desktop screens).
                      <View style={[styles.bannerWrap, { alignItems: "center" }]}>
                        <BannerCard banner={banners[0]} width={Math.min(640, width - 32)} onPress={() => {
                          const link = banners[0]?.ctaLink;
                          if (link && !link.startsWith("http")) router.push(link as any);
                        }} />
                      </View>
                    ) : banners.length > 1 ? (
                      <View style={styles.bannerWrap}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
                          decelerationRate="fast"
                          snapToInterval={Math.min(560, width - 56) + 12}
                          snapToAlignment="start"
                        >
                          {banners.map((b) => (
                            <BannerCard
                              key={b.id}
                              banner={b}
                              width={Math.min(560, width - 56)}
                              onPress={() => {
                                if (!b.ctaLink) return;
                                if (b.ctaLink.startsWith("http")) return;
                                router.push(b.ctaLink as any);
                              }}
                            />
                          ))}
                        </ScrollView>
                      </View>
                    ) : null}

                    {/* Captains Rail — compact cards with avatar + meta */}
                    {captains.length > 0 && (
                      <View style={styles.captainsRailWrap}>
                        <View style={styles.railHeader}>
                          <Text style={styles.railTitle}>Top Captains</Text>
                          <TouchableOpacity activeOpacity={0.7}>
                            <Text style={styles.railSeeAll}>See all ›</Text>
                          </TouchableOpacity>
                        </View>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ paddingHorizontal: 0, gap: 10 }}
                        >
                          {captains.map((c: any) => {
                            const initial = (c.businessName?.[0] || c.user?.firstName?.[0] || "C").toUpperCase();
                            const verified = !!c.isVerified;
                            return (
                              <TouchableOpacity
                                key={c.id}
                                style={styles.capCard}
                                onPress={() => router.push(`/captain/${c.id}` as any)}
                                activeOpacity={0.85}
                              >
                                <View style={styles.capAvatarWrap}>
                                  {/* CaptainAvatar handles the http-check + onError
                                      fallback in one place so a broken Cloudinary
                                      URL never leaves a grey icon on screen. */}
                                  <CaptainAvatar
                                    uri={c.profilePicture || c.user?.profilePicture || c.user?.avatar || c.avatar}
                                    name={c.businessName || c.user?.firstName || "Captain"}
                                    size={44}
                                    radius={15}
                                  />
                                  {verified && (
                                    <View style={styles.capVerifiedBadge}>
                                      <Ionicons name="checkmark" size={9} color="#fff" />
                                    </View>
                                  )}
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.capName} numberOfLines={1}>
                                    {c.businessName || "Captain"}
                                  </Text>
                                  <Text style={styles.capMeta} numberOfLines={1}>
                                    {c.djCount || 0} pkg · {c.equipmentCount || 0} gear
                                  </Text>
                                  {c.locationCity ? (
                                    <View style={styles.capCityRow}>
                                      <Ionicons name="location-outline" size={10} color="#8696a0" />
                                      <Text style={styles.capCity} numberOfLines={1}>{c.locationCity}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}

                    {/* Categories — Zepto-style colored tiles */}
                    <View style={styles.railHeader}>
                      <Text style={styles.railTitle}>Browse by vibe</Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.catScroll}
                      style={styles.catScrollWrap}
                    >
                      {categories.map((cat) => {
                        const on = selectedCategory === cat.id;
                        return (
                          <TouchableOpacity
                            key={cat.id}
                            style={[
                              styles.catTile,
                              { backgroundColor: on ? cat.accent : cat.bg },
                              on && { borderColor: cat.accent },
                            ]}
                            onPress={() => setSelectedCategory(cat.id)}
                            activeOpacity={0.85}
                          >
                            <View style={[styles.catIconBox, { backgroundColor: on ? "rgba(255,255,255,0.22)" : "#fff" }]}>
                              <Ionicons name={cat.icon as any} size={14} color={on ? "#fff" : cat.fg} />
                            </View>
                            <Text style={[styles.catTileText, { color: on ? "#fff" : "#101720" }]}>{cat.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* Results row */}
                    <View style={styles.resultsRow}>
                      <View>
                        <Text style={styles.resultsHeadline}>
                          {displayItems.length > 0 ? "DJs near you" : "No matches"}
                        </Text>
                        <Text style={styles.resultsText}>
                          <Text style={styles.resultsCount}>{displayItems.length}</Text>
                          {" "}result{displayItems.length === 1 ? "" : "s"} • sorted by {activeSortLabel.toLowerCase()}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.sortChip} onPress={() => setShowSort(true)} activeOpacity={0.85}>
                        <Ionicons name="swap-vertical" size={14} color="#02023E" />
                        <Text style={styles.sortChipText}>Sort</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Active date-filter chip (when a date is picked in the filter sheet) */}
                    {!!filterDate && (
                      <View style={styles.activeFilterRow}>
                        <View style={styles.dateChip}>
                          <Ionicons name="calendar" size={13} color="#02023E" />
                          <Text style={styles.dateChipText}>
                            {new Date(filterDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </Text>
                          <TouchableOpacity onPress={() => setFilterDate("")} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                            <Ionicons name="close-circle" size={16} color="#8696a0" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                }
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <View style={styles.emptyIconCircle}>
                      <Ionicons name="search-outline" size={36} color="#02023E" />
                    </View>
                    <Text style={styles.emptyTitle}>No DJs found</Text>
                    <Text style={styles.emptyMsg}>
                      {searchQuery || selectedCategory !== "all"
                        ? "Try a different search or category"
                        : "No DJs are available right now"}
                    </Text>
                    {(searchQuery || selectedCategory !== "all") && (
                      <TouchableOpacity
                        style={styles.emptyReset}
                        onPress={() => { setSearchQuery(""); setSelectedCategory("all"); }}
                      >
                        <Text style={styles.emptyResetText}>Clear filters</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
              />
            )}
          </Animated.View>
        </LinearGradient>
      </SafeAreaView>

      <SortSheet
        visible={showSort}
        selectedSort={selectedSort}
        onSelect={setSelectedSort}
        onClose={() => setShowSort(false)}
        filterDate={filterDate}
        setFilterDate={setFilterDate}
      />

      <LocationBottomSheet
        isVisible={showLocation}
        onClose={() => setShowLocation(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },

  // Header — compact location row + cart
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10,
    gap: 12,
  },
  locationWrap: {
    flex: 1,
    flexDirection: "row", alignItems: "center", gap: 10,
  },
  locationIconCircle: {
    width: 34, height: 34, borderRadius: 12,
    backgroundColor: "#f0fafa",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#d0f0ef",
  },
  deliverRow: {
    flexDirection: "row", alignItems: "center", gap: 4,
    marginBottom: 1,
  },
  deliverLabel: {
    fontSize: 9, fontWeight: "800", color: "#8696a0",
    letterSpacing: 1.2,
  },
  locationText: {
    fontSize: 15, fontWeight: "800",
    color: "#101720", letterSpacing: -0.3,
  },
  cartBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  cartBadge: {
    position: "absolute", top: -4, right: -4,
    backgroundColor: "#ef4444", borderRadius: 10,
    minWidth: 18, height: 18, paddingHorizontal: 5,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  cartBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // Search
  searchRow: { paddingHorizontal: 20, marginBottom: 16, marginTop: 6 },
  searchBox: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#fff", borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    gap: 10, borderWidth: 1, borderColor: "#e4e9f1",
    shadowColor: "#aeb6c4", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16, shadowRadius: 14, elevation: 0,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#101720", fontWeight: "500", padding: 0 },
  searchDivider: { width: 1, height: 22, backgroundColor: "#eef0f3" },
  filterInsideBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: "#02023E",
    justifyContent: "center", alignItems: "center",
  },

  // Rail headers
  railHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 0, marginBottom: 12, marginTop: 14,
  },
  railTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.4 },
  railSeeAll: { fontSize: 12, fontWeight: "700", color: "#02023E" },

  // Captains — compact horizontal card (avatar left, text right)
  // Promo banners
  bannerWrap: { marginTop: 4, marginBottom: 14 },
  bannerCard: {
    height: 140, borderRadius: 18, overflow: "hidden",
    backgroundColor: "#101720",
  },
  bannerImg: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  bannerOverlay: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "rgba(16,23,32,0.55)",
  },
  bannerTitle: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  bannerSubtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, fontWeight: "500" },
  bannerCta: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
    backgroundColor: "#02023E",
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 999, marginTop: 8,
  },
  bannerCtaText: { fontSize: 11, fontWeight: "800", color: "#101720" },

  captainsRailWrap: { marginTop: 4, marginBottom: 4 },
  capCard: {
    flexDirection: "row", alignItems: "center", gap: 11,
    width: 230,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1, borderColor: "#e4e9f1",
    paddingVertical: 11, paddingHorizontal: 11,
    shadowColor: "#aeb6c4", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 0,
  },
  capAvatarWrap: { position: "relative" },
  capAvatar: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  capInitial: { fontSize: 17, fontWeight: "800", color: "#fff" },
  capVerifiedBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: "#22c55e",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "#fff",
  },
  capName: { fontSize: 13, fontWeight: "800", color: "#101720", letterSpacing: -0.2 },
  capMeta: { fontSize: 11, color: "#8696a0", fontWeight: "600", marginTop: 2 },
  capCityRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 },
  capCity: { fontSize: 10, color: "#8696a0", fontWeight: "500" },

  // Category colored tiles
  catScrollWrap: { marginBottom: 8 },
  catScroll: { paddingHorizontal: 20, gap: 8, paddingVertical: 2 },
  catTile: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingLeft: 4, paddingRight: 12, paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1, borderColor: "transparent",
  },
  catIconBox: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  catTileText: { fontSize: 12, fontWeight: "700", letterSpacing: -0.1 },

  // Results row
  resultsRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 0, marginBottom: 14, marginTop: 8,
  },
  resultsHeadline: { fontSize: 17, fontWeight: "800", color: "#101720", letterSpacing: -0.4 },
  resultsText: { fontSize: 12, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  resultsCount: { fontWeight: "800", color: "#101720" },
  sortChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#fff",
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  sortChipText: { fontSize: 12, fontWeight: "800", color: "#02023E" },

  // Grid
  activeFilterRow: { flexDirection: "row", marginTop: 10, marginBottom: 2 },
  dateChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#eef4ff", borderRadius: 10,
    paddingHorizontal: 11, paddingVertical: 7,
    borderWidth: 1, borderColor: "#d6e2fb",
  },
  dateChipText: { fontSize: 12.5, fontWeight: "700", color: "#02023E" },

  grid: { paddingHorizontal: 16, paddingBottom: 120 },
  gridRow: { gap: 12, marginBottom: 14 },

  // Empty
  empty: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIconCircle: {
    width: 96, height: 96, borderRadius: 32,
    backgroundColor: "#f0fafa",
    borderWidth: 1, borderColor: "#d0f0ef",
    justifyContent: "center", alignItems: "center",
    marginBottom: 18,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#101720", marginBottom: 6 },
  emptyMsg: { fontSize: 14, color: "#8696a0", fontWeight: "500", textAlign: "center", marginBottom: 20 },
  emptyReset: {
    backgroundColor: "#02023E",
    paddingHorizontal: 22, paddingVertical: 12,
    borderRadius: 14,
  },
  emptyResetText: { fontSize: 13, fontWeight: "800", color: "#fff" },
});
