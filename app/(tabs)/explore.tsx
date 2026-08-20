import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { effectiveElapsed, useStopwatch } from '@/store/StopwatchContext';
import {
  currentPhase,
  formatElapsed,
  progressFraction,
  totalDuration,
} from '@/engine/curveEngine';
import { Graph, GraphNavBar } from '@/components/Graph';
import { EditStopwatchStartModal } from '@/components/EditStopwatchStartModal';
import { AddStopwatchModal } from '@/components/AddStopwatchModal';
import type { GraphEntry, GraphRef, PlanCurve, PlanMarker } from '@/components/Graph';
import { useTourTarget } from '@/store/tourTargets';
import { useTour } from '@/store/TourContext';
import type { ActiveStopwatch, Plan } from '@/types/models';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TICK_MS = 1000;

// Onboarding tour: synthetic ids for illustrative demo data. Several tour
// steps explain UI (the legend, the plan overlay chips) that has nothing to
// point at on a fresh install — no active doses, no plans yet. Rather than
// touching real persisted state, the relevant steps render one fake entry
// that only exists for the duration of that step, never written to storage.
const TOUR_DEMO_STOPWATCH_ID = '__tour_demo_stopwatch__';
const TOUR_DEMO_PLAN_ID = '__tour_demo_plan__';

