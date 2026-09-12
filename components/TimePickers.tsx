/**
 * Shared picker components used by AddPlanEntryModal, EditPlanEntryModal,
 * and EditStopwatchStartModal.
 *
 * ClockPicker     — HH:MM drum-roll (circular, scrollable + tappable + keyboard).
 *                   Tapping either center wheel opens a combined HHMM keyboard edit:
 *                   digits barrel-shift from right, so typing 1·4·3·0 → 14:30.
 *                   Optionally shows a day-offset column.
 * ValueStepper    — % selector with direct TextInput for the percentage.
 * TimelineSummary — Start → Peak → End timeline strip.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { StopwatchType } from '@/types/models';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function pad2(n: number) { return n.toString().padStart(2, '0'); }
export function clampH(h: number) { return ((h % 24) + 24) % 24; }
export function clampM(m: number) { return ((m % 60) + 60) % 60; }
export function fmtClock(ms: number) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function toAbsMs(now: number, hour: number, minute: number): number {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Wheel constants
// ---------------------------------------------------------------------------

const ITEM_H  = 44;   // row height in px
const VISIBLE = 3;    // number of visible rows (selected is in the middle)
const REPEAT  = 3;    // how many times to repeat for circular illusion

const HOURS   = Array.from({ length: 24 }, (_, i) => pad2(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad2(i));

function makeExt(items: string[]): string[] {
  return Array.from({ length: items.length * REPEAT }, (_, i) => items[i % items.length]);
}

const EXT_HOURS   = makeExt(HOURS);
const EXT_MINUTES = makeExt(MINUTES);

// ---------------------------------------------------------------------------
// WheelPicker — single scrollable column
// ---------------------------------------------------------------------------

interface WheelPickerProps {
  /** Original (non-extended) item labels */
  items: string[];
  /** Extended item list (for circular use makeExt; for finite pass same as items) */
  extItems: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  isDark: boolean;
  /** Whether to use wrap-around distance for opacity calculation */
  circular?: boolean;
  /** Called when the currently-selected (center) item is tapped */
  onCenterTap?: () => void;
  width?: number;
  /** Font size for the selected (center) item. Default 34. */
  selectedFontSize?: number;
  /** Font size for non-selected items. Default 22. */
  otherFontSize?: number;
}

