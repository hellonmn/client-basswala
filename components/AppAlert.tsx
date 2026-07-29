/**
 * components/AppAlert.tsx
 *
 * Custom in-app alert/confirm/toast — replaces React Native's native
 * Alert.alert(). Uses the app's brand colors (#02023E primary, #06f3f9 accent)
 * and matches the language of the rest of the UI (rounded sheets, soft shadow).
 *
 * Usage:
 *   const { alert, confirm, toast } = useAlert();
 *
 *   await alert({ title: "Saved", message: "Your changes were saved." });
 *
 *   const ok = await confirm({
 *     title: "Cancel booking?",
 *     message: "Your advance fee will be refunded within 5 days.",
 *     confirmText: "Yes, cancel",
 *     cancelText: "Keep booking",
 *     destructive: true,
 *   });
 *
 *   toast({ message: "Copied to clipboard", tone: "success" });
 *
 * Mount once at the root layout:
 *   <AppAlertProvider>...</AppAlertProvider>
 */

import { Ionicons } from "@expo/vector-icons";
import React, {
  createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const PRIMARY = "#02023E";
const ACCENT = "#06f3f9";
const DESTRUCTIVE = "#ef4444";
const SUCCESS = "#22c55e";

type Tone = "info" | "success" | "warning" | "error";

interface AlertOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  tone?: Tone;
}

interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  tone?: Tone;
}

interface ToastOptions {
  message: string;
  tone?: Tone;
  duration?: number; // ms
}

interface AlertCtxShape {
  alert: (opts: AlertOptions) => Promise<void>;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  toast: (opts: ToastOptions) => void;
}

const Ctx = createContext<AlertCtxShape>({
  alert: async () => {},
  confirm: async () => false,
  toast: () => {},
});

export function useAlert() {
  return useContext(Ctx);
}

interface DialogState {
  kind: "alert" | "confirm";
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  tone?: Tone;
  resolve: (v: any) => void;
}

interface ToastState {
  id: number;
  message: string;
  tone: Tone;
}

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const close = (val: any) => {
    setDialog((cur) => {
      if (cur) cur.resolve(val);
      return null;
    });
  };

  const alert = useCallback((opts: AlertOptions): Promise<void> => {
    return new Promise<void>((resolve) => {
      setDialog({
        kind: "alert",
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText || "OK",
        tone: opts.tone || "info",
        resolve: () => resolve(),
      });
    });
  }, []);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setDialog({
        kind: "confirm",
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText || "Confirm",
        cancelText: opts.cancelText || "Cancel",
        destructive: !!opts.destructive,
        tone: opts.tone || (opts.destructive ? "warning" : "info"),
        resolve,
      });
    });
  }, []);

  const toast = useCallback((opts: ToastOptions) => {
    const id = Date.now() + Math.random();
    const t: ToastState = {
      id,
      message: opts.message,
      tone: opts.tone || "info",
    };
    setToasts((cur) => [...cur, t]);
    const dur = opts.duration ?? 2400;
    setTimeout(() => {
      setToasts((cur) => cur.filter((x) => x.id !== id));
    }, dur);
  }, []);

  return (
    <Ctx.Provider value={{ alert, confirm, toast }}>
      {children}
      <DialogModal dialog={dialog} onClose={close} />
      <ToastStack toasts={toasts} />
    </Ctx.Provider>
  );
}

