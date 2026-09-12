import { CreatePlanModal } from '@/components/CreatePlanModal';
import { EditPlanEntryModal } from '@/components/EditPlanEntryModal';
import { EditPlanModal } from '@/components/EditPlanModal';
import type { GraphEntry, GraphRef, PlanMarker } from '@/components/Graph';
import { Graph } from '@/components/Graph';
import { type WarningPair } from '@/components/InteractionWarningModal';
import {
  getActiveInteractions,
  INTERACTION_COLOR,
  INTERACTION_SEVERITY,
  type InteractionStatus,
} from '@/constants/interactions';
import { formatDuration, totalDuration } from '@/engine/curveEngine';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useStopwatch } from '@/store/StopwatchContext';
import type { Plan, PlannedEntry, StopwatchType } from '@/types/models';
import { formatEntryTime } from '@/utils/formatEntryTime';
import { useTourTarget } from '@/store/tourTargets';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TICK_MS = 2_000;

// ---------------------------------------------------------------------------
// Plan chip bar
// ---------------------------------------------------------------------------

function PlanChipBar({
  plans,
  selectedId,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  isDark,
}: {
  plans: Plan[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  isDark: boolean;
}) {
  const subColor = isDark ? '#9BA1A6' : '#687076';
  const chipBg   = isDark ? '#1E2022' : '#F0F0F0';
  const selBg    = isDark ? '#2A4A4A' : '#D0F0EE';
  const tint     = isDark ? '#4ECDC4' : '#2BBDB4';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipScroll}
      contentContainerStyle={styles.chipBar}
    >
      {plans.map(plan => {
        const selected = plan.id === selectedId;
        return (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.chip,
              { backgroundColor: selected ? selBg : chipBg },
              selected && { borderColor: tint, borderWidth: 1.5 },
            ]}
            onPress={() => onSelect(plan.id)}
            onLongPress={() => {
              Alert.alert(plan.name, 'What would you like to do?', [
                { text: 'Rename', onPress: () => onRename(plan.id) },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(plan.id) },
                { text: 'Cancel', style: 'cancel' },
              ]);
            }}
          >
            <Text
              style={[
                styles.chipText,
                { color: selected ? tint : subColor },
                selected && { fontWeight: '700' },
              ]}
            >
              {plan.name}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.chip, { backgroundColor: chipBg }]}
        onPress={onAdd}
      >
        <Text style={[styles.chipText, { color: tint, fontWeight: '700' }]}>+ New</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Entry row
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  now,
  isDark,
  onEdit,
  onDelete,
}: {
  entry: PlannedEntry & { typeName: string; typeColor: string; typeDuration: number };
  now: number;
  isDark: boolean;
  onEdit: (entry: PlannedEntry) => void;
  onDelete: (entryId: string) => void;
}) {
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const rowBg     = isDark ? '#1E2022' : '#F5F5F7';
  const border    = isDark ? '#2A2D2F' : '#E5E5EA';

  return (
    <View style={[styles.entryRow, { backgroundColor: rowBg, borderColor: border }]}>
      <View style={[styles.entryDot, { backgroundColor: entry.typeColor }]} />
      <View style={styles.entryInfo}>
        <Text style={[styles.entryName, { color: textColor }]}>{entry.typeName}</Text>
        <Text style={[styles.entrySub, { color: subColor }]}>
          {formatDuration(entry.typeDuration)} · {formatEntryTime(entry.targetTime, now)}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.editEntryBtn, { borderColor: entry.typeColor }]}
        onPress={() => onEdit(entry)}
      >
        <Text style={[styles.editEntryText, { color: entry.typeColor }]}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteEntryBtn}
        onPress={() => onDelete(entry.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.deleteEntryText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Persistent interaction warning row
// ---------------------------------------------------------------------------

function PlanWarningRow({ pair, isDark }: { pair: WarningPair; isDark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const color     = INTERACTION_COLOR[pair.interaction.status];
  const noteBg    = isDark ? '#111' : '#F4F4F4';
  const noteColor = isDark ? '#9BA1A6' : '#687076';
  const textColor = isDark ? '#ECEDEE' : '#11181C';

  function badge(status: InteractionStatus): string {
    switch (status) {
      case 'Dangerous':           return '☠ DANGEROUS';
      case 'Unsafe':              return '⚠ UNSAFE';
      case 'Caution':             return '⚡ CAUTION';
      case 'Low Risk & Synergy':  return '✦ SYNERGY';
      case 'Low Risk & Decrease': return '↓ DECREASE';
      default:                    return '• LOW RISK';
    }
  }

  return (
    <TouchableOpacity
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.75}
      style={[styles.warnRow, { borderLeftColor: color, backgroundColor: isDark ? '#1A1A1A' : '#FAFAFA' }]}
    >
      <View style={styles.warnHeader}>
        <View style={styles.warnLeft}>
          <Text style={[styles.warnBadge, { color, backgroundColor: color + '22' }]}>
            {badge(pair.interaction.status)}
          </Text>
          <Text style={[styles.warnNames, { color: textColor }]}>
            {pair.nameA} + {pair.nameB}
          </Text>
        </View>
        <Text style={[styles.warnChevron, { color: noteColor }]}>{expanded ? '▲' : '▼'}</Text>
      </View>
      {expanded && (
        <View style={[styles.warnNote, { backgroundColor: noteBg }]}>
          <Text style={[styles.warnNoteText, { color: noteColor }]}>
            {pair.interaction.note}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Rename dialog
// ---------------------------------------------------------------------------

function RenameDialog({
  visible,
  currentName,
  isDark,
  onSave,
  onCancel,
  onDelete,
}: {
  visible: boolean;
  currentName: string;
  isDark: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (visible) setName(currentName);
  }, [visible, currentName]);

  if (!visible) return null;

  const bgColor   = isDark ? '#1E2022' : '#fff';
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const border    = isDark ? '#333' : '#DDD';
  const tint      = isDark ? '#4ECDC4' : '#2BBDB4';

  return (
    <View style={styles.dialogOverlay}>
      <View style={[styles.dialog, { backgroundColor: bgColor, borderColor: border }]}>
        <Text style={[styles.dialogTitle, { color: textColor }]}>Rename Plan</Text>
        <TextInput
          style={[styles.dialogInput, { color: textColor, borderColor: border }]}
          value={name}
          onChangeText={setName}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && onSave(name.trim())}
        />
        <View style={styles.dialogBtns}>
          <TouchableOpacity onPress={onCancel} style={styles.dialogBtn}>
            <Text style={[styles.dialogBtnText, { color: textColor }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => name.trim() && onSave(name.trim())}
            style={styles.dialogBtn}
          >
            <Text style={[styles.dialogBtnText, { color: tint, fontWeight: '700' }]}>Save</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.dialogDivider, { backgroundColor: border }]} />
        <TouchableOpacity onPress={onDelete} style={styles.dialogDeleteBtn}>
          <Text style={styles.dialogDeleteText}>Delete Plan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function PlanScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const {
    state,
    createPlanWithEntries,
    renamePlan,
    deletePlan,
    removePlanEntry,
    updatePlanEntry,
    savePlanEdits,
  } = useStopwatch();

  const [currentTime, setCurrentTime] = useState(Date.now);
  const [selectedPlanId, setSelectedPlanId] = useState(state.plans[0]?.id ?? '');
  const [editingEntry, setEditingEntry] = useState<PlannedEntry | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [createPlanVisible, setCreatePlanVisible] = useState(false);
  const [editPlanVisible, setEditPlanVisible] = useState(false);

  const graphRef = useRef<GraphRef>(null);
  const [isGraphPanned, setIsGraphPanned] = useState(false);
  const [isGraphDay, setIsGraphDay] = useState(false);
  const [visibleWindow, setVisibleWindow] = useState<{ start: number; end: number } | null>(null);

  // Onboarding tour target — see store/TourContext.tsx for the step copy.
  const chipsTourRef = useTourTarget('plan.chips');

  // Collapsible sections — collapsing never shrinks the graph; the screen
  // itself scrolls to reveal full content instead (same pattern as the
  // Live screen's "Running now" legend).
  const [entriesCollapsed, setEntriesCollapsed] = useState(false);
  const [interactionsCollapsed, setInteractionsCollapsed] = useState(false);
  const toggleEntries = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEntriesCollapsed(prev => !prev);
  }, []);
  const toggleInteractions = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setInteractionsCollapsed(prev => !prev);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const selectedPlan =
    state.plans.find(p => p.id === selectedPlanId) ?? state.plans[0];

  useEffect(() => {
    if (!state.plans.find(p => p.id === selectedPlanId)) {
      setSelectedPlanId(state.plans[0]?.id ?? '');
    }
  }, [state.plans, selectedPlanId]);

  const bgColor    = isDark ? '#000' : '#F2F2F7';
  const textColor  = isDark ? '#ECEDEE' : '#11181C';
  const subColor   = isDark ? '#9BA1A6' : '#687076';
  const tint       = isDark ? '#4ECDC4' : '#2BBDB4';
  const cardBg     = isDark ? '#1E2022' : '#fff';
  const cardBorder = isDark ? '#2A2D2F' : '#E5E5EA';

  const planOverrideEntries: GraphEntry[] = useMemo(() =>
    (selectedPlan?.entries ?? []).flatMap(e => {
      const tp = state.types.find(t => t.id === e.typeId);
      if (!tp) return [];
      return [{ type: tp, startTime: e.targetTime }];
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPlan?.entries, state.types],
  );

  const planMarkers: PlanMarker[] = useMemo(() =>
    (selectedPlan?.entries ?? []).flatMap(e => {
      const tp = state.types.find(t => t.id === e.typeId);
      if (!tp) return [];
      return [{
        startTime: e.targetTime,
        label: `${selectedPlan?.name ?? 'Plan'} · ${tp.name}`,
        color: tp.color,
      }];
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPlan?.entries, selectedPlan?.name, state.types],
  );

  const richEntries = (selectedPlan?.entries ?? []).map(e => {
    const tp = state.types.find(t => t.id === e.typeId);
    return {
      ...e,
      typeName: tp?.name ?? '?',
      typeColor: tp?.color ?? '#888',
      typeDuration: tp ? totalDuration(tp) : 0,
    };
  });

  const planSubstanceIds = [
    ...new Set(
      (selectedPlan?.entries ?? [])
        .map(e => state.types.find(t => t.id === e.typeId))
        .filter((t): t is StopwatchType => !!t?.isSubstance)
        .map(t => t.id),
    ),
  ];

  const planInteractionPairs: WarningPair[] = getActiveInteractions(planSubstanceIds)
    .sort((a, b) => INTERACTION_SEVERITY[a.interaction.status] - INTERACTION_SEVERITY[b.interaction.status])
    .map(p => ({
      nameA: state.types.find(t => t.id === p.idA)?.name ?? p.idA,
      nameB: state.types.find(t => t.id === p.idB)?.name ?? p.idB,
      interaction: p.interaction,
    }));

  const editingType = editingEntry
    ? state.types.find(t => t.id === editingEntry.typeId) ?? null
    : null;

  function handleCreatePlan(name: string, entries: { typeId: string; targetTime: number }[]) {
    const id = createPlanWithEntries(name, entries);
    setSelectedPlanId(id);
    setCreatePlanVisible(false);
  }

  function handleDeletePlan(id: string) {
    const plan = state.plans.find(p => p.id === id);
    if (state.plans.length <= 1) {
      Alert.alert('Cannot delete', 'You must keep at least one plan.');
      return;
    }
    Alert.alert(`Delete "${plan?.name}"?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePlan(id) },
    ]);
  }

  function handleSaveEntry(entryId: string, newTargetTime: number) {
    if (!selectedPlan) return;
    const entry = selectedPlan.entries.find(e => e.id === entryId);
    if (!entry) return;
    updatePlanEntry(selectedPlan.id, { ...entry, targetTime: newTargetTime });
  }

  function handleDeleteEntry(entryId: string) {
    if (!selectedPlan) return;
    removePlanEntry(selectedPlan.id, entryId);
  }

  function handleSavePlanEdits(name: string, entries: PlannedEntry[]) {
    if (!selectedPlan) return;
    savePlanEdits(selectedPlan.id, name, entries);
    setEditPlanVisible(false);
  }

  const renamingPlan = renameId
    ? state.plans.find(p => p.id === renameId)
    : null;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>

      {/* Screen headline */}
      <View style={styles.headline}>
        <Text style={[styles.headlineTitle, { color: textColor }]}>Plan</Text>
        <Text style={[styles.headlineSubtitle, { color: subColor }]}>
          Plan your trip here. 
          You can see your plans in the live screen
        </Text>
      </View>

      {/* Plan chip selector. Explicit width on the tour-ref wrapper matters:
          the ScrollView inside doesn't constrain its own box to the screen
          (flexShrink: 0 lets it size to its unclipped horizontal content),
          so without this the tour spotlight measured wider than the screen. */}
      <View ref={chipsTourRef} style={{ width: '100%' }}>
        <PlanChipBar
          plans={state.plans}
          selectedId={selectedPlan?.id ?? ''}
          onSelect={setSelectedPlanId}
          onAdd={() => setCreatePlanVisible(true)}
          onRename={id => setRenameId(id)}
          onDelete={handleDeletePlan}
          isDark={isDark}
        />
      </View>

      {/* Everything below the chip bar scrolls, same as the Live Graph screen —
          collapsing a section never shrinks the graph; the page scrolls instead. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* Graph card (fixed height, like the Live Graph screen) */}
        <View style={[styles.graphCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.graphArea}>
            <Graph
              ref={graphRef}
              currentTime={currentTime}
              colorScheme={colorScheme}
              overrideEntries={planOverrideEntries}
              planMarkers={planMarkers.length > 0 ? planMarkers : undefined}
              height={280}
              onIsPanned={setIsGraphPanned}
              onIsDay={setIsGraphDay}
              onViewChange={(s, e) => setVisibleWindow({ start: s, end: e })}
            />

            {/* Off-screen indicators */}
            {visibleWindow && (() => {
              const offLeft = planOverrideEntries.filter(
                e => e.startTime + totalDuration(e.type) < visibleWindow.start,
              ).length;
              const offRight = planOverrideEntries.filter(
                e => e.startTime > visibleWindow.end,
              ).length;
              return (
                <>
                  {offLeft > 0 && (
                    <View pointerEvents="none" style={[styles.offPillAnchor, { left: 8 }]}>
                      <View style={[styles.offPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                        <Text style={[styles.offPillText, { color: subColor }]}>‹ {offLeft}</Text>
                      </View>
                    </View>
                  )}
                  {offRight > 0 && (
                    <View pointerEvents="none" style={[styles.offPillAnchor, { right: 8 }]}>
                      <View style={[styles.offPill, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                        <Text style={[styles.offPillText, { color: subColor }]}>{offRight} ›</Text>
                      </View>
                    </View>
                  )}
                </>
              );
            })()}
          </View>

          {/* Navigation buttons */}
          <View style={[styles.navRow, { borderTopColor: cardBorder }]}>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => graphRef.current?.panByFraction(-1)}
            >
              <Text style={[styles.navBtnText, { color: subColor }]}>{'<<'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => graphRef.current?.panByFraction(-0.5)}
            >
              <Text style={[styles.navBtnText, { color: subColor }]}>{'<'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnWide, isGraphPanned && !isGraphDay && { backgroundColor: tint + '22' }]}
              onPress={() => graphRef.current?.resetView()}
            >
              <Text style={[styles.navBtnText, { color: isGraphPanned && !isGraphDay ? tint : subColor }]}>now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnWide, isGraphDay && { backgroundColor: tint + '22' }]}
              onPress={() => graphRef.current?.showDay()}
            >
              <Text style={[styles.navBtnText, { color: isGraphDay ? tint : subColor }]}>day</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => graphRef.current?.panByFraction(0.5)}
            >
              <Text style={[styles.navBtnText, { color: subColor }]}>{'>'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => graphRef.current?.panByFraction(1)}
            >
              <Text style={[styles.navBtnText, { color: subColor }]}>{'>>'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Entry card — collapsible; body is a plain View so the outer page
            ScrollView handles overflow instead of a small internal one. */}
        <View style={[styles.entryCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <TouchableOpacity
            style={[styles.entryCardHeader, entriesCollapsed && styles.cardHeaderCollapsed, { borderBottomColor: cardBorder }]}
            onPress={toggleEntries}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeaderTitleGroup}>
              <Text style={[styles.cardChevron, { color: subColor }]}>{entriesCollapsed ? '▸' : '▾'}</Text>
              <Text style={[styles.entryCardTitle, styles.entryCardTitleInRow, { color: subColor }]} numberOfLines={1}>
                {selectedPlan?.name ?? ''} entries{richEntries.length > 0 ? ` · ${richEntries.length}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.editPlanBtn, { borderColor: tint }]}
              onPress={() => setEditPlanVisible(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.editPlanBtnText, { color: tint }]}>✏ Edit</Text>
            </TouchableOpacity>
          </TouchableOpacity>

          {!entriesCollapsed && (
            <View style={styles.entryListBody}>
              {richEntries.length === 0 ? (
                <Text style={[styles.emptyText, { color: subColor }]}>
                  No entries yet. Tap Edit to add one.
                </Text>
              ) : (
                richEntries.map(e => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    now={currentTime}
                    isDark={isDark}
                    onEdit={entry => setEditingEntry(entry)}
                    onDelete={handleDeleteEntry}
                  />
                ))
              )}
            </View>
          )}
        </View>

        {/* Interactions card — collapsible; only shown when there are interactions */}
        {state.showInteractionWarnings && planInteractionPairs.length > 0 && (
          <View style={[styles.interactionsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <TouchableOpacity
              style={[styles.entryCardHeader, interactionsCollapsed && styles.cardHeaderCollapsed, { borderBottomColor: cardBorder }]}
              onPress={toggleInteractions}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeaderTitleGroup}>
                <Text style={[styles.cardChevron, { color: subColor }]}>{interactionsCollapsed ? '▸' : '▾'}</Text>
                <Text style={[styles.entryCardTitle, styles.entryCardTitleInRow, { color: subColor }]}>
                  Interactions · {planInteractionPairs.length}
                </Text>
              </View>
            </TouchableOpacity>

            {!interactionsCollapsed && (
              <View style={styles.interactionsListBody}>
                {planInteractionPairs.map((pair, i) => (
                  <PlanWarningRow key={i} pair={pair} isDark={isDark} />
                ))}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      <EditPlanEntryModal
        visible={!!editingEntry}
        entry={editingEntry}
        type={editingType}
        currentTime={currentTime}
        isDark={isDark}
        onSave={handleSaveEntry}
        onClose={() => setEditingEntry(null)}
      />

      <CreatePlanModal
        visible={createPlanVisible}
        isDark={isDark}
        defaultName={`Plan ${state.plans.length + 1}`}
        now={currentTime}
        onCancel={() => setCreatePlanVisible(false)}
        onDone={handleCreatePlan}
      />

      <EditPlanModal
        visible={editPlanVisible}
        isDark={isDark}
        plan={selectedPlan ?? null}
        now={currentTime}
        onCancel={() => setEditPlanVisible(false)}
        onSave={handleSavePlanEdits}
        onDeletePlan={() => {
          if (selectedPlan) handleDeletePlan(selectedPlan.id);
        }}
      />

      <RenameDialog
        visible={!!renameId}
        currentName={renamingPlan?.name ?? ''}
        isDark={isDark}
        onSave={name => {
          if (renameId) renamePlan(renameId, name);
          setRenameId(null);
        }}
        onCancel={() => setRenameId(null)}
        onDelete={() => {
          const id = renameId;
          setRenameId(null);
          if (id) handleDeletePlan(id);
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, gap: 8, paddingBottom: 0 },

  scroll: { flex: 1 },
  scrollContent: {
    padding: 12,
    gap: 8,
    paddingBottom: 24,
  },

  headline: {
    paddingHorizontal: 12,
    paddingTop: 4,
    gap: 2,
  },
  headlineTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  headlineSubtitle: {
    fontSize: 13,
    fontWeight: '500',
  },

  graphCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  graphArea: {},

  entryCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  entryCardTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  entryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardHeaderCollapsed: {
    borderBottomWidth: 0,
  },
  cardHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  cardChevron: {
    fontSize: 12,
  },
  entryCardTitleInRow: {
    paddingHorizontal: 0,
    marginBottom: 0,
    flexShrink: 1,
  },
  editPlanBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1.5,
    flexShrink: 0,
  },
  editPlanBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  entryListBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    gap: 4,
  },
  navBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnWide: {
    paddingHorizontal: 18,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  interactionsCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  interactionsListBody: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },

  chipScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  chipBar: {
    paddingHorizontal: 12,
    gap: 6,
    paddingBottom: 0,
    paddingTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    gap: 4,
  },
  chipText: { fontSize: 12, fontWeight: '500' },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  emptyText: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },

  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 8,
    gap: 10,
  },
  entryDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '600' },
  entrySub: { fontSize: 12, marginTop: 1 },
  editEntryBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  editEntryText: { fontSize: 12, fontWeight: '600' },
  deleteEntryBtn: { paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8 },
  deleteEntryText: { fontSize: 13, color: '#FF6B6B', fontWeight: '700' },

  warnRow: { borderLeftWidth: 3, borderRadius: 8, padding: 10, gap: 6 },
  warnHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  warnLeft: { flex: 1, gap: 3 },
  warnBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  warnNames: { fontSize: 13, fontWeight: '600' },
  warnChevron: { fontSize: 10, marginTop: 2 },
  warnNote: { borderRadius: 6, padding: 8, marginTop: 2 },
  warnNoteText: { fontSize: 12, lineHeight: 17 },

  dialogOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  dialog: {
    width: '80%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 16,
  },
  dialogTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  dialogInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  dialogBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  dialogBtn: { paddingVertical: 4 },
  dialogBtnText: { fontSize: 16 },
  dialogDivider: { height: StyleSheet.hairlineWidth, marginTop: 4 },
  dialogDeleteBtn: { paddingVertical: 12, alignItems: 'center' },
  dialogDeleteText: { fontSize: 15, fontWeight: '600', color: '#FF3B30' },

  // Off-screen indicator pills
  offPillAnchor: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  offPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  offPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