function WheelPicker({
  items,
  extItems,
  selectedIndex,
  onChange,
  isDark,
  circular = false,
  onCenterTap,
  width = 76,
  selectedFontSize = 34,
  otherFontSize = 22,
}: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null);
  const n         = items.length;

  function extIdx(logicalIdx: number): number {
    return circular ? Math.floor(REPEAT / 2) * n + logicalIdx : logicalIdx;
  }

  const [localIndex, setLocalIndex] = useState(selectedIndex);
  // Ref so the sync effect can cancel the mount timer before it fires
  const initTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const selBg     = isDark ? '#2A2D2F' : '#F0F0F2';
  const selBorder = isDark ? '#3A3D3F' : '#C7C7CC';

  // Scroll to initial position on mount — deferred 60ms so the ScrollView has measured
  useEffect(() => {
    initTimerRef.current = setTimeout(() => {
      initTimerRef.current = null;
      scrollRef.current?.scrollTo({ y: extIdx(selectedIndex) * ITEM_H, animated: false });
    }, 60);
    return () => {
      if (initTimerRef.current !== null) clearTimeout(initTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync from parent when selectedIndex changes externally
  useEffect(() => {
    if (selectedIndex !== localIndex) {
      setLocalIndex(selectedIndex);
      // If the mount timer hasn't fired yet, cancel it and jump without animation
      // (this IS the initial position — animating from 0 would look wrong)
      if (initTimerRef.current !== null) {
        clearTimeout(initTimerRef.current);
        initTimerRef.current = null;
        scrollRef.current?.scrollTo({ y: extIdx(selectedIndex) * ITEM_H, animated: false });
      } else {
        scrollRef.current?.scrollTo({ y: extIdx(selectedIndex) * ITEM_H, animated: true });
      }
    }
  }, [selectedIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleScrollEnd(e: any) {
    const y      = e.nativeEvent.contentOffset.y;
    const rawIdx = Math.max(0, Math.min(extItems.length - 1, Math.round(y / ITEM_H)));
    const actual = circular ? rawIdx % n : rawIdx;
    setLocalIndex(actual);
    onChange(actual);
  }

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, position: 'relative' }}>
      {/* Selection highlight */}
      <View
        pointerEvents="none"
        style={[
          wheelSt.selBox,
          { top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H, backgroundColor: selBg, borderColor: selBorder },
        ]}
      />

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScrollEnd}
        contentContainerStyle={{ paddingVertical: ITEM_H * Math.floor(VISIBLE / 2) }}
        style={{ flex: 1 }}
      >
        {extItems.map((item, i) => {
          const actualI  = circular ? i % n : i;
          const dist     = Math.abs(actualI - localIndex);
          const wrapDist = circular ? Math.min(dist, n - dist) : dist;
          const opacity  = wrapDist === 0 ? 1 : wrapDist === 1 ? 0.45 : 0.2;
          const fontSize = wrapDist === 0 ? selectedFontSize : otherFontSize;
          const isCenter = wrapDist === 0;

          return (
            <TouchableOpacity
              key={i}
              style={wheelSt.item}
              onPress={() => {
                if (isCenter && onCenterTap) {
                  onCenterTap();
                } else {
                  scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
                  setLocalIndex(actualI);
                  onChange(actualI);
                }
              }}
              activeOpacity={0.6}
            >
              <Text
                style={{
                  color: isCenter ? textColor : subColor,
                  opacity,
                  fontSize,
                  fontWeight: '300',
                  fontVariant: ['tabular-nums'],
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const wheelSt = StyleSheet.create({
  selBox: {
    position: 'absolute',
    left: 4,
    right: 4,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 0,
  },
  item: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});

// ---------------------------------------------------------------------------
// Day column helpers
// ---------------------------------------------------------------------------

function makeDayItems(range: number): string[] {
  const items: string[] = [];
  for (let d = -range; d <= range; d++) {
    if (d === 0)       items.push('Today');
    else if (d === 1)  items.push('+1d');
    else if (d === -1) items.push('−1d');
    else if (d > 0)    items.push(`+${d}d`);
    else               items.push(`${d}d`);
  }
  return items;
}

// ---------------------------------------------------------------------------
// ClockPicker
// ---------------------------------------------------------------------------

export interface ClockPickerHandle {
  /** Returns the hour currently shown (including any uncommitted keyboard input). */
  getHour: () => number;
  /** Returns the minute currently shown (including any uncommitted keyboard input). */
  getMinute: () => number;
}

interface ClockPickerProps {
  hour: number;
  minute: number;
  isDark: boolean;
  label: string;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
  /** If provided, a day-offset column is shown to the left of hours */
  dayOffset?: number;
  onDayOffset?: (d: number) => void;
  /** Half-range for day column (default 3 → shows −3d … Today … +3d) */
  dayRange?: number;
}

export const ClockPicker = forwardRef<ClockPickerHandle, ClockPickerProps>(function ClockPicker({
  hour,
  minute,
  isDark,
  label,
  onHour,
  onMinute,
  dayOffset,
  onDayOffset,
  dayRange = 3,
}, ref) {
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const selBg     = isDark ? '#2A2D2F' : '#F0F0F2';
  const selBorder = isDark ? '#3A3D3F' : '#C7C7CC';

  const showDay   = dayOffset !== undefined && onDayOffset !== undefined;
  const dayItems  = showDay ? makeDayItems(dayRange) : [];
  const daySelIdx = showDay ? (dayOffset! + dayRange) : 0;

  // ── HHMM keyboard editing ────────────────────────────────────────────────
  // digits = [H_tens, H_ones, M_tens, M_ones]
  // Each keypress barrel-shifts from the right: [d1, d2, d3, newKey]
  // So typing 1·4·3·0 builds 14:30.
  const [hhmmEditing, setHhmmEditing] = useState(false);
  const [digits, setDigits]           = useState<[string, string, string, string]>(['0', '0', '0', '0']);
  const hiddenInputRef                = useRef<TextInput>(null);

  function startHhmmEdit() {
    setDigits([
      Math.floor(hour / 10).toString(),
      (hour % 10).toString(),
      Math.floor(minute / 10).toString(),
      (minute % 10).toString(),
    ]);
    setHhmmEditing(true);
    setTimeout(() => hiddenInputRef.current?.focus(), 30);
  }

  function handleHhmmKeyPress({ nativeEvent: { key } }: any) {
    if (/^[0-9]$/.test(key)) {
      // Shift left, new digit enters from the right
      setDigits(([d0, d1, d2, _d3]) => [d1, d2, _d3, key]);
    }
  }

  function commitHhmm() {
    const [d0, d1, d2, d3] = digits;
    const h = parseInt(d0 + d1, 10);
    const m = parseInt(d2 + d3, 10);
    if (!isNaN(h)) onHour(Math.min(h, 23));
    if (!isNaN(m)) onMinute(Math.min(m, 59));
    setHhmmEditing(false);
  }

  // ── Imperative handle — lets modals read the pending value at save time ──
  useImperativeHandle(ref, () => ({
    getHour: () => {
      if (hhmmEditing) {
        const h = parseInt(digits[0] + digits[1], 10);
        return isNaN(h) ? hour : Math.min(h, 23);
      }
      return hour;
    },
    getMinute: () => {
      if (hhmmEditing) {
        const m = parseInt(digits[2] + digits[3], 10);
        return isNaN(m) ? minute : Math.min(m, 59);
      }
      return minute;
    },
  }), [hhmmEditing, digits, hour, minute]);

  return (
    <View style={styles.clockPicker}>
      <Text style={[styles.pickerLabel, { color: subColor }]}>{label}</Text>
      <View style={styles.pickerRow}>

        {/* Day column (optional) */}
        {showDay && (
          <>
            <WheelPicker
              items={dayItems}
              extItems={dayItems}
              selectedIndex={daySelIdx}
              onChange={idx => onDayOffset!(idx - dayRange)}
              isDark={isDark}
              circular={false}
              width={72}
              selectedFontSize={18}
              otherFontSize={13}
            />
            <Text style={[styles.pickerSep, { color: textColor }]}> </Text>
          </>
        )}

        {/* HH:MM block — the two wheels, overlaid by HHMM edit when active */}
        <View>
          {/* Wheels — hidden (but still rendered so positions are maintained) */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: hhmmEditing ? 0 : 1 }}
            pointerEvents={hhmmEditing ? 'none' : 'auto'}
          >
            <WheelPicker
              items={HOURS}
              extItems={EXT_HOURS}
              selectedIndex={hour}
              onChange={onHour}
              isDark={isDark}
              circular
              onCenterTap={startHhmmEdit}
              width={76}
            />
            <Text style={[styles.pickerColon, { color: textColor }]}>:</Text>
            <WheelPicker
              items={MINUTES}
              extItems={EXT_MINUTES}
              selectedIndex={minute}
              onChange={onMinute}
              isDark={isDark}
              circular
              onCenterTap={startHhmmEdit}
              width={76}
            />
          </View>

          {/* HHMM keyboard overlay — absolutely fills the HH:MM block */}
          {hhmmEditing && (
            <View
              style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
            >
              {/* Center-row highlight (mirrors the WheelPicker selBox) */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 4, right: 4,
                  top: ITEM_H * Math.floor(VISIBLE / 2),
                  height: ITEM_H,
                  backgroundColor: selBg,
                  borderColor: selBorder,
                  borderWidth: 1,
                  borderRadius: 10,
                }}
              />

              {/* Four-digit display */}
              <Text style={[styles.hhmmDisplay, { color: textColor }]}>
                {digits[0]}{digits[1]}:{digits[2]}{digits[3]}
              </Text>

              {/* Hidden TextInput that captures keyboard input */}
              <TextInput
                ref={hiddenInputRef}
                style={wheelSt.hiddenInput}
                value=""
                onChangeText={() => {}}
                onKeyPress={handleHhmmKeyPress}
                onBlur={commitHhmm}
                onSubmitEditing={commitHhmm}
                keyboardType="number-pad"
                caretHidden
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// DurationPicker — H:MM drum for editing a phase duration (non-circular
// hours, circular minutes). Same tap-to-type keyboard override as ClockPicker,
// but commits a duration in ms rather than a wall-clock time.
// ---------------------------------------------------------------------------

export interface DurationPickerHandle {
  /** Returns the duration (ms) currently shown, including any uncommitted keyboard input. */
  getMs: () => number;
}

interface DurationPickerProps {
  /** Duration in ms */
  ms: number;
  isDark: boolean;
  label: string;
  onChange: (ms: number) => void;
  /** Max selectable hours. Default 23. */
  maxHours?: number;
}

export const DurationPicker = forwardRef<DurationPickerHandle, DurationPickerProps>(function DurationPicker({
  ms,
  isDark,
  label,
  onChange,
  maxHours = 23,
}, ref) {
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const selBg     = isDark ? '#2A2D2F' : '#F0F0F2';
  const selBorder = isDark ? '#3A3D3F' : '#C7C7CC';

  const totalMin = Math.max(1, Math.round(ms / 60_000));
  const hour     = Math.min(maxHours, Math.floor(totalMin / 60));
  const minute   = totalMin % 60;

  const hourItems = Array.from({ length: maxHours + 1 }, (_, i) => pad2(i));

  function commitHourMinute(h: number, m: number) {
    onChange(Math.max(60_000, (h * 60 + m) * 60_000));
  }

  // ── HHMM keyboard editing — same barrel-digit pattern as ClockPicker ────
  const [editing, setEditing] = useState(false);
  const [digits, setDigits]   = useState<[string, string, string, string]>(['0', '0', '0', '0']);
  const hiddenInputRef        = useRef<TextInput>(null);

  function startEdit() {
    setDigits([
      Math.floor(hour / 10).toString(),
      (hour % 10).toString(),
      Math.floor(minute / 10).toString(),
      (minute % 10).toString(),
    ]);
    setEditing(true);
    setTimeout(() => hiddenInputRef.current?.focus(), 30);
  }

  function handleKeyPress({ nativeEvent: { key } }: any) {
    if (/^[0-9]$/.test(key)) {
      setDigits(([d0, d1, d2, _d3]) => [d1, d2, _d3, key]);
    }
  }

  function commitEdit() {
    const [d0, d1, d2, d3] = digits;
    const h = Math.min(maxHours, parseInt(d0 + d1, 10) || 0);
    const m = Math.min(59, parseInt(d2 + d3, 10) || 0);
    commitHourMinute(h, m);
    setEditing(false);
  }

  useImperativeHandle(ref, () => ({
    getMs: () => {
      if (editing) {
        const h = Math.min(maxHours, parseInt(digits[0] + digits[1], 10) || 0);
        const m = Math.min(59, parseInt(digits[2] + digits[3], 10) || 0);
        return Math.max(60_000, (h * 60 + m) * 60_000);
      }
      return ms;
    },
  }), [editing, digits, ms, maxHours]);

  return (
    <View style={styles.clockPicker}>
      <Text style={[styles.pickerLabel, { color: subColor }]}>{label}</Text>
      <View>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: editing ? 0 : 1 }}
          pointerEvents={editing ? 'none' : 'auto'}
        >
          <View style={{ alignItems: 'center' }}>
            <WheelPicker
              items={hourItems}
              extItems={hourItems}
              selectedIndex={hour}
              onChange={h => commitHourMinute(h, minute)}
              isDark={isDark}
              circular={false}
              onCenterTap={startEdit}
              width={76}
            />
            <Text style={[styles.durUnit, { color: subColor }]}>HRS</Text>
          </View>
          <Text style={[styles.pickerColon, { color: textColor }]}>:</Text>
          <View style={{ alignItems: 'center' }}>
            <WheelPicker
              items={MINUTES}
              extItems={EXT_MINUTES}
              selectedIndex={minute}
              onChange={m => commitHourMinute(hour, m)}
              isDark={isDark}
              circular
              onCenterTap={startEdit}
              width={76}
            />
            <Text style={[styles.durUnit, { color: subColor }]}>MIN</Text>
          </View>
        </View>

        {editing && (
          <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 4, right: 4,
                top: ITEM_H * Math.floor(VISIBLE / 2),
                height: ITEM_H,
                backgroundColor: selBg,
                borderColor: selBorder,
                borderWidth: 1,
                borderRadius: 10,
              }}
            />
            <Text style={[styles.hhmmDisplay, { color: textColor }]}>
              {digits[0]}{digits[1]}:{digits[2]}{digits[3]}
            </Text>
            <TextInput
              ref={hiddenInputRef}
              style={wheelSt.hiddenInput}
              value=""
              onChangeText={() => {}}
              onKeyPress={handleKeyPress}
              onBlur={commitEdit}
              onSubmitEditing={commitEdit}
              keyboardType="number-pad"
              caretHidden
            />
          </View>
        )}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// ValueStepper
// ---------------------------------------------------------------------------

interface ValueStepperProps {
  value: number;
  max: number;
  isDark: boolean;
  onChange: (v: number) => void;
}

export function ValueStepper({ value, max, isDark, onChange }: ValueStepperProps) {
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const btnBg     = isDark ? '#2A2D2F' : '#E5E5EA';
  const inputBg   = isDark ? '#2A2D2F' : '#F0F0F2';

  const toPct = (v: number) => Math.round((v / max) * 100);
  const [pctStr, setPctStr] = useState(toPct(value).toString());

  useEffect(() => setPctStr(toPct(value).toString()), [value, max]);

  function commitPct(str: string) {
    const n = parseInt(str, 10);
    if (!isNaN(n)) {
      const clamped = Math.max(1, Math.min(99, n));
      onChange((clamped / 100) * max);
      setPctStr(clamped.toString());
    } else {
      setPctStr(toPct(value).toString());
    }
  }

  function clampV(v: number) {
    const step = max / 100;
    return Math.max(step, Math.min(max - step, v));
  }

  return (
    <View style={styles.valueStepper}>
      <Text style={[styles.pickerLabel, { color: subColor }]}>Value at that time</Text>
      <View style={styles.valueRow}>
        {[-20, -5, -1].map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.pickerBtn, styles.valueBtn, { backgroundColor: btnBg }]}
            onPress={() => onChange(clampV(value + d * (max / 100)))}
          >
            <Text style={[styles.valueBtnText, { color: textColor }]}>{d}%</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.valueInputBlock}>
          <TextInput
            style={[styles.valueInput, { color: textColor, backgroundColor: inputBg }]}
            value={pctStr}
            onChangeText={setPctStr}
            onEndEditing={() => commitPct(pctStr)}
            onSubmitEditing={() => commitPct(pctStr)}
            keyboardType="number-pad"
            maxLength={3}
            selectTextOnFocus
            textAlign="center"
          />
          <Text style={[styles.valuePctSign, { color: subColor }]}>%</Text>
        </View>

        {[1, 5, 20].map(d => (
          <TouchableOpacity
            key={d}
            style={[styles.pickerBtn, styles.valueBtn, { backgroundColor: btnBg }]}
            onPress={() => onChange(clampV(value + d * (max / 100)))}
          >
            <Text style={[styles.valueBtnText, { color: textColor }]}>+{d}%</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TimelineSummary
// ---------------------------------------------------------------------------

interface TimelineSummaryProps {
  type: StopwatchType;
  startMs: number;
  isDark: boolean;
}

export function TimelineSummary({ type, startMs, isDark }: TimelineSummaryProps) {
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const pts = [
    { label: 'Start', ms: startMs },
    { label: 'Peak',  ms: startMs + type.onsetDuration + type.comeupDuration },
    { label: 'End',   ms: startMs + type.onsetDuration + type.comeupDuration + type.peakDuration + type.offsetDuration },
  ];
  return (
    <View style={styles.timeline}>
      {pts.map((pt, i) => (
        <React.Fragment key={i}>
          <View style={styles.tlItem}>
            <View style={[styles.tlDot, { backgroundColor: i === 1 ? type.color : subColor }]} />
            <Text style={[styles.tlTime, { color: textColor }]}>{fmtClock(pt.ms)}</Text>
            <Text style={[styles.tlLabel, { color: subColor }]}>{pt.label}</Text>
          </View>
          {i < pts.length - 1 && <View style={[styles.tlLine, { backgroundColor: subColor }]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

export const pickerStyles = StyleSheet.create({
  clockPicker: { gap: 10 },
  pickerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  pickerColon: { fontSize: 34, fontWeight: '200', lineHeight: 44, marginBottom: 2 },
  pickerSep:   { fontSize: 20, fontWeight: '200', opacity: 0.3 },
  durUnit:     { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  hhmmDisplay: {
    fontSize: 34,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    letterSpacing: 3,
  },
  valueStepper: { gap: 8 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  valueBtn: { minWidth: 44 },
  valueBtnText: { fontSize: 11, fontWeight: '600' },
  valueInputBlock: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  valueInput: {
    fontSize: 28,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  valuePctSign: { fontSize: 20, fontWeight: '400' },
  pickerBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, alignItems: 'center', minWidth: 36 },
  timeline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  tlItem: { alignItems: 'center', gap: 2, minWidth: 60 },
  tlDot: { width: 8, height: 8, borderRadius: 4 },
  tlTime: { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  tlLabel: { fontSize: 10, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },
  tlLine: { flex: 1, height: 1.5, opacity: 0.25, marginBottom: 14 },
});

const styles = pickerStyles;
export default styles;
