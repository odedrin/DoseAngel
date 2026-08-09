/**
 * TypesSection
 *
 * Full type management UI — list, add/edit, favorite, hide, delete. This is
 * the former standalone Types tab's content, extracted so it can be embedded
 * inline inside the collapsible "Types" block on the Settings screen.
 *
 * Has no SafeAreaView / ScrollView / title of its own — the parent screen
 * owns scrolling and the section header (see app/(tabs)/settings.tsx).
 */

import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useStopwatch } from '@/store/StopwatchContext';
import { TypeCard } from '@/components/TypeCard';
import { TypeEditorModal } from '@/components/TypeEditorModal';
import { SubstanceDurationEditorModal } from '@/components/SubstanceDurationEditorModal';
import { InteractionWarningModal } from '@/components/InteractionWarningModal';
import { RedoseWarningModal } from '@/components/RedoseWarningModal';
import { useInteractionGuard } from '@/hooks/use-interaction-guard';
import {
  getInteraction,
  INTERACTION_SEVERITY,
  type Interaction,
  type InteractionStatus,
} from '@/constants/interactions';
import type { StopwatchType } from '@/types/models';

interface Props {
  isDark: boolean;
}

export function TypesSection({ isDark }: Props) {
  const {
    state,
    addType,
    updateType,
    deleteType,
    toggleFavorite,
    hideType,
    unhideType,
    setSubstanceDurations,
    resetSubstanceDurations,
  } = useStopwatch();

  const {
    handleStart, pendingType, warningPairs,
    redosePendingType, redoseRemainingMs,
    onConfirm, onCancel,
  } = useInteractionGuard();

  const [editorVisible, setEditorVisible] = useState(false);
  const [editTarget, setEditTarget]       = useState<StopwatchType | null>(null);
  const [creatingSubstance, setCreatingSubstance] = useState(false);
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  const [durationEditorVisible, setDurationEditorVisible] = useState(false);
  const [durationEditTarget, setDurationEditTarget]       = useState<StopwatchType | null>(null);

  const subColor    = isDark ? '#9BA1A6' : '#687076';
  const cardBg       = isDark ? '#1E2022' : '#F5F5F7';
  const borderColor  = isDark ? '#2A2D2F' : '#E5E5EA';
  const tint          = isDark ? '#4ECDC4' : '#2BBDB4';

  function openEditor(type: StopwatchType) {
    setEditTarget(type);
    setCreatingSubstance(false);
    setEditorVisible(true);
  }

  function openNewSubstanceEditor() {
    setEditTarget(null);
    setCreatingSubstance(true);
    setEditorVisible(true);
  }

  function closeEditor() {
    setEditorVisible(false);
    setCreatingSubstance(false);
  }

  function handleSave(type: Omit<StopwatchType, 'id'> | StopwatchType) {
    if ('id' in type) {
      updateType(type as StopwatchType);
    } else {
      addType(creatingSubstance ? { ...type, isSubstance: true } : type);
    }
    closeEditor();
  }

  function openDurationEditor(type: StopwatchType) {
    setDurationEditTarget(type);
    setDurationEditorVisible(true);
  }

  function handleSaveDurations(durations: { onsetDuration: number; comeupDuration: number; peakDuration: number; offsetDuration: number }) {
    if (durationEditTarget) setSubstanceDurations(durationEditTarget.id, durations);
    setDurationEditorVisible(false);
  }

  function handleResetDurations() {
    if (durationEditTarget) resetSubstanceDurations(durationEditTarget.id);
    setDurationEditorVisible(false);
  }

  function handleDelete(type: StopwatchType) {
    Alert.alert(
      `Delete "${type.name}"?`,
      'This will also stop any running stopwatches of this type.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteType(type.id) },
      ],
    );
  }

  // Worst interaction per type vs currently active stopwatches
  const warningMap = useMemo(() => {
    const map = new Map<string, InteractionStatus>();
    if (!state.showInteractionBadges) return map;
    const activeTypeIds = state.activeStopwatches.map(sw => sw.typeId);
    for (const type of state.types) {
      let worst: Interaction | undefined;
      for (const activeId of activeTypeIds) {
        if (activeId === type.id) continue;
        const inter = getInteraction(type.id, activeId);
        if (!inter) continue;
        if (!worst || INTERACTION_SEVERITY[inter.status] < INTERACTION_SEVERITY[worst.status]) {
          worst = inter;
        }
      }
      if (worst) map.set(type.id, worst.status);
    }
    return map;
  }, [state.activeStopwatches, state.types, state.showInteractionBadges]);

  // Visible types, split by section (excludes hidden)
  const customTypes    = state.types.filter(t => !t.isBuiltIn && !t.isSubstance && !t.hidden);
  const builtInTypes   = state.types.filter(t =>  t.isBuiltIn && !t.isSubstance && !t.hidden);
  const substanceTypes = state.types.filter(t =>  t.isSubstance                 && !t.hidden);
  const hiddenTypes    = state.types.filter(t =>  t.hidden);

  function renderCard(item: StopwatchType) {
    return (
      <TypeCard
        key={item.id}
        type={item}
        isDark={isDark}
        isFavorite={(state.favoriteTypeIds ?? []).includes(item.id)}
        activeCount={state.activeStopwatches.filter(sw => sw.typeId === item.id).length}
        onStart={handleStart}
        onEdit={openEditor}
        onEditDurations={openDurationEditor}
        onDelete={handleDelete}
        onToggleFavorite={toggleFavorite}
        onHide={hideType}
        warningStatus={warningMap.get(item.id)}
      />
    );
  }

  return (
    <View style={styles.root}>
      {customTypes.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: subColor }]}>Custom</Text>
          {customTypes.map(renderCard)}
        </>
      )}

      {builtInTypes.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: subColor }]}>Built-in</Text>
          {builtInTypes.map(renderCard)}
        </>
      )}

      <View style={styles.sectionHeaderRow}>
        <Text style={[styles.sectionLabel, { color: subColor }]}>Substances</Text>
        <TouchableOpacity
          onPress={openNewSubstanceEditor}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.addSubstanceBtn}
        >
          <Text style={[styles.addSubstanceBtnText, { color: tint }]}>+ Add Substance</Text>
        </TouchableOpacity>
      </View>
      {substanceTypes.map(renderCard)}

      {/* Collapsible Hidden section (nested disclosure, unrelated to the
          sticky Types toggle in Settings — same pattern as before) */}
      {hiddenTypes.length > 0 && (
        <View style={styles.hiddenSection}>
          <TouchableOpacity
            style={[styles.hiddenHeader, { backgroundColor: cardBg, borderColor }]}
            onPress={() => setHiddenExpanded(e => !e)}
            activeOpacity={0.7}
          >
            <Text style={[styles.hiddenHeaderText, { color: subColor }]}>
              Hidden ({hiddenTypes.length})
            </Text>
            <Text style={[styles.hiddenChevron, { color: subColor }]}>
              {hiddenExpanded ? '▲' : '▼'}
            </Text>
          </TouchableOpacity>

          {hiddenExpanded && hiddenTypes.map(item => (
            <TypeCard
              key={item.id}
              type={item}
              isDark={isDark}
              isFavorite={(state.favoriteTypeIds ?? []).includes(item.id)}
              activeCount={state.activeStopwatches.filter(sw => sw.typeId === item.id).length}
              onStart={handleStart}
              onEdit={openEditor}
              onEditDurations={openDurationEditor}
              onDelete={handleDelete}
              onToggleFavorite={toggleFavorite}
              onHide={() => unhideType(item.id)}
              hideLabel="Unhide"
              warningStatus={warningMap.get(item.id)}
            />
          ))}
        </View>
      )}

      <TypeEditorModal
        visible={editorVisible}
        initial={editTarget}
        creatingSubstance={creatingSubstance}
        onSave={handleSave}
        onClose={closeEditor}
        isDark={isDark}
      />

      <SubstanceDurationEditorModal
        visible={durationEditorVisible}
        type={durationEditTarget}
        hasOverride={durationEditTarget ? Boolean(state.durationOverrides?.[durationEditTarget.id]) : false}
        onSave={handleSaveDurations}
        onReset={handleResetDurations}
        onClose={() => setDurationEditorVisible(false)}
        isDark={isDark}
      />

      <InteractionWarningModal
        visible={pendingType !== null}
        isDark={isDark}
        newSubstanceName={pendingType?.name ?? ''}
        pairs={warningPairs}
        confirmLabel="Start anyway"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
      <RedoseWarningModal
        visible={redosePendingType !== null}
        isDark={isDark}
        typeName={redosePendingType?.name ?? ''}
        remainingMs={redoseRemainingMs}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    opacity: 0.6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 20,
  },
  addSubstanceBtn: {
    paddingVertical: 4,
  },
  addSubstanceBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  hiddenSection: {
    marginTop: 20,
    marginHorizontal: 16,
  },
  hiddenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  hiddenHeaderText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    opacity: 0.6,
  },
  hiddenChevron: {
    fontSize: 11,
    opacity: 0.6,
  },
});
