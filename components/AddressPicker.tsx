/**
 * components/AddressPicker.tsx
 *
 * Dropin for booking forms — replaces the old "type your city/street"
 * text fields. Behavior:
 *
 *   • Loads the user's saved addresses on mount
 *   • Auto-selects the default (or the single one they have)
 *   • Tapping the selected chip opens a sheet listing all addresses
 *     with a "+ Add new address" button at the bottom
 *   • If the user has ZERO addresses, the component opens directly
 *     into the AddAddressModal so they can add their first one
 *
 * The parent gets the full SavedAddress back via onChange(addr).
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { userApi } from "../services/userApi";
import { SavedAddress } from "../types/address";
import AddAddressModal from "./AddAddressModal";

type Props = {
  value: SavedAddress | null;
  onChange: (addr: SavedAddress | null) => void;
  /**
   * Optional label shown above the picker (default: "Delivery Address").
   */
  label?: string;
};

export default function AddressPicker({ value, onChange, label = "Delivery Address" }: Props) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showList, setShowList] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingAddr, setEditingAddr] = useState<SavedAddress | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userApi.getSavedAddresses();
      if (res?.success) {
        const list: SavedAddress[] = res.data || [];
        setAddresses(list);
        // Auto-select the default (or the first one) on initial load
        if (!value && list.length > 0) {
          const def = list.find((a) => a.isDefault) || list[0];
          onChange(def);
        }
        // If the currently-selected address was deleted/renamed, refresh it
        if (value) {
          const fresh = list.find((a) => a.id === value.id);
          if (fresh) onChange(fresh);
          else if (list.length > 0) onChange(list.find((a) => a.isDefault) || list[0]);
          else onChange(null);
        }
      }
    } catch (err) {
      console.error("AddressPicker load:", err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelect = (addr: SavedAddress) => {
    onChange(addr);
    setShowList(false);
  };

  const handleAddNew = () => {
    setEditingAddr(null);
    setShowList(false);
    setShowAdd(true);
  };

  const handleEdit = (addr: SavedAddress) => {
    setEditingAddr(addr);
    setShowList(false);
    setShowAdd(true);
  };

  const handleAfterSave = (saved: SavedAddress) => {
    setShowAdd(false);
    setEditingAddr(null);
    onChange(saved);
    load();
  };

  // Empty state: show a big "Add address" button instead of the picker chip
  if (!loading && addresses.length === 0) {
    return (
      <>
        <View style={s.wrap}>
          <Text style={s.label}>{label}</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={handleAddNew} activeOpacity={0.85}>
            <View style={s.emptyIcon}>
              <Ionicons name="add-circle" size={22} color="#02023E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.emptyTitle}>Add your first address</Text>
              <Text style={s.emptySub}>
                We'll remember it for your next booking
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8696a0" />
          </TouchableOpacity>
        </View>

        <AddAddressModal
          visible={showAdd}
          editing={editingAddr}
          onClose={() => {
            setShowAdd(false);
            setEditingAddr(null);
          }}
          onSaved={handleAfterSave}
        />
      </>
    );
  }

  return (
    <>
      <View style={s.wrap}>
        <Text style={s.label}>{label}</Text>
        {loading ? (
          <View style={s.chipLoading}>
            <ActivityIndicator size="small" color="#02023E" />
          </View>
        ) : value ? (
          <TouchableOpacity
            style={s.chip}
            onPress={() => setShowList(true)}
            activeOpacity={0.88}
          >
            <View style={s.chipIcon}>
              <Ionicons
                name={
                  value.label === "Home"
                    ? "home"
                    : value.label === "Work"
                    ? "briefcase"
                    : "location"
                }
                size={16}
                color="#02023E"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.chipLabel}>{value.label}</Text>
              <Text style={s.chipLine} numberOfLines={1}>
                {[value.street, value.city].filter(Boolean).join(", ")}
              </Text>
            </View>
            <Text style={s.chipChange}>Change</Text>
            <Ionicons name="chevron-down" size={14} color="#02023E" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.chip} onPress={() => setShowList(true)}>
            <Text style={s.chipPlaceholder}>Select an address</Text>
            <Ionicons name="chevron-down" size={16} color="#8696a0" />
          </TouchableOpacity>
        )}
      </View>

      {/* Picker sheet */}
      <Modal
        visible={showList}
        transparent
        animationType="slide"
        onRequestClose={() => setShowList(false)}
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => setShowList(false)}
        >
          <TouchableOpacity activeOpacity={1} style={s.sheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle}>Choose address</Text>
              <TouchableOpacity onPress={() => setShowList(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color="#101720" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: 440 }}
            >
              {addresses.map((a) => {
                const selected = value?.id === a.id;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[s.row, selected && s.rowSelected]}
                    onPress={() => handleSelect(a)}
                    activeOpacity={0.88}
                  >
                    <View style={[s.rowIcon, selected && { backgroundColor: "#02023E" }]}>
                      <Ionicons
                        name={
                          a.label === "Home"
                            ? "home"
                            : a.label === "Work"
                            ? "briefcase"
                            : "location"
                        }
                        size={16}
                        color={selected ? "#fff" : "#02023E"}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.rowTop}>
                        <Text style={s.rowLabel}>{a.label}</Text>
                        {a.isDefault && (
                          <View style={s.defaultBadge}>
                            <Text style={s.defaultBadgeText}>DEFAULT</Text>
                          </View>
                        )}
                      </View>
                      {a.street ? (
                        <Text style={s.rowLine} numberOfLines={1}>{a.street}</Text>
                      ) : null}
                      <Text style={s.rowLine} numberOfLines={1}>
                        {[a.city, a.state, a.zipCode].filter(Boolean).join(", ")}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation();
                        handleEdit(a);
                      }}
                      style={s.rowEditBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="create-outline" size={16} color="#8696a0" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={s.addBtn} onPress={handleAddNew} activeOpacity={0.85}>
              <LinearGradient colors={["#02023E", "#02023E"]} style={s.addBtnGrad}>
                <Ionicons name="add-circle-outline" size={16} color="#fff" />
                <Text style={s.addBtnText}>Add new address</Text>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <AddAddressModal
        visible={showAdd}
        editing={editingAddr}
        onClose={() => {
          setShowAdd(false);
          setEditingAddr(null);
        }}
        onSaved={handleAfterSave}
      />
    </>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: {
    fontSize: 11, fontWeight: "700", color: "#5a6169",
    marginBottom: 7, letterSpacing: 0.3,
  },

  chipLoading: {
    height: 56, borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1, borderColor: "#eef0f3",
    alignItems: "center", justifyContent: "center",
  },

  chip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderColor: "#a5f3fc",
    borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 11,
    backgroundColor: "#f0fffe",
  },
  chipIcon: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  chipLabel: { fontSize: 13, fontWeight: "800", color: "#101720" },
  chipLine: { fontSize: 11, color: "#5a6169", fontWeight: "500", marginTop: 1 },
  chipPlaceholder: { flex: 1, fontSize: 14, color: "#8696a0", fontWeight: "600" },
  chipChange: { fontSize: 11, fontWeight: "800", color: "#02023E" },

  // Empty state button
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: "#a5f3fc",
    borderStyle: "dashed",
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 14,
    backgroundColor: "#f0fffe",
  },
  emptyIcon: {
    width: 40, height: 40, borderRadius: 13,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#a5f3fc",
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: "#101720" },
  emptySub: { fontSize: 11, color: "#02023E", fontWeight: "600", marginTop: 1 },

  // Picker sheet
  overlay: {
    flex: 1, backgroundColor: "rgba(16,23,32,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22,
    maxHeight: "85%",
  },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: "#101720" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
  },

  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 14, marginBottom: 8,
    borderWidth: 1, borderColor: "#eef0f3",
    backgroundColor: "#fff",
  },
  rowSelected: { borderColor: "#02023E", backgroundColor: "#f0fffe" },
  rowIcon: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  rowLabel: { fontSize: 13, fontWeight: "800", color: "#101720" },
  rowLine: { fontSize: 11, color: "#8696a0", fontWeight: "500" },
  defaultBadge: {
    backgroundColor: "#dcfce7", borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: "#bbf7d0",
  },
  defaultBadgeText: { fontSize: 8, fontWeight: "800", color: "#22c55e", letterSpacing: 0.5 },
  rowEditBtn: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: "#f4f8ff",
    alignItems: "center", justifyContent: "center",
  },

  addBtn: { marginTop: 10, borderRadius: 14, overflow: "hidden" },
  addBtnGrad: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 13,
  },
  addBtnText: { fontSize: 14, fontWeight: "800", color: "#fff" },
});
