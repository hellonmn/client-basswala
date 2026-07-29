/**
 * app/captain/[id].tsx
 * Captain profile page — shows the captain's DJ packages and equipment catalogue.
 * Users can tap a DJ to view its detail page, or add equipment directly to the cart.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { servicesApi, chatApi } from "../../services/userApi";
import { useCart } from "../../context/CartContext";
import { useSaved } from "../../context/SavedContext";
import SmartImage from "../../components/SmartImage";
import PressableScale from "../../components/PressableScale";
import CaptainAvatar from "../../components/CaptainAvatar";
import { shareCaptainProfile, shareEquipment } from "../../utils/share";
import { useLoginGate } from "../../components/LoginGate";
import { useAlert } from "../../components/AppAlert";

const { width } = Dimensions.get("window");

// ─── Design tokens ────────────────────────────────────────────────────────────
// Centralising the palette makes the screen easy to re-theme and keeps the
// styles below readable — every color used more than once lives here.
const colors = {
  bg: "#f6f8fc",
  bgGradient: ["#f6f8fc", "#eef1fb", "#ffffff"] as const,
  surface: "#ffffff",
  border: "#eef0f6",
  borderSoft: "#f1f3f8",
  text: "#12141c",
  textMuted: "#8a93a3",
  textSubtle: "#5a6169",
  primary: "#02023E",
  accent: "#0ea5e9",
  accentSoft: "#f0fbff",
  accentBorder: "#bae6fd",
  success: "#22c55e",
  successSoft: "#f0fdf4",
  successBorder: "#bbf7d0",
  warning: "#f59e0b",
  warningSoft: "#fffbeb",
  warningBorder: "#fde68a",
  danger: "#ef4444",
  dangerSoft: "#fef2f2",
  dangerBorder: "#fecaca",
  disabled: "#d6dae2",
};

const shadow = {
  shadowColor: "#0f1b3d",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 2,
};

const shadowLg = {
  shadowColor: colors.primary,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.28,
  shadowRadius: 16,
  elevation: 10,
};

// ─── Skeleton primitives ──────────────────────────────────────────────────────
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

const SkeletonBox = ({ w, h, radius = 10, style }: { w: any; h: number; radius?: number; style?: any }) => {
  const opacity = useShimmer();
  return (
    <Animated.View
      style={[{ width: w, height: h, borderRadius: radius, backgroundColor: "#dde3ee", opacity }, style]}
    />
  );
};

const CaptainProfileSkeleton = () => (
  <View style={{ padding: 16 }}>
    <View style={[s.headerCard, { marginHorizontal: 0 }]}>
      <SkeletonBox w={88} h={88} radius={28} style={{ marginBottom: 12 }} />
      <SkeletonBox w={180} h={22} radius={8} style={{ marginBottom: 6 }} />
      <SkeletonBox w={120} h={14} radius={6} />
      <View style={[s.statsRow, { marginTop: 20 }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <SkeletonBox w={32} h={20} radius={6} />
            <SkeletonBox w={50} h={10} radius={5} />
          </View>
        ))}
      </View>
    </View>

    <View style={s.tabs}>
      <SkeletonBox w="48%" h={38} radius={10} />
      <View style={{ width: 8 }} />
      <SkeletonBox w="48%" h={38} radius={10} />
    </View>

    {[0, 1, 2].map((i) => (
      <View key={i} style={s.packageCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <SkeletonBox w={52} h={52} radius={16} />
          <View style={{ flex: 1, gap: 6 }}>
            <SkeletonBox w="60%" h={15} radius={7} />
            <SkeletonBox w="40%" h={11} radius={5} />
          </View>
          <View style={{ gap: 6, alignItems: "flex-end" }}>
            <SkeletonBox w={60} h={17} radius={7} />
            <SkeletonBox w={40} h={10} radius={5} />
          </View>
        </View>
      </View>
    ))}
  </View>
);

// ─── Types ─────────────────────────────────────────────────────────────────
interface Captain {
  id: number;
  businessName?: string;
  locationCity?: string;
  locationState?: string;
  profilePicture?: string;
  description?: string;
  serviceRadiusKm?: number;
  isVerified?: boolean;
  djCount?: number;
  equipmentCount?: number;
  userId?: number;
  user?: { id?: number; firstName?: string; lastName?: string; profilePicture?: string };
}

interface CaptainDJ {
  id: number;
  name: string;
  bio?: string;
  genres: string[] | string;
  hourlyRate: number;
  minimumHours: number;
  experienceYears: number;
  isAvailable: boolean;
  ratingAverage?: number;
  ratingCount?: number;
  images?: string[] | string;
  profilePicture?: string;
  equipmentDetails?: { id: number; name: string; category: string }[];
}

interface Equipment {
  id: number;
  name: string;
  category: string;
  brand?: string;
  dailyRate: number;
  hourlyRate?: number;
  images?: string[] | string;
  isAvailable?: boolean;
  description?: string;
  quantity?: number;
  availableQuantity?: number;
}

function safeJson(val: any): any[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try {
    const p = JSON.parse(val);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

// ─── Small presentational pieces ──────────────────────────────────────────────
// Pulling these out keeps the main render tree short and each piece testable
// in isolation.

const StatItem = ({ value, label }: { value: React.ReactNode; label: string }) => (
  <View style={s.stat}>
    <Text style={s.statValue}>{value}</Text>
    <Text style={s.statLabel}>{label}</Text>
  </View>
);

const TabButton = ({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity style={[s.tab, active && s.tabActive]} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name={icon} size={16} color={active ? colors.primary : colors.textMuted} />
    <Text style={[s.tabText, active && s.tabTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const EmptyState = ({ icon, title, subtitle }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }) => (
  <View style={s.emptyState}>
    <Ionicons name={icon} size={44} color={colors.disabled} />
    <Text style={s.emptyTitle}>{title}</Text>
    <Text style={s.emptySub}>{subtitle}</Text>
  </View>
);

const StockPill = ({ stock }: { stock: number }) => {
  const outOfStock = stock <= 0;
  const low = stock > 0 && stock <= 2;
  const bg = outOfStock ? colors.dangerSoft : low ? colors.warningSoft : colors.successSoft;
  const border = outOfStock ? colors.dangerBorder : low ? colors.warningBorder : colors.successBorder;
  const dot = outOfStock ? colors.danger : low ? colors.warning : colors.success;
  const label = outOfStock ? "Out of stock" : low ? `Only ${stock} left` : `${stock} in stock`;
  return (
    <View style={[s.stockPill, { backgroundColor: bg, borderColor: border }]}>
      <View style={[s.stockDot, { backgroundColor: dot }]} />
      <Text style={[s.stockText, { color: outOfStock ? colors.danger : low ? "#b45309" : "#15803d" }]}>{label}</Text>
    </View>
  );
};

const DJPackageCard = ({
  dj,
  saved,
  onToggleSave,
  onPress,
}: {
  dj: CaptainDJ;
  saved: boolean;
  onToggleSave: () => void;
  onPress: () => void;
}) => {
  const genres = Array.isArray(dj.genres) ? dj.genres : safeJson(dj.genres);
  // Same image resolution as the Home cards: gallery first image, else the
  // DJ's profile picture. SmartImage falls back to a branded placeholder if
  // neither loads.
  const djImgs = Array.isArray(dj.images) ? dj.images : safeJson(dj.images);
  const djImage = djImgs[0] || dj.profilePicture || "";

  return (
    <PressableScale style={s.packageCard} scaleTo={0.97} onPress={onPress}>
      <View style={s.packageTop}>
        <SmartImage uri={djImage} style={s.packageAvatar} kind="dj" label={dj.name} iconSize={22} />
        <View style={{ flex: 1 }}>
          <Text style={s.packageName} numberOfLines={1}>{dj.name}</Text>
          <Text style={s.packageMeta}>
            {dj.experienceYears > 0 ? `${dj.experienceYears}yr · ` : ""}
            {dj.minimumHours}h min
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.packagePrice}>₹{Number(dj.hourlyRate).toLocaleString()}</Text>
          <Text style={s.packagePriceUnit}>per hour</Text>
        </View>
        <TouchableOpacity
          style={s.inlineHeart}
          onPress={(e) => {
            e.stopPropagation();
            onToggleSave();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name={saved ? "heart" : "heart-outline"} size={16} color={saved ? colors.danger : colors.textMuted} />
        </TouchableOpacity>
      </View>

      {genres.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {genres.slice(0, 4).map((g: string) => (
              <View key={g} style={s.genreChip}>
                <Text style={s.genreChipText}>{g}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {dj.equipmentDetails && dj.equipmentDetails.length > 0 && (
        <View style={s.includesRow}>
          <Ionicons name="cube-outline" size={13} color={colors.success} />
          <Text style={s.includesText} numberOfLines={1}>
            Includes {dj.equipmentDetails.length} item{dj.equipmentDetails.length > 1 ? "s" : ""}:{" "}
            {dj.equipmentDetails.slice(0, 3).map((e) => e.name).join(", ")}
            {dj.equipmentDetails.length > 3 ? `, +${dj.equipmentDetails.length - 3} more` : ""}
          </Text>
        </View>
      )}

      <View style={s.packageFooter}>
        <View style={[s.availDot, { backgroundColor: dj.isAvailable ? colors.success : colors.danger }]} />
        <Text style={[s.availText, { color: dj.isAvailable ? colors.success : colors.danger }]}>
          {dj.isAvailable ? "Available" : "Busy"}
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={s.viewPackage}>View Package</Text>
        <Ionicons name="arrow-forward" size={13} color={colors.primary} />
      </View>
    </PressableScale>
  );
};

const EquipmentCard = ({
  eq,
  saved,
  onToggleSave,
  onAddToCart,
  onChat,
  onShare,
}: {
  eq: Equipment;
  saved: boolean;
  onToggleSave: () => void;
  onAddToCart: () => void;
  onChat: () => void;
  onShare: () => void;
}) => {
  const images = Array.isArray(eq.images) ? eq.images : safeJson(eq.images);
  const stock = Number(eq.availableQuantity ?? eq.quantity ?? 0);
  const outOfStock = stock <= 0;

  return (
    <View style={[s.equipmentCard, outOfStock && { opacity: 0.6 }]}>
      <SmartImage uri={images[0]} style={s.equipmentImageWrap as any} kind="equipment" label={eq.name} iconSize={24} />
      <View style={{ flex: 1 }}>
        <Text style={s.equipmentName} numberOfLines={1}>{eq.name}</Text>
        <Text style={s.equipmentCat} numberOfLines={1}>
          {eq.category}
          {eq.brand ? " · " + eq.brand : ""}
        </Text>
        <Text style={s.equipmentPrice}>
          ₹{Number(eq.dailyRate).toLocaleString()}
          <Text style={s.equipmentPriceUnit}> /day</Text>
        </Text>
        <StockPill stock={stock} />
      </View>
      <View style={{ gap: 6, alignItems: "flex-end" }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity style={s.eqChatBtn} onPress={onChat} activeOpacity={0.8}>
            <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="share-social-outline" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onToggleSave} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={saved ? "heart" : "heart-outline"} size={18} color={saved ? colors.danger : colors.textMuted} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[s.addBtn, outOfStock && { backgroundColor: colors.disabled }]}
          onPress={() => !outOfStock && onAddToCart()}
          disabled={outOfStock}
          activeOpacity={0.85}
        >
          <Ionicons name={outOfStock ? "close-circle" : "add"} size={16} color="#fff" />
          <Text style={s.addBtnText}>{outOfStock ? "N/A" : "Add"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function CaptainProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const captainId = parseInt(params.id as string);
  const { addItem, replaceCart, itemCount, captain: cartCaptain } = useCart();
  const { isCaptainSaved, toggleCaptain, isDJSaved, toggleDJ, isEquipmentSaved, toggleEquipment } = useSaved();
  const { ensureLogin } = useLoginGate();
  const { alert: appAlert } = useAlert();

  const [captain, setCaptain] = useState<Captain | null>(null);
  const [djs, setDjs] = useState<CaptainDJ[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"packages" | "equipment">("packages");

  const loadProfile = useCallback(async () => {
    try {
      const [capRes, djRes, eqRes] = await Promise.all([
        servicesApi.getCaptainById(captainId),
        servicesApi.getCaptainDJs(captainId),
        servicesApi.getCaptainEquipment(captainId),
      ]);
      if (capRes?.success) setCaptain(capRes.data);
      if (djRes?.success) setDjs(djRes.data || []);
      if (eqRes?.success) setEquipment(eqRes.data || []);
    } catch (err) {
      console.error("Captain profile load error:", err);
    }
  }, [captainId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadProfile();
        if (cancelled) return;
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captainId]);

  // Back button with safe fallback — if there's no history (e.g. we were
  // deep-linked or got here from the cart after the previous screen was
  // popped), go home rather than getting stuck on this page.
  const goBack = useCallback(() => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)" as any);
    }
  }, [router]);

  const handleAddToCart = (eq: Equipment) => {
    if (!captain) return;
    const stock = Number(eq.availableQuantity ?? eq.quantity ?? 0);
    if (stock <= 0) {
      Alert.alert("Out of stock", `${eq.name} is currently out of stock.`);
      return;
    }
    const payload = {
      id: eq.id,
      name: eq.name,
      category: eq.category,
      brand: eq.brand,
      dailyRate: Number(eq.dailyRate) || 0,
      images: Array.isArray(eq.images) ? eq.images : typeof eq.images === "string" ? safeJson(eq.images) : [],
      maxStock: stock,
    };
    const cartCaptainInfo = {
      id: captain.id,
      businessName: captain.businessName,
      locationCity: captain.locationCity,
    };
    const res = addItem(payload, cartCaptainInfo);
    if (!res.ok && res.message) {
      // Different-captain conflict → offer to replace the cart.
      // Stock cap → just surface the message.
      const isDifferentCaptain = res.message.includes("captain");
      if (isDifferentCaptain) {
        Alert.alert("Different Captain", res.message, [
          { text: "Cancel", style: "cancel" },
          { text: "Clear & Add", onPress: () => replaceCart(payload, cartCaptainInfo) },
        ]);
      } else {
        Alert.alert("Can't add more", res.message);
      }
    }
  };

  const openChat = useCallback(
    async (productMeta?: { id: number; name: string; price: string; meta: string }) => {
      const ok = await ensureLogin();
      if (!ok) return;
      const captainUserId = (captain as any)?.userId ?? captain?.user?.id;
      try {
        const res = await chatApi.getOrCreateConversation(captainId, productMeta ? undefined : captainUserId);
        if (res?.success && res.data) {
          const cName = captain?.businessName || "Captain";
          router.push({
            pathname: productMeta ? "/chat/[id]" : "/chat/[id]",
            params: productMeta
              ? {
                  id: res.data.id,
                  name: cName,
                  productRef: JSON.stringify({
                    type: "product_card",
                    productType: "equipment",
                    productId: productMeta.id,
                    productName: productMeta.name,
                    productPrice: productMeta.price,
                    productMeta: productMeta.meta,
                  }),
                }
              : { id: res.data.id, name: cName, avatar: captain?.profilePicture || "" },
          } as any);
        } else {
          await appAlert({ title: "Couldn't open chat", message: res?.message || "Please try again in a moment.", tone: "error" });
        }
      } catch (err: any) {
        console.error("Chat:", err);
        await appAlert({
          title: "Couldn't open chat",
          message: err?.response?.data?.message || err?.message || "Please check your internet connection and try again.",
          tone: "error",
        });
      }
    },
    [captain, captainId, ensureLogin, router, appAlert]
  );

  if (loading) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
        <SafeAreaView style={s.container} edges={["top"]}>
          <LinearGradient colors={colors.bgGradient} style={{ flex: 1 }}>
            <View style={s.topBar}>
              <TouchableOpacity onPress={goBack} style={s.iconBtn}>
                <Ionicons name="arrow-back" size={20} color={colors.text} />
              </TouchableOpacity>
              <Text style={s.topBarTitle}>Captain Profile</Text>
              <View style={{ width: 42 }} />
            </View>
            <CaptainProfileSkeleton />
          </LinearGradient>
        </SafeAreaView>
      </>
    );
  }

  if (!captain) {
    return (
      <SafeAreaView style={s.center}>
        <Ionicons name="storefront-outline" size={48} color={colors.disabled} />
        <Text style={{ fontSize: 16, fontWeight: "700", marginTop: 12, color: colors.text }}>Captain not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontWeight: "700" }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const name = captain.businessName || `${captain.user?.firstName || ""} ${captain.user?.lastName || ""}`.trim() || "Captain";

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
      <SafeAreaView style={s.container} edges={["top"]}>
        <LinearGradient colors={colors.bgGradient} style={{ flex: 1 }}>
          {/* Top bar */}
          <View style={s.topBar}>
            <TouchableOpacity onPress={goBack} style={s.iconBtn}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={s.topBarTitle} numberOfLines={1}>Captain Profile</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => shareCaptainProfile({ captainId, businessName: captain.businessName, city: captain.locationCity })}
                style={s.iconBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="share-social-outline" size={20} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => toggleCaptain(captainId)} style={s.iconBtn} activeOpacity={0.8}>
                <Ionicons
                  name={isCaptainSaved(captainId) ? "heart" : "heart-outline"}
                  size={20}
                  color={isCaptainSaved(captainId) ? colors.danger : colors.text}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/cart" as any)} style={s.iconBtn}>
                <Ionicons name="cart-outline" size={20} color={colors.text} />
                {itemCount > 0 && (
                  <View style={s.cartBadge}>
                    <Text style={s.cartBadgeText}>{itemCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          >
            {/* Header card */}
            <View style={s.headerCard}>
              <View style={s.avatarWrap}>
                {/* CaptainAvatar wraps the http-check + onError fallback, so a
                    missing or broken Cloudinary URL silently degrades to the
                    initials chip instead of a grey broken icon. */}
                <CaptainAvatar
                  uri={captain.profilePicture || captain.user?.profilePicture || (captain as any).user?.avatar || (captain as any).avatar}
                  name={captain.businessName || captain.user?.firstName || "Captain"}
                  size={72}
                  radius={24}
                  textSize={28}
                />
                {captain.isVerified && (
                  <View style={s.verifiedBadge}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </View>
              <Text style={s.captainName}>{name}</Text>
              {captain.locationCity && (
                <View style={s.locRow}>
                  <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                  <Text style={s.locText}>
                    {captain.locationCity}
                    {captain.locationState ? ", " + captain.locationState : ""}
                  </Text>
                </View>
              )}

              <View style={s.statsRow}>
                <StatItem value={captain.djCount ?? djs.length} label="Packages" />
                <View style={s.statDivider} />
                <StatItem value={captain.equipmentCount ?? equipment.length} label="Equipment" />
                <View style={s.statDivider} />
                <StatItem value={<>{captain.serviceRadiusKm ?? 50}<Text style={{ fontSize: 12 }}>km</Text></>} label="Radius" />
              </View>

              {captain.description && <Text style={s.description}>{captain.description}</Text>}
            </View>

            {/* Tabs */}
            <View style={s.tabs}>
              <TabButton icon="musical-notes-outline" label={`Packages (${djs.length})`} active={tab === "packages"} onPress={() => setTab("packages")} />
              <TabButton icon="hardware-chip-outline" label={`Equipment (${equipment.length})`} active={tab === "equipment"} onPress={() => setTab("equipment")} />
            </View>

            {/* Packages tab */}
            {tab === "packages" && (
              <View style={s.listWrap}>
                {djs.length === 0 ? (
                  <EmptyState
                    icon="musical-notes-outline"
                    title="No packages yet"
                    subtitle="This captain hasn't added any DJ packages."
                  />
                ) : (
                  djs.map((dj) => (
                    <DJPackageCard
                      key={dj.id}
                      dj={dj}
                      saved={isDJSaved(dj.id)}
                      onToggleSave={() => toggleDJ(dj.id)}
                      onPress={() => router.push({ pathname: "/dj-detail", params: { djId: dj.id, captainId: captain.id } } as any)}
                    />
                  ))
                )}
              </View>
            )}

            {/* Equipment tab */}
            {tab === "equipment" && (
              <View style={s.listWrap}>
                {equipment.length === 0 ? (
                  <EmptyState
                    icon="hardware-chip-outline"
                    title="No equipment available"
                    subtitle="Check back later for individual equipment rentals."
                  />
                ) : (
                  equipment.map((eq) => (
                    <EquipmentCard
                      key={eq.id}
                      eq={eq}
                      saved={isEquipmentSaved(eq.id)}
                      onToggleSave={() => toggleEquipment(eq.id)}
                      onAddToCart={() => handleAddToCart(eq)}
                      onShare={() => shareEquipment({ equipmentId: eq.id, name: eq.name, dailyRate: eq.dailyRate })}
                      onChat={() =>
                        openChat({
                          id: eq.id,
                          name: eq.name,
                          price: `₹${Number(eq.dailyRate).toLocaleString()}/day`,
                          meta: `${eq.category}${eq.brand ? " · " + eq.brand : ""}`,
                        })
                      }
                    />
                  ))
                )}
              </View>
            )}
          </ScrollView>

          {/* Chat floating button */}
          <TouchableOpacity style={s.chatFab} onPress={() => openChat()} activeOpacity={0.85}>
            <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Sticky cart bar */}
          {itemCount > 0 && (
            <TouchableOpacity style={s.cartBar} onPress={() => router.push("/cart" as any)} activeOpacity={0.9}>
              <LinearGradient colors={[colors.primary, "#1a1a5e"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.cartBarGrad}>
                <View style={s.cartBarIconWrap}>
                  <Ionicons name="cart" size={18} color="#fff" />
                  <View style={s.cartBarBadge}>
                    <Text style={s.cartBarBadgeText}>{itemCount}</Text>
                  </View>
                </View>
                <Text style={s.cartBarText}>View Cart</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </LinearGradient>
      </SafeAreaView>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  topBarTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  cartBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  headerCard: {
    margin: 16,
    padding: 22,
    backgroundColor: colors.surface,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  avatarWrap: { position: "relative", marginBottom: 12 },
  verifiedBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  captainName: { fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  locText: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    marginTop: 16,
    paddingTop: 16,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    alignSelf: "stretch",
  },
  stat: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 20, fontWeight: "800", color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: "600", marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: colors.borderSoft },
  description: { marginTop: 14, fontSize: 13, color: colors.textSubtle, textAlign: "center", lineHeight: 19 },

  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12 },
  tabActive: { backgroundColor: colors.accentSoft },
  tabText: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  tabTextActive: { color: colors.primary },

  listWrap: { paddingHorizontal: 16, gap: 10 },

  // Package cards
  packageCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    ...shadow,
  },
  packageTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  packageAvatar: { width: 52, height: 52, borderRadius: 16, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  packageName: { fontSize: 15, fontWeight: "800", color: colors.text },
  packageMeta: { fontSize: 11, color: colors.textMuted, fontWeight: "500", marginTop: 2 },
  packagePrice: { fontSize: 17, fontWeight: "800", color: colors.primary },
  packagePriceUnit: { fontSize: 10, color: colors.textMuted, fontWeight: "500" },
  inlineHeart: {
    marginLeft: 10,
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  genreChip: { backgroundColor: colors.accentSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: colors.accentBorder },
  genreChipText: { fontSize: 10, fontWeight: "700", color: colors.primary },
  includesRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    padding: 8,
    backgroundColor: colors.successSoft,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  includesText: { fontSize: 11, color: "#15803d", fontWeight: "600", flex: 1 },
  packageFooter: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSoft },
  availDot: { width: 8, height: 8, borderRadius: 4 },
  availText: { fontSize: 11, fontWeight: "700" },
  viewPackage: { fontSize: 12, fontWeight: "700", color: colors.primary },

  // Equipment cards
  equipmentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    ...shadow,
  },
  equipmentImageWrap: { width: 64, height: 64, borderRadius: 14, backgroundColor: colors.accentSoft, overflow: "hidden" },
  equipmentName: { fontSize: 14, fontWeight: "800", color: colors.text },
  equipmentCat: { fontSize: 11, color: colors.textMuted, fontWeight: "500", marginTop: 2 },
  equipmentPrice: { fontSize: 14, fontWeight: "800", color: colors.primary, marginTop: 4 },
  equipmentPriceUnit: { fontSize: 10, color: colors.textMuted, fontWeight: "600" },
  stockPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, marginTop: 6, alignSelf: "flex-start" },
  stockDot: { width: 5, height: 5, borderRadius: 3 },
  stockText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  eqChatBtn: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accentBorder, alignItems: "center", justifyContent: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14 },
  addBtnText: { fontSize: 12, fontWeight: "800", color: "#fff" },

  emptyState: { alignItems: "center", padding: 40, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 10 },
  emptySub: { fontSize: 12, color: colors.textMuted, textAlign: "center" },

  chatFab: {
    position: "absolute",
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
    ...shadowLg,
  },

  cartBar: { position: "absolute", bottom: 16, left: 16, right: 16, borderRadius: 20, overflow: "hidden", ...shadowLg },
  cartBarGrad: { flexDirection: "row", alignItems: "center", paddingVertical: 14, paddingHorizontal: 18, gap: 12 },
  cartBarIconWrap: { position: "relative" },
  cartBarBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    backgroundColor: "#fff",
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBarBadgeText: { fontSize: 10, fontWeight: "800", color: colors.primary },
  cartBarText: { flex: 1, fontSize: 15, fontWeight: "800", color: "#fff" },
});