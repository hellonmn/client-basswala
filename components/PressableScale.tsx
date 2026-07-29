/**
 * components/PressableScale.tsx
 *
 * Drop-in replacement for TouchableOpacity that gives a tactile
 * "press" feel — the element springs down to `scaleTo` on press-in
 * and back to 1 on release. Use on cards, buttons, list rows, etc.
 *
 * Usage:
 *   <PressableScale style={s.card} onPress={...}>
 *     ...children...
 *   </PressableScale>
 *
 * Implementation note:
 *  - The style (incl. layout props like `flex`/`width`) is applied
 *    directly to an Animated Pressable, so it behaves exactly like the
 *    TouchableOpacity it replaces in flex rows — no extra wrapper view
 *    that would break sizing. The transform scales the whole element.
 *  - `activeOpacity` is accepted (and ignored) so existing TouchableOpacity
 *    call-sites can be swapped without removing that prop.
 */

import React, { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleProp,
  ViewStyle,
  GestureResponderEvent,
} from "react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: (e: GestureResponderEvent) => void;
  onPressIn?: (e: GestureResponderEvent) => void;
  onPressOut?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  /** How far to shrink on press. Smaller cards feel better at ~0.96–0.98. */
  scaleTo?: number;
  /** Dim slightly on press too (like TouchableOpacity). */
  dimTo?: number;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
  /** Ignored — accepted for TouchableOpacity drop-in compatibility. */
  activeOpacity?: number;
}

export default function PressableScale({
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  disabled,
  scaleTo = 0.97,
  dimTo = 0.9,
  hitSlop,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  activeOpacity,
}: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const animate = (s: number, o: number) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: s,
        useNativeDriver: true,
        speed: 40,
        bounciness: 0,
      }),
      Animated.timing(opacity, {
        toValue: o,
        duration: 90,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <AnimatedPressable
      disabled={disabled}
      hitSlop={hitSlop as any}
      onPress={onPress}
      onPressIn={(e) => { if (!disabled) animate(scaleTo, dimTo); onPressIn?.(e); }}
      onPressOut={(e) => { animate(1, 1); onPressOut?.(e); }}
      style={[style, { transform: [{ scale }], opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
}
