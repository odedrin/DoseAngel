import React, { useEffect, useRef, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useColorSchemePreference } from '@/store/ColorSchemeContext';
import type { ColorSchemePreference } from '@/store/ColorSchemeContext';
import { useStopwatch } from '@/store/StopwatchContext';
import { DisclosureModal } from '@/components/DisclosureModal';
import { TypesSection } from '@/components/TypesSection';
import { useTour } from '@/store/TourContext';
import { useTourTarget } from '@/store/tourTargets';

const SCHEME_OPTIONS: { label: string; value: ColorSchemePreference }[] = [
  { label: 'System', value: 'system' },
  { label: 'Light',  value: 'light' },
  { label: 'Dark',   value: 'dark' },
];

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const { state, toggleInteractionWarnings, toggleInteractionBadges, toggleRedoseWarnings, setPlanOverlayMode } = useStopwatch();
  const { colorSchemePreference, setColorScheme } = useColorSchemePreference();
  const [disclosureVisible, setDisclosureVisible] = useState(false);
  const [typesExpanded, setTypesExpanded] = useState(false);
  const tour = useTour();

  // Onboarding tour target — see store/TourContext.tsx for the step copy.
  const harmReductionTourRef = useTourTarget('settings.harmReduction');
  const scrollRef = useRef<ScrollView>(null);

  // Tab screens stay mounted, so this ScrollView can still be scrolled down
  // from an earlier visit when the tour lands here, leaving the spotlighted
  // card above the top of the screen. Reset to the top whenever this step
  // becomes active so the ring is always fully visible.
  useEffect(() => {
    if (tour.active && tour.steps[tour.stepIndex]?.id === 'settings-harm') {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.active, tour.stepIndex]);

  const bgColor   = isDark ? '#000' : '#F2F2F7';
  const cardBg    = isDark ? '#1E2022' : '#fff';
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const sepColor  = isDark ? '#2A2D2F' : '#E5E5EA';

  const visibleTypeCount = state.types.filter(t => !t.hidden).length;

  // ── Scroll content is built as an array so the sticky index for the
  // Types toggle is computed from its position, not hardcoded — it can't
  // go stale if a block above it is reordered or removed later.
  const blocks: React.ReactNode[] = [];

  blocks.push(
    <View key="header" style={styles.header}>
      <Text style={[styles.screenTitle, { color: subColor }]}>SETTINGS</Text>
    </View>,
  );

  // Appearance
  blocks.push(
    <View key="appearance">
      <Text style={[styles.groupLabel, { color: subColor }]}>Appearance</Text>
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: textColor }]}>Color Scheme</Text>
            <Text style={[styles.rowSub, { color: subColor }]}>
              Override the system appearance or follow it automatically.
            </Text>
          </View>
        </View>
        <View style={[
          styles.segmentRow,
          { backgroundColor: isDark ? '#2c2c2e' : '#e5e5ea' },
        ]}>
          {SCHEME_OPTIONS.map(opt => {
            const active = colorSchemePreference === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.segment,
                  active && { backgroundColor: isDark ? '#48484a' : '#fff' },
                  active && styles.segmentActive,
                ]}
                onPress={() => setColorScheme(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.segmentText,
                  { color: active ? (isDark ? '#ECEDEE' : '#11181C') : subColor },
                  active && styles.segmentTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>,
  );

  // Harm Reduction
  blocks.push(
    <View key="harm-reduction">
      <Text style={[styles.groupLabel, { color: subColor }]}>Harm Reduction</Text>
      {/* Tour ref lives on the card itself, not the group wrapper above —
          the wrapper has no width constraint of its own and stretches
          full-bleed, which measured wider than the screen. The card has
          the marginHorizontal that actually matches what's drawn on screen. */}
      <View ref={harmReductionTourRef} style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={[styles.row, { borderBottomColor: sepColor }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: textColor }]}>Interaction Badges</Text>
            <Text style={[styles.rowSub, { color: subColor }]}>
              Show ⚠ badges in the type list when adding a substance that interacts with an active one.
            </Text>
          </View>
          <Switch
            value={state.showInteractionBadges}
            onValueChange={toggleInteractionBadges}
            trackColor={{ false: isDark ? '#3a3a3c' : '#E5E5EA', true: '#30D158' }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.row, { borderBottomColor: sepColor }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: textColor }]}>Warning Popups</Text>
            <Text style={[styles.rowSub, { color: subColor }]}>
              Show a confirmation dialog when starting a substance that has known interactions with active ones.
            </Text>
          </View>
          <Switch
            value={state.showInteractionWarnings}
            onValueChange={toggleInteractionWarnings}
            trackColor={{ false: isDark ? '#3a3a3c' : '#E5E5EA', true: '#30D158' }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: textColor }]}>Redose Warnings</Text>
            <Text style={[styles.rowSub, { color: subColor }]}>
              Show a confirmation dialog when starting a type that's already active and hasn't peaked yet.
            </Text>
          </View>
          <Switch
            value={state.showRedoseWarnings}
            onValueChange={toggleRedoseWarnings}
            trackColor={{ false: isDark ? '#3a3a3c' : '#E5E5EA', true: '#30D158' }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </View>,
  );

  // Types — sticky toggle. The index is captured immediately after pushing
  // this block, so stickyHeaderIndices always points at the right element.
  blocks.push(
    <View key="types-toggle" style={[styles.typesToggleWrap, { backgroundColor: bgColor }]}>
      <Text style={[styles.groupLabel, { color: subColor, marginBottom: 6 }]}>Substances Library</Text>
      <TouchableOpacity
        style={[styles.typesToggleCard, { backgroundColor: cardBg }]}
        onPress={() => setTypesExpanded(e => !e)}
        activeOpacity={0.7}
      >
        <View style={styles.rowText}>
          <Text style={[styles.rowTitle, { color: textColor }]}>Manage</Text>
          <Text style={[styles.rowSub, { color: subColor }]}>
            {visibleTypeCount} type{visibleTypeCount !== 1 ? 's' : ''} configured
          </Text>
        </View>
        <Text style={[styles.typesChevron, { color: subColor }]}>
          {typesExpanded ? '▲' : '▼'}
        </Text>
      </TouchableOpacity>
    </View>,
  );
  const typesStickyIndex = blocks.length - 1;

  if (typesExpanded) {
    blocks.push(
      <View key="types-body">
        <TypesSection isDark={isDark} />
      </View>,
    );
  }

  // Graph
  blocks.push(
    <View key="graph">
      <Text style={[styles.groupLabel, { color: subColor }]}>Graph</Text>
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: textColor }]}>Plan overlay</Text>
            <Text style={[styles.rowSub, { color: subColor }]}>
              How toggled plans appear on the live graph.
            </Text>
          </View>
        </View>
        <View style={[
          styles.segmentRow,
          { backgroundColor: isDark ? '#2c2c2e' : '#e5e5ea' },
        ]}>
          {([
            { label: 'Start time', value: 'markers' },
            { label: 'Full curve',  value: 'curves'  },
          ] as const).map(opt => {
            const active = state.planOverlayMode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.segment,
                  active && { backgroundColor: isDark ? '#48484a' : '#fff' },
                  active && styles.segmentActive,
                ]}
                onPress={() => setPlanOverlayMode(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.segmentText,
                  { color: active ? (isDark ? '#ECEDEE' : '#11181C') : subColor },
                  active && styles.segmentTextActive,
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>,
  );

  // About
  blocks.push(
    <View key="about">
      <Text style={[styles.groupLabel, { color: subColor }]}>About</Text>
      <View style={[styles.card, { backgroundColor: cardBg }]}>
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => Linking.openURL('https://psychonautwiki.org')}
          activeOpacity={0.6}
        >
          <Text style={[styles.infoLabel, { color: subColor }]}>PK data source</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>PsychonautWiki ↗</Text>
        </TouchableOpacity>
        <View style={[styles.sep, { backgroundColor: sepColor }]} />
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => Linking.openURL('https://tripsit.me')}
          activeOpacity={0.6}
        >
          <Text style={[styles.infoLabel, { color: subColor }]}>Interaction data</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>TripSit combos ↗</Text>
        </TouchableOpacity>
        <View style={[styles.sep, { backgroundColor: sepColor }]} />
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, { color: subColor }]}>Substances</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>18 bundled</Text>
        </View>
        <View style={[styles.sep, { backgroundColor: sepColor }]} />
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => setDisclosureVisible(true)}
          activeOpacity={0.6}
        >
          <Text style={[styles.infoLabel, { color: subColor }]}>Privacy & disclosure</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>View ↗</Text>
        </TouchableOpacity>
        <View style={[styles.sep, { backgroundColor: sepColor }]} />
        <TouchableOpacity
          style={styles.infoRow}
          onPress={() => tour.start()}
          activeOpacity={0.6}
        >
          <Text style={[styles.infoLabel, { color: subColor }]}>Interactive tour</Text>
          <Text style={[styles.infoValue, { color: textColor }]}>Replay ↗</Text>
        </TouchableOpacity>
      </View>
    </View>,
  );

  // Disclaimer
  blocks.push(
    <Text key="disclaimer" style={[styles.disclaimer, { color: subColor }]}>
      DoseAngel provides pharmacokinetic reference data for harm reduction purposes only.
      Duration estimates are population midpoints. Individual responses vary significantly
      with dose, bodyweight, tolerance, and co-administration. Always consult a medical
      professional if in doubt.
    </Text>,
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[typesStickyIndex]}
      >
        {blocks}
      </ScrollView>

      <DisclosureModal
        visible={disclosureVisible}
        onDismiss={() => setDisclosureVisible(false)}
        onResetLaunch={() => {
          AsyncStorage.removeItem('disclosure:dismissed');
          setDisclosureVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 60 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  screenTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
  },

  groupLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 6,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '500', marginBottom: 3 },
  rowSub: { fontSize: 13.5, lineHeight: 19 },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '500' },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 12,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '500',
  },
  segmentTextActive: {
    fontWeight: '600',
  },

  // Types sticky toggle
  typesToggleWrap: {
    paddingBottom: 2,
  },
  typesToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  typesChevron: {
    fontSize: 12,
    opacity: 0.6,
  },

  disclaimer: {
    fontSize: 15,
    lineHeight: 21,
    marginHorizontal: 20,
    marginTop: 20,
    textAlign: 'center',
    opacity: 0.7,
  },
});
