/**
 * plugins/with-upi-queries.js
 *
 * Expo config plugin that injects the <queries> block into AndroidManifest.xml
 * so the app can discover installed UPI apps on Android 11+ (API 30+).
 *
 * Without this, Razorpay's `getAppsWhichSupportUpi()` returns an empty array
 * even when GPay / PhonePe / Paytm / BHIM are installed, because Android's
 * package visibility rules block queries unless the calling app explicitly
 * declares which intents/packages it wants to see.
 *
 * We declare:
 *   1. The standard UPI intent action (`vnd.android.cup/upi/pay`) — covers any
 *      app that registers itself as a UPI payer. This is the primary signal.
 *   2. Explicit package names for the major UPI apps — belt-and-braces for
 *      OEMs that don't honour the intent query.
 *
 * Reference: https://developer.android.com/training/package-visibility
 */

const { withAndroidManifest } = require('@expo/config-plugins');

const UPI_PACKAGES = [
  'com.google.android.apps.nbu.paisa.user', // Google Pay (India)
  'com.phonepe.app',                         // PhonePe
  'net.one97.paytm',                         // Paytm
  'in.org.npci.upiapp',                      // BHIM
  'com.amazon.mShop.android.shopping',       // Amazon Pay
  'com.whatsapp',                            // WhatsApp Pay
  'com.mobikwik_new',                        // MobiKwik
  'com.freecharge.android',                  // Freecharge
  'com.dreamplug.androidapp',                // CRED
  'com.csam.icici.bank.imobile',             // iMobile (ICICI)
  'com.snapwork.hdfc',                       // HDFC PayZapp
  'com.axis.mobile',                         // Axis Mobile
  'com.sbi.lotusintouch',                    // SBI YONO
];

function ensureQueries(manifest) {
  manifest.manifest.queries = manifest.manifest.queries || [];

  // Find or create the queries block
  let queriesBlock = manifest.manifest.queries[0];
  if (!queriesBlock) {
    queriesBlock = {};
    manifest.manifest.queries.push(queriesBlock);
  }
  queriesBlock.intent = queriesBlock.intent || [];
  queriesBlock.package = queriesBlock.package || [];

  // 1. Intent-based query for any UPI-payable app
  const hasUpiIntent = queriesBlock.intent.some((i) => {
    const action = i.action && i.action[0] && i.action[0].$['android:name'];
    const data = i.data && i.data[0] && i.data[0].$['android:scheme'];
    return action === 'android.intent.action.VIEW' && data === 'upi';
  });
  if (!hasUpiIntent) {
    queriesBlock.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': 'upi' } }],
    });
  }

  // 2. Explicit package list — survives quirky OEM behaviour
  const existing = new Set(
    queriesBlock.package
      .map((p) => p.$ && p.$['android:name'])
      .filter(Boolean)
  );
  for (const pkg of UPI_PACKAGES) {
    if (!existing.has(pkg)) {
      queriesBlock.package.push({ $: { 'android:name': pkg } });
    }
  }

  return manifest;
}

module.exports = function withUpiQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = ensureQueries(cfg.modResults);
    return cfg;
  });
};
