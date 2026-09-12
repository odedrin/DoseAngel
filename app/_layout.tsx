import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { StopwatchProvider } from '@/store/StopwatchContext';
import { ColorSchemeProvider } from '@/store/ColorSchemeContext';
import { DisclosureModal } from '@/components/DisclosureModal';
import { ConsentGate } from '@/components/ConsentGate';
import { TourOverlay } from '@/components/TourOverlay';
import { TourProvider, hasTourCompleted, useTour } from '@/store/TourContext';

const DISCLOSURE_KEY = 'disclosure:dismissed';
const CONSENT_KEY = 'consent:agreed';

// Same reasoning as TOUR_OPEN_DELAY_MS / EMBEDDED_TRANSITION_DELAY_MS
// elsewhere: only one native Modal can be presented at a time. Android is
// stricter about this than iOS and can hang or crash if a second Modal
// opens before the first has finished closing, rather than just glitching.
const MODAL_TRANSITION_DELAY_MS = 400;

// Re-enabled after aligning ConsentGate's Modal with the rest of the app's
// proven-working pattern (transparent + own backdrop, instead of the
// iOS-only presentationStyle it used before) and adding an explicit
// MODAL_TRANSITION_DELAY_MS gap before Tour opens (see agreeToConsent
// below), mirroring the delay already used for Disclosure -> Consent.
// Re-test the full Disclosure -> Consent -> Tour chain on a real Android
// device/emulator before shipping — this was disabled for an Android
// hang/blank-page bug that was never conclusively root-caused, only
// narrowed down by process of elimination.
const CONSENT_GATE_ENABLED = true;

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  return (
    <ColorSchemeProvider>
      <TourProvider>
        <RootLayoutInner />
      </TourProvider>
    </ColorSchemeProvider>
  );
}

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const tour = useTour();

  // Show disclosure on first launch (when key is absent from AsyncStorage).
  // The consent gate is a separate, permanent one-time agreement: if it
  // hasn't been agreed to yet, it must show even for existing users who
  // already dismissed the disclosure before this gate existed.
  useEffect(() => {
    (async () => {
      const [discl, consent] = await Promise.all([
        AsyncStorage.getItem(DISCLOSURE_KEY),
        AsyncStorage.getItem(CONSENT_KEY),
      ]);
      if (discl === null) {
        setDisclosureVisible(true);
      } else if (CONSENT_GATE_ENABLED && consent !== 'true') {
        setConsentVisible(true);
      }
    })();
  }, []);

  function startTourIfNeeded() {
    hasTourCompleted().then(done => {
      if (!done) setTimeout(() => tour.start(), 400);
    });
  }

  function dismissDisclosure(suppress: boolean) {
    setDisclosureVisible(false);
    if (suppress) AsyncStorage.setItem(DISCLOSURE_KEY, 'true');

    // The consent gate must run next regardless of the "don't show again"
    // checkbox above — that checkbox only controls the informational recap.
    AsyncStorage.getItem(CONSENT_KEY).then(consent => {
      if (!CONSENT_GATE_ENABLED || consent === 'true') {
        startTourIfNeeded();
      } else {
        // Wait for DisclosureModal's Modal to finish closing before
        // presenting ConsentGate's — see MODAL_TRANSITION_DELAY_MS above.
        setTimeout(() => setConsentVisible(true), MODAL_TRANSITION_DELAY_MS);
      }
    });
  }

  function agreeToConsent() {
    setConsentVisible(false);
    AsyncStorage.setItem(CONSENT_KEY, 'true');
    // Explicit gap before Tour's Modal opens, mirroring the delay used
    // between Disclosure closing and ConsentGate opening above — don't
    // rely solely on startTourIfNeeded's own setTimeout, which exists for
    // a different reason (letting the tab layout settle) and could change
    // independently of this modal-safety requirement.
    setTimeout(startTourIfNeeded, MODAL_TRANSITION_DELAY_MS);
  }

  return (
    <StopwatchProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      </ThemeProvider>

      <DisclosureModal
        visible={disclosureVisible}
        isFirstLaunch
        onDismiss={dismissDisclosure}
      />

      {CONSENT_GATE_ENABLED && (
        <ConsentGate
          visible={consentVisible}
          onAgree={agreeToConsent}
        />
      )}

      <TourOverlay />
    </StopwatchProvider>
  );
}
