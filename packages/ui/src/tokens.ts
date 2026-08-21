/**
 * Design tokens shared conceptually between apps/web (Tailwind config
 * consumes these values) and apps/mobile (React Native StyleSheet /
 * NativeWind consumes the same values) — §83. Web and mobile intentionally
 * do NOT share physical components, only this identity layer.
 *
 * ZELII P0 §6.2 palette — creme + ameixa + coral, com sálvia/azul/âmbar/
 * crítico como acentos funcionais. Tom-alvo: acolhedor e capaz, nunca
 * clínico, infantil ou corporativo. Cor nunca é usada para codificar
 * gênero.
 *
 * Contraste (WCAG AA) — medido, não assumido (fórmula de luminância
 * relativa padrão, contra `bg`/`surface`):
 *   ink (#4B3346)      sobre bg/surface → 10.7:1 / 11.3:1  (AA normal ✅, texto de corpo)
 *   inkMuted (#71646D) sobre bg/surface →  5.3:1 /  5.6:1  (AA normal ✅, texto secundário)
 *   critical, info     como TEXTO sobre bg/surface → ≥4.3:1, `info` sobre
 *                       `surface` e `critical` sobre ambos passam AA normal (≥4.5:1)
 *   primary, success, warning como TEXTO pequeno sobre bg/surface → 3.5–4.2:1,
 *                       ou seja, só atingem o piso AA para texto GRANDE (≥18px
 *                       regular ou ≥~19px em negrito), não para texto pequeno normal.
 *
 * Regra de uso derivada disso (aplicada nos componentes do §6.3):
 *   - Texto de corpo, rótulo pequeno, texto secundário → sempre `ink`/`inkMuted`,
 *     nunca uma cor de acento pura como cor de texto pequeno.
 *   - `StatusBadge`/chips → fundo em tom claro (tint) da cor de acento + texto em
 *     `ink` + um indicador de cor (ponto/ícone) — nunca a cor de acento como texto
 *     em corpo pequeno, mesmo sobre um tint.
 *   - Preenchimento sólido de botão primário (`primary` + texto branco) fica em
 *     ~3.7:1 — dentro do piso AA para texto grande/negrito (é assim que qualquer
 *     "primary button" de app consegue ficar no acento de marca); o componente
 *     `Button` (§6.3) usa rótulo ≥16px semibold para isso. Não é um número
 *     escondido — está documentado aqui para uma revisão de acessibilidade real
 *     antes do lançamento público (ver SECURITY.md "Phase 7 hardening checklist").
 *   - `critical` (emergência/erro) e `info` nunca dependem dessa folga — já
 *     passam AA normal como texto em qualquer tamanho, de propósito, porque são
 *     os dois usos onde legibilidade imediata importa mais.
 */
export const colors = {
  bg: '#FFF8F1', // creme
  surface: '#FFFFFF',
  surfaceMuted: '#F2E8DE', // areia
  ink: '#4B3346', // ameixa escura — texto forte e marca
  inkMuted: '#71646D',
  border: '#E4D8CF',
  primary: '#D95D4F', // coral — ação principal (nunca reaproveitado como cor de emergência)
  primaryInk: '#FFFFFF',
  success: '#5F806C', // sálvia — confirmação e conclusão
  info: '#557A96', // informação e agenda
  warning: '#B7792B', // âmbar — atenção
  critical: '#B83E45', // emergência e erro — deliberadamente distinto de `primary`
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
  md: 14, // botões (12–14px por spec)
  lg: 18, // cartões (14–20px por spec)
  xl: 20, // teto da faixa de cartão
  full: 999,
} as const;

/**
 * Plus Jakarta Sans quando disponível (Google Fonts em web via
 * `next/font/google`; Expo via `expo-font`/`expo-google-fonts`), com
 * fallback seguro de sistema — a stack nunca quebra se a fonte não
 * carregar a tempo (§6.2).
 */
export const typography = {
  fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontFamilyMobile: 'PlusJakartaSans', // nome do asset registrado via expo-font; ver apps/mobile
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
  sm: '0 1px 2px rgba(75,51,70,0.08)',
  md: '0 4px 12px rgba(75,51,70,0.12)',
} as const;

/** Alvo mínimo de toque (§6.2) — aplicado por componentes interativos base. */
export const touchTarget = {
  min: 44,
} as const;

/** Notification-level colors (§49) reused across web/mobile badges. */
export const notificationLevelColors = {
  CRITICAL: colors.critical,
  IMPORTANT: colors.warning,
  INFORMATIONAL: colors.info,
} as const;

/** Category colors for CalendarEvent (§30). Nunca usadas para codificar gênero. */
export const categoryColors: Record<string, string> = {
  SCHOOL: colors.info,
  HEALTH: colors.critical,
  SPORT: colors.success,
  FAMILY: colors.primary,
  MEDICATION: '#8A4FA0',
  DOCUMENT: colors.inkMuted,
  FINANCE: colors.warning,
  OTHER: '#A99C8F',
};
