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
import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type TourTab = 'explore' | 'plan' | 'interactions' | 'settings';

export type TourStep = {
  id: string;
  tab: TourTab;
  targetId: string;
  title: string;
  body: string;
  /**
   * When true, this step's spotlight lives inside another screen's own
   * component (e.g. a modal that must be opened first) rather than being
   * drawn by TourOverlay's own Modal. TourOverlay renders nothing for these
   * steps; the owning component reads TourContext itself and draws its own
   * spotlight using the same SpotlightMask/Callout building blocks.
   */
  embeddedTarget?: boolean;
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
    targetId: 'live.favoriteStar',
    embeddedTarget: true,
    title: 'Mark a favorite',
    body: 'Tap the star next to any substance to favorite it. Favorites float to the top of this list, so the ones you use most are always one tap away.',
  },
  {
    id: 'live-graph',
    tab: 'explore',
    targetId: 'live.graph',
    title: 'The graph on the Live screen',
    body: "Every dose you're tracking shows up here, layered together in real time. You can see what phase each one is in and how it's expected to progress.",
  },
  {
    id: 'live-legend',
    tab: 'explore',
    targetId: 'live.legend',
    title: "Everything you're tracking",
    body: 'Active doses are listed here. Tap ✎ to correct a start time, or ✕ to remove one.',
  },
  {
    id: 'live-visibility',
    tab: 'explore',
    targetId: 'live.legend',
    title: 'Show or hide a dose',
    body: "Tap any dose in this list to drop its curve off the graph above, or tap it again to bring it back. Useful when you're tracking several things and only want to focus on one or two. Hide All / Show All does it for everything at once.",
  },
  {
    id: 'plan-chips',
    tab: 'plan',
    targetId: 'plan.chips',
    title: 'Plan ahead',
    body: "Reduce uncertainty by planning ahead: build a plan, and DoseAngel will help you avoid dangerous combinations and time your doses correctly.",
  },
  {
    id: 'live-plan-preview',
    tab: 'explore',
    targetId: 'live.planToggle',
    title: 'Preview it on Live',
    body: "Once a plan exists, tap it here to preview it on this graph, showing exactly when you plan to take each dose. Want the full predicted curve instead of just the start time? Switch to Full curve under Settings, Plan overlay.",
  },
  {
    id: 'combos-intro',
    tab: 'interactions',
    targetId: 'combos.example',
    title: 'Check a combo',
    body: "Tap two substances here anytime to see documented interaction risk between them, sourced from TripSit. This example shows ketamine and alcohol, a combination with documented risk.",
  },
  {
    id: 'settings-harm',
    tab: 'settings',
    targetId: 'settings.harmReduction',
    title: 'Settings',
    body: "Toggles live here for interaction warnings, redose alerts, your substance library, graph overlays, and appearance. You can also replay this tour anytime from the About section.",
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
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Whether the tour is completed or skipped, it always finishes on the
  // Settings tab (the last step) — send the person back to the Live screen
  // rather than leaving them wherever the tour happened to end.
  const finish = useCallback(() => {
    setActive(false);
    AsyncStorage.setItem(TOUR_KEY, 'true');
    router.navigate('/explore');
  }, [router]);

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
