/**
 * components/UpdatePopup.tsx
 *
 * Mounted once at the root layout. On app focus / open it asks the
 * backend "is there a newer version on the Play Store?" and shows a
 * branded modal with an "Update now" CTA + a "Later" button (unless the
 * backend marks the update as required, in which case Later is hidden).
 *
 * Cooldown:
 *  - If the user taps "Later", we snooze the popup for 24h so we don't
 *    nag every cold launch.
 *  - If the update is required, snoozing is disabled — the user has to
 *    update before continuing.
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  checkForAppUpdate,
  isUpdateRecentlyDismissed,
  openStoreListing,
  snoozeUpdatePopup,
  UpdateInfo,
} from "../services/appHealth";

export default function UpdatePopup() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [opening, setOpening] = useState(false);

  // Run the check on mount + every time the app comes back to the
  // foreground (catches users who left the app open for days).
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // Wait a beat so we don't hammer the network on cold launch
      // before the auth bootstrap settles.
      await new Promise((r) => setTimeout(r, 2500));

      const data = await checkForAppUpdate();
      if (cancelled) return;
      if (!data.updateAvailable) return;

      // Required updates ignore the dismissal cooldown.
      if (!data.isRequired) {
        const dismissed = await isUpdateRecentlyDismissed();
        if (dismissed) return;
      }
      setInfo(data);
    };

    run();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  if (!info) return null;

  const handleUpdate = async () => {
    setOpening(true);
    await openStoreListing();
    // Leave the modal open — when the user returns from the Play Store
    // and the new version is installed, the next launch won't show this
    // popup again (currentVersion will match latestVersion).
    setOpening(false);
  };

  const handleLater = async () => {
    if (info.isRequired) return; // can't snooze a required update
    await snoozeUpdatePopup(24);
    setInfo(null);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleLater}>
      <View style={s.overlay}>
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Ionicons name="cloud-download" size={32} color="#02023E" />
          </View>
          <Text style={s.title}>
            {info.isRequired ? "Update required" : "Update available"}
          </Text>
          <Text style={s.body}>
            {info.isRequired
              ? `A required update (v${info.latestVersion}) is available. Please update to keep using Basswala.`
              : `A new version (v${info.latestVersion}) is available with improvements and fixes.`}
          </Text>
          {info.notes ? <Text style={s.notes}>{info.notes}</Text> : null}

          <View style={s.actionRow}>
            {!info.isRequired && (
              <TouchableOpacity style={s.laterBtn} onPress={handleLater} activeOpacity={0.85}>
                <Text style={s.laterText}>Later</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.updateBtn, info.isRequired && { flex: 1 }]}
              onPress={handleUpdate}
              disabled={opening}
              activeOpacity={0.88}
            >
              {opening ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="arrow-up-circle" size={18} color="#fff" />
                  <Text style={s.updateText}>
                    {Platform.OS === "android" ? "Update on Play Store" : "Update"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Text style={s.versionLine}>
            Current: v{info.currentVersion || "?"} · Latest: v{info.latestVersion}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(2,2,30,0.55)",
    alignItems: "center", justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%", maxWidth: 420,
    backgroundColor: "#fff", borderRadius: 24,
    padding: 24, alignItems: "center",
  },
  iconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: "#eef0fa",
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 20, fontWeight: "800", color: "#0F1626",
    letterSpacing: -0.2, textAlign: "center",
  },
  body: {
    fontSize: 14, color: "#5b6877",
    textAlign: "center", lineHeight: 21,
    marginTop: 8, marginBottom: 10,
  },
  notes: {
    fontSize: 12, color: "#0F1626",
    textAlign: "center", marginBottom: 10,
    backgroundColor: "#eef0fa", padding: 10, borderRadius: 10,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row", gap: 10, marginTop: 14, width: "100%",
  },
  laterBtn: {
    flex: 1, height: 50, borderRadius: 14,
    backgroundColor: "#f1f3f7",
    alignItems: "center", justifyContent: "center",
  },
  laterText: { color: "#0F1626", fontSize: 15, fontWeight: "700" },
  updateBtn: {
    flex: 2, height: 50, borderRadius: 14,
    backgroundColor: "#02023E",
    flexDirection: "row", gap: 8,
    alignItems: "center", justifyContent: "center",
  },
  updateText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: 0.2 },
  versionLine: {
    fontSize: 11, color: "#8696a0", fontWeight: "600",
    marginTop: 14,
  },
});
