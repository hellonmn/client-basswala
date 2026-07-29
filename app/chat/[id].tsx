/**
 * app/chat/[id].tsx — Chat Screen (User App)
 *
 * Uses an INVERTED FlatList so newest messages are at the bottom.
 * KeyboardAvoidingView keeps the input visible above the keyboard.
 * Real-time messages are appended via ChatContext's onNewMessage.
 * Also polls every 5s as a fallback in case WebSocket drops silently.
 *
 * Product-aware messaging:
 *  - Auto-sends a product card when navigating from DJ detail / equipment card
 *  - "+" button opens a picker to browse the captain's DJs & equipment
 *  - Product cards render as rich bubbles with name, price, type badge
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
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
import { chatApi, servicesApi } from "../../services/userApi";
import { useChat } from "../../context/ChatContext";
import { useAuth } from "../../context/AuthContext";

const fmtTime = (d: string) => {
  try { return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

const fmtDate = (d: string) => {
  const date = new Date(d);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// ─── Product Card Component (rendered inside bubble) ────────────────────────
const ProductCard = ({ metadata, isOwn }: { metadata: any; isOwn: boolean }) => {
  const router = useRouter();
  const isDJ = metadata.productType === "dj";

  const handleTap = () => {
    if (isDJ && metadata.productId) {
      router.push({ pathname: "/dj-detail", params: { id: String(metadata.productId) } });
    }
    // Equipment detail could be added later
  };

  return (
    <TouchableOpacity
      onPress={handleTap}
      activeOpacity={0.85}
      style={[
        pc.card,
        isOwn ? pc.cardOwn : pc.cardOther,
      ]}
    >
      {/* Type badge */}
      <View style={[pc.badge, { backgroundColor: isDJ ? "#8b5cf6" : "#f59e0b" }]}>
        <Ionicons name={isDJ ? "musical-notes" : "hardware-chip"} size={10} color="#fff" />
        <Text style={pc.badgeText}>{isDJ ? "DJ" : "Equipment"}</Text>
      </View>

      {/* Product image */}
      {metadata.productImage ? (
        <Image source={{ uri: metadata.productImage }} style={pc.image} />
      ) : (
        <View style={[pc.imagePlaceholder, { backgroundColor: isOwn ? "rgba(255,255,255,0.15)" : "#f0f2f5" }]}>
          <Ionicons name={isDJ ? "person" : "cube"} size={28} color={isOwn ? "rgba(255,255,255,0.5)" : "#c4c9d0"} />
        </View>
      )}

      {/* Info */}
      <Text style={[pc.name, isOwn && { color: "#fff" }]} numberOfLines={1}>
        {metadata.productName || "Product"}
      </Text>
      {metadata.productPrice ? (
        <Text style={[pc.price, isOwn && { color: "rgba(255,255,255,0.85)" }]}>
          ₹{metadata.productPrice}{isDJ ? "/hr" : "/day"}
        </Text>
      ) : null}
      {metadata.productMeta ? (
        <Text style={[pc.meta, isOwn && { color: "rgba(255,255,255,0.7)" }]} numberOfLines={1}>
          {metadata.productMeta}
        </Text>
      ) : null}

      {/* Tap hint */}
      <View style={pc.tapHint}>
        <Text style={[pc.tapHintText, isOwn && { color: "rgba(255,255,255,0.5)" }]}>Tap to view</Text>
        <Ionicons name="chevron-forward" size={12} color={isOwn ? "rgba(255,255,255,0.5)" : "#8696a0"} />
      </View>
    </TouchableOpacity>
  );
};

const pc = StyleSheet.create({
  card: { borderRadius: 12, overflow: "hidden", marginBottom: 6 },
  cardOwn: { backgroundColor: "rgba(0,0,0,0.08)" },
  cardOther: { backgroundColor: "#f8f9fb", borderWidth: 1, borderColor: "#eef0f3" },
  badge: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    gap: 4, margin: 8, marginBottom: 0,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  image: { width: "100%", height: 120, backgroundColor: "#e5e7eb" },
  imagePlaceholder: {
    width: "100%", height: 80, alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 14, fontWeight: "700", color: "#101720", marginHorizontal: 10, marginTop: 8 },
  price: { fontSize: 13, fontWeight: "600", color: "#02023E", marginHorizontal: 10, marginTop: 2 },
  meta: { fontSize: 11, color: "#8696a0", marginHorizontal: 10, marginTop: 2 },
  tapHint: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
    paddingHorizontal: 10, paddingVertical: 6, gap: 2,
  },
  tapHintText: { fontSize: 10, color: "#8696a0" },
});

