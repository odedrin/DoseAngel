/**
 * DisclosureModal
 *
 * Shown on first launch (auto-dismissed flag stored in AsyncStorage) and
 * accessible any time via Settings → "View Disclosure".
 *
 * Content: 100% offline notice, no data collection, harm reduction context,
 * and a dismiss button.
 *
 * Visually matches ConsentGate (the screen that follows it on first launch):
 * no emoji, no boxed cards, a short accent rule above a left-aligned title,
 * and a numeral beside each section, so the two read as one continuous flow.
 */

import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface Props {
  visible: boolean;
  /**
   * If true, shows a "Don't show again" checkbox above the Continue button.
   * onDismiss receives the checkbox state so the caller can decide whether
   * to persist the suppression flag.
   */
  isFirstLaunch?: boolean;
  /** Called with `suppress=true` when checkbox is checked, `false` otherwise. */
  onDismiss: (suppress: boolean) => void;
  /**
   * If provided, a "Show on next launch" link appears in the footer (for the
   * Settings path) so the user can re-enable the automatic first-launch flow.
   */
  onResetLaunch?: () => void;
}

export function DisclosureModal({ visible, isFirstLaunch = false, onDismiss, onResetLaunch }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const [dontShowAgain, setDontShowAgain] = useState(true);

  const bgColor     = isDark ? '#0d0d0f' : '#F2F2F7';
  const textColor   = isDark ? '#ECEDEE' : '#11181C';
  const subColor    = isDark ? '#9BA1A6' : '#687076';
  const borderColor = isDark ? '#2A2D2F' : '#E5E5EA';
  // Same light/dark teal split as ConsentGate.
  const accentColor = isDark ? '#4ECDC4' : '#2BBDB4';

  const sections: { title: string; body: React.ReactNode }[] = [
    {
      title: '100% offline, no data leaves your device',
      body: (
        <>
          DoseAngel stores everything exclusively in local app storage. No account is required,
          no analytics are collected, and no information is ever transmitted to any server.
        </>
      ),
    },
    {
      title: 'For harm reduction reference only',
      body: (
        <>
          Duration estimates and effect curves are population midpoints sourced from
          PsychonautWiki and TripSit. Individual responses vary significantly with dose,
          bodyweight, tolerance, metabolism, and route of administration.{'\n\n'}
          DoseAngel is <Text style={[styles.bold, { color: textColor }]}>not medical advice</Text>.
          It does not encourage or facilitate drug use. When in doubt, consult a medical professional
          or a local harm reduction service.
        </>
      ),
    },
    {
      title: 'Interaction warnings',
      body: (
        <>
          Known drug–drug interactions are sourced from TripSit's combo data. Warnings flag
          combinations that carry documented risks, but the absence of a warning does not
          mean a combination is safe.
        </>
      ),
    },
    {
      title: 'Know the risks',
      body: (
        <>
          Many of the substances covered in this app are illegal in many countries, and all of
          them carry a risk of addiction. If you choose to use any of them, you do so at your
          own risk.{'\n\n'}
          If you're concerned about your own or someone else's substance use, please reach out
          to a medical professional or a local addiction support service.
        </>
      ),
    },
  ];

  return (
    // transparent + our own opaque full-bleed View, same as ConsentGate and
    // every other Modal in the app (presentationStyle is iOS-only and was a
    // suspect in the Android Disclosure -> Consent -> Tour hang).
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => onDismiss(dontShowAgain)}
    >
      <View style={[styles.root, { backgroundColor: bgColor }]}>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.rule, { backgroundColor: accentColor }]} />
          <Text style={[styles.title, { color: textColor }]}>Before you begin</Text>
          <Text style={[styles.subtitle, { color: subColor }]}>
            A few things you should know about DoseAngel
          </Text>

          <View style={styles.statements}>
            {sections.map((s, i) => (
              <View key={s.title} style={styles.statementRow}>
                <Text style={[styles.numeral, { color: accentColor }]} numberOfLines={1}>
                  {String(i + 1).padStart(2, '0')}
                </Text>
                <View style={styles.statementText}>
                  <Text style={[styles.sectionTitle, { color: textColor }]}>{s.title}</Text>
                  <Text style={[styles.paragraph, { color: subColor }]}>{s.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: borderColor }]}>

          {/* Checkbox row, only shown on first launch */}
          {isFirstLaunch && (
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setDontShowAgain(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.checkbox,
                { borderColor: dontShowAgain ? accentColor : subColor },
                dontShowAgain && { backgroundColor: accentColor },
              ]}>
                {dontShowAgain && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={[styles.checkLabel, { color: textColor }]}>
                Don't show again
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: accentColor }]}
            onPress={() => onDismiss(dontShowAgain)}
            activeOpacity={0.85}
          >
            <Text style={styles.btnText}>Continue</Text>
          </TouchableOpacity>

          {/* Reset link, shown in the Settings path when the flag may already be set */}
          {onResetLaunch && (
            <TouchableOpacity onPress={onResetLaunch} activeOpacity={0.6} style={styles.resetBtn}>
              <Text style={[styles.resetText, { color: subColor }]}>Show on next launch</Text>
            </TouchableOpacity>
          )}
        </View>

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  rule: {
    width: 40,
    height: 3,
    marginBottom: 18,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 30,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
    paddingBottom: 24,
  },
  statements: {
    gap: 28,
  },
  statementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  numeral: {
    // Wider than ConsentGate's 40: that screen only shows 01-02, but here
    // "03"/"04" have wider glyphs and wrapped onto two lines at 40.
    // tabular-nums gives every digit the same width so 01-04 line up.
    width: 50,
    flexShrink: 0,
    fontSize: 30,
    fontWeight: '800',
    lineHeight: 32,
    fontVariant: ['tabular-nums'],
  },
  statementText: {
    flex: 1,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
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
  resetBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  resetText: {
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
