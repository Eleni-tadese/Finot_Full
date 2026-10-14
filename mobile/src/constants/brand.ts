// The Finot website's colours (from finot/src/assets/styles/global.css), so the app looks like the same product.
export const brand = {
  primary: '#1B2E66', // deep blue: titles, buttons, selected tab
  primaryLight: '#2a4494',
  primarySoft: '#e8edf9', // very light blue: icon backgrounds, chips
  accent: '#F7DF1E', // amber: highlights only (never as text on white)
  accentSoft: '#fef9c3',
  background: '#f6f8fc', // page background
  card: '#ffffff',
  border: '#e5eaf3',
  text: '#1e2a4a',
  muted: '#64748b',
  success: '#15803d',
  successSoft: '#dcfce7',
  danger: '#b91c1c',
  dangerSoft: '#fee2e2',
  warning: '#b45309',
  warningSoft: '#fef3c7',
} as const;

// Plus Jakarta Sans, the website's font. React Native needs one font name per weight.
export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

// A soft shadow under cards. iOS uses the shadow* values, Android uses elevation.
export const shadow = {
  card: {
    shadowColor: '#1B2E66',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;
