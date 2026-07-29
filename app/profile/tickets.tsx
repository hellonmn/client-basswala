/**
 * app/profile/tickets.tsx — My Support Tickets list
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { supportApi } from "../../services/userApi";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Open: { bg: "#eef2ff", fg: "#6366f1" },
  "In Progress": { bg: "#f5f3ff", fg: "#8b5cf6" },
  "Awaiting User": { bg: "#fffbeb", fg: "#f59e0b" },
  Resolved: { bg: "#f0fdf4", fg: "#22c55e" },
  Closed: { bg: "#f4f8ff", fg: "#8696a0" },
};

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

export default function MyTicketsScreen() {
  const router = useRouter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await supportApi.getMyTickets();
      if (res?.success) setTickets(res.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: any }) => {
    const sc = STATUS_COLORS[item.status] || STATUS_COLORS.Open;
    return (
      <TouchableOpacity
        style={s.card}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: "/profile/ticket/[id]", params: { id: String(item.id) } })}
      >
        <View style={s.cardHeader}>
          <Text style={s.ticketCode}>#{item.ticketCode}</Text>
          <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
            <Text style={[s.statusText, { color: sc.fg }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={s.subject} numberOfLines={1}>{item.subject}</Text>
        <View style={s.metaRow}>
          <View style={s.typeChip}>
            <Ionicons name="pricetag-outline" size={11} color="#02023E" />
            <Text style={s.typeText}>{item.type}</Text>
          </View>
          <Text style={s.date}>{fmtDate(item.updatedAt)}</Text>
          {item.unreadUser > 0 && <View style={s.unreadDot} />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#101720" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Tickets</Text>
        <TouchableOpacity onPress={() => router.push("/profile/ticket/new")} style={s.newBtn}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#02023E" /></View>
      ) : (
        <FlatList
          data={tickets}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#02023E" />}
          ListEmptyComponent={
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Ionicons name="chatbox-ellipses-outline" size={44} color="#c4c9d0" />
              </View>
              <Text style={s.emptyTitle}>No tickets yet</Text>
              <Text style={s.emptySub}>Raise your first support ticket to get help from our team</Text>
              <TouchableOpacity style={s.emptyBtn} onPress={() => router.push("/profile/ticket/new")} activeOpacity={0.85}>
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={s.emptyBtnText}>Raise New Ticket</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f4f8ff", alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: "#101720" },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#02023E", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },

  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: "#eef0f3",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  ticketCode: { fontSize: 11, fontWeight: "700", color: "#02023E", letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: "700" },
  subject: { fontSize: 14.5, fontWeight: "700", color: "#101720", marginBottom: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f0fffe", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 11, fontWeight: "600", color: "#02023E" },
  date: { fontSize: 11, color: "#8696a0", fontWeight: "500", marginLeft: "auto" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ef4444" },

  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: "#f4f8ff", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#101720", marginBottom: 6 },
  emptySub: { fontSize: 13, color: "#8696a0", textAlign: "center", marginBottom: 20, lineHeight: 19 },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#02023E", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
