/**
 * app/profile/addresses.tsx — Manage saved delivery addresses
 *
 * Users can add / edit / delete / set default for their addresses here.
 * The same AddAddressModal is used on booking screens too when a user
 * has no addresses yet.
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useRouter, useFocusEffect } from "expo-router";
import { userApi } from "../../services/userApi";
import { SavedAddress } from "../../types/address";
import AddAddressModal from "../../components/AddAddressModal";
import { useAlert } from "../../components/AppAlert";

export default function AddressesScreen() {
  const router = useRouter();
  const { alert: appAlert, confirm } = useAlert();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SavedAddress | null>(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userApi.getSavedAddresses();
      if (res?.success) setAddresses(res.data || []);
    } catch (err) {
      console.error("Load addresses:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleDelete = async (addr: SavedAddress) => {
    const ok = await confirm({
      title: "Remove address?",
      message: `Delete "${addr.label}${addr.street ? " · " + addr.street : ""}"?`,
      confirmText: "Remove",
      cancelText: "Cancel",
      destructive: true,
    });
    if (!ok) return;
    try {
      const res = await userApi.deleteSavedAddress(addr.id);
      if (res?.success) {
        setAddresses((prev) => prev.filter((a) => a.id !== addr.id));
      } else {
        await appAlert({ title: "Error", message: res?.message || "Failed to delete", tone: "error" });
      }
    } catch (err: any) {
      await appAlert({
        title: "Error",
        message: err?.response?.data?.message || err?.message || "Failed to delete",
        tone: "error",
      });
    }
  };

  const handleSetDefault = async (addr: SavedAddress) => {
    if (addr.isDefault) return;
    try {
      const res = await userApi.setDefaultAddress(addr.id);
      if (res?.success) {
        setAddresses((prev) =>
          prev.map((a) => ({ ...a, isDefault: a.id === addr.id }))
        );
      }
    } catch (err: any) {
      await appAlert({
        title: "Error",
        message: err?.response?.data?.message || err?.message || "Failed to set default",
        tone: "error",
      });
    }
  };

  const handleEdit = (addr: SavedAddress) => {
    setEditing(addr);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditing(null);
    setShowModal(true);
  };

  return (
    <SafeAreaView style={s.root} edges={["top"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
        <View style={s.header}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color="#101720" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>My Addresses</Text>
          <View style={{ width: 42 }} />
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.infoCard}>
            <Ionicons name="information-circle-outline" size={18} color="#02023E" />
            <Text style={s.infoText}>
              Your default address is used automatically at checkout. You can pick a
              different one while booking.
            </Text>
          </View>

          {loading ? (
            <View style={s.loadingCard}>
              <ActivityIndicator color="#02023E" />
            </View>
          ) : addresses.length === 0 ? (
            <View style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="location-outline" size={36} color="#02023E" />
              </View>
              <Text style={s.emptyTitle}>No addresses yet</Text>
              <Text style={s.emptySub}>
                Add your first address so you can book in seconds next time.
              </Text>
            </View>
          ) : (
            addresses.map((a) => (
              <View key={a.id} style={[s.card, a.isDefault && s.cardDefault]}>
                <View style={s.cardTop}>
                  <View style={s.labelIcon}>
                    <Ionicons
                      name={
                        a.label === "Home"
                          ? "home"
                          : a.label === "Work"
                          ? "briefcase"
                          : "location"
                      }
                      size={16}
                      color="#02023E"
                    />
                  </View>
                  <Text style={s.cardLabel}>{a.label}</Text>
                  {a.isDefault && (
                    <View style={s.defaultBadge}>
                      <Ionicons name="checkmark-circle" size={10} color="#22c55e" />
                      <Text style={s.defaultBadgeText}>DEFAULT</Text>
                    </View>
                  )}
                </View>
                {a.street ? <Text style={s.cardLine}>{a.street}</Text> : null}
                {a.landmark ? <Text style={s.cardLine}>Near {a.landmark}</Text> : null}
                <Text style={s.cardLine}>
                  {[a.city, a.state, a.zipCode].filter(Boolean).join(", ")}
                </Text>
                {a.contactName || a.contactPhone ? (
                  <Text style={s.cardContact}>
                    <Ionicons name="call-outline" size={11} color="#8696a0" />{" "}
                    {[a.contactName, a.contactPhone].filter(Boolean).join(" · ")}
                  </Text>
                ) : null}

                <View style={s.cardActions}>
                  {!a.isDefault && (
                    <TouchableOpacity
                      style={s.pillBtn}
                      onPress={() => handleSetDefault(a)}
                      activeOpacity={0.85}
                    >
                      <Text style={s.pillBtnText}>Set default</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={s.pillBtn}
                    onPress={() => handleEdit(a)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="create-outline" size={12} color="#02023E" />
                    <Text style={s.pillBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.pillBtn, s.pillBtnDanger]}
                    onPress={() => handleDelete(a)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="trash-outline" size={12} color="#ef4444" />
                    <Text style={[s.pillBtnText, { color: "#ef4444" }]}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          <TouchableOpacity style={s.addBtn} onPress={handleAdd} activeOpacity={0.85}>
            <LinearGradient colors={["#02023E", "#02023E"]} style={s.addBtnGrad}>
              <Ionicons name="add-circle-outline" size={18} color="#fff" />
              <Text style={s.addBtnText}>Add New Address</Text>
            </LinearGradient>
          </TouchableOpacity>

          <View style={{ height: 30 }} />
        </ScrollView>
      </LinearGradient>

      <AddAddressModal
        visible={showModal}
        editing={editing}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          load();
        }}
      />
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
  iconBtn: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: "#eef0f3",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#101720", letterSpacing: -0.3 },
  scroll: { padding: 20 },

  infoCard: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    backgroundColor: "#f0fffe", borderRadius: 14, padding: 12,
    marginBottom: 16,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  infoText: { flex: 1, fontSize: 11, color: "#02023E", fontWeight: "600", lineHeight: 16 },

  loadingCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 30,
    alignItems: "center", borderWidth: 1, borderColor: "#eef0f3",
  },
  emptyCard: {
    backgroundColor: "#fff", borderRadius: 20, padding: 28, alignItems: "center",
    marginBottom: 16, borderWidth: 1, borderColor: "#eef0f3",
  },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 22,
    backgroundColor: "#f0fffe", alignItems: "center", justifyContent: "center",
    marginBottom: 12, borderWidth: 1, borderColor: "#a5f3fc",
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#101720" },
  emptySub: {
    fontSize: 13, color: "#8696a0", textAlign: "center",
    marginTop: 6, lineHeight: 19, fontWeight: "500",
  },

  card: {
    backgroundColor: "#fff", borderRadius: 18, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: "#eef0f3",
  },
  cardDefault: { borderColor: "#22c55e", borderWidth: 1.5, backgroundColor: "#f0fdf4" },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  labelIcon: {
    width: 28, height: 28, borderRadius: 9, backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
  },
  cardLabel: { flex: 1, fontSize: 14, fontWeight: "800", color: "#101720" },
  defaultBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#fff", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: "#bbf7d0",
  },
  defaultBadgeText: { fontSize: 8, fontWeight: "800", color: "#22c55e", letterSpacing: 0.5 },
  cardLine: { fontSize: 13, color: "#5a6169", fontWeight: "500", lineHeight: 19 },
  cardContact: { fontSize: 11, color: "#8696a0", fontWeight: "600", marginTop: 4 },

  cardActions: {
    flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap",
  },
  pillBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: "#f0fffe", borderRadius: 10,
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  pillBtnDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  pillBtnText: { fontSize: 11, fontWeight: "800", color: "#02023E" },

  addBtn: { marginTop: 16, borderRadius: 16, overflow: "hidden" },
  addBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 15,
  },
  addBtnText: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
