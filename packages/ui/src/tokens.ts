/**
 * Design tokens shared conceptually between apps/web (Tailwind config
 * consumes these values) and apps/mobile (React Native StyleSheet /
 * NativeWind consumes the same values) — §83. Web and mobile intentionally
 * do NOT share physical components, only this identity layer.
 *
 * Tone target (§82): acolhedora, simples, moderna — not clinical, not
 * corporate, not infantilized. Warm neutrals + one confident accent, not
 * a "hospital app" palette of clinical blues, and not pastel/childish
 * either since a parent-facing screen needs to read as calm and capable.
 */
export const colors = {
  bg: '#FBF9F6',
  surface: '#FFFFFF',
  surfaceMuted: '#F2EEE7',
  ink: '#231F1B',
  inkMuted: '#6B655D',
  border: '#E7E1D6',
  primary: '#B5562B', // warm terracotta — accent, not clinical blue
  primaryInk: '#FFFFFF',
  success: '#2F7D5A',
  warning: '#B8842A',
  critical: '#B23B3B',
  info: '#3A6EA5',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  full: 999,
} as const;

export const typography = {
  fontFamily: 'System', // platform default; a custom pt-BR-friendly humanist sans is a Phase 8 polish item
  scale: {
    display: 32,
    title: 24,
    subtitle: 18,
    body: 16,
    caption: 13,
  },
} as const;

export const elevation = {
  none: 'none',
  sm: '0 1px 2px rgba(35,31,27,0.06)',
  md: '0 4px 12px rgba(35,31,27,0.10)',
} as const;

/** Notification-level colors (§49) reused across web/mobile badges. */
export const notificationLevelColors = {
  CRITICAL: colors.critical,
  IMPORTANT: colors.warning,
  INFORMATIONAL: colors.info,
} as const;

/** Category colors for CalendarEvent (§30). */
export const categoryColors: Record<string, string> = {
  SCHOOL: '#3A6EA5',
  HEALTH: '#B23B3B',
  SPORT: '#2F7D5A',
  FAMILY: '#B5562B',
  MEDICATION: '#8A4FA0',
  DOCUMENT: '#6B655D',
  FINANCE: '#B8842A',
  OTHER: '#918B80',
};
