/**
 * ScrollDirectionContext.tsx
 *
 * Provides a lightweight way for any scrollable screen to broadcast
 * its scroll direction so the tab bar can hide / show itself.
 *
 * Usage in a screen:
 *   const { onScroll } = useScrollDirection();
 *   <ScrollView onScroll={onScroll} scrollEventThrottle={16} ... />
 *
 * Usage in the tab bar:
 *   const { translateY } = useScrollDirection();
 *   <Animated.View style={{ transform: [{ translateY }] }} />
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
} from "react";
import { Animated, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

const HIDE_THRESHOLD = 8;   // px scrolled down before bar hides
const SHOW_THRESHOLD = 4;   // px scrolled up before bar shows
const BAR_HEIGHT     = 100; // a bit more than the actual bar so it fully exits

// ─── Context shape ────────────────────────────────────────────────────────────

type ScrollDirectionContextType = {
  /** Pass this directly to a ScrollView / FlatList's onScroll prop */
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Animated.Value driving translateY of the tab bar (0 = visible, BAR_HEIGHT = hidden) */
  tabBarTranslateY: Animated.Value;
};

const ScrollDirectionContext = createContext<ScrollDirectionContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ScrollDirectionProvider({ children }: { children: React.ReactNode }) {
  const tabBarTranslateY = useRef(new Animated.Value(0)).current;
  const lastY            = useRef(0);
  const hidden           = useRef(false);
  const accumulated      = useRef(0);

  const showBar = useCallback(() => {
    if (!hidden.current) return;
    hidden.current = false;
    Animated.spring(tabBarTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 14,
    }).start();
  }, [tabBarTranslateY]);

  const hideBar = useCallback(() => {
    if (hidden.current) return;
    hidden.current = true;
    Animated.spring(tabBarTranslateY, {
      toValue: BAR_HEIGHT,
      useNativeDriver: true,
      tension: 80,
      friction: 14,
    }).start();
  }, [tabBarTranslateY]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const currentY = e.nativeEvent.contentOffset.y;
      const delta    = currentY - lastY.current;
      lastY.current  = currentY;

      // Always show bar when near top
      if (currentY <= 10) {
        accumulated.current = 0;
        showBar();
        return;
      }

      accumulated.current += delta;

      if (accumulated.current > HIDE_THRESHOLD) {
        accumulated.current = 0;
        hideBar();
      } else if (accumulated.current < -SHOW_THRESHOLD) {
        accumulated.current = 0;
        showBar();
      }
    },
    [hideBar, showBar]
  );

  return (
    <ScrollDirectionContext.Provider value={{ onScroll, tabBarTranslateY }}>
      {children}
    </ScrollDirectionContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useScrollDirection() {
  const ctx = useContext(ScrollDirectionContext);
  if (!ctx) throw new Error("useScrollDirection must be used inside ScrollDirectionProvider");
  return ctx;
}