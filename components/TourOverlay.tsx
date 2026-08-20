/**
 * TourOverlay — renders the spotlight walkthrough driven by TourContext.
 *
 * Mounted once at the app root (app/_layout.tsx), sibling to the tab
 * navigator. For each step it navigates to the right tab, measures the
 * registered target (see store/tourTargets.ts) with `measureInWindow`, and
 * draws a dimmed full-screen mask with a cutout around the target plus a
 * callout bubble with an arrow pointing at it.
 *
 * Deliberately built with plain Views + the RN Animated API — no
 * react-native-reanimated (see project conventions) and no gesture
 * handling: this is a look-don't-touch walkthrough, not an interactive one.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import type { LayoutChangeEvent, View as RNView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { TourStep, TourTab, useTour } from '@/store/TourContext';
import { getTourTargetRef } from '@/store/tourTargets';

export type Rect = { x: number; y: number; width: number; height: number };

const TAB_PATH: Record<TourTab, string> = {
  explore: '/explore',
  plan: '/plan',
  interactions: '/interactions',
  settings: '/settings',
};

// Matches the tour targets registered on each tab icon in app/(tabs)/_layout.tsx.
const TAB_TARGET_ID: Record<TourTab, string> = {
  explore: 'tab.explore',
  plan: 'tab.plan',
  interactions: 'tab.interactions',
  settings: 'tab.settings',
};

const HOLE_PADDING = 10;
const MEASURE_RETRY_MS = 80;
const MEASURE_MAX_TRIES = 25; // ~2s before giving up and falling back to a centered bubble
const MEASURE_SETTLE_MS = 220; // re-confirm once after a target's first successful measurement
const GAP = 16;
const ARROW_SIZE = 14;

// All spotlight/ring drawing happens inside TourOverlay's own <Modal
// statusBarTranslucent>, whose internal coordinate origin sits at the very
// physical top of the screen (statusBarTranslucent makes it draw under the
// status bar). measureInWindow(), however, is called on the *real* target
// view living in the app's normal, non-modal window — and on Android, that
// window's origin can sit *below* the status bar (its exact behavior
// depends on the host shell; e.g. Expo Go doesn't apply this project's
// edgeToEdgeEnabled config the way a standalone build would). The two
// coordinate spaces end up offset by the status bar's height, which is why
// every highlight renders too high on Android. iOS doesn't have this
// mismatch, so this only applies on Android.
const ANDROID_STATUS_BAR_OFFSET = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;

function toModalRect(x: number, y: number, width: number, height: number): Rect {
  return { x, y: y + ANDROID_STATUS_BAR_OFFSET, width, height };
}

function measureTarget(
  targetId: string,
  onRect: (r: Rect | null) => void,
  triesRef: React.MutableRefObject<number>,
  screenW: number,
  screenH: number,
  // Only true when the rect will be drawn inside TourOverlay's own
  // statusBarTranslucent Modal (its own main-step spotlight, and the tab
  // icon ring). AddStopwatchModal's embedded spotlight (see
  // useTourTargetRect below) measures and draws within its *own*,
  // non-translucent Modal, so the two coordinate spaces already agree there
  // — applying this offset in that case would push it the wrong way.
  applyStatusBarOffset: boolean = true,
) {
  const ref = getTourTargetRef(targetId);
  const view = ref?.current as RNView | null | undefined;
  const toRect = (x: number, y: number, width: number, height: number): Rect =>
    applyStatusBarOffset ? toModalRect(x, y, width, height) : { x, y, width, height };

  if (!view) {
    if (triesRef.current < MEASURE_MAX_TRIES) {
      triesRef.current += 1;
      setTimeout(() => measureTarget(targetId, onRect, triesRef, screenW, screenH, applyStatusBarOffset), MEASURE_RETRY_MS);
    } else {
      onRect({ x: screenW / 2 - 1, y: screenH / 2 - 1, width: 2, height: 2 });
    }
    return;
  }

  view.measureInWindow((x: number, y: number, width: number, height: number) => {
    if (width === 0 && height === 0) {
      if (triesRef.current < MEASURE_MAX_TRIES) {
        triesRef.current += 1;
        setTimeout(() => measureTarget(targetId, onRect, triesRef, screenW, screenH, applyStatusBarOffset), MEASURE_RETRY_MS);
      } else {
        onRect({ x: screenW / 2 - 1, y: screenH / 2 - 1, width: 2, height: 2 });
      }
      return;
    }
    onRect(toRect(x, y, width, height));

    // A target that just mounted (e.g. a card with wrapped multi-line text,
    // or right after a scroll) can report a size here before its layout has
    // fully settled. Re-confirm once, shortly after, and use that instead
    // if it differs — otherwise the spotlight can silently lock onto a
    // too-small rect, cutting off content and misplacing the callout.
    setTimeout(() => {
      view.measureInWindow((x2: number, y2: number, width2: number, height2: number) => {
        if (width2 > 0 || height2 > 0) onRect(toRect(x2, y2, width2, height2));
      });
    }, MEASURE_SETTLE_MS);
  });
}

/**
 * Reusable hook for any screen that needs to draw its own embedded tour
 * spotlight (see `TourStep.embeddedTarget`) — e.g. a component that must
 * open a modal before the real target even exists on screen. Mirrors the
 * measure-with-retry behavior TourOverlay uses for its own steps.
 */
