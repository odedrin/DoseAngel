import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import { evaluate, totalDuration } from '@/engine/curveEngine';
import type { CurveShape, StopwatchType } from '@/types/models';
import { TYPE_COLORS } from '@/constants/defaultTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msToMin(ms: number): string {
  return String(Math.round(ms / 60_000));
}

function minToMs(s: string): number {
  const n = parseInt(s, 10);
  return isNaN(n) || n < 1 ? 60_000 : n * 60_000;
}

const SHAPES: CurveShape[] = ['linear', 'easeIn', 'easeOut', 'sigmoid'];
const SHAPE_LABELS: Record<CurveShape, string> = {
  linear: '─',
  easeIn: '↗',
  easeOut: '↘',
  sigmoid: '∫',
};

// ---------------------------------------------------------------------------
// Mini preview curve
// ---------------------------------------------------------------------------

function PreviewCurve({
  type,
  isDark,
}: {
  type: StopwatchType;
  isDark: boolean;
}) {
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
// Sub-components
// ---------------------------------------------------------------------------

function Stepper({
  label,
  value,
  unit,
  step,
  min,
  max,
  onChange,
  textColor,
  subColor,
}: {
  label: string;
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  textColor: string;
  subColor: string;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={[styles.stepperLabel, { color: subColor }]}>{label}</Text>
      <View style={styles.stepperControl}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChange(Math.max(min, value - step))}
        >
          <Text style={[styles.stepBtnText, { color: textColor }]}>−</Text>
        </TouchableOpacity>
        <Text style={[styles.stepperValue, { color: textColor }]}>
          {value}
          <Text style={[styles.stepperUnit, { color: subColor }]}> {unit}</Text>
        </Text>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChange(Math.min(max, value + step))}
        >
          <Text style={[styles.stepBtnText, { color: textColor }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ShapePicker({
  label,
  value,
  onChange,
  textColor,
  subColor,
  tint,
}: {
  label: string;
  value: CurveShape;
  onChange: (s: CurveShape) => void;
  textColor: string;
  subColor: string;
  tint: string;
}) {
  return (
    <View style={styles.shapePicker}>
      <Text style={[styles.stepperLabel, { color: subColor, flex: 1 }]}>{label}</Text>
      <View style={styles.shapeButtons}>
        {SHAPES.map(s => (
          <TouchableOpacity
            key={s}
            style={[
              styles.shapeBtn,
              value === s && { backgroundColor: tint },
            ]}
            onPress={() => onChange(s)}
          >
            <Text
              style={[
                styles.shapeBtnText,
                { color: value === s ? '#fff' : subColor },
              ]}
            >
              {SHAPE_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

interface Props {
  visible: boolean;
  initial?: StopwatchType | null;
  onSave: (type: Omit<StopwatchType, 'id'> | StopwatchType) => void;
  onClose: () => void;
  isDark: boolean;
  /** When true and `initial` is unset, this is a brand-new substance (not a generic custom type). Only affects header copy and default naming. */
  creatingSubstance?: boolean;
}

export function TypeEditorModal({ visible, initial, onSave, onClose, isDark, creatingSubstance = false }: Props) {
  const [name, setName] = useState('New Type');
  const [color, setColor] = useState(TYPE_COLORS[0]);
  const [onset, setOnset] = useState(15);       // minutes
  const [comeup, setComeup] = useState(30);
  const [peak, setPeak] = useState(60);
  const [offset, setOffset] = useState(90);
  const [peakValue, setPeakValue] = useState(7);
  const [onsetFrac, setOnsetFrac] = useState(25); // percent
  const [onsetShape, setOnsetShape] = useState<CurveShape>('easeIn');
  const [comeupShape, setComeupShape] = useState<CurveShape>('easeOut');
  const [offsetShape, setOffsetShape] = useState<CurveShape>('sigmoid');

  useEffect(() => {
    if (initial) {
      // When customising a built-in, suggest a new name so it's clear it's a copy
      setName(initial.isBuiltIn ? `${initial.name} (Custom)` : initial.name);
      setColor(initial.color);
      setOnset(Math.round(initial.onsetDuration / 60_000));
      setComeup(Math.round(initial.comeupDuration / 60_000));
      setPeak(Math.round(initial.peakDuration / 60_000));
      setOffset(Math.round(initial.offsetDuration / 60_000));
      setPeakValue(initial.peakValue);
      setOnsetFrac(Math.round(initial.onsetEndFraction * 100));
      setOnsetShape(initial.onsetShape);
      setComeupShape(initial.comeupShape);
      setOffsetShape(initial.offsetShape);
    } else if (visible) {
      // Fresh "create new" open — reset every field to sensible defaults so
      // leftover values from a previous edit/customize session don't linger.
      setName('');
      setColor(TYPE_COLORS[0]);
      setOnset(15);
      setComeup(30);
      setPeak(60);
      setOffset(90);
      setPeakValue(7);
      setOnsetFrac(25);
      setOnsetShape('easeIn');
      setComeupShape('easeOut');
      setOffsetShape('sigmoid');
    }
  }, [initial, visible]);

  const previewType: StopwatchType = useMemo(() => ({
    id: '__preview__',
    name,
    color,
    onsetDuration: onset * 60_000,
    comeupDuration: comeup * 60_000,
    peakDuration: peak * 60_000,
    offsetDuration: offset * 60_000,
    peakValue,
    onsetEndFraction: onsetFrac / 100,
    onsetShape,
    comeupShape,
    offsetShape,
  }), [name, color, onset, comeup, peak, offset, peakValue, onsetFrac, onsetShape, comeupShape, offsetShape]);

  function handleSave() {
    const base = {
      name: name.trim() || 'Unnamed',
      color,
      onsetDuration: onset * 60_000,
      comeupDuration: comeup * 60_000,
      peakDuration: peak * 60_000,
      offsetDuration: offset * 60_000,
      peakValue,
      onsetEndFraction: onsetFrac / 100,
      onsetShape,
      comeupShape,
      offsetShape,
    };
    if (initial && !initial.isBuiltIn) {
      // Editing an existing custom type — update it in place
      onSave({ ...base, id: initial.id });
    } else {
      // Creating new: either blank or customised from a built-in
      onSave(base);
    }
    onClose();
  }

  const bgColor = isDark ? '#111' : '#fff';
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor = isDark ? '#9BA1A6' : '#687076';
  const inputBg = isDark ? '#1E2022' : '#F0F0F2';
  const handleColor = isDark ? '#444' : '#DDD';
  const sectionBg = isDark ? '#18191B' : '#F8F8FA';
  const sectionBorder = isDark ? '#2A2D2F' : '#E5E5EA';

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
            <Text style={[styles.headerTitle, { color: textColor }]}>
              {!initial ? (creatingSubstance ? 'New Substance' : 'New Type') : initial.isBuiltIn ? 'Customize' : 'Edit Type'}
            </Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={[styles.headerBtn, { color: color, fontWeight: '700' }]}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            {/* Preview */}
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <PreviewCurve type={previewType} isDark={isDark} />
            </View>

            {/* Name */}
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <Text style={[styles.sectionTitle, { color: subColor }]}>NAME</Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: inputBg, color: textColor }]}
                value={name}
                onChangeText={setName}
                placeholder="Type name"
                placeholderTextColor={subColor}
                maxLength={30}
              />
            </View>

            {/* Color */}
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <Text style={[styles.sectionTitle, { color: subColor }]}>COLOR</Text>
              <View style={styles.colorGrid}>
                {TYPE_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: c },
                      color === c && styles.colorSwatchSelected,
                    ]}
                    onPress={() => setColor(c)}
                  />
                ))}
              </View>
            </View>

            {/* Durations */}
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <Text style={[styles.sectionTitle, { color: subColor }]}>DURATIONS</Text>
              <Stepper label="Onset" value={onset} unit="min" step={5} min={1} max={480} onChange={setOnset} textColor={textColor} subColor={subColor} />
              <Stepper label="Comeup" value={comeup} unit="min" step={5} min={1} max={480} onChange={setComeup} textColor={textColor} subColor={subColor} />
              <Stepper label="Peak" value={peak} unit="min" step={5} min={1} max={720} onChange={setPeak} textColor={textColor} subColor={subColor} />
              <Stepper label="Offset" value={offset} unit="min" step={5} min={1} max={720} onChange={setOffset} textColor={textColor} subColor={subColor} />
            </View>

            {/* Amplitude */}
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <Text style={[styles.sectionTitle, { color: subColor }]}>AMPLITUDE</Text>
              <Stepper label="Peak value" value={peakValue} unit="" step={1} min={1} max={100} onChange={setPeakValue} textColor={textColor} subColor={subColor} />
              <Stepper label="Onset reaches" value={onsetFrac} unit="% of peak" step={5} min={5} max={90} onChange={setOnsetFrac} textColor={textColor} subColor={subColor} />
            </View>

            {/* Curve shapes */}
            <View style={[styles.section, { backgroundColor: sectionBg, borderColor: sectionBorder }]}>
              <Text style={[styles.sectionTitle, { color: subColor }]}>CURVE SHAPES</Text>
              <ShapePicker label="Onset" value={onsetShape} onChange={setOnsetShape} textColor={textColor} subColor={subColor} tint={color} />
              <ShapePicker label="Comeup" value={comeupShape} onChange={setComeupShape} textColor={textColor} subColor={subColor} tint={color} />
              <ShapePicker label="Offset" value={offsetShape} onChange={setOffsetShape} textColor={textColor} subColor={subColor} tint={color} />
            </View>
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
  previewSvg: {
    alignSelf: 'center',
  },
  section: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  textInput: {
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperLabel: {
    fontSize: 14,
  },
  stepperControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(128,128,128,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '300',
  },
  stepperValue: {
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    minWidth: 70,
    textAlign: 'center',
  },
  stepperUnit: {
    fontSize: 12,
  },
  shapePicker: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shapeButtons: {
    flexDirection: 'row',
    gap: 6,
  },
  shapeBtn: {
    width: 34,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(128,128,128,0.12)',
  },
  shapeBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
