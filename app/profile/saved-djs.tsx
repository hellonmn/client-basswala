/**
 * app/profile/saved-djs.tsx — Saved / Favourites screen
 *
 * Shows saved Captains and DJs from the shared SavedContext (AsyncStorage-
 * backed). Two tabs: Captains | DJs. Fetches full details from the backend
 * using the saved IDs.
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useState, useCallback, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { servicesApi } from "../../services/userApi";
import { useSaved } from "../../context/SavedContext";
import SmartImage from "../../components/SmartImage";
import CaptainAvatar from "../../components/CaptainAvatar";

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skel({ w, h, r = 8 }: { w: number | string; h: number; r?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={{
        width: w as any,
        height: h,
        borderRadius: r,
        backgroundColor: "#e5e7eb",
        opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] }),
      }}
    />
  );
}

function safeArray(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
}

// ─── Captain Card ─────────────────────────────────────────────────────────────
function CaptainCard({
  captain,
  onRemove,
  onOpen,
}: {
  captain: any;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const initial = (captain.businessName?.[0] || captain.user?.firstName?.[0] || "C").toUpperCase();
  const name = captain.businessName || `${captain.user?.firstName ?? ""} ${captain.user?.lastName ?? ""}`.trim() || "Captain";

  return (
    <TouchableOpacity style={c.captainCard} activeOpacity={0.92} onPress={onOpen}>
      <View style={c.captainLeft}>
        {/* CaptainAvatar handles the http-check + onError fallback so a
            broken or missing profile photo silently falls back to initials. */}
        <CaptainAvatar
          uri={captain.profilePicture}
          name={name}
          size={56}
          radius={18}
          textSize={22}
        />
        {captain.isVerified && (
          <View style={c.verifiedBadge}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={c.captainName} numberOfLines={1}>{name}</Text>
        {captain.locationCity && (
          <View style={c.locRow}>
            <Ionicons name="location-outline" size={11} color="#8696a0" />
            <Text style={c.locText} numberOfLines={1}>{captain.locationCity}</Text>
          </View>
        )}
        <View style={c.captainStats}>
          <View style={c.statPill}>
            <Ionicons name="musical-notes-outline" size={10} color="#02023E" />
            <Text style={c.statPillText}>{captain.djCount ?? 0} pkg</Text>
          </View>
          <View style={c.statPill}>
            <Ionicons name="hardware-chip-outline" size={10} color="#f59e0b" />
            <Text style={c.statPillText}>{captain.equipmentCount ?? 0} gear</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={c.removeBtn}
        onPress={onRemove}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="heart" size={16} color="#ef4444" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ─── DJ Card ──────────────────────────────────────────────────────────────────
function DJCard({
  dj,
  onRemove,
  onOpen,
}: {
  dj: any;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const genres = safeArray(dj.genres);
  const images = safeArray(dj.images);
  const image = images[0] || dj.profilePicture || "";
  const rating = parseFloat(dj.ratingAverage ?? 0).toFixed(1);
  const rate = Math.round(dj.hourlyRate ?? 0).toLocaleString("en-IN");

  return (
    <TouchableOpacity style={c.djCard} activeOpacity={0.92} onPress={onOpen}>
      <View style={c.djImgWrap}>
        <SmartImage uri={image} style={c.djImg} kind="dj" label={dj.name} iconSize={48} />
        <LinearGradient colors={["transparent", "rgba(16,23,32,0.72)"]} style={c.djImgGrad} />

        <TouchableOpacity
          style={c.djRemoveBtn}
          onPress={onRemove}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="heart" size={16} color="#ef4444" />
        </TouchableOpacity>

        <View style={[c.availBadge, !dj.isAvailable && c.availBadgeOff]}>
          <View style={[c.availDot, !dj.isAvailable && { backgroundColor: "#d1d5db" }]} />
          <Text style={c.availText}>{dj.isAvailable ? "Available" : "Busy"}</Text>
        </View>

        <View style={c.djNameWrap}>
          <Text style={c.djGenre} numberOfLines={1}>
            {genres.slice(0, 2).join(" · ") || "DJ"}
          </Text>
          <Text style={c.djName} numberOfLines={1}>{dj.name}</Text>
          <View style={c.djMetaRow}>
            <Ionicons name="star" size={11} color="#FFC107" />
            <Text style={c.djRating}>{rating}</Text>
            <Text style={c.djRatingCount}>({dj.ratingCount ?? 0})</Text>
            <Text style={c.djRateText}>  ₹{rate}/hr</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SavedScreen() {
  const router = useRouter();
  const { savedCaptains, savedDJs, savedEquipment, toggleCaptain, toggleDJ, toggleEquipment } = useSaved();

  const [tab, setTab] = useState<"captains" | "djs" | "equipment">("captains");
  const [captainList, setCaptainList] = useState<any[]>([]);
  const [djList, setDJList] = useState<any[]>([]);
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSaved = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const captainIds = Array.from(savedCaptains);
        const djIds = Array.from(savedDJs);
        const equipmentIds = Array.from(savedEquipment);

        const capPromises = captainIds.map((id) =>
          servicesApi.getCaptainById(id).then((r: any) => r?.data).catch(() => null)
        );

        // DJs and Equipment: fetch the whole list once then filter client-side
        const djAllPromise = djIds.length > 0
          ? servicesApi.getAllDJs().then((r: any) => (r?.success ? r.data || [] : []))
          : Promise.resolve([]);

        const eqAllPromise = equipmentIds.length > 0
          ? servicesApi.getAllEquipment().then((r: any) => (r?.success ? r.data || [] : []))
          : Promise.resolve([]);

        const [capResults, djAll, eqAll] = await Promise.all([
          Promise.all(capPromises),
          djAllPromise,
          eqAllPromise,
        ]);

        setCaptainList(capResults.filter(Boolean));
        const djIdSet = new Set(djIds);
        setDJList((djAll as any[]).filter((d: any) => djIdSet.has(d.id)));
        const eqIdSet = new Set(equipmentIds);
        setEquipmentList((eqAll as any[]).filter((e: any) => eqIdSet.has(e.id)));
      } catch (err) {
        console.error("Failed to load saved items:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [savedCaptains, savedDJs, savedEquipment]
  );

  useFocusEffect(
    useCallback(() => {
      loadSaved();
    }, [loadSaved])
  );

  const handleRemoveCaptain = (id: number) => {
    Alert.alert("Remove captain?", "Remove from your saved list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          toggleCaptain(id);
          setCaptainList((prev) => prev.filter((c) => c.id !== id));
        },
      },
    ]);
  };

  const handleRemoveDJ = (id: number) => {
    Alert.alert("Remove DJ?", "Remove from your saved list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          toggleDJ(id);
          setDJList((prev) => prev.filter((d) => d.id !== id));
        },
      },
    ]);
  };

  const handleRemoveEquipment = (id: number) => {
    Alert.alert("Remove equipment?", "Remove from your saved list?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          toggleEquipment(id);
          setEquipmentList((prev) => prev.filter((e) => e.id !== id));
        },
      },
    ]);
  };

  const currentCount =
    tab === "captains" ? captainList.length :
    tab === "djs" ? djList.length :
    equipmentList.length;
  const totalSaved = savedCaptains.size + savedDJs.size + savedEquipment.size;

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color="#101720" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Saved</Text>
          {totalSaved > 0 && (
            <Text style={s.headerSub}>
              {totalSaved} item{totalSaved !== 1 ? "s" : ""} saved
            </Text>
          )}
        </View>
        <View style={{ width: 42 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, tab === "captains" && s.tabActive]}
          onPress={() => setTab("captains")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="storefront-outline"
            size={14}
            color={tab === "captains" ? "#02023E" : "#8696a0"}
          />
          <Text style={[s.tabText, tab === "captains" && s.tabTextActive]}>
            Captains ({savedCaptains.size})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === "djs" && s.tabActive]}
          onPress={() => setTab("djs")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="musical-notes-outline"
            size={14}
            color={tab === "djs" ? "#02023E" : "#8696a0"}
          />
          <Text style={[s.tabText, tab === "djs" && s.tabTextActive]}>
            DJs ({savedDJs.size})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, tab === "equipment" && s.tabActive]}
          onPress={() => setTab("equipment")}
          activeOpacity={0.85}
        >
          <Ionicons
            name="hardware-chip-outline"
            size={14}
            color={tab === "equipment" ? "#02023E" : "#8696a0"}
          />
          <Text style={[s.tabText, tab === "equipment" && s.tabTextActive]}>
            Gear ({savedEquipment.size})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={{ marginBottom: 12, backgroundColor: "#fff", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#eef0f3" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Skel w={56} h={56} r={18} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skel w="60%" h={14} r={6} />
                  <Skel w="40%" h={10} r={5} />
                  <Skel w="50%" h={10} r={5} />
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : currentCount === 0 ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <Ionicons name="heart-outline" size={44} color="#02023E" />
          </View>
          <Text style={s.emptyTitle}>
            No Saved {tab === "captains" ? "Captains" : tab === "djs" ? "DJs" : "Equipment"} Yet
          </Text>
          <Text style={s.emptySub}>
            Tap the ♥ on any {tab === "captains" ? "captain" : tab === "djs" ? "DJ" : "equipment item"} to save them here for quick access.
          </Text>
          <TouchableOpacity
            style={s.browseBtn}
            activeOpacity={0.85}
            onPress={() => router.push("/(tabs)/explore" as any)}
          >
            <Ionicons name="search-outline" size={18} color="#fff" />
            <Text style={s.browseBtnText}>Browse</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadSaved(true)}
              colors={["#02023E"]}
            />
          }
        >
          {tab === "captains" &&
            captainList.map((cap) => (
              <CaptainCard
                key={cap.id}
                captain={cap}
                onRemove={() => handleRemoveCaptain(cap.id)}
                onOpen={() => router.push(`/captain/${cap.id}` as any)}
              />
            ))}

          {tab === "djs" &&
            djList.map((dj) => (
              <DJCard
                key={dj.id}
                dj={dj}
                onRemove={() => handleRemoveDJ(dj.id)}
                onOpen={() =>
                  router.push({
                    pathname: "/dj-detail",
                    params: { djId: dj.id, captainId: dj.captain?.id ?? dj.captainId },
                  } as any)
                }
              />
            ))}

          {tab === "equipment" &&
            equipmentList.map((eq) => {
              const images = safeArray(eq.images);
              return (
                <TouchableOpacity
                  key={eq.id}
                  style={c.equipmentCard}
                  onPress={() =>
                    eq.captain?.id && router.push(`/captain/${eq.captain.id}` as any)
                  }
                  activeOpacity={0.92}
                >
                  <SmartImage
                    uri={images[0]}
                    style={c.equipmentImgWrap as any}
                    kind="equipment"
                    label={eq.name}
                    iconSize={22}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={c.equipmentName} numberOfLines={1}>{eq.name}</Text>
                    <Text style={c.equipmentCat} numberOfLines={1}>
                      {eq.category}
                      {eq.brand ? " · " + eq.brand : ""}
                    </Text>
                    {eq.captain?.businessName && (
                      <Text style={c.equipmentOwner} numberOfLines={1}>
                        {eq.captain.businessName}
                      </Text>
                    )}
                    <Text style={c.equipmentPrice}>
                      ₹{Number(eq.dailyRate).toLocaleString()}
                      <Text style={{ fontSize: 10, color: "#8696a0" }}> /day</Text>
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={c.removeBtn}
                    onPress={() => handleRemoveEquipment(eq.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="heart" size={16} color="#ef4444" />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}

          <View style={s.tip}>
            <Ionicons name="information-circle-outline" size={14} color="#8696a0" />
            <Text style={s.tipText}>
              Tap the ♥ icon anywhere to add or remove items from this list.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: "#f4f8ff",
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: "#8696a0", fontWeight: "500", marginTop: 2 },

  tabs: {
    flexDirection: "row", marginHorizontal: 20, marginTop: 14,
    backgroundColor: "#fff", borderRadius: 14, padding: 4,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  tabActive: { backgroundColor: "#f0fffe" },
  tabText: { fontSize: 13, fontWeight: "700", color: "#8696a0" },
  tabTextActive: { color: "#02023E" },

  scroll: { paddingHorizontal: 20, paddingTop: 16 },

  emptyWrap: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 },
  emptyIcon: {
    width: 100, height: 100, borderRadius: 32,
    backgroundColor: "#f0fafa",
    justifyContent: "center", alignItems: "center",
    marginBottom: 20, borderWidth: 1, borderColor: "#d0f0ef",
  },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: "#101720", marginBottom: 10, textAlign: "center" },
  emptySub: {
    fontSize: 14, color: "#8696a0", textAlign: "center",
    lineHeight: 22, fontWeight: "500", marginBottom: 28,
  },
  browseBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#101720", borderRadius: 16,
    paddingHorizontal: 28, paddingVertical: 14,
  },
  browseBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  tip: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#f9fafb", borderRadius: 14, padding: 14,
    marginTop: 4, borderWidth: 1, borderColor: "#e5e7eb",
  },
  tipText: { flex: 1, fontSize: 12, color: "#8696a0", lineHeight: 17, fontWeight: "500" },
});

