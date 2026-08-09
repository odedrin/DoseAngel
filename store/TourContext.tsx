/**
 * TourContext — drives the first-time-user spotlight walkthrough.
 *
 * Steps are static config, each naming a tab and a `targetId` that matches
 * an id registered via `useTourTarget` (see tourTargets.ts) on the relevant
 * screen. TourOverlay (rendered once at the app root) reads this context,
 * navigates to the right tab, measures the target, and draws the spotlight.
 *
 * Persistence mirrors the existing DisclosureModal pattern in app/_layout.tsx:
 * a single AsyncStorage key, absent until the tour is finished or skipped.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type TourTab = 'explore' | 'plan' | 'interactions' | 'settings';

export type TourStep = {
  id: string;
  tab: TourTab;
  targetId: string;
  title: string;
  body: string;
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'live-fab',
    tab: 'explore',
    targetId: 'live.fab',
    title: 'Track a dose',
    body: 'Tap + whenever you take a dose. It starts timing immediately, and you can adjust the exact time afterward if you log it a little late.',
  },
  {
    id: 'live-favorite',
    tab: 'explore',
    targetId: 'live.fab',
    title: 'Mark a favorite',
    body: 'From that same + sheet, tap the star next to any substance to favorite it. Favorites float to the top of the list, so the ones you use most are always one tap away.',
  },
  {
    id: 'live-graph',
    tab: 'explore',
    targetId: 'live.graph',
    title: 'The graph on the Live screen',
    body: "Every dose you're tracking shows up here, layered together in real time. You can see what phase each one is in and how it's expected to progress.",
  },
  {
    id: 'live-visibility',
    tab: 'explore',
    targetId: 'live.legend',
    title: 'Show or hide a dose',
    body: "Tap any dose in this list to drop its curve off the graph above, or tap it again to bring it back. Useful when you're tracking several things and only want to focus on one or two. Hide All / Show All does it for everything at once.",
  },
  {
    id: 'live-legend',
    tab: 'explore',
    targetId: 'live.legend',
    title: "Everything you're tracking",
    body: 'Active doses are listed here. Tap ✎ to correct a start time, or ✕ to remove one.',
  },
  {
    id: 'plan-chips',
    tab: 'plan',
    targetId: 'plan.chips',
    title: 'Plan ahead',
    body: "Reduce uncertainty by planning ahead: create a plan, avoid dangerous combinations, and time your doses correctly. Once it's built, flip back to Live and toggle it on to see it overlaid on top of what's actually happening.",
  },
  {
    id: 'combos-intro',
    tab: 'interactions',
    targetId: 'combos.headline',
    title: 'Check a combo',
    body: 'Tap two substances here anytime to see documented interaction risk between them, sourced from TripSit.',
  },
  {
    id: 'settings-harm',
    tab: 'settings',
    targetId: 'settings.harmReduction',
    title: 'Make it yours',
    body: "Settings holds toggles for interaction warnings, graph overlays, and appearance. Explore them anytime.",
  },
];

const TOUR_KEY = 'tour:completed';

type TourContextValue = {
  active: boolean;
  stepIndex: number;
  steps: TourStep[];
  start: () => void;
  next: () => void;
  prev: () => void;
  skip: () => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const finish = useCallback(() => {
    setActive(false);
    AsyncStorage.setItem(TOUR_KEY, 'true');
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex(i => {
      if (i + 1 >= TOUR_STEPS.length) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [finish]);

  const prev = useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const value = useMemo<TourContextValue>(
    () => ({ active, stepIndex, steps: TOUR_STEPS, start, next, prev, skip }),
    [active, stepIndex, start, next, prev, skip],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}

export async function hasTourCompleted(): Promise<boolean> {
  return (await AsyncStorage.getItem(TOUR_KEY)) !== null;
}
