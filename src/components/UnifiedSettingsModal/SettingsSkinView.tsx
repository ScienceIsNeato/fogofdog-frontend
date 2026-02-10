/**
 * SettingsSkinView
 *
 * Settings sub-view for selecting and applying map skins.
 * Follows the established pattern of other settings views in this directory.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setSkin } from '../../store/slices/skinSlice';
import type { SkinId } from '../../store/slices/skinSlice';

interface SettingsSkinViewProps {
  onBack: () => void;
  styles: any;
}

export const SettingsSkinView: React.FC<SettingsSkinViewProps> = ({ onBack, styles }) => {
  const dispatch = useAppDispatch();
  const activeSkin = useAppSelector((state) => state.skin.activeSkin);
  const isInitializing = useAppSelector((state) => state.skin.isInitializing);
  // Use Redux state for available skins to support dynamic catalog updates
  const availableSkins = useAppSelector((state) => state.skin.availableSkins);

  const handleSelectSkin = (skinId: SkinId) => {
    dispatch(setSkin(skinId));
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} testID="back-button">
          <MaterialIcons name="arrow-back" size={24} color="#666" />
        </TouchableOpacity>
        <MaterialIcons name="palette" size={24} color="#666" />
        <Text style={styles.title}>Map Style</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>Choose a visual style for your map</Text>

        {isInitializing && (
          <View style={skinStyles.loadingRow}>
            <ActivityIndicator size="small" color="#007AFF" testID="skin-loading-indicator" />
            <Text style={skinStyles.loadingText}>Applying skin…</Text>
          </View>
        )}

        {availableSkins.map((skin) => {
          const isActive = activeSkin === skin.id;
          return (
            <TouchableOpacity
              key={skin.id}
              testID={`skin-option-${skin.id}`}
              style={[styles.menuItem, isActive && skinStyles.activeMenuItem]}
              onPress={() => handleSelectSkin(skin.id)}
            >
              <MaterialIcons
                name={skin.id === 'none' ? 'map' : 'color-lens'}
                size={20}
                color={isActive ? '#007AFF' : '#666'}
              />
              <View style={styles.menuItemContent}>
                <Text style={[styles.menuItemText, isActive && skinStyles.activeMenuItemText]}>
                  {skin.label}
                </Text>
                <Text style={styles.menuItemDescription}>{skin.description}</Text>
              </View>
              {isActive && <MaterialIcons name="check" size={20} color="#007AFF" />}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
};

const skinStyles = {
  activeMenuItem: {
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  activeMenuItemText: {
    color: '#007AFF',
  },
  loadingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
};
