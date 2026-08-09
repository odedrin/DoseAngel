import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { evaluate, totalDuration } from '@/engine/curveEngine';
import { DEFAULT_TYPES } from '@/constants/defaultTypes';
import { SUBSTANCE_TYPES } from '@/constants/substanceDB';
import type { ActiveStopwatch, Plan, PlannedEntry, StopwatchType } from '@/types/models';

const STORAGE_KEY = 'festibud_state';

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let _counter = 0;
function genId(): string {
  return `${Date.now()}-${(++_counter).toString(36)}`;
}

// ---------------------------------------------------------------------------
// Effective elapsed helper
// ---------------------------------------------------------------------------

/** Returns the real elapsed ms for a stopwatch, subtracting any paused time. */
export function effectiveElapsed(sw: ActiveStopwatch, now: number): number {
  const base = sw.pausedAt !== undefined ? sw.pausedAt : now;
  return base - sw.startTime - (sw.totalPausedMs ?? 0);
}

// ---------------------------------------------------------------------------
// State & actions
// ---------------------------------------------------------------------------

/** A user-edited set of phase durations for a built-in or substance type, keyed by type id. */
export type DurationOverride = Pick<
  StopwatchType,
  'onsetDuration' | 'comeupDuration' | 'peakDuration' | 'offsetDuration'
>;

export interface AppState {
  types: StopwatchType[];
  activeStopwatches: ActiveStopwatch[];
  favoriteTypeIds: string[];
  plans: Plan[];
  /** Whether to show interaction warnings on the stopwatches screen. Default: true. */
  showInteractionWarnings: boolean;
  /** Whether to show ⚠ badges in type lists (AddStopwatchModal, AddPlanEntryModal). Default: true. */
  showInteractionBadges: boolean;
  /** Whether to warn when starting a type that's already active and hasn't peaked yet. Default: true. */
  showRedoseWarnings: boolean;
  /** How plans are overlaid on the live graph. Default: 'markers'. */
  planOverlayMode: 'markers' | 'curves';
  /**
   * User-edited phase durations for built-in/substance types, keyed by type id.
   * Built-in and substance types are otherwise always re-sourced from the code
   * bundle on hydration (so shipped data-corrections apply automatically) — an
   * entry here is layered on top of that fresh data so a user's manual duration
   * edit survives across restarts. Absent for types the user never touched.
   */
  durationOverrides: Record<string, DurationOverride>;
}

type Action =
  | { type: 'HYDRATE'; payload: AppState }
  | { type: 'ADD_TYPE'; payload: StopwatchType }
  | { type: 'UPDATE_TYPE'; payload: StopwatchType }
  | { type: 'DELETE_TYPE'; payload: string }
  | { type: 'START_STOPWATCH'; payload: { typeId: string; label?: string } }
  | { type: 'STOP_STOPWATCH'; payload: string }
  | { type: 'PAUSE_STOPWATCH'; payload: { id: string; now: number } }
  | { type: 'RESUME_STOPWATCH'; payload: { id: string; now: number } }
  | { type: 'UPDATE_STOPWATCH_START'; payload: { id: string; newStartTime: number } }
  | { type: 'TOGGLE_FAVORITE'; payload: string }
  | { type: 'CLEANUP_STALE'; payload: number }
  // Plans
  | { type: 'ADD_PLAN'; payload: Plan }
  | { type: 'RENAME_PLAN'; payload: { id: string; name: string } }
  | { type: 'DELETE_PLAN'; payload: string }
  | { type: 'ADD_PLAN_ENTRY'; payload: { planId: string; entry: PlannedEntry } }
  | { type: 'REMOVE_PLAN_ENTRY'; payload: { planId: string; entryId: string } }
  | { type: 'UPDATE_PLAN_ENTRY'; payload: { planId: string; entry: PlannedEntry } }
  | { type: 'SAVE_PLAN_EDITS'; payload: { planId: string; name: string; entries: PlannedEntry[] } }
  | { type: 'TOGGLE_INTERACTION_WARNINGS' }
  | { type: 'TOGGLE_INTERACTION_BADGES' }
  | { type: 'TOGGLE_REDOSE_WARNINGS' }
  | { type: 'SET_PLAN_OVERLAY_MODE'; payload: 'markers' | 'curves' }
  | { type: 'REORDER_TYPES'; payload: string[] }
  | { type: 'HIDE_TYPE'; payload: string }
  | { type: 'UNHIDE_TYPE'; payload: string }
  | { type: 'SET_DURATION_OVERRIDE'; payload: { id: string; durations: DurationOverride } }
  | { type: 'CLEAR_DURATION_OVERRIDE'; payload: string };

