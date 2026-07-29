/**
 * plugins/with-strip-ad-id.js
 *
 * Expo config plugin that forcibly strips the
 * `com.google.android.gms.permission.AD_ID` permission from the merged
 * AndroidManifest at build time.
 *
 * Why we need this even after setting `android.blockedPermissions`:
 * Firebase / Play Services dependencies declare the AD_ID permission
 * inside their AAR's library manifest. The AAPT2 manifest merger pulls
 * it in transitively. Expo's `blockedPermissions` works for top-level
 * apps but doesn't always apply early enough to win the merge — Play
 * Console then sees AD_ID in the resulting bundle and contradicts our
 * "No AdId" declaration in the Advertising ID form.
 *
 * This plugin emits an explicit `<uses-permission android:name="..."
 * tools:node="remove"/>` element, which is the standard Android-docs
 * way to forcibly drop a transitively-merged permission. It always wins
 * the merge regardless of library-level declarations.
 *
 * Wire in app.json plugins array as:
 *   "./plugins/with-strip-ad-id"
 */

const { withAndroidManifest } = require('expo/config-plugins');

const AD_ID_PERMISSION = 'com.google.android.gms.permission.AD_ID';

module.exports = function withStripAdId(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Ensure the "tools" XML namespace exists — it's needed for the
    // `tools:node="remove"` directive to be recognised by AAPT.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // Make sure there's a <uses-permission> array we can append to.
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    const already = manifest['uses-permission'].some((p) => {
      return p && p.$ && p.$['android:name'] === AD_ID_PERMISSION
        && p.$['tools:node'] === 'remove';
    });

    if (!already) {
      manifest['uses-permission'].push({
        $: {
          'android:name': AD_ID_PERMISSION,
          'tools:node': 'remove',
        },
      });
    }

    return cfg;
  });
};