const c = StyleSheet.create({
  // Captain card
  captainCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 16, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: "#eef0f3",
  },
  captainLeft: { position: "relative" },
  captainAvatar: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  captainAvatarText: { fontSize: 22, fontWeight: "800", color: "#fff" },
  verifiedBadge: {
    position: "absolute", bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#02023E",
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  captainName: { fontSize: 15, fontWeight: "800", color: "#101720" },
  locRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  locText: { fontSize: 11, color: "#8696a0", fontWeight: "500" },
  captainStats: { flexDirection: "row", gap: 6, marginTop: 6 },
  statPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#f8fafc", borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  statPillText: { fontSize: 10, fontWeight: "700", color: "#101720" },
  removeBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "#fef2f2",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#fecaca",
  },

  // DJ card
  djCard: {
    backgroundColor: "#fff", borderRadius: 20, overflow: "hidden",
    marginBottom: 16, borderWidth: 1, borderColor: "#eef0f3",
  },
  djImgWrap: { position: "relative", height: 200 },
  djImg: { width: "100%", height: "100%", backgroundColor: "#e5e7eb" },
  djImgGrad: { ...StyleSheet.absoluteFillObject },
  djRemoveBtn: {
    position: "absolute", top: 12, right: 12,
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.92)",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#fecaca",
  },
  availBadge: {
    position: "absolute", top: 12, left: 12,
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
  },
  availBadgeOff: { backgroundColor: "rgba(220,220,220,0.85)" },
  availDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  availText: { fontSize: 10, fontWeight: "700", color: "#101720" },
  djNameWrap: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 14 },
  djGenre: {
    fontSize: 9, fontWeight: "700",
    color: "rgba(255,255,255,0.55)", letterSpacing: 0.8,
    textTransform: "uppercase", marginBottom: 3,
  },
  djName: { fontSize: 18, fontWeight: "800", color: "#fff", letterSpacing: -0.4, marginBottom: 5 },
  djMetaRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  djRating: { fontSize: 12, fontWeight: "700", color: "#fff" },
  djRatingCount: { fontSize: 11, color: "rgba(255,255,255,0.55)" },
  djRateText: { fontSize: 13, fontWeight: "700", color: "#02023E" },

  // Equipment card (saved tab)
  equipmentCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 16, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: "#eef0f3",
  },
  equipmentImgWrap: {
    width: 64, height: 64, borderRadius: 14,
    backgroundColor: "#f0fffe", overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  equipmentImg: { width: "100%", height: "100%" },
  equipmentName: { fontSize: 14, fontWeight: "800", color: "#101720" },
  equipmentCat: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginTop: 2 },
  equipmentOwner: { fontSize: 10, color: "#02023E", fontWeight: "600", marginTop: 2 },
  equipmentPrice: { fontSize: 13, fontWeight: "800", color: "#02023E", marginTop: 4 },
});