export function useTourTargetRect(
  targetId: string | null,
  active: boolean,
  screenW: number,
  screenH: number,
  // See measureTarget's applyStatusBarOffset param. Defaults to false since
  // this hook's original caller (AddStopwatchModal) draws its spotlight
  // inside its own non-translucent Modal, where measured coordinates already
  // match. TourOverlay passes true explicitly for its own (translucent-Modal)
  // use of this same hook, the tab icon ring.
  applyStatusBarOffset: boolean = false,
): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const triesRef = useRef(0);

  useEffect(() => {
    if (!active || !targetId) {
      setRect(null);
      return;
    }
    triesRef.current = 0;
    setRect(null);
    measureTarget(targetId, setRect, triesRef, screenW, screenH, applyStatusBarOffset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targetId]);

  return rect;
}

// How long to wait before (re)presenting TourOverlay's own Modal right after
// an embedded step's owning component (e.g. AddStopwatchModal) closes its
// Modal — iOS only supports one presented native Modal at a time, so
// presenting too early risks the two fighting over which one is on top.
const EMBEDDED_TRANSITION_DELAY_MS = 380;

export function TourOverlay() {
  const { active, stepIndex, steps, next, prev, skip } = useTour();
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const { width: screenW, height: screenH } = useWindowDimensions();

  const step = steps[stepIndex];
  const [rect, setRect] = useState<Rect | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const triesRef = useRef(0);

  // Steps with `embeddedTarget` draw their own spotlight elsewhere (the
  // component that owns the target renders it directly), so TourOverlay has
  // nothing to show for them. If the step right before this one was
  // embedded, hold off presenting until its Modal has had time to close.
  const wasPrevStepEmbeddedRef = useRef(false);
  const [readyToShow, setReadyToShow] = useState(true);

  // Secondary highlight around whichever tab icon this step lives on, so
  // it's always clear which screen the tour is currently talking about.
  // Not shown for embedded steps: their owning component's Modal covers the
  // tab bar entirely, so there's nothing to highlight there anyway.
  const tabTargetId = step ? TAB_TARGET_ID[step.tab] : null;
  const tabMeasureActive = active && !!step && !step.embeddedTarget && readyToShow;
  // true: this ring is drawn inside TourOverlay's own translucent Modal below.
  const tabRect = useTourTargetRect(tabTargetId, tabMeasureActive, screenW, screenH, true);

  useEffect(() => {
    if (!active || !step) {
      setReadyToShow(true);
      wasPrevStepEmbeddedRef.current = false;
      return;
    }
    if (step.embeddedTarget) {
      wasPrevStepEmbeddedRef.current = true;
      setReadyToShow(false);
      return;
    }
    if (wasPrevStepEmbeddedRef.current) {
      wasPrevStepEmbeddedRef.current = false;
      setReadyToShow(false);
      const t = setTimeout(() => setReadyToShow(true), EMBEDDED_TRANSITION_DELAY_MS);
      return () => clearTimeout(t);
    }
    setReadyToShow(true);
  }, [active, stepIndex, step]);

  // Step 1: get onto the right tab.
  useEffect(() => {
    if (!active || !step) return;
    const target = TAB_PATH[step.tab];
    if (pathname !== target) {
      router.navigate(target as never);
    }
  }, [active, step, pathname, router]);

  // Step 2: once we're on the right tab, measure the target (with retries).
  useEffect(() => {
    if (!active || !step || step.embeddedTarget || !readyToShow) {
      setRect(null);
      return;
    }
    const target = TAB_PATH[step.tab];
    if (pathname !== target) return; // waiting on navigation from the effect above

    triesRef.current = 0;
    setRect(null);
    fade.setValue(0);
    measureTarget(step.targetId, setRect, triesRef, screenW, screenH);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex, pathname, readyToShow]);

  useEffect(() => {
    if (rect) {
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }
  }, [rect, fade]);

  if (!active || !step || step.embeddedTarget || !readyToShow) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={skip}>
      <Animated.View style={[styles.root, { opacity: rect ? fade : 0 }]}>
        {rect && <SpotlightMask rect={rect} screenW={screenW} screenH={screenH} isDark={isDark} />}
        {tabRect && <TabHighlightRing rect={tabRect} />}
        {rect && (
          <Callout
            key={step.id}
            step={step}
            stepIndex={stepIndex}
            total={steps.length}
            rect={rect}
            screenW={screenW}
            screenH={screenH}
            isDark={isDark}
            onNext={next}
            onPrev={prev}
            onSkip={skip}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

/**
 * `blockTouches` — when the mask is drawn inside TourOverlay's own Modal
 * there's nothing beneath it in that native window, so touches passing
 * through are harmless. When it's drawn embedded inside another screen's
 * real Modal (see `useTourTargetRect`/`embeddedTarget`), the real UI is
 * sitting right behind it and would otherwise still be tappable, so this
 * makes the dimmed area swallow touches. The hole itself is deliberately
 * left interactive either way, so the exact thing being spotlighted stays
 * usable.
 */
export function SpotlightMask({
  rect,
  screenW,
  screenH,
  isDark,
  blockTouches = false,
}: {
  rect: Rect;
  screenW: number;
  screenH: number;
  isDark: boolean;
  blockTouches?: boolean;
}) {
  const hole = {
    x: Math.max(0, rect.x - HOLE_PADDING),
    y: Math.max(0, rect.y - HOLE_PADDING),
    width: rect.width + HOLE_PADDING * 2,
    height: rect.height + HOLE_PADDING * 2,
  };
  const dim = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.68)';
  const accent = '#4ECDC4';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={blockTouches ? 'auto' : 'none'}>
      <View style={[styles.dim, { top: 0, left: 0, right: 0, height: Math.max(0, hole.y), backgroundColor: dim }]} />
      <View
        style={[
          styles.dim,
          { top: hole.y + hole.height, left: 0, right: 0, bottom: 0, backgroundColor: dim },
        ]}
      />
      <View
        style={[
          styles.dim,
          { top: hole.y, left: 0, width: Math.max(0, hole.x), height: hole.height, backgroundColor: dim },
        ]}
      />
      <View
        style={[
          styles.dim,
          {
            top: hole.y,
            left: hole.x + hole.width,
            right: 0,
            height: hole.height,
            backgroundColor: dim,
          },
        ]}
      />
      <View
        style={[
          styles.ring,
          {
            top: hole.y,
            left: hole.x,
            width: hole.width,
            height: hole.height,
            borderRadius: Math.min(20, hole.height / 2),
            borderColor: accent,
          },
        ]}
      />
    </View>
  );
}

const TAB_RING_PADDING = 8;

/**
 * A lightweight secondary highlight around the tab icon for whichever
 * screen the current step lives on. Deliberately just an outline — the tab
 * bar already sits behind SpotlightMask's dimming, so this doesn't need to
 * punch its own hole, just frame the icon clearly.
 */
export function TabHighlightRing({ rect }: { rect: Rect }) {
  const accent = '#4ECDC4';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: rect.y - TAB_RING_PADDING,
        left: rect.x - TAB_RING_PADDING,
        width: rect.width + TAB_RING_PADDING * 2,
        height: rect.height + TAB_RING_PADDING * 2,
        borderRadius: 10,
        borderWidth: 2,
        borderColor: accent,
      }}
    />
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Reserves room below the hole for the tab bar (its exact height isn't
// known here — this is a deliberately generous fixed buffer on top of the
// safe-area bottom inset).
const BOTTOM_CHROME_RESERVE = 66;
const EDGE_MARGIN = 12;

export function Callout({
  step,
  stepIndex,
  total,
  rect,
  screenW,
  screenH,
  isDark,
  onNext,
  onPrev,
  onSkip,
}: {
  step: TourStep;
  stepIndex: number;
  total: number;
  rect: Rect;
  screenW: number;
  screenH: number;
  isDark: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bg = isDark ? '#1E2022' : '#fff';
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor = isDark ? '#9BA1A6' : '#687076';
  const accent = '#4ECDC4';

  // Height isn't known until the bubble itself has laid out (the text can
  // wrap to any number of lines), so the first render is measured
  // off-screen and invisible, then repositioned once we know it.
  const [bubbleHeight, setBubbleHeight] = useState<number | null>(null);
  const onBubbleLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setBubbleHeight(prev => (prev === h ? prev : h));
  };

  const BUBBLE_W = Math.min(320, screenW - 32);
  const hole = {
    x: Math.max(0, rect.x - HOLE_PADDING),
    y: Math.max(0, rect.y - HOLE_PADDING),
    width: rect.width + HOLE_PADDING * 2,
    height: rect.height + HOLE_PADDING * 2,
  };
  const holeCenterX = hole.x + hole.width / 2;
  const holeBottom = hole.y + hole.height;
  const minTop = insets.top + EDGE_MARGIN;
  const maxBottomEdge = screenH - insets.bottom - BOTTOM_CHROME_RESERVE;
  const spaceBelow = maxBottomEdge - holeBottom;
  const spaceAbove = hole.y - minTop;
  const placeBelow = spaceBelow >= 180 || spaceBelow >= spaceAbove;

  const bubbleLeft = clamp(holeCenterX - BUBBLE_W / 2, EDGE_MARGIN, Math.max(EDGE_MARGIN, screenW - EDGE_MARGIN - BUBBLE_W));

  const measured = bubbleHeight !== null;
  const h = bubbleHeight ?? 0;
  const idealTop = placeBelow ? holeBottom + GAP : hole.y - GAP - h;

  // Clamp toward the safe-area edges when there's room, but never let the
  // bubble's position cross into the hole's own vertical span. The old clamp
  // bounded finalTop against the screen edges only, with no idea where the
  // hole actually was — for a tall target with a long body (like this step),
  // that could walk the bubble straight down over the exact content it's
  // meant to explain. Better to slightly crowd a screen edge than hide the
  // thing being pointed at.
  const finalTop = !measured
    ? idealTop
    : placeBelow
      ? Math.max(holeBottom + GAP, Math.min(idealTop, maxBottomEdge - h))
      : Math.min(hole.y - GAP - h, Math.max(idealTop, minTop));

  // Only draw the little arrow tail when the bubble actually landed where
  // it was aimed — once clamping kicks in (e.g. the spotlighted element is
  // large and leaves no room), the bubble floats as a plain card instead of
  // pretending to point at something it no longer sits next to.
  const showArrow = measured && Math.abs(finalTop - idealTop) < 2;
  const arrowTop = placeBelow ? holeBottom + GAP / 2 - ARROW_SIZE / 2 : hole.y - GAP / 2 - ARROW_SIZE / 2;
  const arrowLeft = clamp(holeCenterX - ARROW_SIZE / 2, bubbleLeft + 16, bubbleLeft + BUBBLE_W - 16 - ARROW_SIZE);

  return (
    <>
      {showArrow && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: arrowTop,
            left: arrowLeft,
            width: ARROW_SIZE,
            height: ARROW_SIZE,
            backgroundColor: bg,
            transform: [{ rotate: '45deg' }],
          }}
        />
      )}
      <View
        onLayout={onBubbleLayout}
        style={[
          styles.bubble,
          {
            left: bubbleLeft,
            width: BUBBLE_W,
            top: finalTop,
            backgroundColor: bg,
            opacity: measured ? 1 : 0,
          },
        ]}
      >
        <View style={styles.bubbleHeader}>
          <Text style={[styles.stepCounter, { color: subColor }]}>
            {stepIndex + 1} of {total}
          </Text>
          <TouchableOpacity onPress={onSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.skipText, { color: subColor }]}>Skip</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.title, { color: textColor }]}>{step.title}</Text>
        <Text style={[styles.body, { color: subColor }]}>{step.body}</Text>
        <View style={styles.buttonRow}>
          {stepIndex > 0 ? (
            <TouchableOpacity onPress={onPrev} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.backText, { color: subColor }]}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View />
          )}
          <TouchableOpacity onPress={onNext} style={[styles.nextBtn, { backgroundColor: accent }]}>
            <Text style={styles.nextText}>{stepIndex + 1 === total ? 'Done' : 'Next'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  dim: {
    position: 'absolute',
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
  },
  bubble: {
    position: 'absolute',
    borderRadius: 16,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  bubbleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepCounter: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  skipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
  nextBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginLeft: 'auto',
  },
  nextText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
});
