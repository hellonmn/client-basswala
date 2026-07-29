import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { servicesApi } from "../services/userApi";

const { width } = Dimensions.get("window");

interface CaptainDJ {
  id: number;
  name: string;
  phone?: string;
  email?: string;
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
  captain?: {
    id: number;
    businessName?: string;
    locationCity?: string;
    latitude?: number;
    longitude?: number;
  };
}

const GENRES = ["All", "Bollywood", "EDM", "Hip Hop", "House", "Techno", "R&B", "Pop", "Punjabi", "Retro", "Commercial"];

const StarRow = ({ rating, count }: { rating: number; count: number }) => (
  <View style={styles.starRow}>
    {[1, 2, 3, 4, 5].map(s => (
      <Ionicons key={s} name={s <= Math.round(rating) ? "star" : "star-outline"} size={12} color={s <= Math.round(rating) ? "#f59e0b" : "#d1d5db"} />
    ))}
    <Text style={styles.ratingText}>{Number(rating).toFixed(1)}</Text>
    {count > 0 ? <Text style={styles.ratingCount}>({count})</Text> : null}
  </View>
);

const DJCard = ({ dj, onPress }: { dj: CaptainDJ; onPress: () => void }) => (
  <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.88}>
    {/* Avatar */}
    <View style={styles.cardLeft}>
      <LinearGradient
        colors={dj.isAvailable ? ["#02023E", "#02023E"] : ["#8696a0", "#5a6169"]}
        style={styles.avatar}
      >
        <Text style={styles.avatarText}>{dj.name[0]?.toUpperCase()}</Text>
      </LinearGradient>
      <View style={[styles.availDot, { backgroundColor: dj.isAvailable ? "#22c55e" : "#ef4444" }]} />
    </View>

    {/* Info */}
    <View style={styles.cardBody}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardName}>{dj.name}</Text>
        <View style={[styles.availBadge, { backgroundColor: dj.isAvailable ? "#f0fdf4" : "#fef2f2" }]}>
          <Text style={[styles.availBadgeText, { color: dj.isAvailable ? "#22c55e" : "#ef4444" }]}>
            {dj.isAvailable ? "Available" : "Busy"}
          </Text>
        </View>
      </View>

      {dj.captain?.businessName ? (
        <View style={styles.captainRow}>
          <Ionicons name="storefront-outline" size={12} color="#8696a0" />
          <Text style={styles.captainName}>{dj.captain.businessName}</Text>
          {dj.captain.locationCity ? (
            <>
              <Text style={styles.dot}>Â·</Text>
              <Ionicons name="location-outline" size={12} color="#8696a0" />
              <Text style={styles.captainName}>{dj.captain.locationCity}</Text>
            </>
          ) : null}
        </View>
      ) : null}

      {dj.ratingCount > 0 ? <StarRow rating={dj.ratingAverage} count={dj.ratingCount} /> : null}

      {/* Genres */}
      {dj.genres && dj.genres.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreScroll}>
          {dj.genres.slice(0, 4).map(g => (
            <View key={g} style={styles.genreTag}>
              <Text style={styles.genreText}>{g}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      {/* Footer */}
      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.rateLabel}>HOURLY RATE</Text>
          <Text style={styles.rate}>â‚¹{Number(dj.hourlyRate).toLocaleString()}<Text style={styles.rateUnit}>/hr</Text></Text>
        </View>
        <View style={styles.metaRight}>
          <Text style={styles.minHours}>Min {dj.minimumHours}h</Text>
          {dj.experienceYears > 0 ? <Text style={styles.exp}>{dj.experienceYears}yr exp</Text> : null}
        </View>
        <TouchableOpacity style={[styles.bookBtn, !dj.isAvailable && styles.bookBtnOff]} onPress={onPress} disabled={!dj.isAvailable} activeOpacity={0.8}>
          <Text style={[styles.bookBtnText, !dj.isAvailable && styles.bookBtnTextOff]}>
            {dj.isAvailable ? "Book" : "Unavail."}
          </Text>
          {dj.isAvailable ? <Ionicons name="arrow-forward" size={12} color="#fff" /> : null}
        </TouchableOpacity>
      </View>
    </View>
  </TouchableOpacity>
);

export default function DJsScreen() {
  const router = useRouter();
  const [djs, setDjs] = useState<CaptainDJ[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [minRate, setMinRate] = useState("");
  const [maxRate, setMaxRate] = useState("");

  const fetchDJs = useCallback(async () => {
    try {
      const res = await servicesApi.getAllDJs({
        genre: selectedGenre !== "All" ? selectedGenre : undefined,
        search: search || undefined,
        minRate: minRate ? parseFloat(minRate) : undefined,
        maxRate: maxRate ? parseFloat(maxRate) : undefined,
      });
      if (res.success) setDjs(res.data || []);
    } catch (err: any) {
      console.error("fetchDJs error:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, selectedGenre, minRate, maxRate]);

  useEffect(() => { setLoading(true); fetchDJs(); }, [selectedGenre]);

  useEffect(() => {
    const t = setTimeout(() => fetchDJs(), 500);
    return () => clearTimeout(t);
  }, [search]);

  const available = djs.filter(d => d.isAvailable).length;

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <SafeAreaView style={styles.container} edges={["top"]}>
        <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>

          {/* Top Bar */}
          <View style={styles.topBar}>
            <View>
              <Text style={styles.topBarTitle}>Find a DJ</Text>
              <Text style={styles.topBarSub}>{available} available now Â· {djs.length} total</Text>
            </View>
            <TouchableOpacity style={styles.filterIconBtn} activeOpacity={0.8}>
              <Ionicons name="options-outline" size={20} color="#101720" />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View style={styles.searchSection}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={18} color="#8696a0" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search DJ name, genre..."
                placeholderTextColor="#8696a0"
                value={search}
                onChangeText={setSearch}
              />
              {search ? (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={18} color="#c4c9d0" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Genre filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreScroll2} contentContainerStyle={styles.genreContent}>
            {GENRES.map(g => (
              <TouchableOpacity
                key={g}
                onPress={() => setSelectedGenre(g)}
                style={[styles.genreChip, selectedGenre === g && styles.genreChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.genreChipText, selectedGenre === g && styles.genreChipTextActive]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <View style={styles.loader}><ActivityIndicator size="large" color="#02023E" /></View>
          ) : (
            <FlatList
              data={djs}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => (
                <DJCard
                  dj={item}
                  onPress={() => router.push({ pathname: "/dj-detail", params: { djId: item.id, captainId: item.captain?.id } } as any)}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="musical-notes-outline" size={52} color="#c4c9d0" />
                  <Text style={styles.emptyTitle}>No DJs found</Text>
                  <Text style={styles.emptySub}>Try changing your search or genre filter</Text>
                </View>
              }
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDJs(); }} tintColor="#02023E" />
              }
            />
          )}
        </LinearGradient>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f4f8ff" },
  topBar: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  topBarTitle: { fontSize: 26, fontWeight: "800", color: "#101720", letterSpacing: -0.5 },
  topBarSub: { fontSize: 13, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  filterIconBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3",
  },
  searchSection: { paddingHorizontal: 20, paddingTop: 14 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 14,
    paddingVertical: 12, borderWidth: 1, borderColor: "#eef0f3",
  },
  searchInput: { flex: 1, fontSize: 14, color: "#101720", fontWeight: "500", padding: 0 },
  genreScroll2: { maxHeight: 52 },
  genreContent: { paddingHorizontal: 20, paddingVertical: 10, gap: 8 },
  genreChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#eef0f3",
  },
  genreChipActive: { backgroundColor: "#101720", borderColor: "#101720" },
  genreChipText: { fontSize: 12, fontWeight: "700", color: "#8696a0" },
  genreChipTextActive: { color: "#fff" },
  loader: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 120, gap: 12 },

  card: {
    flexDirection: "row", backgroundColor: "#fff", borderRadius: 20,
    padding: 14, borderWidth: 1, borderColor: "#eef0f3", gap: 12,
  },
  cardLeft: { alignItems: "center", gap: 6, position: "relative" },
  avatar: { width: 56, height: 56, borderRadius: 18, justifyContent: "center", alignItems: "center" },
  avatarText: { fontSize: 22, fontWeight: "800", color: "#fff" },
  availDot: {
    position: "absolute", bottom: -2, right: -2,
    width: 14, height: 14, borderRadius: 7, borderWidth: 2.5, borderColor: "#fff",
  },
  cardBody: { flex: 1, gap: 5 },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  cardName: { fontSize: 16, fontWeight: "800", color: "#101720", letterSpacing: -0.3, flex: 1 },
  availBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 },
  availBadgeText: { fontSize: 11, fontWeight: "700" },
  captainRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  captainName: { fontSize: 12, color: "#8696a0", fontWeight: "500" },
  dot: { color: "#c4c9d0", fontSize: 12 },
  starRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#101720", marginLeft: 4 },
  ratingCount: { fontSize: 11, color: "#8696a0", fontWeight: "500" },
  genreScroll: { maxHeight: 28 },
  genreTag: {
    backgroundColor: "#f0fffe", borderRadius: 8, paddingHorizontal: 9,
    paddingVertical: 3, marginRight: 6, borderWidth: 1, borderColor: "#a5f3fc",
  },
  genreText: { fontSize: 10, fontWeight: "700", color: "#02023E" },
  cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  rateLabel: { fontSize: 9, color: "#8696a0", fontWeight: "700", letterSpacing: 0.5 },
  rate: { fontSize: 18, fontWeight: "800", color: "#02023E", letterSpacing: -0.4 },
  rateUnit: { fontSize: 12, fontWeight: "500", color: "#8696a0" },
  metaRight: { gap: 3 },
  minHours: { fontSize: 11, color: "#5a6169", fontWeight: "600" },
  exp: { fontSize: 11, color: "#8696a0", fontWeight: "500" },
  bookBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#02023E", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
  },
  bookBtnOff: { backgroundColor: "#e5e7eb" },
  bookBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  bookBtnTextOff: { color: "#8696a0" },
  emptyState: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#101720" },
  emptySub: { fontSize: 14, color: "#8696a0", textAlign: "center", paddingHorizontal: 20 },
});