/**
 * useInteractionGuard
 *
 * Wraps startStopwatch with two independent checks, each with its own
 * warning UI. Both can apply at once — when they do, they're shown
 * sequentially rather than one suppressing the other, with the redose
 * warning taking precedence (shown first):
 *
 * 1. Redose check — if the type being started already has an active instance
 *    that hasn't reached its peak phase yet (still in onset or comeup),
 *    surfaces RedoseWarningModal via `redosePendingType` / `redoseRemainingMs`.
 * 2. Interaction check — if the type being started is a substance and has
 *    interactions with currently active substances, surfaces
 *    InteractionWarningModal via `pendingType` / `warningPairs`.
 *
 * If both apply: the redose warning shows first. Confirming it then reveals
 * the interaction warning (the timer is NOT started yet). Confirming that
 * finally starts the timer. Canceling either warning aborts the whole flow.
 * If only one applies, confirming it starts the timer directly.
 *
 * handleStart returns true if a warning was triggered (timer NOT yet started),
 * false if the timer was started immediately (no warning needed).
 * Callers use the return value to decide whether to close a modal, etc.
 *
 * onConfirm returns true once the timer has actually been started (the whole
 * chain is resolved), false if it just advanced to the next warning in the
 * chain. Callers that auto-close a wrapping sheet on confirm should only do
 * so when onConfirm returns true — closing early would unmount the chained
 * warning before the user sees it (see AddStopwatchModal).
 */

import { useCallback, useState } from 'react';
import { getActiveInteractions } from '@/constants/interactions';
import { useStopwatch, effectiveElapsed } from '@/store/StopwatchContext';
import { type WarningPair } from '@/components/InteractionWarningModal';
import { currentPhase, msUntilPeak } from '@/engine/curveEngine';
import type { StopwatchType } from '@/types/models';

interface GuardResult {
  /** Returns true if a warning was shown (timer held), false if started directly. */
  handleStart: (typeId: string) => boolean;
  // Interaction warning (InteractionWarningModal)
  pendingType: StopwatchType | null;
  warningPairs: WarningPair[];
  // Redose warning (RedoseWarningModal)
  redosePendingType: StopwatchType | null;
  redoseRemainingMs: number;
  /**
   * Call when user confirms "Start anyway" / "Redose anyway".
   * Returns true if the timer was started (flow fully resolved), false if a
   * chained warning (e.g. the interaction warning after a redose warning) is
   * now pending and the timer has NOT started yet.
   */
  onConfirm: () => boolean;
  /** Call when user cancels the warning. Aborts the entire chain. */
  onCancel: () => void;
}

export function useInteractionGuard(): GuardResult {
  const { state, startStopwatch } = useStopwatch();

  const [pendingType, setPendingType]     = useState<StopwatchType | null>(null);
  const [warningPairs, setWarningPairs]   = useState<WarningPair[]>([]);
  const [redosePendingType, setRedosePendingType] = useState<StopwatchType | null>(null);
  const [redoseRemainingMs, setRedoseRemainingMs] = useState(0);
  // Interaction pairs computed alongside a redose warning, held until the
  // redose warning is confirmed — redose takes precedence in display order.
  const [deferredPairs, setDeferredPairs] = useState<WarningPair[] | null>(null);

  const handleStart = useCallback((typeId: string): boolean => {
    const type = state.types.find(t => t.id === typeId);
    if (!type) return false;

    // Compute interaction pairs up front regardless of the redose check below,
    // so neither check suppresses the other — just whichever fires displays first.
    let interactionPairs: WarningPair[] | null = null;
    if (type.isSubstance && state.showInteractionWarnings) {
      // Deduplicate and exclude the type being started (matches plan.tsx logic)
      const activeSubstanceIds = [
        ...new Set(
          state.activeStopwatches
            .map(sw => state.types.find(t => t.id === sw.typeId))
            .filter((t): t is StopwatchType => !!t?.isSubstance)
            .map(t => t.id)
            .filter(id => id !== typeId),
        ),
      ];

      if (activeSubstanceIds.length > 0) {
        const rawPairs = getActiveInteractions([typeId, ...activeSubstanceIds])
          .filter(p => p.idA === typeId || p.idB === typeId)
          .filter(p => !p.interaction.status.startsWith('Low Risk'));

        if (rawPairs.length > 0) {
          // Deduplicate pairs by canonical key (belt-and-suspenders)
          const seen = new Set<string>();
          const pairs: WarningPair[] = [];
          for (const p of rawPairs) {
            const key = [p.idA, p.idB].sort().join('+');
            if (!seen.has(key)) {
              seen.add(key);
              pairs.push({
                nameA: state.types.find(t => t.id === p.idA)?.name ?? p.idA,
                nameB: state.types.find(t => t.id === p.idB)?.name ?? p.idB,
                interaction: p.interaction,
              });
            }
          }
          interactionPairs = pairs;
        }
      }
    }

    // Redose check — applies to any type (not just substances): warn if an
    // active instance of this exact type hasn't reached peak yet. Takes
    // display precedence — if it fires, the interaction warning (if any) is
    // deferred until this one is confirmed, rather than being dropped.
    if (state.showRedoseWarnings) {
      const now = Date.now();
      let soonestToPeak: number | null = null;
      for (const sw of state.activeStopwatches) {
        if (sw.typeId !== typeId) continue;
        const elapsed = effectiveElapsed(sw, now);
        const phase = currentPhase(type, elapsed);
        if (phase !== 'onset' && phase !== 'comeup') continue;
        const remaining = msUntilPeak(type, elapsed);
        if (soonestToPeak === null || remaining < soonestToPeak) soonestToPeak = remaining;
      }
      if (soonestToPeak !== null) {
        setRedosePendingType(type);
        setRedoseRemainingMs(soonestToPeak);
        setDeferredPairs(interactionPairs);
        return true; // warning shown — caller should NOT close its modal yet
      }
    }

    if (interactionPairs) {
      setPendingType(type);
      setWarningPairs(interactionPairs);
      return true; // warning shown — caller should NOT close its modal yet
    }

    startStopwatch(typeId);
    return false; // started directly — caller may close its modal
  }, [state, startStopwatch]);

  const onConfirm = useCallback((): boolean => {
    if (redosePendingType) {
      const type = redosePendingType;
      setRedosePendingType(null);
      setRedoseRemainingMs(0);
      if (deferredPairs) {
        // Chain into the interaction warning instead of starting yet.
        setPendingType(type);
        setWarningPairs(deferredPairs);
        setDeferredPairs(null);
        return false;
      }
      startStopwatch(type.id);
      return true;
    }
    if (pendingType) {
      startStopwatch(pendingType.id);
      setPendingType(null);
      setWarningPairs([]);
      return true;
    }
    return true;
  }, [pendingType, redosePendingType, deferredPairs, startStopwatch]);

  const onCancel = useCallback(() => {
    setPendingType(null);
    setWarningPairs([]);
    setRedosePendingType(null);
    setRedoseRemainingMs(0);
    setDeferredPairs(null);
  }, []);

  return {
    handleStart,
    pendingType, warningPairs,
    redosePendingType, redoseRemainingMs,
    onConfirm, onCancel,
  };
}
