/**
 * SubstanceDurationEditorModal
 *
 * Lets a user edit a built-in/substance type's phase durations (onset,
 * comeup, peak, offset) in place, using wheel/drum pickers — never a name
 * change, and never for custom (already fully-editable) types. Reached from
 * the same TypeCard row that also offers "Customize" (duplicate into a new
 * custom copy); this modal edits the substance itself.
 *
 * Persistence: saving dispatches through StopwatchContext's
 * setSubstanceDurations, which both updates the live type and records a
 * durationOverride that survives the app's usual "re-source built-ins from
 * the bundle on every launch" hydration step. "Reset to default timing"
 * clears that override.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { evaluate, formatDuration, totalDuration } from '@/engine/curveEngine';
import { DurationPicker } from '@/components/TimePickers';
import type { DurationOverride } from '@/store/StopwatchContext';
import type { StopwatchType } from '@/types/models';

// ---------------------------------------------------------------------------
// Mini preview curve (mirrors TypeEditorModal's PreviewCurve)
// ---------------------------------------------------------------------------

function PreviewCurve({ type, isDark }: { type: StopwatchType; isDark: boolean }) {
  const W = 280;
  const H = 80;
  const PAD = 6;

  const d = useMemo(() => {
    const total = totalDuration(type);
    if (total <= 0) return '';
    const steps = 100;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * total;
      const v = evaluate(type, t);
      const x = PAD + (i / steps) * (W - PAD * 2);
      const y = H - PAD - (v / (type.peakValue || 1)) * (H - PAD * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [type]);

  const lineColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  return (
    <Svg width={W} height={H} style={styles.previewSvg}>
      <Line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={lineColor} strokeWidth={1} />
      <Line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={lineColor} strokeWidth={1} />
      {d ? <Path d={d} stroke={type.color} strokeWidth={2.5} fill="none" /> : null}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  type: StopwatchType | null;
  hasOverride: boolean;
  onSave: (durations: DurationOverride) => void;
  onReset: () => void;
  onClose: () => void;
  isDark: boolean;
}

export function SubstanceDurationEditorModal({ visible, type, hasOverride, onSave, onReset, onClose, isDark }: Props) {
  const [onset, setOnset]   = useState(15 * 60_000);
  const [comeup, setComeup] = useState(30 * 60_000);
  const [peak, setPeak]     = useState(60 * 60_000);
  const [offset, setOffset] = useState(90 * 60_000);

  useEffect(() => {
    if (type) {
      setOnset(type.onsetDuration);
      setComeup(type.comeupDuration);
      setPeak(type.peakDuration);
      setOffset(type.offsetDuration);
    }
  }, [type, visible]);

  const previewType: StopwatchType | null = useMemo(() => {
    if (!type) return null;
    return { ...type, onsetDuration: onset, comeupDuration: comeup, peakDuration: peak, offsetDuration: offset };
  }, [type, onset, comeup, peak, offset]);

  function handleSave() {
    onSave({ onsetDuration: onset, comeupDuration: comeup, peakDuration: peak, offsetDuration: offset });
    onClose();
  }

  function handleReset() {
    onReset();
    onClose();
  }

  if (!type) return null;

  const bgColor       = isDark ? '#111' : '#fff';
  const textColor      = isDark ? '#ECEDEE' : '#11181C';
  const subColor       = isDark ? '#9BA1A6' : '#687076';
  const handleColor    = isDark ? '#444' : '#DDD';
  const sectionBg       = isDark ? '#18191B' : '#F8F8FA';
  const sectionBorder   = isDark ? '#2A2D2F' : '#E5E5EA';

  const total = onset + comeup + peak + offset;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kavContainer}
      >
        <View style={[styles.sheet, { backgroundColor: bgColor }]}>
          <View style={[styles.handle, { backgroundColor: handleColor }]} />

          <View style={styles.header}>
            <TouchableOpacity onPress={onClose}>
              <Text style={[styles.headerBtn, { color: subColor }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
              Edit Durations
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[styles.headerBtn, { color: type.color, fontWeight: '700' }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            {/* Name (read-only) */}
            <View style={styles.nameRow}>
              <View style={[styles.dot, { backgroundColor: type.color }]} />
              <Text style={[styles.name, { color: textColor }]}>{type.name}</Text>
            </View>
            <Text style={[styles.hint, { color: subColor }]}>
              Only the timing of each phase can be changed here. Total: {formatDuration(total)}
            </Text>

            {/* Preview */}
            {previewType && (
              <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
                <PreviewCurve type={previewType} isDark={isDark} />
              </View>
            )}

            {/* Durations */}
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <DurationPicker label="ONSET" ms={onset} onChange={setOnset} isDark={isDark} />
            </View>
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <DurationPicker label="COMEUP" ms={comeup} onChange={setComeup} isDark={isDark} />
            </View>
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <DurationPicker label="PEAK" ms={peak} onChange={setPeak} isDark={isDark} />
            </View>
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <DurationPicker label="OFFSET" ms={offset} onChange={setOffset} isDark={isDark} />
            </View>

            {hasOverride && (
              <TouchableOpacity style={styles.resetBtn} onPress={handleReset} activeOpacity={0.7}>
                <Text style={[styles.resetText, { color: subColor }]}>Reset to default timing</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  kavContainer: {
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  headerBtn: {
    fontSize: 16,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  previewSvg: {
    alignSelf: 'center',
  },
  section: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
    alignItems: 'center',
  },
  resetBtn: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  resetText: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
