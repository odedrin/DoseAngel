/**
 * ConsentGate
 *
 * A mandatory, blocking agreement screen. Shown once, ever, on the first
 * launch after DisclosureModal is dismissed (and on every subsequent launch
 * until agreed, for users who dismissed the disclosure before this screen
 * existed). Unlike DisclosureModal, this cannot be swiped away or skipped:
 * the only two paths forward are ticking the box and tapping "Continue," or
 * "Quit app." iOS does not allow apps to force-quit themselves, so on iOS
 * "Quit" prompts the user to close DoseAngel manually; on Android it exits
 * the app directly.
 */

import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useState } from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  onAgree: () => void;
}

export function ConsentGate({ visible, onAgree }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const [agreed, setAgreed] = useState(false);

  const bgColor     = isDark ? '#0d0d0f' : '#F2F2F7';
  const textColor   = isDark ? '#ECEDEE' : '#11181C';
  const subColor    = isDark ? '#9BA1A6' : '#687076';
  const borderColor = isDark ? '#2A2D2F' : '#E5E5EA';
  // Matches the light/dark split used for this same teal elsewhere (plan.tsx,
  // explore.tsx) rather than the flat #4ECDC4 this screen used to hardcode —
  // that value is tuned for dark backgrounds and runs pale on light ones.
  const accentColor = isDark ? '#4ECDC4' : '#2BBDB4';

  function handleQuit() {
    if (Platform.OS === 'android') {
      BackHandler.exitApp();
      return;
    }
    Alert.alert(
      'Close DoseAngel',
      'To quit, close the app yourself: swipe up from the bottom of the screen and swipe DoseAngel away.',
      [{ text: 'OK' }],
    );
  }

  return (
    // transparent + our own opaque full-bleed View, not presentationStyle
    // (iOS-only; Android ignores it). Matches every other Modal in this app
    // (InteractionWarningModal, RedoseWarningModal, AddStopwatchModal, ...) —
    // this was previously the only non-transparent Modal in the codebase,
    // and a likely contributor to an Android hang/blank-page bug that
    // showed up specifically on the Disclosure -> Consent -> Tour chain of
    // sequential native Modals. Re-test on Android before trusting this.
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleQuit}
    >
      <View style={[styles.root, { backgroundColor: bgColor }]}>

        {/* Left-aligned title running straight into the two statements, no
            boxed "card" around them — this is a short, plain-text agreement,
            not a dashboard widget, so it reads as text rather than UI chrome.
            The whole block centers vertically via scrollContent's flexGrow +
            justifyContent, and falls back to normal top-anchored scrolling
            if the content ever grows taller than the screen (larger
            accessibility text sizes, for example). */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: textColor }]}>Before you continue</Text>

          <Text style={[styles.paragraph, { color: textColor }]}>
            I understand that drug use carries risk that harm reduction measures cannot
            eliminate. I am responsible for my own choices and their consequences, and
            DoseAngel is not responsible for any choice I make or its outcome.
          </Text>

          <View style={[styles.divider, { backgroundColor: borderColor }]} />

          <Text style={[styles.paragraph, { color: textColor }]}>
            I understand that DoseAngel does not give medical advice, and that the data in
            the app may contain errors or be incomplete.
          </Text>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: borderColor }]}>

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setAgreed(v => !v)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.checkbox,
              { borderColor: agreed ? accentColor : subColor },
              agreed && { backgroundColor: accentColor },
            ]}>
              {agreed && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.checkLabel, { color: textColor }]}>
              I understand and agree
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: agreed ? accentColor : borderColor }]}
            onPress={onAgree}
            activeOpacity={0.85}
            disabled={!agreed}
          >
            <Text style={[styles.btnText, !agreed && { color: subColor }]}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleQuit} activeOpacity={0.6} style={styles.quitBtn}>
            <Text style={[styles.quitText, { color: subColor }]}>Quit app</Text>
          </TouchableOpacity>

        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginBottom: 22,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 20,
  },
  footer: {
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#000',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
  },
  checkLabel: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  btn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  quitBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  quitText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
