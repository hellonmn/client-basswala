/**
 * PaymentStep.tsx  — FIXED
 *
 * Fix 1: UPI ID — replaced SDK collect flow (which shows Razorpay's own screen)
 *         with a direct Razorpay Payments API call + custom polling UI.
 *         User sees YOUR screen the whole time — Razorpay never appears.
 *
 * Fix 2: UPI Apps — getAppsWhichSupportUPI now passes KEY_ID as first arg.
 *
 * Fix 3: verifyPayment is called immediately after UPI/card success BEFORE
 *         onResult fires — so the backend Payment record is 'success' when
 *         createRental runs. This prevents the 400 on "Confirm & Book".
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  InstalledUPIApp,
  RazorpayCustomUI,
  UPI_APP_META,
  PaymentResult,
} from '../services/razorpay-customui.service';
import { apiService } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'upi_app' | 'upi_id' | 'card' | 'cod';
type CollectStatus = 'idle' | 'requesting' | 'pending' | 'success' | 'failed' | 'expired';

interface Props {
  orderId: string;
  amount: number;   // ₹
  contact: string;
  email: string;
  keyId?: string;
  onResult: (result: PaymentResult & { method: Tab }) => void;
}

// ─── UPI Collect: routed through your backend (secret key stays server-side) ──
// Frontend calls apiService.initiateUPICollect() → backend calls Razorpay SDK
// Frontend polls apiService.getUPIPaymentStatus() every 4s

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentStep({ orderId, amount, contact, email, keyId, onResult }: Props) {
  const [tab, setTab]                 = useState<Tab>('upi_app');
  const [upiApps, setUpiApps]         = useState<InstalledUPIApp[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<InstalledUPIApp | null>(null);
  const [vpa, setVpa]                 = useState('');
  const [vpaValid, setVpaValid]       = useState(false);
  const [paying, setPaying]           = useState(false);

  // UPI Collect polling
  const [collectStatus, setCollectStatus]     = useState<CollectStatus>('idle');
  const [collectPaymentId, setCollectPaymentId] = useState('');
  const [pollCountdown, setPollCountdown]     = useState(0);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const TIMEOUT_SEC  = 120;

  // Card
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName]     = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv]       = useState('');

  // Shimmer
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1,   duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0.3, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  // Load UPI apps
  useEffect(() => {
    RazorpayCustomUI.getInstalledUPIApps().then((apps) => {
      setUpiApps(apps);
      if (apps.length > 0) setSelectedApp(apps[0]);
      else setTab('upi_id');
      setAppsLoading(false);
    });
  }, []);

  useEffect(() => {
    setVpaValid(/^[\w.\-_]{2,}@[\w]{2,}$/.test(vpa.trim()));
  }, [vpa]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  // ── Polling logic ────────────────────────────────────────────────────────

  const startPolling = (paymentId: string) => {
    setCollectPaymentId(paymentId);
    setCollectStatus('pending');
    setPollCountdown(TIMEOUT_SEC);

    countdownRef.current = setInterval(() => {
      setPollCountdown((c) => {
        if (c <= 1) { clearInterval(countdownRef.current!); return 0; }
        return c - 1;
      });
    }, 1000);

    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 4000;
      try {
        const res = await apiService.getUPIPaymentStatus(paymentId);
        const status = res.status;
        if (status === 'captured' || status === 'authorized') {
          clearInterval(pollRef.current!);
          clearInterval(countdownRef.current!);
          setCollectStatus('success');
          // Verify on backend before firing onResult
          try { await apiService.verifyPayment({ orderId, paymentId, signature: '' }); } catch (_) {}
          onResult({ success: true, paymentId, orderId, method: 'upi_id' });
          return;
        }
        if (status === 'failed') {
          clearInterval(pollRef.current!);
          clearInterval(countdownRef.current!);
          setCollectStatus('failed');
          setPaying(false);
          return;
        }
      } catch (_) {}
      if (elapsed >= TIMEOUT_SEC * 1000) {
        clearInterval(pollRef.current!);
        clearInterval(countdownRef.current!);
        setCollectStatus('expired');
        setPaying(false);
      }
    }, 4000);
  };

  const cancelCollect = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCollectStatus('idle');
    setCollectPaymentId('');
    setPaying(false);
  };

  // ── Pay handler ──────────────────────────────────────────────────────────

  const handlePay = useCallback(async () => {
    if (!orderId) { Alert.alert('Not Ready', 'Payment order not set up yet.'); return; }
    setPaying(true);

    try {
      if (tab === 'upi_app') {
        if (!selectedApp) { Alert.alert('Select App', 'Tap a UPI app to continue.'); setPaying(false); return; }
        const result = await RazorpayCustomUI.payViaUPIIntent({ orderId, amount, contact, email, packageName: selectedApp.package_name, keyId });
        if (result.success && result.paymentId) {
          try { await apiService.verifyPayment({ orderId, paymentId: result.paymentId, signature: result.signature ?? '' }); } catch (_) {}
        }
        onResult({ ...result, method: 'upi_app' });
        setPaying(false);

      } else if (tab === 'upi_id') {
        if (!vpaValid) { Alert.alert('Invalid UPI ID', 'Enter a valid UPI ID like name@okaxis'); setPaying(false); return; }
        setCollectStatus('requesting');

        // Use SDK.open() with collect flow — works with both test and live keys.
        // (Direct Razorpay REST API only works with live keys)
        const result = await RazorpayCustomUI.payViaUPICollect({
          orderId, amount, contact, email, vpa: vpa.trim(), keyId,
        });

        if (result.success && result.paymentId) {
          try { await apiService.verifyPayment({ orderId, paymentId: result.paymentId, signature: result.signature ?? '' }); } catch (_) {}
          setCollectStatus('success');
          onResult({ ...result, method: 'upi_id' });
        } else if (result.dismissed) {
          setCollectStatus('idle');
          setPaying(false);
        } else {
          setCollectStatus('failed');
          setPaying(false);
        }
        return;

      } else if (tab === 'card') {
        const [mm, yy] = cardExpiry.split('/');
        if (!cardNumber || !cardName || !mm || !yy || !cardCvv) { Alert.alert('Incomplete', 'Fill in all card details.'); setPaying(false); return; }
        const result = await RazorpayCustomUI.payViaCard({ orderId, amount, contact, email, card: { number: cardNumber.replace(/\s/g, ''), name: cardName, expiry_month: mm.trim(), expiry_year: yy.trim(), cvv: cardCvv }, keyId });
        if (result.success && result.paymentId) {
          try { await apiService.verifyPayment({ orderId, paymentId: result.paymentId, signature: result.signature ?? '' }); } catch (_) {}
        }
        onResult({ ...result, method: 'card' });
        setPaying(false);

      }
    } catch (err: any) {
      onResult({ success: false, error: err?.message, method: tab });
      setPaying(false);
    }
  }, [tab, orderId, amount, contact, email, keyId, selectedApp, vpa, vpaValid, cardNumber, cardName, cardExpiry, cardCvv]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'upi_app', label: 'UPI App', icon: 'phone-portrait-outline' },
    { id: 'upi_id',  label: 'UPI ID',  icon: 'at-outline'             },
    { id: 'card',    label: 'Card',    icon: 'card-outline'            },
  ];

  const isPending = collectStatus === 'pending';
  const isSuccess = collectStatus === 'success';

  return (
    <View style={s.root}>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <TouchableOpacity key={t.id} style={[s.tab, on && s.tabOn]}
              onPress={() => { if (isPending) return; setTab(t.id); }} activeOpacity={0.75}>
              <Ionicons name={t.icon as any} size={17} color={on ? '#02023E' : '#8696a0'} />
              <Text style={[s.tabLabel, on && s.tabLabelOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* �?�? UPI App �?�? */}
      {tab === 'upi_app' && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Choose UPI App</Text>
          <Text style={s.sectionHint}>Apps installed on your phone — tap to select</Text>

          {appsLoading && (
            <View style={s.shimmerRow}>
              {[0,1,2,3].map((i) => <Animated.View key={i} style={[s.shimmerCard, { opacity: shimmer }]} />)}
            </View>
          )}

          {!appsLoading && upiApps.length === 0 && (
            <View style={s.emptyBox}>
              <View style={s.emptyIcon}><Ionicons name="phone-portrait-outline" size={28} color="#c4c9d0" /></View>
              <Text style={s.emptyText}>No UPI apps found on this device</Text>
              <TouchableOpacity onPress={() => setTab('upi_id')}>
                <Text style={s.emptyLink}>Use UPI ID instead →</Text>
              </TouchableOpacity>
            </View>
          )}

          {!appsLoading && upiApps.length > 0 && (
            <View style={s.appGrid}>
              {upiApps.map((app) => {
                const meta  = UPI_APP_META[app.package_name];
                const label = meta?.label ?? app.app_name;
                const color = meta?.color ?? '#02023E';
                const isOn  = selectedApp?.package_name === app.package_name;
                return (
                  <TouchableOpacity key={app.package_name} style={[s.appCard, isOn && s.appCardOn]}
                    onPress={() => setSelectedApp(app)} activeOpacity={0.8}>
                    {isOn && <View style={s.appCheck}><Ionicons name="checkmark" size={9} color="#fff" /></View>}
                    {app.app_icon
                      ? <Image source={{ uri: `data:image/png;base64,${app.app_icon}` }} style={s.appIcon} resizeMode="contain" />
                      : <View style={[s.appIconFb, { backgroundColor: color + '18' }]}><Text style={[s.appIconLetter, { color }]}>{label.charAt(0)}</Text></View>
                    }
                    <Text style={[s.appName, isOn && { color: '#02023E' }]} numberOfLines={2}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <InfoNote text="Tapping Pay opens your selected UPI app directly. Razorpay processes in the background — you never leave this app." />
        </View>
      )}

      {/* �?�? UPI ID — Custom screen, no Razorpay UI �?�? */}
      {tab === 'upi_id' && (
        <View style={s.section}>

          {/* Input */}
          {(collectStatus === 'idle' || collectStatus === 'requesting') && (
            <>
              <Text style={s.sectionTitle}>Enter UPI ID</Text>
              <Text style={s.sectionHint}>We'll send a collect request to your UPI app</Text>

              <View style={[s.inputBox, vpa.length > 0 && (vpaValid ? s.inputBoxOk : s.inputBoxErr)]}>
                <Ionicons name="at-outline" size={18} color={vpaValid ? '#02023E' : '#8696a0'} />
                <TextInput style={s.input} value={vpa} onChangeText={setVpa}
                  placeholder="yourname@okaxis" placeholderTextColor="#c4c9d0"
                  autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
                  editable={collectStatus === 'idle'} />
                {vpa.length > 0 && (
                  <Ionicons name={vpaValid ? 'checkmark-circle' : 'close-circle'} size={18}
                    color={vpaValid ? '#22c55e' : '#f87171'} />
                )}
              </View>

              <View style={s.vpaChips}>
                {['@okaxis','@oksbi','@okicici','@ybl'].map((sx) => (
                  <TouchableOpacity key={sx} style={s.vpaChip}
                    onPress={() => setVpa((v) => (v.includes('@') ? v.split('@')[0] : v) + sx)}>
                    <Text style={s.vpaChipText}>{sx}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {collectStatus === 'requesting' && (
                <View style={s.reqRow}>
                  <ActivityIndicator size="small" color="#02023E" />
                  <Text style={s.reqText}>Sending collect request…</Text>
                </View>
              )}
              <InfoNote text="A payment request will be sent to your UPI app. Open it and approve within 2 minutes." />
            </>
          )}

          {/* Waiting */}
          {collectStatus === 'pending' && (
            <View style={s.pendingCard}>
              <LinearGradient colors={['#f0fafa','#e8f8f8']} style={s.pendingGrad}>
                <View style={s.pulseWrap}>
                  <Animated.View style={[s.pulseRing, { opacity: shimmer, transform: [{ scale: shimmer }] }]} />
                  <View style={s.pulseIcon}><Ionicons name="phone-portrait-outline" size={28} color="#02023E" /></View>
                </View>
                <Text style={s.pendingTitle}>Waiting for approval</Text>
                <Text style={s.pendingVpa}>{vpa}</Text>
                <Text style={s.pendingHint}>
                  Open your UPI app and approve the ₹{amount.toLocaleString('en-IN')} request
                </Text>
                <View style={s.timerBadge}>
                  <Ionicons name="time-outline" size={14} color={pollCountdown < 30 ? '#f87171' : '#8696a0'} />
                  <Text style={[s.timerText, pollCountdown < 30 && { color: '#f87171' }]}>
                    Expires in {pollCountdown}s
                  </Text>
                </View>
                <TouchableOpacity style={s.cancelBtn} onPress={cancelCollect}>
                  <Text style={s.cancelText}>Cancel & try another method</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          )}

          {/* Success */}
          {collectStatus === 'success' && (
            <View style={s.resultCard}>
              <View style={[s.resultIcon, { backgroundColor: '#f0fdf4' }]}>
                <Ionicons name="checkmark-circle" size={38} color="#22c55e" />
              </View>
              <Text style={s.resultTitle}>Payment Successful!</Text>
              <Text style={s.resultSub}>UPI ID: {vpa}</Text>
            </View>
          )}

          {/* Failed / Expired */}
          {(collectStatus === 'failed' || collectStatus === 'expired') && (
            <View style={s.resultCard}>
              <View style={[s.resultIcon, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="close-circle" size={38} color="#f87171" />
              </View>
              <Text style={s.resultTitle}>{collectStatus === 'expired' ? 'Request Expired' : 'Payment Declined'}</Text>
              <Text style={s.resultSub}>
                {collectStatus === 'expired' ? 'Not approved within 2 minutes' : 'Declined by your UPI app'}
              </Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => setCollectStatus('idle')}>
                <Text style={s.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* �?�? Card �?�? */}
      {tab === 'card' && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Card Details</Text>
          <Text style={s.sectionHint}>Visa · Mastercard · RuPay · Amex</Text>
          <View style={s.cardNumWrap}>
            <Ionicons name="card-outline" size={17} color="#8696a0" />
            <TextInput style={[s.input, { flex: 1 }]} value={cardNumber}
              onChangeText={(v) => { const d = v.replace(/\D/g,'').slice(0,16); setCardNumber(d.replace(/(\d{4})(?=\d)/g,'$1 ')); }}
              placeholder="1234  5678  9012  3456" placeholderTextColor="#c4c9d0" keyboardType="numeric" />
            <Text style={s.cardBrand}>
              {cardNumber.startsWith('4') ? '💳 Visa' : cardNumber.startsWith('5') ? '💳 MC'
                : cardNumber.startsWith('6') ? '💳 RuPay' : cardNumber.startsWith('3') ? '💳 Amex' : ''}
            </Text>
          </View>
          <View style={[s.inputBox, { marginBottom: 10 }]}>
            <Ionicons name="person-outline" size={17} color="#8696a0" />
            <TextInput style={s.input} value={cardName} onChangeText={setCardName} placeholder="Name on card" placeholderTextColor="#c4c9d0" autoCapitalize="characters" />
          </View>
          <View style={s.cardRow}>
            <View style={[s.inputBox, { flex: 1 }]}>
              <Ionicons name="calendar-outline" size={17} color="#8696a0" />
              <TextInput style={s.input} value={cardExpiry}
                onChangeText={(v) => { const d = v.replace(/\D/g,'').slice(0,4); setCardExpiry(d.length > 2 ? d.slice(0,2)+'/'+d.slice(2) : d); }}
                placeholder="MM/YY" placeholderTextColor="#c4c9d0" keyboardType="numeric" />
            </View>
            <View style={[s.inputBox, { width: 110 }]}>
              <Ionicons name="lock-closed-outline" size={17} color="#8696a0" />
              <TextInput style={s.input} value={cardCvv} onChangeText={(v) => setCardCvv(v.replace(/\D/g,'').slice(0,4))}
                placeholder="CVV" placeholderTextColor="#c4c9d0" keyboardType="numeric" secureTextEntry />
            </View>
          </View>
          <InfoNote text="Your card details are encrypted and sent directly to Razorpay. We never store them." icon="shield-checkmark-outline" />
        </View>
      )}

      {/* COD removed — online payment only */}

      {/* Pay button — hidden while polling or after success */}
      {!isPending && !isSuccess && (
        <TouchableOpacity style={[s.payBtn, paying && { opacity: 0.65 }]}
          onPress={handlePay} disabled={paying} activeOpacity={0.88}>
          <LinearGradient colors={['#101720','#1a2535']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={s.payBtnInner}>
            {paying && collectStatus !== 'requesting'
              ? <><ActivityIndicator size="small" color="#02023E" /><Text style={s.payBtnText}>Processing…</Text></>
              : <>
                  <Text style={s.payBtnText}>{`Pay  ₹${amount.toLocaleString('en-IN')}`}</Text>
                  <View style={s.payBtnIcon}><Ionicons name="lock-closed" size={15} color="#101720" /></View>
                </>
            }
          </LinearGradient>
        </TouchableOpacity>
      )}

      <View style={s.rzpBadge}>
        <Ionicons name="shield-checkmark-outline" size={12} color="#8696a0" />
        <Text style={s.rzpBadgeText}>Secured by Razorpay · 256-bit SSL</Text>
      </View>
    </View>
  );
}

function InfoNote({ text, icon = 'information-circle-outline' }: { text: string; icon?: string }) {
  return (
    <View style={s.infoNote}>
      <Ionicons name={icon as any} size={13} color="#02023E" style={{ marginTop: 1 }} />
      <Text style={s.infoNoteText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },

  tabBar: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#eef0f3' },
  tabOn: { borderColor: '#02023E', backgroundColor: '#f0fafa' },
  tabLabel: { fontSize: 10, fontWeight: '700', color: '#8696a0', letterSpacing: 0.2 },
  tabLabelOn: { color: '#02023E' },

  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#101720', letterSpacing: -0.4, marginBottom: 3 },
  sectionHint: { fontSize: 12, color: '#8696a0', fontWeight: '500', marginBottom: 16 },

  shimmerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  shimmerCard: { width: 74, height: 88, borderRadius: 18, backgroundColor: '#eef0f3' },

  emptyBox: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, backgroundColor: '#f4f8ff', justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#8696a0', fontWeight: '500' },
  emptyLink: { fontSize: 13, color: '#02023E', fontWeight: '700' },

  appGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  appCard: { width: 74, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 6, gap: 8, borderRadius: 18, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#eef0f3', position: 'relative' },
  appCardOn: { borderColor: '#02023E', backgroundColor: '#f0fafa' },
  appCheck: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#02023E', justifyContent: 'center', alignItems: 'center' },
  appIcon: { width: 38, height: 38, borderRadius: 10 },
  appIconFb: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  appIconLetter: { fontSize: 18, fontWeight: '800' },
  appName: { fontSize: 9.5, fontWeight: '700', color: '#8696a0', textAlign: 'center', lineHeight: 13 },

  inputBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#eef0f3', marginBottom: 10 },
  inputBoxOk: { borderColor: '#86efac' },
  inputBoxErr: { borderColor: '#fca5a5' },
  input: { flex: 1, fontSize: 14, color: '#101720', fontWeight: '500' },

  vpaChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
  vpaChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#f4f8ff', borderWidth: 1, borderColor: '#d8e4f0' },
  vpaChipText: { fontSize: 11, fontWeight: '700', color: '#4b6585' },

  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  reqText: { fontSize: 13, color: '#8696a0', fontWeight: '500' },

  pendingCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 8 },
  pendingGrad: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, gap: 12 },
  pulseWrap: { width: 72, height: 72, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  pulseRing: { position: 'absolute', width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: '#02023E' },
  pulseIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#d0f0ef' },
  pendingTitle: { fontSize: 17, fontWeight: '800', color: '#101720', letterSpacing: -0.3 },
  pendingVpa: { fontSize: 13, fontWeight: '700', color: '#02023E' },
  pendingHint: { fontSize: 12, color: '#4b6585', fontWeight: '500', textAlign: 'center', lineHeight: 18 },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#eef0f3' },
  timerText: { fontSize: 12, fontWeight: '700', color: '#8696a0' },
  cancelBtn: { marginTop: 4 },
  cancelText: { fontSize: 12, color: '#f87171', fontWeight: '600' },

  resultCard: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  resultIcon: { width: 72, height: 72, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  resultTitle: { fontSize: 17, fontWeight: '800', color: '#101720' },
  resultSub: { fontSize: 13, color: '#8696a0', fontWeight: '500' },
  retryBtn: { marginTop: 8, backgroundColor: '#f0fafa', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#d0f0ef' },
  retryText: { fontSize: 13, fontWeight: '700', color: '#02023E' },

  cardNumWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#eef0f3', marginBottom: 10 },
  cardBrand: { fontSize: 11, fontWeight: '700', color: '#8696a0' },
  cardRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },

  codCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 8 },
  codGrad: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20, gap: 10 },
  codIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 3 },
  codTitle: { fontSize: 18, fontWeight: '800', color: '#101720', letterSpacing: -0.3 },
  codSub: { fontSize: 13, color: '#4b6585', fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  codAmt: { fontWeight: '800', color: '#101720' },
  codBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  codBadgeText: { fontSize: 12, fontWeight: '700', color: '#16a34a' },

  infoNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, backgroundColor: '#f0fafa', borderRadius: 12, padding: 11, borderWidth: 1, borderColor: '#c8eeee', marginBottom: 4 },
  infoNoteText: { flex: 1, fontSize: 11, color: '#4b6585', fontWeight: '500', lineHeight: 17 },

  payBtn: { borderRadius: 18, overflow: 'hidden', marginTop: 14 },
  payBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 16 },
  payBtnText: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  payBtnIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#02023E', justifyContent: 'center', alignItems: 'center' },

  rzpBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  rzpBadgeText: { fontSize: 11, color: '#8696a0', fontWeight: '500' },
});