// ─── Dialog ────────────────────────────────────────────────────────────────
function DialogModal({
  dialog,
  onClose,
}: {
  dialog: DialogState | null;
  onClose: (v: any) => void;
}) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (dialog) {
      scale.setValue(0.92);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 90, friction: 10 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [dialog]);

  if (!dialog) return null;

  const tone = dialog.tone || "info";
  const iconName: any = tone === "success" ? "checkmark-circle"
    : tone === "warning" ? "alert-circle"
    : tone === "error" ? "close-circle"
    : "information-circle";
  const iconColor = tone === "success" ? SUCCESS
    : tone === "warning" ? "#f59e0b"
    : tone === "error" ? DESTRUCTIVE
    : PRIMARY;

  const onCancel = () => onClose(dialog.kind === "confirm" ? false : undefined);
  const onConfirm = () => onClose(dialog.kind === "confirm" ? true : undefined);

  return (
    <Modal
      visible={!!dialog}
      transparent
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Animated.View style={[s.dialogOverlay, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dialog.kind === "confirm" ? onCancel : onConfirm} />
        <Animated.View style={[s.dialogCard, { transform: [{ scale }] }]}>
          <View style={[s.iconHalo, { backgroundColor: iconColor + "1A" }]}>
            <Ionicons name={iconName} size={32} color={iconColor} />
          </View>
          {dialog.title ? <Text style={s.dialogTitle}>{dialog.title}</Text> : null}
          {dialog.message ? <Text style={s.dialogMsg}>{dialog.message}</Text> : null}

          <View style={s.btnRow}>
            {dialog.kind === "confirm" ? (
              <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={onCancel} activeOpacity={0.85}>
                <Text style={s.btnGhostText}>{dialog.cancelText}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[
                s.btn,
                s.btnPrimary,
                dialog.destructive && { backgroundColor: DESTRUCTIVE },
              ]}
              onPress={onConfirm}
              activeOpacity={0.88}
            >
              <Text style={s.btnPrimaryText}>{dialog.confirmText}</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ─── Toasts ────────────────────────────────────────────────────────────────
function ToastStack({ toasts }: { toasts: ToastState[] }) {
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="none" style={s.toastWrap}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  );
}

function ToastItem({ toast }: { toast: ToastState }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(ty, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }),
    ]).start();
  }, []);

  const bg = toast.tone === "success" ? "#0c2f1c"
    : toast.tone === "warning" ? "#3d2c10"
    : toast.tone === "error" ? "#3a1414"
    : PRIMARY;
  const dot = toast.tone === "success" ? SUCCESS
    : toast.tone === "warning" ? "#f59e0b"
    : toast.tone === "error" ? DESTRUCTIVE
    : ACCENT;

  return (
    <Animated.View style={[s.toast, { backgroundColor: bg, opacity, transform: [{ translateY: ty }] }]}>
      <View style={[s.toastDot, { backgroundColor: dot }]} />
      <Text style={s.toastText} numberOfLines={3}>{toast.message}</Text>
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  dialogOverlay: {
    flex: 1,
    backgroundColor: "rgba(2,2,30,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  dialogCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
      android: { elevation: 12 },
    }),
  },
  iconHalo: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  dialogTitle: {
    fontSize: 18, fontWeight: "800", color: "#0F1626",
    textAlign: "center", letterSpacing: -0.2,
  },
  dialogMsg: {
    fontSize: 14, color: "#5b6877", marginTop: 8,
    textAlign: "center", lineHeight: 21, fontWeight: "500",
  },
  btnRow: {
    flexDirection: "row", gap: 10,
    marginTop: 20, width: "100%",
  },
  btn: {
    flex: 1, height: 50, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  btnGhost: {
    backgroundColor: "#f1f3f7",
    borderWidth: 1, borderColor: "#e6eaf0",
  },
  btnGhostText: {
    color: "#0F1626", fontSize: 15, fontWeight: "700",
  },
  btnPrimary: {
    backgroundColor: PRIMARY,
  },
  btnPrimaryText: {
    color: "#fff", fontSize: 15, fontWeight: "800",
    letterSpacing: 0.2,
  },

  toastWrap: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    left: 16, right: 16,
    gap: 8,
    zIndex: 9999,
  },
  toast: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
    }),
  },
  toastDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  toastText: {
    flex: 1, color: "#fff", fontSize: 13, fontWeight: "600",
    lineHeight: 18,
  },
});