export default function LiveGraphScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const { state, stopStopwatch, updateStopwatchStartTime } = useStopwatch();

  const [now, setNow] = useState(Date.now);
  const [visiblePlanIds, setVisiblePlanIds] = useState<Set<string>>(new Set());
  const graphRef = useRef<GraphRef>(null);
  const [isGraphPanned, setIsGraphPanned] = useState(false);
  const [isGraphDay, setIsGraphDay] = useState(false);

  // Onboarding tour targets — see store/TourContext.tsx for the step copy.
  const graphTourRef = useTourTarget('live.graph');
  const fabTourRef = useTourTarget('live.fab');
  const legendTourRef = useTourTarget('live.legend');
  const planTourRef = useTourTarget('live.planToggle');
  const tour = useTour();
  const tourStepId = tour.active ? tour.steps[tour.stepIndex]?.id : undefined;

  // Multi-select state
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Graph visibility — which active stopwatches are excluded from the graph.
  // Tapping a legend row (outside select mode) toggles membership here.
  const [hiddenGraphIds, setHiddenGraphIds] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add stopwatch modal state
  const [addVisible, setAddVisible] = useState(false);

  // Visible time window (for off-screen indicators)
  const [visibleWindow, setVisibleWindow] = useState<{ start: number; end: number } | null>(null);

  // "Running now" card collapse state — collapsing it never shrinks the graph;
  // the screen itself scrolls to reveal the full stopwatch list instead.
  const [legendCollapsed, setLegendCollapsed] = useState(false);
  const toggleLegend = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setLegendCollapsed(prev => !prev);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Reset select mode when all stopwatches are gone
  useEffect(() => {
    if (state.activeStopwatches.length === 0) {
      setIsSelectMode(false);
      setSelectedIds(new Set());
    }
  }, [state.activeStopwatches.length]);

  // Onboarding tour demo data — "the graph", "everything you're tracking",
  // and "show or hide a dose" all explain the legend/graph, which are empty
  // on a fresh install. While any of these steps is active and nothing real
  // is running, show one illustrative dose instead (frozen ~35% through its
  // curve, a good spot to see onset/comeup/peak all at once).
  const showTrackingDemo = (tourStepId === 'live-graph' || tourStepId === 'live-legend' || tourStepId === 'live-visibility')
    && state.activeStopwatches.length === 0;
  const demoType = useMemo(
    () => state.types.find(t => t.isBuiltIn && t.isSubstance) ?? state.types[0],
    [state.types],
  );
  const demoStartTime = demoType ? now - Math.round(totalDuration(demoType) * 0.35) : now;
  const demoStopwatch: ActiveStopwatch | null = (showTrackingDemo && demoType) ? {
    id: TOUR_DEMO_STOPWATCH_ID,
    typeId: demoType.id,
    startTime: demoStartTime,
  } : null;
  const displayStopwatches: ActiveStopwatch[] = demoStopwatch ? [demoStopwatch] : state.activeStopwatches;

  // "Preview it on Live" explains the plan overlay chips, which don't render
  // at all until at least one plan exists. Show one fake chip while that
  // step is active and the user has no real plans yet.
  const showPlanDemo = tourStepId === 'live-plan-preview' && state.plans.length === 0;
  const displayPlans: Plan[] = showPlanDemo
    ? [{ id: TOUR_DEMO_PLAN_ID, name: 'Example Plan', entries: [] }]
    : state.plans;

  // Entries actually fed to the graph — active stopwatches minus any the
  // user has hidden via a legend row tap. Always passed explicitly (rather
  // than leaving Graph to default to all active stopwatches) so hiding stays
  // in sync with the off-screen indicators below.
  const graphEntries: GraphEntry[] = useMemo(() => {
    if (showTrackingDemo && demoType) {
      return [{ type: demoType, startTime: demoStartTime }];
    }
    return state.activeStopwatches
      .filter(sw => !hiddenGraphIds.has(sw.id))
      .flatMap(sw => {
        const tp = state.types.find(t => t.id === sw.typeId);
        if (!tp) return [];
        return [{ type: tp, startTime: now - effectiveElapsed(sw, now) }];
      });
  }, [state.activeStopwatches, state.types, hiddenGraphIds, now, showTrackingDemo, demoType, demoStartTime]);

  const toggleGraphVisibility = useCallback((id: string) => {
    setHiddenGraphIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAllGraph = useCallback(() => {
    setHiddenGraphIds(prev =>
      prev.size > 0 ? new Set() : new Set(state.activeStopwatches.map(sw => sw.id)),
    );
  }, [state.activeStopwatches]);

  const earliestStart = displayStopwatches.length > 0
    ? Math.min(...displayStopwatches.map(sw => sw.startTime))
    : null;
  const elapsedSinceFirst = earliestStart !== null ? now - earliestStart : null;

  const accent   = isDark ? '#4ECDC4' : Colors[colorScheme].tint;
  const bgColor  = isDark ? '#000' : '#F2F2F7';
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const cardBg    = isDark ? '#1E2022' : '#fff';
  const cardBorder = isDark ? '#2A2D2F' : '#E5E5EA';

  const editingStopwatch = editingId
    ? state.activeStopwatches.find(sw => sw.id === editingId) ?? null
    : null;
  const editingType = editingStopwatch
    ? state.types.find(t => t.id === editingStopwatch.typeId) ?? null
    : null;

  function togglePlan(planId: string) {
    setVisiblePlanIds(prev => {
      const next = new Set(prev);
      if (next.has(planId)) next.delete(planId);
      else next.add(planId);
      return next;
    });
  }

  const { planMarkers, planCurves } = useMemo(() => {
    const markers: PlanMarker[] = [];
    const curves: PlanCurve[]  = [];
    for (const plan of state.plans) {
      if (!visiblePlanIds.has(plan.id)) continue;
      for (const entry of plan.entries) {
        const tp = state.types.find(t => t.id === entry.typeId);
        if (!tp) continue;
        const label = `${plan.name} · ${tp.name}`;
        if (state.planOverlayMode === 'curves') {
          curves.push({ type: tp, startTime: entry.targetTime, label });
        } else {
          markers.push({ startTime: entry.targetTime, label, color: tp.color });
        }
      }
    }
    return { planMarkers: markers, planCurves: curves };
  }, [state.plans, state.types, state.planOverlayMode, visiblePlanIds]);

  // ── Stop (single) with confirmation ─────────────────────────────────────
  const handleStop = useCallback((id: string) => {
    Alert.alert('Remove stopwatch', 'Are you sure you want to remove this stopwatch?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => stopStopwatch(id) },
    ]);
  }, [stopStopwatch]);

  // ── Multi-select handlers ────────────────────────────────────────────────
  const handleLongPress = useCallback((id: string) => {
    setIsSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const handleRowPress = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCancelSelect = useCallback(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const count = selectedIds.size;
    Alert.alert(
      'Remove stopwatches',
      `Remove ${count} stopwatch${count > 1 ? 'es' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            selectedIds.forEach(id => stopStopwatch(id));
            setIsSelectMode(false);
            setSelectedIds(new Set());
          },
        },
      ],
    );
  }, [selectedIds, stopStopwatch]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bgColor }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Screen headline ── */}
        <View style={styles.headline}>
          <Text style={[styles.headlineTitle, { color: textColor }]}>Live</Text>
          <Text style={[styles.headlineSubtitle, { color: subColor }]}>
            The current state of your trip
          </Text>
        </View>

        {/* ── Container: Overlay plans (moved to top, only when plans exist) ── */}
        {(displayPlans.length > 0) && (
          <View ref={planTourRef} style={[styles.overlayCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Text style={[styles.overlayLabel, { color: subColor }]}>Overlay plans</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.overlayChips}
            >
              {displayPlans.map(plan => {
                const isVisible = visiblePlanIds.has(plan.id);
                const isDemo = plan.id === TOUR_DEMO_PLAN_ID;
                return (
                  <TouchableOpacity
                    key={plan.id}
                    style={[
                      styles.planChip,
                      {
                        backgroundColor: isVisible ? accent : (isDark ? '#2A2D2F' : '#F0F0F0'),
                        borderColor: isVisible ? accent : cardBorder,
                      },
                    ]}
                    onPress={isDemo ? undefined : () => togglePlan(plan.id)}
                  >
                    <Text style={[styles.planChipText, { color: isVisible ? '#fff' : subColor }]}>
                      {isVisible ? '☑' : '☐'} {plan.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Container: Graph ── */}
        <View ref={graphTourRef} style={[styles.graphCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Compact timer above graph */}
          <View style={styles.timerRow}>
            <Text style={[styles.timerLabel, { color: subColor }]}>ELAPSED</Text>
            <Text style={[styles.timerValue, { color: textColor }]}>
              {elapsedSinceFirst !== null ? formatElapsed(elapsedSinceFirst) : '--:--:--'}
            </Text>
            <Text style={[styles.timerSuffix, { color: subColor }]}>since first dose</Text>
          </View>

          <Graph
            ref={graphRef}
            currentTime={now}
            height={320}
            colorScheme={colorScheme}
          overrideEntries={graphEntries}
          planMarkers={planMarkers.length > 0 ? planMarkers : undefined}
          planCurves={planCurves.length > 0 ? planCurves : undefined}
          onIsPanned={setIsGraphPanned}
          onIsDay={setIsGraphDay}
          onViewChange={(s, e) => setVisibleWindow({ start: s, end: e })}
        />

        {/* Off-screen indicators */}
        {(() => {
          if (!visibleWindow) return null;
          const offLeft = state.activeStopwatches.filter(sw => {
            if (hiddenGraphIds.has(sw.id)) return false;
            const type = state.types.find(t => t.id === sw.typeId);
            if (!type) return false;
            return (now - effectiveElapsed(sw, now)) + totalDuration(type) < visibleWindow.start;
          }).length
            + planMarkers.filter(m => m.startTime < visibleWindow.start).length
            + planCurves.filter(c => c.startTime + totalDuration(c.type) < visibleWindow.start).length;
          const offRight = state.activeStopwatches.filter(sw => {
            if (hiddenGraphIds.has(sw.id)) return false;
            const type = state.types.find(t => t.id === sw.typeId);
            if (!type) return false;
            return (now - effectiveElapsed(sw, now)) > visibleWindow.end;
          }).length
            + planMarkers.filter(m => m.startTime > visibleWindow.end).length
            + planCurves.filter(c => c.startTime > visibleWindow.end).length;
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

        <GraphNavBar graphRef={graphRef} isDark={isDark} tint={accent} isPanned={isGraphPanned} isDay={isGraphDay} />
      </View>

      {/* ── Container: Stopwatches legend — collapsible, not scroll-constrained.
             Collapsing/expanding never touches the graph; when expanded and the
             list is long, the whole screen scrolls (see outer ScrollView) so
             every running stopwatch is reachable. ── */}
        <View ref={legendTourRef} style={[styles.legendCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>

          {/* Header — tap to collapse/expand */}
          <TouchableOpacity
            style={[styles.legendHeader, { borderBottomColor: cardBorder }, legendCollapsed && styles.legendHeaderCollapsed]}
            onPress={toggleLegend}
            activeOpacity={0.7}
          >
            <View style={styles.legendHeaderTitleGroup}>
              <Text style={[styles.legendChevron, { color: subColor }]}>{legendCollapsed ? '▸' : '▾'}</Text>
              <Text style={[styles.legendTitle, { color: subColor }]}>
                {isSelectMode
                  ? `${selectedIds.size} selected`
                  : `Running now${displayStopwatches.length > 0 ? ` · ${displayStopwatches.length}` : ''}`}
              </Text>
            </View>
            <View style={styles.legendHeaderActions}>
              {!legendCollapsed && isSelectMode && selectedIds.size > 0 && (
                <TouchableOpacity onPress={handleDeleteSelected} style={styles.headerBtn}>
                  <Text style={[styles.headerBtnText, { color: '#FF3B30' }]}>Remove</Text>
                </TouchableOpacity>
              )}
              {!legendCollapsed && !isSelectMode && state.activeStopwatches.length > 1 && (
                <TouchableOpacity onPress={handleToggleAllGraph} style={styles.headerBtn}>
                  <Text style={[styles.headerBtnText, { color: accent }]}>
                    {hiddenGraphIds.size > 0 ? 'Show All' : 'Hide All'}
                  </Text>
                </TouchableOpacity>
              )}
              {!legendCollapsed && state.activeStopwatches.length > 0 && (
                <TouchableOpacity
                  onPress={isSelectMode ? handleCancelSelect : () => setIsSelectMode(true)}
                  style={styles.headerBtn}
                >
                  <Text style={[styles.headerBtnText, { color: accent }]}>
                    {isSelectMode ? 'Cancel' : 'Select'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>

          {/* Stopwatch rows — plain View, not its own ScrollView, so it grows
              naturally and the outer page ScrollView handles overflow. */}
          {!legendCollapsed && (
          <View style={styles.legendList}>
          {displayStopwatches.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: subColor }]}>
                Tap + to start tracking your first dose.
              </Text>
            </View>
          ) : (
            displayStopwatches.map(sw => {
              const type = state.types.find(t => t.id === sw.typeId);
              if (!type) return null;
              const isDemo = sw.id === TOUR_DEMO_STOPWATCH_ID;
              const elapsed   = effectiveElapsed(sw, now);
              const total     = totalDuration(type);
              const phase     = currentPhase(type, elapsed);
              const progress  = progressFraction(type, elapsed);
              const isSelected = selectedIds.has(sw.id);
              const isHiddenFromGraph = hiddenGraphIds.has(sw.id);

              const onsetW  = type.onsetDuration  / total;
              const comeupW = type.comeupDuration / total;
              const peakW   = type.peakDuration   / total;

              return (
                <TouchableOpacity
                  key={sw.id}
                  style={[
                    styles.legendRow,
                    { borderBottomColor: cardBorder },
                    isSelected && { backgroundColor: isDark ? '#1C2B2B' : '#E8F8F7' },
                    !isSelectMode && isHiddenFromGraph && styles.legendRowHidden,
                  ]}
                  onPress={isDemo ? undefined : (isSelectMode ? () => handleRowPress(sw.id) : () => toggleGraphVisibility(sw.id))}
                  onLongPress={isDemo ? undefined : () => handleLongPress(sw.id)}
                  activeOpacity={0.6}
                >
                  {/* Color stripe — greyed out when excluded from the graph */}
                  <View style={[styles.colorStripe, { backgroundColor: !isSelectMode && isHiddenFromGraph ? cardBorder : type.color }]} />

                  {/* Info block */}
                  <View style={styles.rowInfo}>
                    <View style={styles.rowTopLine}>
                      <Text style={[styles.rowName, { color: textColor }]} numberOfLines={1}>
                        {type.name}
                      </Text>
                      {!isSelectMode && isHiddenFromGraph && (
                        <View style={[styles.hiddenPill, { borderColor: cardBorder }]}>
                          <Text style={[styles.hiddenPillText, { color: subColor }]}>hidden</Text>
                        </View>
                      )}
                      <View style={[styles.phasePill, { borderColor: type.color }]}>
                        <Text style={[styles.phaseText, { color: type.color }]}>{phase}</Text>
                      </View>
                    </View>
                    <Text style={[styles.rowTime, { color: subColor }]}>
                      {formatElapsed(elapsed)} / {formatElapsed(total)}
                    </Text>
                    {/* Phase progress bar */}
                    <View style={styles.phaseTrack}>
                      <View style={{ width: `${onsetW * 100}%`, height: '100%', backgroundColor: type.color, opacity: 0.3 }} />
                      <View style={{ width: `${comeupW * 100}%`, height: '100%', backgroundColor: type.color, opacity: 0.6 }} />
                      <View style={{ width: `${peakW * 100}%`, height: '100%', backgroundColor: type.color, opacity: 1 }} />
                      <View style={{ flex: 1, height: '100%', backgroundColor: type.color, opacity: 0.35 }} />
                      <View style={[styles.phaseCursor, { left: `${progress * 100}%` as any, backgroundColor: isDark ? '#fff' : '#000' }]} />
                    </View>
                  </View>

                  {/* Actions or checkbox */}
                  {isSelectMode ? (
                    <View style={[
                      styles.checkbox,
                      { borderColor: isSelected ? accent : cardBorder },
                      isSelected && { backgroundColor: accent },
                    ]}>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                  ) : (
                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: cardBorder }]}
                        onPress={isDemo ? undefined : () => setEditingId(sw.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={[styles.actionBtnText, { color: subColor }]}>✎</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { borderColor: cardBorder }]}
                        onPress={isDemo ? undefined : () => handleStop(sw.id)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Text style={[styles.actionBtnText, { color: '#FF6B6B' }]}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
          </View>
          )}
        </View>

      </ScrollView>

      {/* FAB: add stopwatch (floats above the scrolling content) */}
      <TouchableOpacity
        ref={fabTourRef}
        style={[styles.fab, { backgroundColor: accent }]}
        onPress={() => setAddVisible(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Edit start-time modal */}
      <EditStopwatchStartModal
        visible={!!editingId}
        stopwatch={editingStopwatch}
        type={editingType}
        currentTime={now}
        isDark={isDark}
        onSave={(id, newStartTime) => updateStopwatchStartTime(id, newStartTime)}
        onClose={() => setEditingId(null)}
      />

      {/* Add stopwatch modal */}
      <AddStopwatchModal
        visible={addVisible}
        isDark={isDark}
        onClose={() => setAddVisible(false)}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    gap: 8,
    paddingBottom: 100, // keep content clear of the FAB
  },

  // ── Screen headline ──────────────────────────────────────────────────────
  headline: {
    paddingHorizontal: 4,
    paddingBottom: 2,
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

  // ── Container 1: graph ──────────────────────────────────────────────────
  graphCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    paddingTop: 10,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  timerLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timerValue: {
    fontSize: 24,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  timerSuffix: {
    fontSize: 12,
  },


  // ── Container 2: overlay plans ─────────────────────────────────────────
  overlayCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  overlayLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  overlayChips: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 14,
  },
  planChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  planChipText: { fontSize: 12, fontWeight: '500' },

  // ── Container 3: legend (collapsible; height follows its content) ──────
  legendCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  legendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  legendHeaderCollapsed: {
    borderBottomWidth: 0,
  },
  legendHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendChevron: {
    fontSize: 12,
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  legendHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  headerBtn: { paddingVertical: 2 },
  headerBtnText: { fontSize: 14, fontWeight: '500' },
  legendList: { paddingBottom: 8 },

  emptyState: { padding: 28, alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Legend rows
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingRight: 12,
    gap: 10,
  },
  legendRowHidden: {
    opacity: 0.45,
  },
  hiddenPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  hiddenPillText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  colorStripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  rowInfo: {
    flex: 1,
    paddingVertical: 10,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
    flexWrap: 'nowrap',
  },
  rowName: {
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  phasePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  phaseText: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  rowTime: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    marginBottom: 5,
  },
  phaseTrack: {
    height: 5,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  phaseCursor: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 9,
    borderRadius: 1,
    marginLeft: -1,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '300', lineHeight: 30 },
  rowActions: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },

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
