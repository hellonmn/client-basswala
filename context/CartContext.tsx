/**
 * CartContext.tsx
 * Global cart for equipment-only bookings.
 *
 * IMPORTANT: The cart is always scoped to a single captain. Equipment from
 * different captains can't be mixed because bookings are created per-captain
 * on the backend. If a user tries to add equipment from a different captain,
 * they're prompted to clear the cart first.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CART_STORAGE_KEY = "@basswala/cart-v1";

export interface CartEquipment {
  id: number;
  name: string;
  category: string;
  brand?: string;
  dailyRate: number;
  images?: string[];
  quantity: number;
  days: number;
  /** Max units currently available server-side. Used to cap + / updates. */
  maxStock?: number;
}

export interface CartCaptain {
  id: number;
  businessName?: string;
  locationCity?: string;
}

interface CartState {
  items: CartEquipment[];
  captain: CartCaptain | null;
}

interface CartContextType {
  items: CartEquipment[];
  captain: CartCaptain | null;
  itemCount: number;
  subtotal: number;
  addItem: (equipment: Omit<CartEquipment, "quantity" | "days">, captain: CartCaptain, days?: number) => { ok: boolean; message?: string };
  updateQuantity: (id: number, quantity: number) => void;
  updateDays: (id: number, days: number) => void;
  removeItem: (id: number) => void;
  clear: () => void;
  replaceCart: (equipment: Omit<CartEquipment, "quantity" | "days">, captain: CartCaptain, days?: number) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>({ items: [], captain: null });
  const [hydrated, setHydrated] = useState(false);

  // Load from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CART_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.items)) {
            setState({ items: parsed.items, captain: parsed.captain || null });
          }
        }
      } catch (err) {
        console.warn("Cart hydration failed:", err);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // Persist on every change (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state)).catch((err) =>
      console.warn("Cart persist failed:", err)
    );
  }, [state, hydrated]);

  const addItem = useCallback(
    (
      equipment: Omit<CartEquipment, "quantity" | "days">,
      captain: CartCaptain,
      days: number = 1
    ): { ok: boolean; message?: string } => {
      // If cart has items from a different captain, refuse
      if (state.captain && state.captain.id !== captain.id) {
        return {
          ok: false,
          message: `Your cart has items from ${state.captain.businessName || "another captain"}. Clear it first to add from ${captain.businessName || "this captain"}.`,
        };
      }

      // If the item is out of stock on the server, refuse
      if (typeof equipment.maxStock === "number" && equipment.maxStock <= 0) {
        return {
          ok: false,
          message: `${equipment.name} is currently out of stock.`,
        };
      }

      let capped = false;
      setState((prev) => {
        const existing = prev.items.find((i) => i.id === equipment.id);
        if (existing) {
          const max = equipment.maxStock ?? existing.maxStock ?? Number.MAX_SAFE_INTEGER;
          const next = existing.quantity + 1;
          if (next > max) {
            capped = true;
            return prev;
          }
          return {
            ...prev,
            captain: captain,
            items: prev.items.map((i) =>
              i.id === equipment.id
                ? { ...i, quantity: next, maxStock: equipment.maxStock ?? i.maxStock }
                : i
            ),
          };
        }
        return {
          captain: captain,
          items: [...prev.items, { ...equipment, quantity: 1, days }],
        };
      });

      if (capped) {
        return {
          ok: false,
          message: `Only ${equipment.maxStock} ${equipment.name}${(equipment.maxStock ?? 0) > 1 ? "s" : ""} in stock.`,
        };
      }
      return { ok: true };
    },
    [state.captain]
  );

  const replaceCart = useCallback(
    (
      equipment: Omit<CartEquipment, "quantity" | "days">,
      captain: CartCaptain,
      days: number = 1
    ) => {
      setState({
        captain,
        items: [{ ...equipment, quantity: 1, days }],
      });
    },
    []
  );

  const updateQuantity = useCallback((id: number, quantity: number) => {
    setState((prev) => {
      if (quantity <= 0) {
        const items = prev.items.filter((i) => i.id !== id);
        return {
          items,
          captain: items.length === 0 ? null : prev.captain,
        };
      }
      return {
        ...prev,
        items: prev.items.map((i) => {
          if (i.id !== id) return i;
          const max = i.maxStock ?? Number.MAX_SAFE_INTEGER;
          return { ...i, quantity: Math.min(quantity, max) };
        }),
      };
    });
  }, []);

  const updateDays = useCallback((id: number, days: number) => {
    setState((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.id === id ? { ...i, days: Math.max(1, days) } : i
      ),
    }));
  }, []);

  const removeItem = useCallback((id: number) => {
    setState((prev) => {
      const items = prev.items.filter((i) => i.id !== id);
      return {
        items,
        captain: items.length === 0 ? null : prev.captain,
      };
    });
  }, []);

  const clear = useCallback(() => {
    setState({ items: [], captain: null });
  }, []);

  const itemCount = useMemo(
    () => state.items.reduce((sum, i) => sum + i.quantity, 0),
    [state.items]
  );

  const subtotal = useMemo(
    () =>
      state.items.reduce(
        (sum, i) => sum + Number(i.dailyRate) * i.quantity * i.days,
        0
      ),
    [state.items]
  );

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        captain: state.captain,
        itemCount,
        subtotal,
        addItem,
        updateQuantity,
        updateDays,
        removeItem,
        clear,
        replaceCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
