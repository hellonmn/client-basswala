/**
 * razorpay-customui.service.ts — FIXED
 *
 * FIXES:
 *  1. getAppsWhichSupportUPI correct signature: getAppsWhichSupportUPI(callback)
 *     No key argument — passing KEY_ID as first arg silently returned no apps.
 *  2. All amount params are received in RUPEES and converted to paise internally
 *     using Math.round(params.amount * 100). Callers must NOT pre-multiply.
 */

import { Platform } from 'react-native';
import { RAZORPAY_CONFIG } from './razorpay.config';

export interface InstalledUPIApp {
  app_name: string;
  app_icon: string; // base64 PNG — use as: { uri: `data:image/png;base64,${app_icon}` }
  package_name: string;
}

/**
 * Raw shape that the native bridge actually emits. Field names are
 * camelCase and apps are nested under `.data`. We normalise this in
 * `getInstalledUPIApps()` so callers see snake_case `InstalledUPIApp`.
 */
interface NativeUPIApp {
  appName?: string;
  packageName?: string;
  iconBase64?: string;
  appLogo?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: string;
  orderId?: string;
  signature?: string;
  dismissed?: boolean;
  error?: string;
}

// Logos are bundled PNGs from assets/images/upi/. Metro resolves require()
// at bundle time, so only list files that actually exist on disk — apps
// without a bundled logo gracefully fall back to a coloured letter avatar
// in the picker UI.
export const UPI_APP_META: Record<string, { label: string; color: string; logo?: any }> = {
  'com.google.android.apps.nbu.paisa.user': { label: 'Google Pay',   color: '#4285F4', logo: require('../assets/images/upi/gpay.png') },
  'com.phonepe.app':                         { label: 'PhonePe',      color: '#5f259f', logo: require('../assets/images/upi/phonepe.png') },
  'net.one97.paytm':                         { label: 'Paytm',        color: '#00b9f1', logo: require('../assets/images/upi/paytm.png') },
  'in.org.npci.upiapp':                      { label: 'BHIM',         color: '#00529c', logo: require('../assets/images/upi/bhim.png') },
  'com.amazon.mShop.android.shopping':       { label: 'Amazon Pay',   color: '#ff9900', logo: require('../assets/images/upi/amazonpay.png') },
  'com.whatsapp':                            { label: 'WhatsApp Pay', color: '#25D366', logo: require('../assets/images/upi/whatsapp.png') },
  // No bundled PNG yet → letter avatar fallback (drop a file in to enable):
  'com.mobikwik_new':                        { label: 'MobiKwik',     color: '#1da0f2' },
  'com.dreamplug.androidapp':                { label: 'CRED',         color: '#000000' },
  'com.freecharge.android':                  { label: 'Freecharge',   color: '#f57c00' },
};

function getSDK(): any | null {
  try {
    const mod = require('react-native-customui').default ?? require('react-native-customui');
    return mod || null;
  } catch {
    console.warn(
      '[RazorpayCustomUI] SDK not available.\n' +
      'Run: npm install react-native-customui && npx expo prebuild --clean && npx expo run:android'
    );
    return null;
  }
}

class _RazorpayCustomUIService {

  isAvailable(): boolean {
    return getSDK() !== null;
  }

  /**
   * Returns UPI apps installed on the device.
   * Android only — resolves to [] on iOS.
   *
   * ✅ FIXED: correct signature is getAppsWhichSupportUPI(callback)
   *    NO key argument — passing KEY_ID as first arg was the bug causing empty results.
   */
  getInstalledUPIApps(): Promise<InstalledUPIApp[]> {
    return new Promise((resolve) => {
      if (Platform.OS !== 'android') {
        console.log('[RazorpayCustomUI] iOS — UPI app discovery not supported, returning empty list.');
        return resolve([]);
      }

      const SDK = getSDK();
      if (!SDK) {
        console.warn('[RazorpayCustomUI] Native module not linked. Run `npx expo prebuild --clean && npx expo run:android` to rebuild.');
        return resolve([]);
      }

      try {
        // The wrapper's getAppsWhichSupportUPI takes a callback. The native
        // side emits an object of shape `{ data: [{ appName, packageName,
        // iconBase64, appLogo }, ...] }` — NOT a raw array, and NOT in the
        // snake_case shape our UI expects. We normalise both here.
        SDK.getAppsWhichSupportUPI((raw: any) => {
          // Defensive extraction — accept either { data: [...] } (real shape)
          // or a raw array (in case the native bridge changes in future).
          const rawArr: NativeUPIApp[] = Array.isArray(raw)
            ? raw
            : (raw && Array.isArray(raw.data) ? raw.data : []);

          const list: InstalledUPIApp[] = rawArr
            .filter((a) => a && (a.packageName || (a as any).package_name))
            .map((a: any) => ({
              app_name:     a.appName     ?? a.app_name     ?? '',
              app_icon:     a.iconBase64  ?? a.app_icon     ?? '',
              package_name: a.packageName ?? a.package_name ?? '',
            }));

          if (list.length === 0) {
            console.warn(
              '[RazorpayCustomUI] getAppsWhichSupportUPI returned 0 apps. ' +
              'Possible causes: (1) no UPI apps installed on the device, ' +
              '(2) AndroidManifest missing the <queries> block for UPI ' +
              '(Android 11+), or (3) emulator without UPI apps. Raw payload: ' +
              JSON.stringify(raw)
            );
          } else {
            console.log(
              `[RazorpayCustomUI] Found ${list.length} UPI app(s):`,
              list.map((a) => a.package_name).join(', ')
            );
          }
          resolve(list);
        });
      } catch (e) {
        console.warn('[RazorpayCustomUI] getAppsWhichSupportUPI error:', e);
        resolve([]);
      }
    });
  }

