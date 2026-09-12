import { useColorScheme as useNativeColorScheme } from 'react-native';
import { useColorSchemePreference } from '@/store/ColorSchemeContext';

/**
 * Drop-in replacement for React Native's useColorScheme.
 * Respects the user's manual override (System / Light / Dark) set in Settings.
 * When preference is 'system', falls back to the OS color scheme.
 */
export function useColorScheme(): 'light' | 'dark' {
  const { colorSchemePreference } = useColorSchemePreference();
  // RN's ColorSchemeName can also be 'unspecified' (e.g. some Android
  // versions/devices with no OS-level preference set) as of RN 0.83 (SDK
  // 55); treat that the same as no preference, same as null/undefined.
  const rawSystemScheme = useNativeColorScheme();
  const systemScheme: 'light' | 'dark' = rawSystemScheme === 'dark' ? 'dark' : 'light';

  if (colorSchemePreference === 'system') return systemScheme;
  return colorSchemePreference;
}
