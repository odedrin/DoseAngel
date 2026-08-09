/**
 * Easing curve shapes for each phase of a stopwatch type.
 * linear   — constant rate of change
 * easeIn   — starts slow, accelerates
 * easeOut  — starts fast, decelerates
 * sigmoid  — slow → fast → slow (S-curve)
 */
export type CurveShape = 'linear' | 'easeIn' | 'easeOut' | 'sigmoid';

/**
 * Defines a stopwatch "type" — the shape of f_d(t).
 *
 * The function is piecewise over four phases:
 *   Onset:   0          → onsetEndFraction * peakValue   (duration: onsetDuration)
 *   Comeup:  above      → peakValue                      (duration: comeupDuration)
 *   Peak:    constant at peakValue                        (duration: peakDuration)
 *   Offset:  peakValue  → 0                              (duration: offsetDuration)
 *
 * All durations are in milliseconds.
 */
export interface StopwatchType {
  id: string;
  name: string;
  /** Hex color used for this type's curve and UI accents */
  color: string;

  /** Onset phase duration in ms (0 → onsetEndFraction * peakValue) */
  onsetDuration: number;
  /** Comeup phase duration in ms (→ peakValue) */
  comeupDuration: number;
  /** Peak phase duration in ms (constant at peakValue) */
  peakDuration: number;
  /** Offset phase duration in ms (peakValue → 0) */
  offsetDuration: number;

  /** Maximum amplitude */
  peakValue: number;
  /**
   * Fraction of peakValue that onset reaches at the onset/comeup boundary.
   * Typical range 0.15–0.45.
   */
  onsetEndFraction: number;

  onsetShape: CurveShape;
  comeupShape: CurveShape;
  offsetShape: CurveShape;

  /** Built-in types cannot be deleted */
  isBuiltIn?: boolean;
  /**
   * Substance types come from the bundled harm-reduction database.
   * They cannot be deleted or renamed, but their phase durations can be edited
   * in place (see StopwatchContext's durationOverrides), and they can be
   * duplicated into an independent custom type. Implies isBuiltIn = true for
   * all UI purposes.
   */
  isSubstance?: boolean;
  /**
   * When true, this type is hidden from its section in the Types screen and
   * shown instead in a collapsible "Hidden" section at the bottom. The type
   * remains fully functional — active stopwatches of this type keep running.
   */
  hidden?: boolean;
}

/**
 * A single running stopwatch instance.
 * Multiple instances of the same type can run simultaneously.
 */
export interface ActiveStopwatch {
  id: string;
  typeId: string;
  /** Unix timestamp (ms) when this stopwatch was started */
  startTime: number;
  /** Optional user label */
  label?: string;
  /**
   * If set, the stopwatch is currently paused.
   * Value is the wall-clock timestamp (ms) when it was paused.
   */
  pausedAt?: number;
  /**
   * Total milliseconds accumulated across all completed pause sessions.
   * Does not include the current ongoing pause (if any).
   */
  totalPausedMs?: number;
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/**
 * One hypothetical stopwatch inside a Plan.
 * targetTime is an absolute wall-clock timestamp (ms) for when this entry starts.
 * It can be set to any date/time — today, tomorrow, further ahead.
 */
export interface PlannedEntry {
  id: string;
  typeId: string;
  /** Absolute wall-clock start time in ms. */
  targetTime: number;
}

/**
 * A named set of PlannedEntries. Plans never start real stopwatches —
 * they only preview what the graph would look like.
 */
export interface Plan {
  id: string;
  name: string;
  entries: PlannedEntry[];
}
