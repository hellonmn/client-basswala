/**
 * context/SavedContext.tsx
 * Persistent "Saved / Favorites" store for captains and DJs.
 * Backed by AsyncStorage, keyed by id.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "@basswala/saved-v1";

interface SavedState {
  captains: number[];
  djs: number[];
  equipment: number[];
}

interface SavedContextType {
  savedCaptains: Set<number>;
  savedDJs: Set<number>;
  savedEquipment: Set<number>;
  toggleCaptain: (id: number) => void;
  toggleDJ: (id: number) => void;
  toggleEquipment: (id: number) => void;
  isCaptainSaved: (id: number) => boolean;
  isDJSaved: (id: number) => boolean;
  isEquipmentSaved: (id: number) => boolean;
}

const SavedContext = createContext<SavedContextType | null>(null);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SavedState>({ captains: [], djs: [], equipment: [] });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setState({
            captains: Array.isArray(parsed.captains) ? parsed.captains : [],
            djs: Array.isArray(parsed.djs) ? parsed.djs : [],
            equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
          });
        }
      } catch {
        /* ignore */
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  const toggleCaptain = useCallback((id: number) => {
    setState((prev) => ({
      ...prev,
      captains: prev.captains.includes(id)
        ? prev.captains.filter((x) => x !== id)
        : [...prev.captains, id],
    }));
  }, []);

  const toggleDJ = useCallback((id: number) => {
    setState((prev) => ({
      ...prev,
      djs: prev.djs.includes(id)
        ? prev.djs.filter((x) => x !== id)
        : [...prev.djs, id],
    }));
  }, []);

  const toggleEquipment = useCallback((id: number) => {
    setState((prev) => ({
      ...prev,
      equipment: prev.equipment.includes(id)
        ? prev.equipment.filter((x) => x !== id)
        : [...prev.equipment, id],
    }));
  }, []);

  const savedCaptains = new Set(state.captains);
  const savedDJs = new Set(state.djs);
  const savedEquipment = new Set(state.equipment);

  return (
    <SavedContext.Provider
      value={{
        savedCaptains,
        savedDJs,
        savedEquipment,
        toggleCaptain,
        toggleDJ,
        toggleEquipment,
        isCaptainSaved: (id) => savedCaptains.has(id),
        isDJSaved: (id) => savedDJs.has(id),
        isEquipmentSaved: (id) => savedEquipment.has(id),
      }}
    >
      {children}
    </SavedContext.Provider>
  );
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used within SavedProvider");
  return ctx;
}
