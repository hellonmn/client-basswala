/**
 * app/profile/ticket/[id].tsx — Ticket conversation thread
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView,
  Platform, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supportApi } from "../../../services/userApi";

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  Open: { bg: "#eef2ff", fg: "#6366f1" },
  "In Progress": { bg: "#f5f3ff", fg: "#8b5cf6" },
  "Awaiting User": { bg: "#fffbeb", fg: "#f59e0b" },
  Resolved: { bg: "#f0fdf4", fg: "#22c55e" },
  Closed: { bg: "#f4f8ff", fg: "#8696a0" },
};

const fmtTime = (d: string) => {
  try { return new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};

export default function TicketDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ticketId = parseInt(id!);
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await supportApi.getTicket(ticketId);
      if (res?.success) setTicket(res.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // Poll every 5s
  useEffect(() => {
    const i = setInterval(() => load(true), 5000);
    return () => clearInterval(i);
  }, [load]);

  useEffect(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [ticket?.messages?.length]);

  const send = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await supportApi.addMessage(ticketId, reply.trim());
      if (res?.success) {
        setReply("");
        await load(true);
      }
    } catch (err: any) {
      Alert.alert("Error", err?.response?.data?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const closeTicket = () => {
    Alert.alert("Close Ticket?", "You can still view it, but no more messages can be sent.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close", style: "destructive",
        onPress: async () => {
          const res = await supportApi.closeTicket(ticketId);
          if (res?.success) load();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root}><View style={s.center}><ActivityIndicator size="large" color="#02023E" /></View></SafeAreaView>
    );
  }

  if (!ticket) {
    return (
      <SafeAreaView style={s.root}><View style={s.center}><Text>Ticket not found</Text></View></SafeAreaView>
    );
  }

  const sc = STATUS_COLORS[ticket.status] || STATUS_COLORS.Open;
  const isClosed = ticket.status === "Closed";

  const renderMsg = ({ item }: { item: any }) => {
    const isMine = item.senderType === "user" || item.senderType === "captain";
    return (
      <View style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowOther]}>
        <Text style={[s.msgMeta, isMine && { textAlign: "right" }]}>
          {isMine ? "You" : "Support Team"} · {fmtTime(item.createdAt)}
        </Text>
        <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleOther]}>
          <Text style={[s.bubbleText, isMine && { color: "#fff" }]}>{item.message}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color="#101720" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={s.ticketCode}>#{ticket.ticketCode}</Text>
            <View style={[s.statusPill, { backgroundColor: sc.bg }]}>
              <Text style={[s.statusText, { color: sc.fg }]}>{ticket.status}</Text>
            </View>
          </View>
          <Text style={s.subject} numberOfLines={1}>{ticket.subject}</Text>
        </View>
        {!isClosed && (
          <TouchableOpacity style={s.closeBtn} onPress={closeTicket}>
            <Ionicons name="close-circle-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.typeBar}>
        <Ionicons name="pricetag-outline" size={13} color="#02023E" />
        <Text style={s.typeText}>{ticket.type}</Text>
        {ticket.priority && (
          <>
            <View style={s.dot} />
            <Text style={s.priorityText}>{ticket.priority} priority</Text>
          </>
        )}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={listRef}
          data={ticket.messages || []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderMsg}
          contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        />

        {!isClosed ? (
          <View style={s.inputBar}>
            <TextInput
              style={s.input}
              placeholder="Type your message..."
              placeholderTextColor="#8696a0"
              value={reply}
              onChangeText={setReply}
              multiline
              maxLength={2000}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!reply.trim() || sending) && { opacity: 0.4 }]}
              onPress={send}
              disabled={!reply.trim() || sending}
              activeOpacity={0.85}
            >
              <Ionicons name="send" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.closedBar}>
            <Ionicons name="lock-closed-outline" size={14} color="#8696a0" />
            <Text style={s.closedText}>This ticket is closed. Raise a new ticket if you need help.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eef0f3",
  },
  backBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#f4f8ff", alignItems: "center", justifyContent: "center" },
  ticketCode: { fontSize: 11, fontWeight: "700", color: "#02023E", letterSpacing: 0.5 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 10, fontWeight: "700" },
  subject: { fontSize: 14.5, fontWeight: "700", color: "#101720", marginTop: 2 },
  closeBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center" },

  typeBar: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eef0f3" },
  typeText: { fontSize: 12, fontWeight: "600", color: "#02023E" },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#c4c9d0", marginHorizontal: 4 },
  priorityText: { fontSize: 12, fontWeight: "600", color: "#8696a0" },

  msgRow: { marginBottom: 14 },
  msgRowMine: { alignItems: "flex-end" },
  msgRowOther: { alignItems: "flex-start" },
  msgMeta: { fontSize: 10, color: "#8696a0", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, paddingHorizontal: 4 },
  bubble: { maxWidth: "82%", padding: 12, borderRadius: 14 },
  bubbleMine: { backgroundColor: "#02023E", borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: "#fff", borderBottomLeftRadius: 4, borderWidth: 1, borderColor: "#eef0f3" },
  bubbleText: { fontSize: 14, color: "#101720", lineHeight: 20 },

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: Platform.OS === "ios" ? 28 : 10,
    backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eef0f3",
  },
  input: {
    flex: 1, fontSize: 14, color: "#101720",
    backgroundColor: "#f4f8ff", borderRadius: 20,
    paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10,
    maxHeight: 100, borderWidth: 1, borderColor: "#eef0f3",
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#02023E", alignItems: "center", justifyContent: "center" },

  closedBar: { flexDirection: "row", alignItems: "center", gap: 8, padding: 16, paddingBottom: Platform.OS === "ios" ? 28 : 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: "#eef0f3" },
  closedText: { fontSize: 12, color: "#8696a0", flex: 1 },
});
