/**
 * services/bookingPayment.ts
 *
 * In-app payment flow — replaces the old "open Razorpay payment link in
 * a browser tab" approach. Now everything happens inside the app via
 * the PaymentSheet provider:
 *
 *   1. PaymentSheet creates a Razorpay Order on the backend
 *   2. User enters their UPI ID in our own bottom-sheet UI
 *   3. RazorpayCustomUI.payViaUPICollect fires the collect to their UPI app
 *   4. Backend verifies the payment and marks the booking as Paid
 *
 * No browser. No webview. No Razorpay-branded sheet. Just like Zepto/Zomato.
 *
 * Callers should ideally use `usePaymentSheet().pay({ ... })` directly,
 * but this helper exists so existing call sites that already use
 * `payForBooking(bookingId)` keep working — see `usePayForBooking()`.
 */

import { useEffect, useState } from "react";
import { bookingApi } from "./userApi";

export interface BookingPaymentResult {
  success: boolean;
  paid: boolean;
  cancelled?: boolean;
  message?: string;
}

/**
 * Cached booking fee. The admin can change this from /admin/settings, so we
 * always fetch from the backend instead of hardcoding 499. The first request
 * after app launch fills the cache; subsequent screens get the value
 * synchronously without a fresh round-trip.
 */
let cachedFee: number | null = null;
let inflight: Promise<number> | null = null;

export const DEFAULT_BOOKING_FEE = 499;

export async function fetchBookingFee(): Promise<number> {
  if (cachedFee != null) return cachedFee;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await bookingApi.getBookingFee();
      const amount = Number(res?.data?.amount);
      if (Number.isFinite(amount) && amount > 0) {
        cachedFee = amount;
        return amount;
      }
    } catch { /* ignore — fall through to default */ }
    cachedFee = DEFAULT_BOOKING_FEE;
    return DEFAULT_BOOKING_FEE;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * React hook — returns the live booking fee. Defaults to 499 immediately
 * (so screens render without flicker) and updates the moment the API call
 * resolves. Call from any component that displays "Pay ₹X to confirm".
 *
 *   const fee = useBookingFee();
 *   <Text>Pay ₹{fee}</Text>
 */
export function useBookingFee(): number {
  const [fee, setFee] = useState<number>(cachedFee ?? DEFAULT_BOOKING_FEE);
  useEffect(() => {
    let cancelled = false;
    fetchBookingFee().then((v) => {
      if (!cancelled) setFee(v);
    });
    return () => { cancelled = true; };
  }, []);
  return fee;
}

/**
 * Hook-style helper. Use it in components like:
 *
 *   const payForBooking = usePayForBooking();
 *   const result = await payForBooking(bookingId, 499);
 *
 * It internally calls the PaymentSheet provider mounted at the root.
 */
export function usePayForBooking() {
  // Late import to keep this module React-Native-friendly even if used
  // from non-React code paths (none today, but defensive).
  const { usePaymentSheet } = require("../components/PaymentSheet");
  const { pay } = usePaymentSheet();

  return async function payForBooking(
    bookingId: number,
    amount?: number,
    description?: string,
  ): Promise<BookingPaymentResult> {
    // Resolve the fee live from the backend (admin-editable) instead of
    // hardcoding ₹499. Falls back to the cached default if the request fails.
    const resolvedAmount = amount ?? await fetchBookingFee();

    // If the booking is already paid (e.g. a retry from the receipts screen),
    // short-circuit without showing the sheet.
    try {
      const status = await bookingApi.verifyPayment(bookingId);
      if (status?.success && status.paid) {
        return { success: true, paid: true };
      }
    } catch {
      /* ignore — fall through to the in-app sheet */
    }

    const r = await pay({ bookingId, amount: resolvedAmount, description });
    return r;
  };
}
