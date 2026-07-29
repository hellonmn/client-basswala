/**
 * app/chat/index.tsx — Conversation List (User App)
 */

import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useChat } from "../../context/ChatContext";
import CaptainAvatar from "../../components/CaptainAvatar";

const timeAgo = (d: string) => {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

export default function ConversationList() {
  const router = useRouter();
  const { conversations, totalUnread, loading, refreshConversations } = useChat();

  const openChat = (conv: any) => {
    const captainName = conv.captain?.businessName
      || `${conv.captain?.user?.firstName || ""} ${conv.captain?.user?.lastName || ""}`.trim()
      || "Captain";
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: conv.id,
        name: captainName,
        avatar: conv.captain?.profilePicture || "",
      },
    } as any);
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <View style={s.header}>
        <Text style={s.headerTitle}>Messages</Text>
        {totalUnread > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{totalUnread}</Text>
          </View>
        )}
      </View>

      {loading && conversations.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#02023E" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => {
            const captain = item.captain;
            const name = captain?.businessName
              || `${captain?.user?.firstName || ""} ${captain?.user?.lastName || ""}`.trim()
              || "Captain";
            const avatar = captain?.profilePicture;
            const initial = (name[0] || "C").toUpperCase();
            const unread = item.unreadUser || 0;

            return (
              <TouchableOpacity style={s.row} onPress={() => openChat(item)} activeOpacity={0.85}>
                {/* CaptainAvatar handles the http-check, host
                    normalisation (so dev/ngrok URLs resolve via the
                    current API host) AND the initials fallback on
                    image load failure. */}
                <CaptainAvatar uri={avatar} name={name} size={48} radius={14} />

                <View style={s.rowBody}>
                  <View style={s.rowTop}>
                    <Text style={[s.rowName, unread > 0 && { fontWeight: "800" }]} numberOfLines={1}>{name}</Text>
                    <Text style={[s.rowTime, unread > 0 && { color: "#02023E" }]}>{timeAgo(item.lastMessageAt)}</Text>
                  </View>
                  <View style={s.rowBottom}>
                    <Text style={[s.rowPreview, unread > 0 && { color: "#101720", fontWeight: "600" }]} numberOfLines={1}>
                      {item.lastMessage || "Tap to start chatting"}
                    </Text>
                    {unread > 0 && (
                      <View style={s.unreadBadge}>
                        <Text style={s.unreadText}>{unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="chatbubbles-outline" size={48} color="#c4c9d0" />
              </View>
              <Text style={s.emptyTitle}>No conversations yet</Text>
              <Text style={s.emptySub}>
                Visit a captain's profile and tap "Chat" to start a conversation.
              </Text>
            </View>
          }
          contentContainerStyle={conversations.length === 0 ? { flex: 1 } : { paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refreshConversations} tintColor="#02023E" colors={["#02023E"]} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: "#101720", letterSpacing: -0.5 },
  badge: {
    backgroundColor: "#02023E", borderRadius: 12,
    minWidth: 24, height: 24, paddingHorizontal: 8,
    alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  row: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  avatar: {
    width: 52, height: 52, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "800", color: "#fff" },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  rowName: { fontSize: 15, fontWeight: "600", color: "#101720", flex: 1, marginRight: 8 },
  rowTime: { fontSize: 11, fontWeight: "600", color: "#8696a0" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowPreview: { fontSize: 13, color: "#8696a0", fontWeight: "500", flex: 1, marginRight: 8 },
  unreadBadge: {
    backgroundColor: "#02023E", borderRadius: 10,
    minWidth: 20, height: 20, paddingHorizontal: 6,
    alignItems: "center", justifyContent: "center",
  },
  unreadText: { color: "#fff", fontSize: 10, fontWeight: "800" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  emptyIcon: {
    width: 100, height: 100, borderRadius: 32,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    marginBottom: 16, borderWidth: 1, borderColor: "#eef0f3",
  },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: "#101720", marginBottom: 6 },
  emptySub: { fontSize: 13, color: "#8696a0", textAlign: "center", lineHeight: 19 },
});
