import type { Config } from 'tailwindcss';
import { colors, radius } from '@family-app/ui';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: colors.bg,
        surface: colors.surface,
        surfaceMuted: colors.surfaceMuted,
        ink: colors.ink,
        inkMuted: colors.inkMuted,
        border: colors.border,
        primary: colors.primary,
        success: colors.success,
        warning: colors.warning,
        critical: colors.critical,
        info: colors.info,
      },
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        xl: `${radius.xl}px`,
      },
      fontFamily: {
        // Plus Jakarta Sans loaded via next/font/google in layout.tsx sets
        // this CSS variable; the same system-font fallback stack as
        // packages/ui's typography token covers a failed font load.
        sans: ['var(--font-plus-jakarta-sans)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
};

export default config;