const DEFAULT_PLAN: Plan = { id: 'plan-default', name: 'My Plan', entries: [] };

const INITIAL_STATE: AppState = {
  types: [...DEFAULT_TYPES, ...SUBSTANCE_TYPES],
  activeStopwatches: [],
  favoriteTypeIds: [],
  plans: [DEFAULT_PLAN],
  showInteractionWarnings: true,
  showInteractionBadges: true,
  showRedoseWarnings: true,
  planOverlayMode: 'markers',
  durationOverrides: {},
};

function reducer(rawState: AppState, action: Action): AppState {
  // Guard against stale hot-reload state missing newer fields
  const state: AppState = {
    ...rawState,
    favoriteTypeIds: rawState.favoriteTypeIds ?? [],
    plans: rawState.plans ?? [DEFAULT_PLAN],
    showInteractionWarnings: rawState.showInteractionWarnings ?? true,
    showInteractionBadges: rawState.showInteractionBadges ?? true,
    showRedoseWarnings: rawState.showRedoseWarnings ?? true,
    planOverlayMode: rawState.planOverlayMode ?? 'markers',
    durationOverrides: rawState.durationOverrides ?? {},
  };
  switch (action.type) {
    case 'HYDRATE':
      return action.payload;

    case 'ADD_TYPE':
      return { ...state, types: [...state.types, action.payload] };

    case 'UPDATE_TYPE':
      return {
        ...state,
        types: state.types.map(t => t.id === action.payload.id ? action.payload : t),
      };

    case 'DELETE_TYPE':
      return {
        ...state,
        types: state.types.filter(t => t.id !== action.payload),
        activeStopwatches: state.activeStopwatches.filter(sw => sw.typeId !== action.payload),
        favoriteTypeIds: state.favoriteTypeIds.filter(id => id !== action.payload),
        plans: state.plans.map(p => ({
          ...p,
          entries: p.entries.filter(e => e.typeId !== action.payload),
        })),
      };

    case 'START_STOPWATCH':
      return {
        ...state,
        activeStopwatches: [
          ...state.activeStopwatches,
          {
            id: genId(),
            typeId: action.payload.typeId,
            startTime: Date.now(),
            label: action.payload.label,
          },
        ],
      };

    case 'STOP_STOPWATCH':
      return {
        ...state,
        activeStopwatches: state.activeStopwatches.filter(sw => sw.id !== action.payload),
      };

    case 'PAUSE_STOPWATCH':
      return {
        ...state,
        activeStopwatches: state.activeStopwatches.map(sw =>
          sw.id === action.payload.id && sw.pausedAt === undefined
            ? { ...sw, pausedAt: action.payload.now }
            : sw,
        ),
      };

    case 'RESUME_STOPWATCH':
      return {
        ...state,
        activeStopwatches: state.activeStopwatches.map(sw => {
          if (sw.id !== action.payload.id || sw.pausedAt === undefined) return sw;
          const addedPause = action.payload.now - sw.pausedAt;
          return {
            ...sw,
            pausedAt: undefined,
            totalPausedMs: (sw.totalPausedMs ?? 0) + addedPause,
          };
        }),
      };

    case 'UPDATE_STOPWATCH_START':
      return {
        ...state,
        activeStopwatches: state.activeStopwatches.map(sw =>
          sw.id === action.payload.id
            ? { ...sw, startTime: action.payload.newStartTime, pausedAt: undefined, totalPausedMs: 0 }
            : sw,
        ),
      };

    case 'TOGGLE_FAVORITE': {
      const id = action.payload;
      const isFav = state.favoriteTypeIds.includes(id);
      return {
        ...state,
        favoriteTypeIds: isFav
          ? state.favoriteTypeIds.filter(f => f !== id)
          : [...state.favoriteTypeIds, id],
      };
    }

    case 'TOGGLE_INTERACTION_WARNINGS':
      return { ...state, showInteractionWarnings: !state.showInteractionWarnings };

    case 'TOGGLE_INTERACTION_BADGES':
      return { ...state, showInteractionBadges: !state.showInteractionBadges };

    case 'TOGGLE_REDOSE_WARNINGS':
      return { ...state, showRedoseWarnings: !state.showRedoseWarnings };

    case 'SET_PLAN_OVERLAY_MODE':
      return { ...state, planOverlayMode: action.payload };

    case 'CLEANUP_STALE': {
      const now = action.payload;
      const MS_24H = 24 * 60 * 60 * 1000;
      return {
        ...state,
        activeStopwatches: state.activeStopwatches.filter(sw => {
          const type = state.types.find(t => t.id === sw.typeId);
          if (!type) return false;
          const total = totalDuration(type);

          if (sw.pausedAt !== undefined) {
            // Paused stopwatch: effectiveElapsed is frozen at pause time.
            // Consider it stale if it's been paused for > 24h, OR if the
            // pause itself was already past the end of the comedown.
            const elapsedAtPause = sw.pausedAt - sw.startTime - (sw.totalPausedMs ?? 0);
            const endedAtPause = sw.startTime + (sw.totalPausedMs ?? 0) + total;
            if (elapsedAtPause >= total && now - endedAtPause >= MS_24H) return false;
            if (now - sw.pausedAt >= MS_24H) return false;
            return true;
          }

          // Running stopwatch
          const elapsed = effectiveElapsed(sw, now);
          if (elapsed < total) return true; // comedown not finished yet
          // Wall-clock time when comedown ended
          const endedAt = sw.startTime + (sw.totalPausedMs ?? 0) + total;
          return now - endedAt < MS_24H;
        }),
      };
    }

    case 'ADD_PLAN':
      return { ...state, plans: [...state.plans, action.payload] };

    case 'RENAME_PLAN':
      return {
        ...state,
        plans: state.plans.map(p =>
          p.id === action.payload.id ? { ...p, name: action.payload.name } : p,
        ),
      };

    case 'DELETE_PLAN':
      return {
        ...state,
        plans: state.plans.length > 1
          ? state.plans.filter(p => p.id !== action.payload)
          : state.plans,
      };

    case 'ADD_PLAN_ENTRY':
      return {
        ...state,
        plans: state.plans.map(p =>
          p.id === action.payload.planId
            ? { ...p, entries: [...p.entries, action.payload.entry] }
            : p,
        ),
      };

    case 'REMOVE_PLAN_ENTRY':
      return {
        ...state,
        plans: state.plans.map(p =>
          p.id === action.payload.planId
            ? { ...p, entries: p.entries.filter(e => e.id !== action.payload.entryId) }
            : p,
        ),
      };

    case 'UPDATE_PLAN_ENTRY':
      return {
        ...state,
        plans: state.plans.map(p =>
          p.id === action.payload.planId
            ? {
                ...p,
                entries: p.entries.map(e =>
                  e.id === action.payload.entry.id ? action.payload.entry : e,
                ),
              }
            : p,
        ),
      };

    case 'SAVE_PLAN_EDITS':
      return {
        ...state,
        plans: state.plans.map(p =>
          p.id === action.payload.planId
            ? { ...p, name: action.payload.name, entries: action.payload.entries }
            : p,
        ),
      };

    case 'REORDER_TYPES': {
      const newOrder = action.payload; // IDs in desired order (one section at a time)
      const reorderSet = new Set(newOrder);
      const firstSectionIdx = state.types.findIndex(t => reorderSet.has(t.id));
      if (firstSectionIdx === -1) return state;
      const others = state.types.filter(t => !reorderSet.has(t.id));
      // insertIdx into `others`: count how many non-section items precede firstSectionIdx
      const insertIdx = state.types
        .slice(0, firstSectionIdx)
        .filter(t => !reorderSet.has(t.id)).length;
      const reordered = newOrder
        .map(id => state.types.find(t => t.id === id))
        .filter(Boolean) as StopwatchType[];
      return {
        ...state,
        types: [...others.slice(0, insertIdx), ...reordered, ...others.slice(insertIdx)],
      };
    }

    case 'HIDE_TYPE':
      return {
        ...state,
        types: state.types.map(t =>
          t.id === action.payload ? { ...t, hidden: true } : t,
        ),
      };

    case 'UNHIDE_TYPE':
      return {
        ...state,
        types: state.types.map(t =>
          t.id === action.payload ? { ...t, hidden: false } : t,
        ),
      };

    case 'SET_DURATION_OVERRIDE': {
      const { id, durations } = action.payload;
      return {
        ...state,
        types: state.types.map(t => t.id === id ? { ...t, ...durations } : t),
        durationOverrides: { ...state.durationOverrides, [id]: durations },
      };
    }

    case 'CLEAR_DURATION_OVERRIDE': {
      const id = action.payload;
      const fresh = DEFAULT_TYPES.find(t => t.id === id) ?? SUBSTANCE_TYPES.find(t => t.id === id);
      const { [id]: _removed, ...rest } = state.durationOverrides;
      if (!fresh) return { ...state, durationOverrides: rest };
      return {
        ...state,
        types: state.types.map(t =>
          t.id === id
            ? {
                ...t,
                onsetDuration: fresh.onsetDuration,
                comeupDuration: fresh.comeupDuration,
                peakDuration: fresh.peakDuration,
                offsetDuration: fresh.offsetDuration,
              }
            : t,
        ),
        durationOverrides: rest,
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface StopwatchContextValue {
  state: AppState;
  startStopwatch: (typeId: string, label?: string) => void;
  stopStopwatch: (id: string) => void;
  pauseStopwatch: (id: string) => void;
  resumeStopwatch: (id: string) => void;
  updateStopwatchStartTime: (id: string, newStartTime: number) => void;
  addType: (type: Omit<StopwatchType, 'id'>) => void;
  updateType: (type: StopwatchType) => void;
  deleteType: (id: string) => void;
  getTypeById: (id: string) => StopwatchType | undefined;
  evaluateSum: (atTime?: number) => number;
  toggleFavorite: (typeId: string) => void;
  reorderTypes: (ids: string[]) => void;
  hideType: (id: string) => void;
  unhideType: (id: string) => void;
  toggleInteractionWarnings: () => void;
  toggleInteractionBadges: () => void;
  toggleRedoseWarnings: () => void;
  setPlanOverlayMode: (mode: 'markers' | 'curves') => void;
  /** Edits a built-in/substance type's phase durations in place, persisting across restarts. */
  setSubstanceDurations: (id: string, durations: DurationOverride) => void;
  /** Reverts a previously-edited type's phase durations back to the bundled default. */
  resetSubstanceDurations: (id: string) => void;
  // Plans
  addPlan: (name: string) => void;
  /** Creates a plan with an initial batch of entries (each with its own target time) in a single update. Returns the new plan's id. */
  createPlanWithEntries: (name: string, entries: { typeId: string; targetTime: number }[]) => string;
  renamePlan: (id: string, name: string) => void;
  deletePlan: (id: string) => void;
  addPlanEntry: (planId: string, typeId: string, targetTime: number) => void;
  removePlanEntry: (planId: string, entryId: string) => void;
  updatePlanEntry: (planId: string, entry: PlannedEntry) => void;
  /** Atomically renames a plan and replaces its entire entries array — used by the Edit Plan modal's Save action. */
  savePlanEdits: (planId: string, name: string, entries: PlannedEntry[]) => void;
}

const StopwatchContext = createContext<StopwatchContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function StopwatchProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<AppState>;
          // Built-in and substance IDs are always re-sourced from the bundle.
          // LEGACY_IDS covers presets that were removed so they don't survive as custom types.
          const LEGACY_IDS = new Set(['preset-quick', 'preset-extended']);
          const builtInIds = new Set([
            ...DEFAULT_TYPES.map(t => t.id),
            ...SUBSTANCE_TYPES.map(t => t.id),
          ]);
          const customTypes = (saved.types ?? []).filter(
            t => !builtInIds.has(t.id) && !LEGACY_IDS.has(t.id),
          );

          // Preserve user-defined ordering of built-in and substance types.
          // Re-source data from the bundle (so name/color/curve updates apply),
          // but keep the saved order. Append any brand-new bundle types at the end.
          // Any user-edited phase durations (durationOverrides) are layered back
          // on top of the fresh bundle data so edits survive the re-source.
          const savedIds = new Set((saved.types ?? []).map(t => t.id));
          const durationOverrides = saved.durationOverrides ?? {};
          const orderedBuiltIns = [
            ...(saved.types ?? [])
              .filter(t => DEFAULT_TYPES.some(d => d.id === t.id))
              .map(t => ({
                ...DEFAULT_TYPES.find(d => d.id === t.id)!,
                hidden: t.hidden,
                ...(durationOverrides[t.id] ?? {}),
              })),
            ...DEFAULT_TYPES.filter(t => !savedIds.has(t.id)),
          ];
          const orderedSubstances = [
            ...(saved.types ?? [])
              .filter(t => SUBSTANCE_TYPES.some(s => s.id === t.id))
              .map(t => ({
                ...SUBSTANCE_TYPES.find(s => s.id === t.id)!,
                hidden: t.hidden,
                ...(durationOverrides[t.id] ?? {}),
              })),
            ...SUBSTANCE_TYPES.filter(t => !savedIds.has(t.id)),
          ];

          // Migrate plan entries: convert legacy offsetMinutes → targetTime
          const nowMs = Date.now();
          const migratedPlans = (saved.plans ?? []).map(p => ({
            ...p,
            entries: (p.entries ?? []).map((e: any) => ({
              id: e.id,
              typeId: e.typeId,
              targetTime: e.targetTime ?? (nowMs + (e.offsetMinutes ?? 0) * 60_000),
            })),
          }));

          dispatch({
            type: 'HYDRATE',
            payload: {
              ...INITIAL_STATE,
              ...saved,
              types: [...orderedBuiltIns, ...orderedSubstances, ...customTypes],
              plans: migratedPlans.length > 0 ? migratedPlans : INITIAL_STATE.plans,
            },
          });
        } catch {
          // Corrupted storage — fall back to defaults silently
        }
      }
      // Clean up stale stopwatches immediately on launch, before rendering
      dispatch({ type: 'CLEANUP_STALE', payload: Date.now() });
      setHydrated(true);
    });
  }, []);

  // Persist state whenever it changes (skip until hydration is done)
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  // Auto-cleanup: remove stopwatches done >24h ago, checked every minute
  useEffect(() => {
    if (!hydrated) return;
    const id = setInterval(() => {
      dispatch({ type: 'CLEANUP_STALE', payload: Date.now() });
    }, 60_000);
    return () => clearInterval(id);
  }, [hydrated]);

  const startStopwatch = useCallback((typeId: string, label?: string) => {
    dispatch({ type: 'START_STOPWATCH', payload: { typeId, label } });
  }, []);

  const stopStopwatch = useCallback((id: string) => {
    dispatch({ type: 'STOP_STOPWATCH', payload: id });
  }, []);

  const pauseStopwatch = useCallback((id: string) => {
    dispatch({ type: 'PAUSE_STOPWATCH', payload: { id, now: Date.now() } });
  }, []);

  const resumeStopwatch = useCallback((id: string) => {
    dispatch({ type: 'RESUME_STOPWATCH', payload: { id, now: Date.now() } });
  }, []);

  const updateStopwatchStartTime = useCallback((id: string, newStartTime: number) => {
    dispatch({ type: 'UPDATE_STOPWATCH_START', payload: { id, newStartTime } });
  }, []);

  const addType = useCallback((type: Omit<StopwatchType, 'id'>) => {
    dispatch({ type: 'ADD_TYPE', payload: { ...type, id: genId() } });
  }, []);

  const updateType = useCallback((type: StopwatchType) => {
    dispatch({ type: 'UPDATE_TYPE', payload: type });
  }, []);

  const deleteType = useCallback((id: string) => {
    dispatch({ type: 'DELETE_TYPE', payload: id });
  }, []);

  const getTypeById = useCallback(
    (id: string) => state.types.find(t => t.id === id),
    [state.types],
  );

  const evaluateSum = useCallback(
    (atTime: number = Date.now()) =>
      state.activeStopwatches.reduce((sum, sw) => {
        const type = state.types.find(t => t.id === sw.typeId);
        if (!type) return sum;
        const elapsed = effectiveElapsed(sw, atTime);
        return sum + evaluate(type, elapsed);
      }, 0),
    [state.activeStopwatches, state.types],
  );

  const toggleFavorite = useCallback((typeId: string) => {
    dispatch({ type: 'TOGGLE_FAVORITE', payload: typeId });
  }, []);

  const reorderTypes = useCallback((ids: string[]) => {
    dispatch({ type: 'REORDER_TYPES', payload: ids });
  }, []);

  const hideType = useCallback((id: string) => {
    dispatch({ type: 'HIDE_TYPE', payload: id });
  }, []);

  const unhideType = useCallback((id: string) => {
    dispatch({ type: 'UNHIDE_TYPE', payload: id });
  }, []);

  const toggleInteractionWarnings = useCallback(() => {
    dispatch({ type: 'TOGGLE_INTERACTION_WARNINGS' });
  }, []);

  const toggleInteractionBadges = useCallback(() => {
    dispatch({ type: 'TOGGLE_INTERACTION_BADGES' });
  }, []);

  const toggleRedoseWarnings = useCallback(() => {
    dispatch({ type: 'TOGGLE_REDOSE_WARNINGS' });
  }, []);

  const setPlanOverlayMode = useCallback((mode: 'markers' | 'curves') => {
    dispatch({ type: 'SET_PLAN_OVERLAY_MODE', payload: mode });
  }, []);

  const setSubstanceDurations = useCallback((id: string, durations: DurationOverride) => {
    dispatch({ type: 'SET_DURATION_OVERRIDE', payload: { id, durations } });
  }, []);

  const resetSubstanceDurations = useCallback((id: string) => {
    dispatch({ type: 'CLEAR_DURATION_OVERRIDE', payload: id });
  }, []);

  const addPlan = useCallback((name: string) => {
    dispatch({ type: 'ADD_PLAN', payload: { id: genId(), name, entries: [] } });
  }, []);

  const createPlanWithEntries = useCallback(
    (name: string, entries: { typeId: string; targetTime: number }[]) => {
      const planId = genId();
      const planEntries: PlannedEntry[] = entries.map(e => ({
        id: genId(),
        typeId: e.typeId,
        targetTime: e.targetTime,
      }));
      dispatch({ type: 'ADD_PLAN', payload: { id: planId, name, entries: planEntries } });
      return planId;
    },
    [],
  );

  const renamePlan = useCallback((id: string, name: string) => {
    dispatch({ type: 'RENAME_PLAN', payload: { id, name } });
  }, []);

  const deletePlan = useCallback((id: string) => {
    dispatch({ type: 'DELETE_PLAN', payload: id });
  }, []);

  const addPlanEntry = useCallback((planId: string, typeId: string, targetTime: number) => {
    dispatch({
      type: 'ADD_PLAN_ENTRY',
      payload: { planId, entry: { id: genId(), typeId, targetTime } },
    });
  }, []);

  const removePlanEntry = useCallback((planId: string, entryId: string) => {
    dispatch({ type: 'REMOVE_PLAN_ENTRY', payload: { planId, entryId } });
  }, []);

  const updatePlanEntry = useCallback((planId: string, entry: PlannedEntry) => {
    dispatch({ type: 'UPDATE_PLAN_ENTRY', payload: { planId, entry } });
  }, []);

  const savePlanEdits = useCallback((planId: string, name: string, entries: PlannedEntry[]) => {
    dispatch({ type: 'SAVE_PLAN_EDITS', payload: { planId, name, entries } });
  }, []);

  if (!hydrated) return null;

  return (
    <StopwatchContext.Provider value={{
      state,
      startStopwatch, stopStopwatch, pauseStopwatch, resumeStopwatch, updateStopwatchStartTime,
      addType, updateType, deleteType, getTypeById, evaluateSum,
      toggleFavorite, reorderTypes, hideType, unhideType, toggleInteractionWarnings, toggleInteractionBadges, toggleRedoseWarnings, setPlanOverlayMode,
      setSubstanceDurations, resetSubstanceDurations,
      addPlan, createPlanWithEntries, renamePlan, deletePlan,
      addPlanEntry, removePlanEntry, updatePlanEntry, savePlanEdits,
    }}>
      {children}
    </StopwatchContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStopwatch(): StopwatchContextValue {
  const ctx = useContext(StopwatchContext);
  if (!ctx) throw new Error('useStopwatch must be used inside <StopwatchProvider>');
  return ctx;
}
