/**
 * SettingsEffectsView
 *
 * Settings sub-view for selecting graphics effects (fog, map, scent).
 * Follows the established pattern of SettingsSkinView.
 *
 * Three sections are shown in sequence:
 *   1. Fog Effects
 *   2. Map Effects
 *   3. Scent Effects
 *
 * Each section lists available effects with a checkmark on the active one.
 * Animated effects are labelled with a ✦ badge so players know they have
 * additional GPU cost (though still within the ≤30% idle overhead budget).
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  setFogEffect,
  setMapEffect,
  setScentEffect,
  AVAILABLE_GRAPHICS,
} from '../../store/slices/graphicsSlice';
import type { EffectKind } from '../../types/graphics';

interface SettingsEffectsViewProps {
  onBack: () => void;
  styles: any;
}

const SECTION_LABELS: Record<EffectKind, string> = {
  fog: 'Fog Effects',
  map: 'Map Overlays',
  scent: 'Scent Trail',
};

const SECTION_ICONS: Record<EffectKind, React.ComponentProps<typeof MaterialIcons>['name']> = {
  fog: 'blur-on',
  map: 'layers',
  scent: 'timeline',
};

export const SettingsEffectsView: React.FC<SettingsEffectsViewProps> = ({ onBack, styles }) => {
  const dispatch = useAppDispatch();
  const activeFogId = useAppSelector((s) => s.graphics.activeFogEffectId);
  const activeMapId = useAppSelector((s) => s.graphics.activeMapEffectId);
  const activeScentId = useAppSelector((s) => s.graphics.activeScentEffectId);

  const activeIds: Record<EffectKind, string> = {
    fog: activeFogId,
    map: activeMapId,
    scent: activeScentId,
  };

  const handleSelect = (kind: EffectKind, id: string) => {
    if (kind === 'fog') dispatch(setFogEffect(id));
    else if (kind === 'map') dispatch(setMapEffect(id));
    else dispatch(setScentEffect(id));
  };

  const renderSection = (kind: EffectKind) => {
    const effects = AVAILABLE_GRAPHICS.filter((g) => g.kind === kind);
    const activeId = activeIds[kind];

    return (
      <View key={kind} style={effectStyles.section}>
        <View style={effectStyles.sectionHeader}>
          <MaterialIcons name={SECTION_ICONS[kind]} size={18} color="#5AC8FA" />
          <Text style={effectStyles.sectionTitle}>{SECTION_LABELS[kind]}</Text>
        </View>
        {effects.map((effect) => {
          const isActive = activeId === effect.id;
          return (
            <TouchableOpacity
              key={effect.id}
              testID={`effect-option-${effect.id}`}
              style={[styles.menuItem, isActive && effectStyles.activeMenuItem]}
              onPress={() => handleSelect(kind, effect.id)}
            >
              <View style={effectStyles.labelRow}>
                <Text style={[styles.menuItemText, isActive && effectStyles.activeText]}>
                  {effect.label}
                </Text>
                {effect.isAnimated && <Text style={effectStyles.animatedBadge}> ✦</Text>}
              </View>
              <Text style={[styles.menuItemDescription, effectStyles.description]}>
                {effect.description}
              </Text>
              {isActive && <MaterialIcons name="check" size={20} color="#007AFF" />}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} testID="effects-back-button">
          <MaterialIcons name="arrow-back" size={24} color="#666" />
        </TouchableOpacity>
        <MaterialIcons name="auto-awesome" size={24} color="#666" />
        <Text style={styles.title}>Visual Effects</Text>
      </View>

      <ScrollView
        style={effectStyles.scrollContainer}
        contentContainerStyle={effectStyles.scrollContent}
      >
        <Text style={effectStyles.hint}>
          ✦ = animated effect · effects with animation use GPU animation (UI thread only)
        </Text>
        {(['fog', 'map', 'scent'] as EffectKind[]).map(renderSection)}
      </ScrollView>
    </>
  );
};

const effectStyles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  hint: {
    fontSize: 11,
    color: '#999',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5AC8FA',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  activeMenuItem: {
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  activeText: {
    color: '#007AFF',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  animatedBadge: {
    fontSize: 13,
    color: '#FFD60A',
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    flex: 1,
    marginTop: 2,
  },
});
