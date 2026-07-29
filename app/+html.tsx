/**
 * app/+html.tsx
 *
 * Custom HTML shell rendered by Expo Router on every web page. This is
 * where we set the `<title>`, meta description, Open Graph tags, theme
 * colour, etc. — anything that has to live inside the document `<head>`.
 *
 * Anything below `<ScrollViewStyleReset />` is the Expo-mandated default
 * scaffolding; only edit the meta tags above it.
 *
 * Note: Expo's `app.json` has its own `web.name` / `web.favicon` config,
 * but Google's crawler reads the rendered HTML's `<title>` + `<meta
 * name="description">` for search snippets — those come from this file.
 */

import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

const TITLE = "Basswala — Book DJs in 3 taps";
const DESCRIPTION =
  "Basswala helps you discover and book DJs for your events in minutes. " +
  "Browse curated DJ packages, check availability, see verified reviews, " +
  "and confirm your booking with a small advance — all in one app.";
const SITE_URL = "https://basswala.com";
const OG_IMAGE = "/logo.png";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <meta name="theme-color" content="#02023E" />
        <meta name="format-detection" content="telephone=no" />

        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />

        {/* Open Graph — what Facebook / WhatsApp / LinkedIn show when a
            user shares the link. Twitter Cards picks these up too. */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:site_name" content="Basswala" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={TITLE} />
        <meta name="twitter:description" content={DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />

        {/* Favicons — small (browser tab) + larger Apple touch / Android */}
        <link rel="icon" type="image/png" href="/logo.png" />
        <link rel="apple-touch-icon" href="/logo.png" />

        {/* Site verification / canonical */}
        <link rel="canonical" href={SITE_URL} />

        <ScrollViewStyleReset />

        {/* Global resets that play nicely with the responsive layout —
            killing default body margins and forcing the html/body to
            fill the viewport so the React Native root has somewhere to
            stretch into. */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackgroundCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackgroundCss = `
html, body, #root { height: 100%; margin: 0; padding: 0; }
body { background-color: #f4f8ff; }
`;
