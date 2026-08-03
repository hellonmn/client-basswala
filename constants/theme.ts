/**
 * Theme constants for consistent styling across the app
 * Updated with elegant white theme and balanced colors
 */

export const COLORS = {
  // Primary colors - deep navy brand
  primary: '#02023E',
  primaryDark: '#010128',
  primaryLight: '#1a1a5e',
  primaryMuted: '#2a2a7e',

  // Accent color - cyan, used for highlights/badges
  accent: '#06f3f9',
  accentLight: '#e0fcfd',
  accentDark: '#00c4cb',

  // Background colors
  background: '#ffffff',
  backgroundLight: '#f8f9fa',
  backgroundCard: '#ffffff',
  backgroundSubtle: '#f3f4f6',
  glassBackground: 'rgba(255, 255, 255, 0.85)',
  glassDark: 'rgba(2, 2, 62, 0.75)',

  // Text colors
  text: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  textInverted: '#ffffff',

  // UI & Border colors
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderFocus: '#02023E',
  cardBorder: 'rgba(226, 232, 240, 0.8)',
  divider: '#f1f5f9',
  overlay: 'rgba(2, 2, 62, 0.4)',

  // Status colors
  success: '#10b981',
  successLight: '#d1fae5',
  error: '#ef4444',
  errorLight: '#fee2e2',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  info: '#3b82f6',
  infoLight: '#dbeafe',

  // Gradient colors
  gradientStart: '#02023E',
  gradientEnd: '#0d0d63',
  accentGradientStart: '#06f3f9',
  accentGradientEnd: '#3b82f6',
};

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  xxxl: 36,
};

export const FONT_WEIGHTS = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const BORDER_RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 30,
  round: 9999,
};

export const SHADOWS = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  soft: {
    shadowColor: '#02023E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  small: {
    shadowColor: '#02023E',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  medium: {
    shadowColor: '#02023E',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  large: {
    shadowColor: '#02023E',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
  floating: {
    shadowColor: '#02023E',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 28,
    elevation: 14,
  },
};

export const ANIMATION = {
  fast: 150,
  normal: 250,
  slow: 400,
};

