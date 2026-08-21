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
      },
    },
  },
  plugins: [],
};

export default config;
