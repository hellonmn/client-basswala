import React from 'react';
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PressableScale from './PressableScale';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, BORDER_RADIUS, SHADOWS, SPACING } from '../constants/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'accent' | 'danger';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
  icon,
}) => {
  const isPrimary = variant === 'primary';
  const isAccent = variant === 'accent';
  const isDisabled = disabled || loading;

  const getSpinnerColor = () => {
    if (isPrimary || isAccent || variant === 'danger') return COLORS.textInverted;
    return COLORS.primary;
  };

  const getTextColorStyle = () => {
    if (isDisabled) return styles.textDisabled;
    switch (variant) {
      case 'primary':
      case 'danger':
        return styles.textInverted;
      case 'accent':
        return styles.textAccent;
      case 'outline':
      case 'ghost':
        return styles.textOutline;
      case 'secondary':
      default:
        return styles.textSecondary;
    }
  };

  const buttonInnerContent = (
    <View style={styles.contentRow}>
      {loading ? (
        <ActivityIndicator color={getSpinnerColor()} size="small" />
      ) : (
        <>
          {icon && <View style={styles.iconWrapper}>{icon}</View>}
          <Text
            style={[
              styles.text,
              styles[`text${size.charAt(0).toUpperCase() + size.slice(1)}` as keyof typeof styles],
              getTextColorStyle(),
              textStyle,
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </View>
  );

  if (isPrimary && !isDisabled) {
    return (
      <PressableScale
        onPress={onPress}
        disabled={isDisabled}
        scaleTo={0.96}
        style={[
          styles.container,
          styles.shadowPrimary,
          styles[size],
          fullWidth && styles.fullWidth,
          style,
        ]}
      >
        <LinearGradient
          colors={[COLORS.gradientStart, COLORS.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {buttonInnerContent}
        </LinearGradient>
      </PressableScale>
    );
  }

  if (isAccent && !isDisabled) {
    return (
      <PressableScale
        onPress={onPress}
        disabled={isDisabled}
        scaleTo={0.96}
        style={[
          styles.container,
          styles.shadowAccent,
          styles[size],
          fullWidth && styles.fullWidth,
          style,
        ]}
      >
        <LinearGradient
          colors={[COLORS.accentGradientStart, COLORS.accentGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {buttonInnerContent}
        </LinearGradient>
      </PressableScale>
    );
  }

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      scaleTo={0.97}
      style={[
        styles.container,
        styles[size],
        styles[variant],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {buttonInnerContent}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: BORDER_RADIUS.pill,
    overflow: 'hidden',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  iconWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadowPrimary: {
    ...SHADOWS.small,
  },
  shadowAccent: {
    shadowColor: COLORS.accentDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  small: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  medium: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  large: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md + 4,
  },
  fullWidth: {
    width: '100%',
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  accent: {
    backgroundColor: COLORS.accent,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: COLORS.error,
  },
  disabled: {
    backgroundColor: COLORS.borderLight,
    opacity: 0.6,
  },
  text: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  textSmall: {
    fontSize: FONT_SIZES.sm,
  },
  textMedium: {
    fontSize: FONT_SIZES.md,
  },
  textLarge: {
    fontSize: FONT_SIZES.lg,
  },
  textInverted: {
    color: COLORS.textInverted,
  },
  textAccent: {
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHTS.bold,
  },
  textOutline: {
    color: COLORS.primary,
  },
  textSecondary: {
    color: COLORS.text,
  },
  textDisabled: {
    color: COLORS.textMuted,
  },
});