  /**
   * UPI Intent — opens a specific UPI app directly, bypassing Razorpay UI.
   * packageName must come from getInstalledUPIApps().
   *
   * @param params.amount  Amount in RUPEES (e.g. 499). Converted to paise internally.
   */
  async payViaUPIIntent(params: {
    orderId: string;
    amount: number;       // RUPEES — do NOT pass paise
    packageName: string;
    contact: string;
    email: string;
    /** Razorpay merchant key the order was created under. Required if it
     *  differs from the bundled RAZORPAY_CONFIG.KEY_ID — otherwise the
     *  Razorpay API rejects with "The id provided does not exist". */
    keyId?: string;
  }): Promise<PaymentResult> {
    const SDK = getSDK();
    if (!SDK) return { success: false, error: 'Custom UI SDK not linked.' };

    return this._open(SDK, {
      key_id:               params.keyId || RAZORPAY_CONFIG.KEY_ID,
      amount:               String(Math.round(params.amount * 100)), // → paise
      currency:             'INR',
      order_id:             params.orderId,
      contact:              params.contact,
      email:                params.email,
      method:               'upi',
      upi_app_package_name: params.packageName,
      '_[flow]':            'intent',
    });
  }

  /**
   * UPI Collect — sends a collect request to the user's VPA.
   * The user approves inside their UPI app (PhonePe, GPay, etc).
   * No Razorpay UI is shown — SDK handles the request silently.
   *
   * @param params.amount  Amount in RUPEES (e.g. 499). Converted to paise internally.
   */
  async payViaUPICollect(params: {
    orderId: string;
    amount: number;   // RUPEES — do NOT pass paise
    vpa: string;
    contact: string;
    email: string;
    /** Razorpay merchant key the order was created under. Required if it
     *  differs from the bundled RAZORPAY_CONFIG.KEY_ID. */
    keyId?: string;
  }): Promise<PaymentResult> {
    const SDK = getSDK();
    if (!SDK) return { success: false, error: 'Custom UI SDK not linked.' };

    return this._open(SDK, {
      key_id:    params.keyId || RAZORPAY_CONFIG.KEY_ID,
      amount:    String(Math.round(params.amount * 100)), // → paise
      currency:  'INR',
      order_id:  params.orderId,
      contact:   params.contact,
      email:     params.email,
      method:    'upi',
      vpa:       params.vpa,
      '_[flow]': 'collect',
    });
  }

  /**
   * Card payment — your own UI collects card details.
   *
   * @param params.amount  Amount in RUPEES (e.g. 499). Converted to paise internally.
   */
  async payViaCard(params: {
    orderId: string;
    amount: number;   // RUPEES — do NOT pass paise
    card: {
      number: string;
      name: string;
      expiry_month: string;
      expiry_year: string;
      cvv: string;
    };
    contact: string;
    email: string;
    keyId?: string;
  }): Promise<PaymentResult> {
    const SDK = getSDK();
    if (!SDK) return { success: false, error: 'Custom UI SDK not linked.' };

    return this._open(SDK, {
      key_id:                params.keyId || RAZORPAY_CONFIG.KEY_ID,
      amount:                String(Math.round(params.amount * 100)), // → paise
      currency:              'INR',
      order_id:              params.orderId,
      contact:               params.contact,
      email:                 params.email,
      method:                'card',
      'card[number]':        params.card.number,
      'card[name]':          params.card.name,
      'card[expiry_month]':  params.card.expiry_month,
      'card[expiry_year]':   params.card.expiry_year,
      'card[cvv]':           params.card.cvv,
    });
  }

  private _open(SDK: any, options: Record<string, string>): Promise<PaymentResult> {
    return new Promise((resolve) => {
      SDK.open(options)
        .then((data: any) => resolve({
          success:   true,
          paymentId: data.razorpay_payment_id,
          orderId:   data.razorpay_order_id,
          signature: data.razorpay_signature,
        }))
        .catch((err: any) => {
          // code 0 = user dismissed (not an error)
          if (err?.code === 0) return resolve({ success: false, dismissed: true });
          resolve({
            success: false,
            error: err?.description ?? err?.message ?? 'Payment failed',
          });
        });
    });
  }
}

export const RazorpayCustomUI = new _RazorpayCustomUIService();