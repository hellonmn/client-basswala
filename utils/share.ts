/**
 * utils/share.ts
 *
 * Cross-platform sharing helper for the user app. On native it opens the OS
 * share sheet via RN's Share API. On web it tries `navigator.share`, then
 * falls back to copy-to-clipboard with a soft alert.
 *
 * Configure the public web origin via:
 *   - SHARE_BASE_URL constant below, or
 *   - EXPO_PUBLIC_SHARE_BASE_URL in app.json / .env
 */

import { Platform, Share } from "react-native";

const SHARE_BASE_URL =
  process.env.EXPO_PUBLIC_SHARE_BASE_URL ||
  "https://basswala.com"; // user-facing public website (universal links resolve here)

// ─── URL builders ──────────────────────────────────────────────────────────
export function captainProfileUrl(captainId: number | string): string {
  return `${SHARE_BASE_URL}/captain/${captainId}`;
}

export function djUrl(djId: number | string, captainId: number | string): string {
  return `${SHARE_BASE_URL}/dj-detail?djId=${djId}&captainId=${captainId}`;
}

export function equipmentUrl(equipmentId: number | string): string {
  return `${SHARE_BASE_URL}/equipment/${equipmentId}`;
}

// ─── Generic share trigger ─────────────────────────────────────────────────
interface ShareOptions {
  title?: string;
  message: string;
  url?: string;
}

export async function shareLink(opts: ShareOptions): Promise<boolean> {
  const { title, message, url } = opts;

  if (Platform.OS === "web") {
    try {
      const nav = (typeof navigator !== "undefined" ? navigator : undefined) as any;
      if (nav?.share) {
        await nav.share({ title, text: message, url });
        return true;
      }
      const text = url ? `${message}\n${url}` : message;
      if (nav?.clipboard?.writeText) {
        await nav.clipboard.writeText(text);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      try { (typeof window !== "undefined" ? window.alert : undefined)?.("Link copied to clipboard"); } catch {}
      return true;
    } catch (err) {
      console.warn("[share] web share failed:", err);
      return false;
    }
  }

  try {
    const result = await Share.share(
      {
        title,
        message: url ? `${message}\n${url}` : message,
        url,
      },
      { dialogTitle: title }
    );
    return result.action !== Share.dismissedAction;
  } catch (err) {
    console.warn("[share] native share failed:", err);
    return false;
  }
}

// ─── Convenience wrappers ──────────────────────────────────────────────────
export async function shareCaptainProfile(opts: {
  captainId: number | string;
  businessName?: string;
  city?: string;
}): Promise<boolean> {
  const url = captainProfileUrl(opts.captainId);
  const name = opts.businessName?.trim() || "Basswala captain";
  const city = opts.city ? ` · ${opts.city}` : "";
  return shareLink({
    title: `${name} on Basswala`,
    message: `🎧 Check out ${name}${city} on Basswala — book DJs and gear directly:`,
    url,
  });
}

export async function shareDJ(opts: {
  djId: number | string;
  captainId: number | string;
  djName?: string;
  hourlyRate?: number;
}): Promise<boolean> {
  const url = djUrl(opts.djId, opts.captainId);
  const name = opts.djName?.trim() || "this DJ package";
  const rate = opts.hourlyRate
    ? ` from ₹${Math.round(Number(opts.hourlyRate)).toLocaleString("en-IN")}/hr`
    : "";
  return shareLink({
    title: `${name} on Basswala`,
    message: `🎧 Book ${name}${rate} on Basswala:`,
    url,
  });
}

export async function shareEquipment(opts: {
  equipmentId: number | string;
  name?: string;
  dailyRate?: number;
}): Promise<boolean> {
  const url = equipmentUrl(opts.equipmentId);
  const eqName = opts.name?.trim() || "this equipment";
  const rate = opts.dailyRate
    ? ` from ₹${Math.round(Number(opts.dailyRate)).toLocaleString("en-IN")}/day`
    : "";
  return shareLink({
    title: `${eqName} on Basswala`,
    message: `🔊 Rent ${eqName}${rate} on Basswala:`,
    url,
  });
}