// ─── Main Chat Screen ───────────────────────────────────────────────────────
export default function ChatScreen() {
  const router = useRouter();
  const { id, name, productRef } = useLocalSearchParams<{ id: string; name: string; productRef?: string }>();
  const conversationId = parseInt(id);
  const { user } = useAuth();
  const { onNewMessage, refreshConversations } = useChat();

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [hasMore, setHasMore] = useState(true);

  // Product picker state
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"djs" | "equipment">("djs");
  const [pickerDJs, setPickerDJs] = useState<any[]>([]);
  const [pickerEquipment, setPickerEquipment] = useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [convData, setConvData] = useState<any>(null);

  const inputRef = useRef<TextInput>(null);
  const productRefSentRef = useRef(false);

  // ─── Load initial messages ───────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    try {
      const res = await chatApi.getMessages(conversationId, { limit: 30 });
      if (res?.success) {
        setMessages(res.data || []);
        setHasMore(res.hasMore || false);
      }
    } catch (err) {
      console.error("Load messages:", err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ─── Load conversation data (to get captainId for product picker) ────────
  useEffect(() => {
    chatApi.getConversations().then((res: any) => {
      if (res?.success) {
        const conv = (res.data || []).find((c: any) => c.id === conversationId);
        if (conv) setConvData(conv);
      }
    }).catch(() => {});
  }, [conversationId]);

  // ─── Auto-send product card when navigating from DJ/equipment detail ─────
  useEffect(() => {
    if (!productRef || productRefSentRef.current || loading) return;
    productRefSentRef.current = true;

    try {
      const ref = JSON.parse(productRef);
      if (!ref?.productName) return;

      const isDJ = ref.productType === "dj";
      const msgText = `Hi! I'm interested in ${isDJ ? "DJ" : ""} ${ref.productName}`;
      const metadata = {
        type: "product_card",
        productType: ref.productType || "dj",
        productId: ref.productId,
        productName: ref.productName,
        productImage: ref.productImage || null,
        productPrice: ref.productPrice || null,
        productMeta: ref.productMeta || null,
      };

      // Send after a short delay so UI is ready
      setTimeout(() => {
        sendProductCard(msgText, metadata);
      }, 600);
    } catch { /* invalid JSON, ignore */ }
  }, [productRef, loading]);

  // ─── Mark as read + refresh unread counts ────────────────────────────────
  useEffect(() => {
    chatApi.markAsRead(conversationId)
      .then(() => refreshConversations())
      .catch(() => {});
    return () => { refreshConversations(); };
  }, [conversationId]);

  // ─── Real-time via WebSocket ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = onNewMessage((data) => {
      if (data.conversationId === conversationId && data.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        chatApi.markAsRead(conversationId).catch(() => {});
      }
    });
    return unsub;
  }, [conversationId, onNewMessage]);

  // ─── Polling fallback every 5s ───────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await chatApi.getMessages(conversationId, { limit: 30 });
        if (res?.success && res.data) {
          setMessages((prev) => {
            const prevIds = new Set(prev.filter((m) => !m._pending).map((m) => m.id));
            const newMsgs = res.data.filter((m: any) => !prevIds.has(m.id));
            if (newMsgs.length === 0) return prev;
            const pending = prev.filter((m) => m._pending);
            return [...res.data, ...pending];
          });
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [conversationId]);

  // ─── Load older messages on scroll up ────────────────────────────────────
  const loadOlder = async () => {
    if (!hasMore || loading || messages.length === 0) return;
    const oldest = messages[0];
    try {
      const res = await chatApi.getMessages(conversationId, { before: oldest.id, limit: 30 });
      if (res?.success) {
        setMessages((prev) => [...(res.data || []), ...prev]);
        setHasMore(res.hasMore || false);
      }
    } catch { /* ignore */ }
  };

  // ─── Send text message ──────────────────────────────────────────────────
  const sendMessage = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const tempId = Date.now();
    const optimistic = {
      id: tempId, conversationId, senderId: user?.id,
      senderType: "user", text: trimmed, isRead: false,
      createdAt: new Date().toISOString(), _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setText("");

    setSending(true);
    try {
      const res = await chatApi.sendMessage(conversationId, trimmed);
      if (res?.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...res.data, _pending: false } : m))
        );
        refreshConversations();
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  };

  // ─── Send product card message ──────────────────────────────────────────
  const sendProductCard = async (msgText: string, metadata: any) => {
    const tempId = Date.now();
    const optimistic = {
      id: tempId, conversationId, senderId: user?.id,
      senderType: "user", text: msgText, metadata,
      isRead: false, createdAt: new Date().toISOString(), _pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await chatApi.sendMessage(conversationId, msgText, metadata);
      if (res?.success) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? { ...res.data, _pending: false } : m))
        );
        refreshConversations();
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  // ─── Product picker helpers ─────────────────────────────────────────────
  const openPicker = async () => {
    Keyboard.dismiss();
    setShowPicker(true);
    setPickerLoading(true);

    try {
      // Resolve captainId — use cached convData or fetch fresh
      let cId = convData?.captainId || convData?.captain?.id;
      if (!cId) {
        const convRes = await chatApi.getConversations();
        if (convRes?.success) {
          const conv = (convRes.data || []).find((c: any) => c.id === conversationId);
          if (conv) {
            setConvData(conv);
            cId = conv.captainId || conv.captain?.id;
          }
        }
      }

      if (!cId) {
        console.warn("Could not resolve captainId for picker");
        setPickerLoading(false);
        return;
      }

      const [djRes, eqRes] = await Promise.all([
        servicesApi.getCaptainDJs(cId).catch((e: any) => { console.error("DJ fetch:", e); return null; }),
        servicesApi.getCaptainEquipment(cId).catch((e: any) => { console.error("Eq fetch:", e); return null; }),
      ]);
      if (djRes?.success) setPickerDJs(djRes.data || []);
      if (eqRes?.success) setPickerEquipment(eqRes.data || []);
    } catch { /* ignore */ }
    finally { setPickerLoading(false); }
  };

  const safeArr = (v: any): any[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") { try { const p = JSON.parse(v); if (Array.isArray(p)) return p; } catch {} }
    return [];
  };

  const pickProduct = (product: any, type: "dj" | "equipment") => {
    setShowPicker(false);
    const isDJ = type === "dj";
    const pName = isDJ
      ? (product.stageName || product.name || "DJ")
      : (product.name || "Equipment");
    const photos = safeArr(product.photos);
    const pImage = isDJ
      ? (product.profilePicture || null)
      : (photos.length > 0 ? photos[0] : null);
    const pPrice = isDJ
      ? (product.hourlyRate || product.pricePerHour || null)
      : (product.pricePerDay || product.dailyRate || null);
    const genres = safeArr(product.genres);
    const pMeta = isDJ
      ? (product.genre || (genres.length ? genres.join(", ") : null))
      : (product.category || null);

    const metadata = {
      type: "product_card",
      productType: type,
      productId: product.id,
      productName: pName,
      productImage: pImage,
      productPrice: pPrice,
      productMeta: pMeta,
    };
    const msgText = `I'd like to know more about ${isDJ ? "DJ" : ""} ${pName}`;
    sendProductCard(msgText, metadata);
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  const invertedData = [...messages].reverse();

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isOwn = item.senderType === "user";
    const nextItem = invertedData[index + 1];
    const showDate = !nextItem || fmtDate(item.createdAt) !== fmtDate(nextItem.createdAt);
    const hasProductCard = item.metadata?.type === "product_card";

    return (
      <View>
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
          {/* Product card (above the text) */}
          {hasProductCard && <ProductCard metadata={item.metadata} isOwn={isOwn} />}

          {/* Text */}
          <Text style={[s.bubbleText, isOwn && { color: "#fff" }]}>{item.text}</Text>

          {/* Time + read status */}
          <View style={s.bubbleMeta}>
            <Text style={[s.bubbleTime, isOwn && { color: "rgba(255,255,255,0.7)" }]}>
              {fmtTime(item.createdAt)}
            </Text>
            {isOwn && (
              <Ionicons
                name={item._pending ? "time-outline" : item.isRead ? "checkmark-done" : "checkmark"}
                size={14}
                color={item.isRead ? "#a5f3fc" : "rgba(255,255,255,0.5)"}
              />
            )}
          </View>
        </View>
        {showDate && (
          <View style={s.dateSep}>
            <Text style={s.dateSepText}>{fmtDate(item.createdAt)}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#101720" />
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerName} numberOfLines={1}>{name || "Chat"}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#02023E" />
          </View>
        ) : (
          <FlatList
            data={invertedData}
            inverted
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={s.messageList}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.3}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={s.emptyChat}>
                <Ionicons name="chatbubble-outline" size={36} color="#c4c9d0" />
                <Text style={s.emptyChatText}>Say hello!</Text>
              </View>
            }
          />
        )}

        {/* Input bar */}
        <View style={s.inputBar}>
          {/* "+" button — product picker */}
          <TouchableOpacity style={s.attachBtn} onPress={openPicker} activeOpacity={0.7}>
            <Ionicons name="add-circle" size={28} color="#02023E" />
          </TouchableOpacity>

          <TextInput
            ref={inputRef}
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor="#8696a0"
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ─── Product Picker Modal ──────────────────────────────────────────── */}
      <Modal visible={showPicker} animationType="slide" transparent onRequestClose={() => setShowPicker(false)}>
        <View style={pk.overlay}>
          <TouchableOpacity style={pk.backdrop} onPress={() => setShowPicker(false)} activeOpacity={1} />
          <View style={pk.sheet}>
            {/* Handle */}
            <View style={pk.handleRow}>
              <View style={pk.handle} />
            </View>

            {/* Title */}
            <Text style={pk.title}>Share a product</Text>

            {/* Tabs */}
            <View style={pk.tabs}>
              <TouchableOpacity
                style={[pk.tab, pickerTab === "djs" && pk.tabActive]}
                onPress={() => setPickerTab("djs")}
              >
                <Ionicons name="musical-notes" size={16} color={pickerTab === "djs" ? "#fff" : "#8696a0"} />
                <Text style={[pk.tabText, pickerTab === "djs" && pk.tabTextActive]}>DJs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[pk.tab, pickerTab === "equipment" && pk.tabActive]}
                onPress={() => setPickerTab("equipment")}
              >
                <Ionicons name="hardware-chip" size={16} color={pickerTab === "equipment" ? "#fff" : "#8696a0"} />
                <Text style={[pk.tabText, pickerTab === "equipment" && pk.tabTextActive]}>Equipment</Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            {pickerLoading ? (
              <View style={pk.loading}>
                <ActivityIndicator size="large" color="#02023E" />
              </View>
            ) : (
              <ScrollView style={pk.list} showsVerticalScrollIndicator={false}>
                {pickerTab === "djs" ? (
                  pickerDJs.length === 0 ? (
                    <View style={pk.empty}>
                      <Ionicons name="musical-notes-outline" size={32} color="#c4c9d0" />
                      <Text style={pk.emptyText}>No DJs available</Text>
                    </View>
                  ) : (
                    pickerDJs.map((dj) => (
                      <TouchableOpacity
                        key={dj.id}
                        style={pk.item}
                        onPress={() => pickProduct(dj, "dj")}
                        activeOpacity={0.7}
                      >
                        {dj.profilePicture ? (
                          <Image source={{ uri: dj.profilePicture }} style={pk.itemImage} />
                        ) : (
                          <View style={[pk.itemImage, pk.itemImagePlaceholder]}>
                            <Ionicons name="person" size={20} color="#c4c9d0" />
                          </View>
                        )}
                        <View style={pk.itemInfo}>
                          <Text style={pk.itemName} numberOfLines={1}>
                            {dj.stageName || dj.name || "DJ"}
                          </Text>
                          <Text style={pk.itemSub} numberOfLines={1}>
                            {dj.genre || (Array.isArray(dj.genres) ? dj.genres : (() => { try { const p = JSON.parse(dj.genres); return Array.isArray(p) ? p : []; } catch { return []; } })()).join(", ") || ""}
                            {dj.hourlyRate || dj.pricePerHour
                              ? ` • ₹${dj.hourlyRate || dj.pricePerHour}/hr`
                              : ""}
                          </Text>
                        </View>
                        <Ionicons name="send" size={18} color="#02023E" />
                      </TouchableOpacity>
                    ))
                  )
                ) : (
                  pickerEquipment.length === 0 ? (
                    <View style={pk.empty}>
                      <Ionicons name="cube-outline" size={32} color="#c4c9d0" />
                      <Text style={pk.emptyText}>No equipment available</Text>
                    </View>
                  ) : (
                    pickerEquipment.map((eq) => {
                      const eqPhotos = Array.isArray(eq.photos) ? eq.photos : (() => { try { const p = JSON.parse(eq.photos); return Array.isArray(p) ? p : []; } catch { return []; } })();
                      const eqImg = eqPhotos.length > 0 ? eqPhotos[0] : null;
                      return (
                        <TouchableOpacity
                          key={eq.id}
                          style={pk.item}
                          onPress={() => pickProduct(eq, "equipment")}
                          activeOpacity={0.7}
                        >
                          {eqImg ? (
                            <Image source={{ uri: eqImg }} style={pk.itemImage} />
                          ) : (
                            <View style={[pk.itemImage, pk.itemImagePlaceholder]}>
                              <Ionicons name="cube" size={20} color="#c4c9d0" />
                            </View>
                          )}
                          <View style={pk.itemInfo}>
                            <Text style={pk.itemName} numberOfLines={1}>
                              {eq.name || "Equipment"}
                            </Text>
                            <Text style={pk.itemSub} numberOfLines={1}>
                              {eq.category || ""}
                              {eq.pricePerDay || eq.dailyRate
                                ? ` • ₹${eq.pricePerDay || eq.dailyRate}/day`
                                : ""}
                            </Text>
                          </View>
                          <Ionicons name="send" size={18} color="#02023E" />
                        </TouchableOpacity>
                      );
                    })
                  )
                )}
                <View style={{ height: 40 }} />
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Product Picker Styles ──────────────────────────────────────────────────
const pk = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: "70%", minHeight: 300,
    paddingBottom: Platform.OS === "ios" ? 34 : 16,
  },
  handleRow: { alignItems: "center", paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#d1d5db" },
  title: { fontSize: 18, fontWeight: "800", color: "#101720", textAlign: "center", marginBottom: 12 },
  tabs: {
    flexDirection: "row", marginHorizontal: 16, marginBottom: 12,
    backgroundColor: "#f4f8ff", borderRadius: 12, padding: 4,
  },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, borderRadius: 10, gap: 6,
  },
  tabActive: { backgroundColor: "#02023E" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#8696a0" },
  tabTextActive: { color: "#fff" },
  loading: { paddingVertical: 60, alignItems: "center" },
  list: { paddingHorizontal: 16 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 14, color: "#8696a0", fontWeight: "600" },
  item: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f0f2f5",
  },
  itemImage: { width: 48, height: 48, borderRadius: 12, backgroundColor: "#e5e7eb" },
  itemImagePlaceholder: { alignItems: "center", justifyContent: "center", backgroundColor: "#f4f8ff" },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "700", color: "#101720" },
  itemSub: { fontSize: 12, color: "#8696a0", marginTop: 2 },
});

