/**
 * app/(tabs)/profile.tsx — Fixed Version
 * - Removed Change Password
 * - Real booking stats via userApi
 * - Clean default export
 */

import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLoginGate } from "../../components/LoginGate";
import UserAvatar from "../../components/UserAvatar";
import { useAuth } from "../../context/AuthContext";
import { authApi, userApi } from "../../services/userApi"; // important: use userApi
import { firebaseAuth } from "../../services/firebase";
import { useAlert } from "../../components/AppAlert";

const { width } = Dimensions.get("window");

// ─── Success Toast ────────────────────────────────────────────────────────────
function SuccessToast({ visible }: { visible: boolean }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -80, duration: 280, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[ts.toast, { transform: [{ translateY }], opacity }]} pointerEvents="none">
      <View style={ts.iconCircle}>
        <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
      </View>
      <Text style={ts.toastText}>Profile saved successfully!</Text>
    </Animated.View>
  );
}

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

// ─── Logout Modal ─────────────────────────────────────────────────────────────
function LogoutModal({ visible, onClose, onConfirm }: {
  visible: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.spring(scale, { toValue: visible ? 1 : 0, useNativeDriver: true, tension: 100, friction: 8 }).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <Animated.View style={[ms.modal, { transform: [{ scale }] }]}>
          <View style={ms.iconCircle}>
            <Ionicons name="log-out-outline" size={30} color="#ef4444" />
          </View>
          <Text style={ms.title}>Sign Out?</Text>
          <Text style={ms.message}>You'll need to sign in again to access your account.</Text>
          <View style={ms.btnRow}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={ms.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={ms.confirmBtn} onPress={onConfirm} activeOpacity={0.8}>
              <Text style={ms.confirmText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Delete Account Modal ─────────────────────────────────────────────────────
function DeleteAccountModal({ visible, onClose, onConfirm, processing, error }: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  processing: boolean;
  error: string;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    Animated.spring(scale, { toValue: visible ? 1 : 0, useNativeDriver: true, tension: 100, friction: 8 }).start();
    if (!visible) setTyped("");
  }, [visible]);

  const matches = typed.trim().toUpperCase() === "DELETE";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={processing ? undefined : onClose}>
      <View style={ms.overlay}>
        <Animated.View style={[ms.modal, { transform: [{ scale }] }]}>
          <View style={[ms.iconCircle, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
            <Ionicons name="trash-outline" size={30} color="#ef4444" />
          </View>
          <Text style={ms.title}>Delete your account?</Text>
          <Text style={ms.message}>
            This will permanently erase your profile, bookings, saved addresses and chats. This can't be undone.
          </Text>

          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder='Type DELETE to confirm'
            placeholderTextColor="#c4c9d0"
            autoCapitalize="characters"
            editable={!processing}
            style={ms.confirmInput}
          />

          {error ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, alignSelf: "stretch", marginTop: 10 }}>
              <Ionicons name="alert-circle" size={14} color="#ef4444" style={{ marginTop: 2 }} />
              <Text style={{ flex: 1, color: "#ef4444", fontSize: 12, fontWeight: "500" }}>{error}</Text>
            </View>
          ) : null}

          <View style={ms.btnRow}>
            <TouchableOpacity style={ms.cancelBtn} onPress={onClose} disabled={processing} activeOpacity={0.8}>
              <Text style={ms.cancelText}>Keep account</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ms.confirmBtn, (!matches || processing) && { opacity: 0.5 }]}
              onPress={onConfirm}
              disabled={!matches || processing}
              activeOpacity={0.8}
            >
              {processing
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={ms.confirmText}>Delete forever</Text>}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color = "#02023E" }: {
  icon: string; value: string | number; label: string; color?: string;
}) {
  return (
    <View style={s.statCard}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Menu Row ─────────────────────────────────────────────────────────────────
function MenuRow({ icon, label, sublabel, onPress, danger = false, badge }: {
  icon: string; label: string; sublabel?: string; onPress: () => void;
  danger?: boolean; badge?: number;
}) {
  return (
    <TouchableOpacity style={s.menuRow} onPress={onPress} activeOpacity={0.72}>
      <View style={[s.menuIcon, danger && s.menuIconDanger]}>
        <Ionicons name={icon as any} size={20} color={danger ? "#ef4444" : "#101720"} />
      </View>
      <View style={s.menuText}>
        <Text style={[s.menuLabel, danger && { color: "#ef4444" }]}>{label}</Text>
        {sublabel && <Text style={s.menuSub}>{sublabel}</Text>}
      </View>
      {badge !== undefined && badge > 0 ? (
        <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color={danger ? "#fca5a5" : "#c4c9d0"} />
      )}
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

const Divider = () => <View style={s.rowDivider} />;

// ─── Main Profile Screen ──────────────────────────────────────────────────────
interface Stats {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
}

export default function ProfileScreen() {
  const { user, isAuthenticated, logout, refreshUser } = useAuth();
  const { alert: appAlert, confirm } = useAlert();
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  // Link a Google account to the currently logged-in (phone-OTP) user.
  // After this succeeds, the user can sign in with EITHER phone or Google
  // and resolve to the same User row on the backend.
  const linkGoogleAccount = async () => {
    setLinkingGoogle(true);
    try {
      const idToken = await firebaseAuth.getGoogleIdToken();
      const res = await authApi.linkGoogle(idToken);
      if (res?.success) {
        await refreshUser();
        await appAlert({
          title: "Google linked",
          message: `Your Google account (${res.data?.email || "linked"}) is now connected. You can sign in with Google any time.`,
          tone: "success",
        });
      } else {
        await appAlert({
          title: "Couldn't link Google",
          message: res?.message || "Please try again.",
          tone: "error",
        });
      }
    } catch (err: any) {
      // Common case: user cancelled the Google chooser → don't show an error popup.
      const msg = err?.message || "";
      if (/cancel|sign_in_cancelled|RNGoogleSignInError/i.test(msg)) {
        setLinkingGoogle(false);
        return;
      }
      await appAlert({
        title: "Couldn't link Google",
        message: err?.response?.data?.message || msg || "Network error.",
        tone: "error",
      });
    } finally {
      setLinkingGoogle(false);
    }
  };
  const { ensureLogin } = useLoginGate();
  const router = useRouter();
  const params = useLocalSearchParams<{ saved?: string }>();

  const [showLogout, setShowLogout] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, completed: 0, cancelled: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [showToast, setShowToast] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await authApi.deleteAccount();
      if (res?.success) {
        setShowDelete(false);
        await logout();
      } else {
        setDeleteError(res?.message || "Could not delete your account.");
      }
    } catch (err: any) {
      setDeleteError(
        err?.response?.data?.message ||
        err?.message ||
        "Could not delete your account. Please try again."
      );
    } finally {
      setDeleting(false);
    }
  };

  // Show toast when returning from edit profile
  useEffect(() => {
    if (params.saved === "1") {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 2800);
      return () => clearTimeout(t);
    }
  }, [params.saved]);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const profileRes = await userApi.getProfile().catch(() => null);
      const profileData = profileRes?.data ?? profileRes;

      if (profileData?.bookingStats) {
        const b = profileData.bookingStats;
        setStats({
          total: b.totalBookings ?? b.total ?? 0,
          active: b.pendingBookings ?? b.active ?? b.confirmed ?? 0,
          completed: b.completedBookings ?? b.completed ?? 0,
          cancelled: b.cancelledBookings ?? b.cancelled ?? 0,
        });
      } else {
        // Profile endpoint didn't return bookingStats.
        // Rather than hitting another endpoint that may be CDN-blocked,
        // show zeros gracefully. The real fix is on the server side
        // (Hostinger CDN/WAF blocking specific paths).
        setStats({ total: 0, active: 0, completed: 0, cancelled: 0 });
      }
    } catch (err) {
      console.error("Failed to load stats:", err);
      setStats({ total: 0, active: 0, completed: 0, cancelled: 0 });
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadStats(); }, [loadStats]));

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.name ?? "User";

  const initials = displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })
    : null;

  // Signed-out view — render a clean CTA that opens the LoginGate sheet.
  if (!isAuthenticated) {
    return (
      <>
        <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
        <SafeAreaView style={s.root} edges={["top"]}>
          <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>
            <View style={s.header}>
              <Text style={s.headerTitle}>Profile</Text>
              <View style={{ width: 42 }} />
            </View>

            <View style={s.signedOutWrap}>
              <View style={s.signedOutPuck}>
                <Ionicons name="person-outline" size={36} color="#02023E" />
              </View>
              <Text style={s.signedOutTitle}>You're browsing as a guest</Text>
              <Text style={s.signedOutSub}>
                Sign in to track bookings, save favourites, message captains and unlock checkout.
              </Text>

              <TouchableOpacity
                style={s.signedOutCta}
                onPress={() => ensureLogin()}
                activeOpacity={0.9}
              >
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={s.signedOutCtaText}>Sign in</Text>
              </TouchableOpacity>

              <Text style={s.signedOutFoot}>
                You can keep browsing — we'll only ask when you book.
              </Text>
            </View>
          </LinearGradient>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f4f8ff" />
      <SafeAreaView style={s.root} edges={["top"]}>
        <LinearGradient colors={["#f4f8ff", "#eef1f9", "#ffffff"]} style={{ flex: 1 }}>

          <SuccessToast visible={showToast} />

          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>Profile</Text>
            <TouchableOpacity style={s.settingsBtn} onPress={() => router.push("/profile/edit" as any)}>
              <Ionicons name="settings-outline" size={22} color="#101720" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

            {/* Hero — consolidated profile info */}
            <View style={s.hero}>
              <UserAvatar
                uri={user?.profilePicture}
                firstName={user?.firstName}
                lastName={user?.lastName}
                size={96}
                radius={32}
                textSize={36}
              />
              <View style={{ height: 14 }} />
              <View style={s.onlineDot} />
              <Text style={s.heroName}>{displayName}</Text>

              {/* All details in one card */}
              <View style={s.detailsCard}>
                {user?.email && (
                  <View style={s.detailRow}>
                    <View style={s.detailIcon}>
                      <Ionicons name="mail-outline" size={15} color="#02023E" />
                    </View>
                    <Text style={s.detailText} numberOfLines={1}>{user.email}</Text>
                    {user?.isEmailVerified && (
                      <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                    )}
                  </View>
                )}
                {user?.phone && (
                  <View style={s.detailRow}>
                    <View style={s.detailIcon}>
                      <Ionicons name="call-outline" size={15} color="#02023E" />
                    </View>
                    <Text style={s.detailText}>{user.phone}</Text>
                  </View>
                )}
                {user?.locationCity && (
                  <View style={s.detailRow}>
                    <View style={s.detailIcon}>
                      <Ionicons name="location-outline" size={15} color="#02023E" />
                    </View>
                    <Text style={s.detailText} numberOfLines={1}>
                      {[user.locationCity, user.locationState].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity style={s.editBtn} onPress={() => router.push("/profile/edit" as any)} activeOpacity={0.85}>
                <Ionicons name="pencil-outline" size={15} color="#fff" />
                <Text style={s.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </View>

            {/* Stats */}
            {loadingStats ? (
              <View style={s.statsRow}>
                {[1, 2, 3, 4].map((_, i) => (
                  <React.Fragment key={i}>
                    <View style={s.statCard}>
                      <Skel w={22} h={22} r={6} />
                      <Skel w={30} h={18} r={5} />
                      <Skel w={46} h={11} r={4} />
                    </View>
                    {i < 3 && <View style={s.statDivider} />}
                  </React.Fragment>
                ))}
              </View>
            ) : (
              <View style={s.statsRow}>
                <StatCard icon="calendar-outline" value={stats.total} label="Total" />
                <View style={s.statDivider} />
                <StatCard icon="time-outline" value={stats.active} label="Active" color="#f59e0b" />
                <View style={s.statDivider} />
                <StatCard icon="checkmark-circle-outline" value={stats.completed} label="Completed" color="#22c55e" />
                <View style={s.statDivider} />
                <StatCard icon="close-circle-outline" value={stats.cancelled} label="Cancelled" color="#ef4444" />
              </View>
            )}

            {/* Bookings */}
            <Section title="Bookings">
              <MenuRow 
                icon="calendar-outline" 
                label="My Bookings" 
                badge={stats.active} 
                onPress={() => router.push("/(tabs)/bookings" as any)} 
              />
              <Divider />
              <MenuRow icon="heart-outline" label="Saved DJs" onPress={() => router.push("/profile/saved-djs" as any)} />
            </Section>

            {/* Payments */}
            <Section title="Payments">
              <MenuRow icon="wallet-outline" label="Basswala Wallet" sublabel="Balance · Transactions · Top-up" onPress={() => router.push("/wallet" as any)} />
              <Divider />
              <MenuRow
                icon="card-outline"
                label="Payout Methods"
                sublabel="UPI / bank accounts for refunds"
                onPress={() => router.push("/profile/payout-methods" as any)}
              />
              <Divider />
              <MenuRow icon="refresh-circle-outline" label="Refunds" sublabel="Request or track a refund" onPress={() => router.push("/wallet/refund" as any)} />
            </Section>

            {/* Preferences */}
            <Section title="Preferences">
              <MenuRow
                icon="location-outline"
                label="My Addresses"
                sublabel="Manage delivery addresses"
                onPress={() => router.push("/profile/addresses" as any)}
              />
            </Section>

            {/* Account & Security — show Link Google for users who don't
                have an email on file (i.e. they signed up via phone OTP).
                Once linked, the email field is populated and we hide the
                row to avoid offering the same action twice. */}
            <Section title="Account">
              {!user?.email ? (
                <MenuRow
                  icon="logo-google"
                  label={linkingGoogle ? "Connecting…" : "Connect Google account"}
                  sublabel="Sign in with Google in addition to your phone"
                  onPress={linkingGoogle ? undefined : linkGoogleAccount}
                />
              ) : (
                <MenuRow
                  icon="checkmark-circle-outline"
                  label="Google connected"
                  sublabel={user.email}
                  onPress={undefined}
                />
              )}
            </Section>

            {/* Support */}
            <Section title="Support">
              <MenuRow icon="help-circle-outline" label="Help Centre" onPress={() => router.push("/profile/help-center" as any)} />
              <Divider />
              <MenuRow icon="chatbubble-outline" label="Contact Us" onPress={() => router.push("/profile/contact-us" as any)} />
              <Divider />
              <MenuRow icon="document-text-outline" label="Terms of Service" onPress={() => Linking.openURL("https://server.basswala.com/legal/user/terms.html").catch(() => {})} />
              <Divider />
              <MenuRow icon="receipt-outline" label="Cancellation & Refund" onPress={() => Linking.openURL("https://server.basswala.com/legal/user/refund.html").catch(() => {})} />
              <Divider />
              <MenuRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => Linking.openURL("https://server.basswala.com/legal/user/privacy.html").catch(() => {})} />
            </Section>

            {memberSince && <Text style={s.memberSince}>Member since {memberSince}</Text>}

            <TouchableOpacity style={s.logoutBtn} onPress={() => setShowLogout(true)} activeOpacity={0.85}>
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
              <Text style={s.logoutText}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.deleteAccountBtn}
              onPress={() => { setDeleteError(""); setShowDelete(true); }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={14} color="#8696a0" />
              <Text style={s.deleteAccountText}>Delete my account</Text>
            </TouchableOpacity>

            <Text style={s.version}>Basswala v1.0.0</Text>
          </ScrollView>
        </LinearGradient>
      </SafeAreaView>

      <LogoutModal
        visible={showLogout}
        onClose={() => setShowLogout(false)}
        onConfirm={async () => {
          setShowLogout(false);
          await logout();
        }}
      />

      <DeleteAccountModal
        visible={showDelete}
        onClose={() => { if (!deleting) { setShowDelete(false); setDeleteError(""); } }}
        onConfirm={handleDeleteAccount}
        processing={deleting}
        error={deleteError}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f4f8ff" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#101720", letterSpacing: -0.4 },
  settingsBtn: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#fff", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },

  hero: { alignItems: "center", paddingTop: 8, paddingBottom: 20, paddingHorizontal: 20 },
  avatarCircle: { width: 96, height: 96, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  avatarText: { fontSize: 36, fontWeight: "800", color: "#fff", letterSpacing: -1 },
  onlineDot: { position: "absolute", top: 74, right: width / 2 - 52, width: 14, height: 14, borderRadius: 7, backgroundColor: "#22c55e", borderWidth: 2.5, borderColor: "#f4f8ff" },
  heroName: { fontSize: 22, fontWeight: "800", color: "#101720", letterSpacing: -0.4, marginBottom: 14 },
  detailsCard: {
    alignSelf: "stretch", backgroundColor: "#fff", borderRadius: 18,
    padding: 14, borderWidth: 1, borderColor: "#eef0f3", gap: 10,
    marginBottom: 14,
  },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailIcon: {
    width: 32, height: 32, borderRadius: 11, backgroundColor: "#f0fffe",
    alignItems: "center", justifyContent: "center",
  },
  detailText: { flex: 1, fontSize: 13.5, color: "#101720", fontWeight: "600" },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#02023E", borderRadius: 14,
    paddingHorizontal: 22, paddingVertical: 12,
  },
  editBtnText: { fontSize: 13, fontWeight: "800", color: "#fff" },

  statsRow: { flexDirection: "row", marginHorizontal: 20, backgroundColor: "#fff", borderRadius: 20, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#eef0f3", alignItems: "center" },
  statCard: { flex: 1, alignItems: "center", gap: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: "#eef0f3" },
  statValue: { fontSize: 17, fontWeight: "800", color: "#101720" },
  statLabel: { fontSize: 10, color: "#8696a0", fontWeight: "600" },

  section: { marginHorizontal: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: "700", color: "#8696a0", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 },
  sectionCard: { backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: "#eef0f3", overflow: "hidden" },
  menuRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  menuIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#f4f8ff", justifyContent: "center", alignItems: "center" },
  menuIconDanger: { backgroundColor: "#fef2f2" },
  menuText: { flex: 1 },
  menuLabel: { fontSize: 15, fontWeight: "600", color: "#101720" },
  menuSub: { fontSize: 12, color: "#8696a0", fontWeight: "500", marginTop: 1 },
  badge: { backgroundColor: "#02023E", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, minWidth: 22, alignItems: "center" },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  rowDivider: { height: 1, backgroundColor: "#f3f4f6", marginHorizontal: 16 },

  djBanner: { marginHorizontal: 20, marginBottom: 16, borderRadius: 18, overflow: "hidden" },
  djBannerInner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18, gap: 16 },
  djBannerTitle: { fontSize: 15, fontWeight: "800", color: "#fff", marginBottom: 3 },
  djBannerSub: { fontSize: 12, color: "rgba(255,255,255,0.82)", fontWeight: "500" },
  djBannerArrow: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },

  memberSince: { textAlign: "center", fontSize: 12, color: "#c4c9d0", fontWeight: "500", marginBottom: 14, marginTop: 4 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginHorizontal: 20, paddingVertical: 16, borderRadius: 18, borderWidth: 1.5, borderColor: "#fecaca", backgroundColor: "#fff5f5", marginBottom: 10 },
  logoutText: { fontSize: 15, fontWeight: "700", color: "#ef4444" },
  deleteAccountBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    alignSelf: "center",
    paddingVertical: 8, paddingHorizontal: 14,
    marginBottom: 4,
  },
  deleteAccountText: { fontSize: 12, fontWeight: "600", color: "#8696a0", textDecorationLine: "underline" },
  version: { textAlign: "center", fontSize: 11, color: "#d1d5db", marginBottom: 8 },

  // Signed-out empty state
  signedOutWrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 32, paddingBottom: 80,
  },
  signedOutPuck: {
    width: 96, height: 96, borderRadius: 32,
    backgroundColor: "#f0fffe", borderWidth: 1, borderColor: "#a5f3fc",
    alignItems: "center", justifyContent: "center",
    marginBottom: 22,
  },
  signedOutTitle: {
    fontSize: 20, fontWeight: "800", color: "#101720",
    letterSpacing: -0.4, marginBottom: 8, textAlign: "center",
  },
  signedOutSub: {
    fontSize: 13.5, color: "#6B7A8A",
    textAlign: "center", lineHeight: 20,
    marginBottom: 26,
  },
  signedOutCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#02023E",
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 32,
    minWidth: 200,
  },
  signedOutCtaText: { color: "#fff", fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  signedOutFoot: {
    fontSize: 11, color: "#8696a0", fontWeight: "500",
    marginTop: 18, textAlign: "center",
  },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(16,23,32,0.45)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  modal: { backgroundColor: "#fff", borderRadius: 26, padding: 28, width: "100%", maxWidth: 380, alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  iconCircle: { width: 72, height: 72, borderRadius: 24, backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "#fecaca" },
  title: { fontSize: 20, fontWeight: "800", color: "#101720", textAlign: "center", marginBottom: 10, letterSpacing: -0.3 },
  message: { fontSize: 14, color: "#8696a0", textAlign: "center", lineHeight: 21, marginBottom: 28, paddingHorizontal: 8, fontWeight: "500" },
  btnRow: { flexDirection: "row", gap: 12, width: "100%" },
  cancelBtn: { flex: 1, backgroundColor: "#f4f8ff", borderRadius: 16, paddingVertical: 14, alignItems: "center", borderWidth: 1, borderColor: "#eef0f3" },
  cancelText: { color: "#8696a0", fontSize: 14, fontWeight: "700" },
  confirmBtn: { flex: 1, backgroundColor: "#ef4444", borderRadius: 16, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  confirmInput: {
    alignSelf: "stretch",
    marginTop: -14, marginBottom: 6,
    borderWidth: 1.5, borderColor: "#fecaca", borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontWeight: "700", color: "#101720",
    backgroundColor: "#fff5f5",
    letterSpacing: 1,
    textAlign: "center",
  },
});

const ts = StyleSheet.create({
  toast: { position: "absolute", top: 12, left: 20, right: 20, zIndex: 999, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: "#bbf7d0", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 8 },
  iconCircle: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#f0fdf4", justifyContent: "center", alignItems: "center" },
  toastText: { fontSize: 14, fontWeight: "700", color: "#15803d" },
});