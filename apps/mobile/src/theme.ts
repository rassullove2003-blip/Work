import { Platform } from 'react-native';

/** Дизайн-токены UniItalia (раздел 02 ТЗ). */
export const colors = {
  primary: '#00B8D9',
  primaryDark: '#0092AD',
  primarySoft: '#E0F7FB',
  secondary: '#0066FF',
  secondarySoft: '#E6F0FF',
  background: '#FFFFFF',
  surface: '#F5F7FA',
  border: '#E3E8EF',
  text: '#172B4D',
  textMuted: '#5E6C84',
  textOnPrimary: '#FFFFFF',
  success: '#00C896',
  successSoft: '#E0F9F2',
  warning: '#FFB020',
  warningSoft: '#FFF5E0',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const font = {
  h1: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '800' as const, lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  bodyBold: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  small: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.6 },
};

/** Минимальная зона нажатия по рекомендациям Apple/Google. */
export const HIT = 44;

export const shadow = Platform.select({
  web: { boxShadow: '0 2px 10px rgba(23, 43, 77, 0.08)' } as object,
  default: {
    shadowColor: '#172B4D',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