// ─── Main Styles ────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: "#f4f8ff", alignItems: "center", justifyContent: "center",
  },
  headerInfo: { flex: 1 },
  headerName: { fontSize: 16, fontWeight: "800", color: "#101720" },

  messageList: { padding: 16, paddingTop: 8 },

  dateSep: { alignItems: "center", marginVertical: 12 },
  dateSepText: {
    fontSize: 11, fontWeight: "700", color: "#8696a0",
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 10, borderWidth: 1, borderColor: "#eef0f3",
    overflow: "hidden",
  },

  bubble: { maxWidth: "78%", padding: 12, borderRadius: 16, marginBottom: 6 },
  bubbleOwn: {
    alignSelf: "flex-end", backgroundColor: "#02023E",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: "flex-start", backgroundColor: "#fff",
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: "#eef0f3",
  },
  bubbleText: { fontSize: 15, color: "#101720", lineHeight: 21 },
  bubbleMeta: {
    flexDirection: "row", alignItems: "center", justifyContent: "flex-end",
    gap: 4, marginTop: 4,
  },
  bubbleTime: { fontSize: 10, color: "#8696a0", fontWeight: "500" },

  emptyChat: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: 60, gap: 8,
    transform: [{ scaleY: -1 }],
  },
  emptyChatText: { fontSize: 14, color: "#8696a0", fontWeight: "600" },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 12, paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 28 : 10,
    backgroundColor: "#fff",
    borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  attachBtn: {
    width: 44, height: 44, alignItems: "center", justifyContent: "center",
  },
  input: {
    flex: 1, fontSize: 15, color: "#101720",
    backgroundColor: "#f4f8ff", borderRadius: 22,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
    maxHeight: 100, borderWidth: 1, borderColor: "#eef0f3",
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#02023E",
    alignItems: "center", justifyContent: "center",
    marginBottom: 0,
  },
});
