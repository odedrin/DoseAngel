import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { evaluate, formatDuration, totalDuration } from '@/engine/curveEngine';
import { INTERACTION_COLOR, type InteractionStatus } from '@/constants/interactions';
import type { StopwatchType } from '@/types/models';
import Svg, { Path, Line } from 'react-native-svg';

/** Derive the PsychonautWiki article URL from a substance name. */
function psychonautWikiUrl(name: string): string {
  const slug = name.replace(/\s*\(.*?\)\s*/g, '').trim();
  return `https://psychonautwiki.org/wiki/${encodeURIComponent(slug)}`;
}

interface Props {
  type: StopwatchType;
  isDark: boolean;
  isFavorite: boolean;
  activeCount: number;
  dragHandle?: React.ReactNode;
  onStart: (typeId: string) => void;
  /** Called for both "Customize" (built-in) and "Edit" (custom) */
  onEdit: (type: StopwatchType) => void;
  /** Opens the in-place phase-duration editor. Only shown for isSubstance types. */
  onEditDurations?: (type: StopwatchType) => void;
  onDelete?: (type: StopwatchType) => void;
  onToggleFavorite: (typeId: string) => void;
  onHide?: (typeId: string) => void;
  /** Label shown on the hide button. Defaults to "Hide". Pass "Unhide" for the hidden section. */
  hideLabel?: string;
  /** Worst interaction status vs currently active stopwatches, if any. */
  warningStatus?: InteractionStatus;
}

/** Sparkline preview of f(t) for a single type */
function MiniCurve({ type }: { type: StopwatchType }) {
  const W = 90;
  const H = 40;
  const PAD = 4;

  const d = useMemo(() => {
    const total = totalDuration(type);
    const steps = 80;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * total;
      const v = evaluate(type, t);
      const x = PAD + (i / steps) * (W - PAD * 2);
      const y = H - PAD - (v / type.peakValue) * (H - PAD * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [type]);

  return (
    <Svg width={W} height={H}>
      <Line
        x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD}
        stroke="rgba(128,128,128,0.2)" strokeWidth={1}
      />
      <Path d={d} stroke={type.color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

export function TypeCard({ type, isDark, isFavorite, activeCount, dragHandle, onStart, onEdit, onEditDurations, onDelete, onToggleFavorite, onHide, hideLabel = 'Hide', warningStatus }: Props) {
  const textColor = isDark ? '#ECEDEE' : '#11181C';
  const subColor  = isDark ? '#9BA1A6' : '#687076';
  const cardBg    = isDark ? '#1E2022' : '#F5F5F7';
  const border    = isDark ? '#2A2D2F' : '#E5E5EA';

  const total = totalDuration(type);

  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderColor: border }]}>
      {/* Left color stripe */}
      <View style={[styles.stripe, { backgroundColor: type.color }]} />

      <View style={styles.body}>
        {/* Interaction warning badge — top-right corner */}
        {warningStatus && (() => {
          const wc = INTERACTION_COLOR[warningStatus];
          const icon =
            warningStatus === 'Low Risk & Synergy'  ? '↑' :
            warningStatus === 'Low Risk & Decrease' ? '↓' :
            warningStatus === 'Low Risk & No Synergy' ? '▲' : '⚠';
          return (
            <View style={[styles.warnCorner, { backgroundColor: wc + '22', borderColor: wc }]}>
              <Text style={[styles.warnCornerText, { color: wc }]}>{icon}</Text>
            </View>
          );
        })()}

        {/* Name + duration */}
        <View style={styles.topRow}>
          <View style={styles.nameBlock}>
            <View style={styles.nameRow}>
              <Text style={[styles.name, { color: textColor }]}>{type.name}</Text>
              {activeCount > 0 && (
                <View style={[styles.badge, { backgroundColor: type.color }]}>
                  <Text style={styles.badgeText}>{activeCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.totalDur, { color: subColor }]}>
              {formatDuration(total)} total
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => onToggleFavorite(type.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.starBtn}
          >
            <Text style={[styles.star, { color: isFavorite ? '#FFD700' : subColor }]}>
              {isFavorite ? '★' : '☆'}
            </Text>
          </TouchableOpacity>

          <MiniCurve type={type} />
        </View>

        {/* Phase breakdown */}
        <View style={styles.phases}>
          {[
            { label: 'Onset',  dur: type.onsetDuration  },
            { label: 'Comeup', dur: type.comeupDuration },
            { label: 'Peak',   dur: type.peakDuration   },
            { label: 'Offset', dur: type.offsetDuration },
          ].map(({ label, dur }) => (
            <View key={label} style={styles.phaseItem}>
              <Text style={[styles.phaseLabel, { color: subColor }]}>{label}</Text>
              <Text style={[styles.phaseDur, { color: textColor }]}>{formatDuration(dur)}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.startBtn, { backgroundColor: type.color }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onStart(type.id);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.startText}>▶  Start</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: type.color }]}
            onPress={() => onEdit(type)}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryText, { color: type.color }]}>
              {type.isBuiltIn ? 'Customize' : 'Edit'}
            </Text>
          </TouchableOpacity>

          {/* Restricted duration-only editor and PsychonautWiki link only make
              sense for the app's own bundled substances — a user-created
              substance already gets full editing via "Edit", and its name
              wouldn't reliably resolve to a real wiki page. */}
          {type.isSubstance && type.isBuiltIn && onEditDurations && (
            <TouchableOpacity
              style={styles.wikiBtn}
              onPress={() => onEditDurations(type)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.wikiText, { color: subColor }]}>✎</Text>
            </TouchableOpacity>
          )}

          {type.isSubstance && type.isBuiltIn && (
            <TouchableOpacity
              style={styles.wikiBtn}
              onPress={() => Linking.openURL(psychonautWikiUrl(type.name))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.wikiText, { color: subColor }]}>ⓘ</Text>
            </TouchableOpacity>
          )}

          {onHide && (
            <TouchableOpacity
              style={styles.hideBtn}
              onPress={() => onHide(type.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.hideText, { color: subColor }]}>{hideLabel}</Text>
            </TouchableOpacity>
          )}

          {!type.isBuiltIn && onDelete && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => onDelete(type)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.deleteText, { color: subColor }]}>✕</Text>
            </TouchableOpacity>
          )}
          {dragHandle}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
    marginBottom: 14,
    overflow: 'hidden',
  },
  stripe: {
    width: 5,
  },
  body: {
    flex: 1,
    padding: 14,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameBlock: {
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  name: {
    fontSize: 17,
    fontWeight: '600',
  },
  totalDur: {
    fontSize: 12,
  },
  phases: {
    flexDirection: 'row',
    gap: 4,
  },
  phaseItem: {
    flex: 1,
    gap: 2,
  },
  phaseLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  phaseDur: {
    fontSize: 12,
    fontWeight: '500',
  },
  starBtn: {
    padding: 2,
  },
  star: {
    fontSize: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  startText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  wikiBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(128,128,128,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wikiText: {
    fontSize: 14,
    fontWeight: '600',
  },
  hideBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hideText: {
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(128,128,128,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 12,
    fontWeight: '700',
  },
  warnCorner: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  warnCornerText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
