import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Skin } from '../../store/slices/skinSlice';

interface SettingsSkinViewProps {
  activeSkin: string | null;
  availableSkins: Skin[];
  onSelectSkin: (skinId: string | null) => void;
  onBackToMain: () => void;
  styles: any;
}

/* eslint-disable max-lines-per-function */
export const SettingsSkinView: React.FC<SettingsSkinViewProps> = ({
  activeSkin,
  availableSkins,
  onSelectSkin,
  onBackToMain,
  styles,
}) => {
  const handleApplySkin = (skinId: string) => {
    onSelectSkin(skinId);
  };

  const handleRemoveSkin = () => {
    onSelectSkin(null);
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBackToMain} testID="back-button">
          <MaterialIcons name="arrow-back" size={24} color="#666" />
        </TouchableOpacity>
        <MaterialIcons name="palette" size={24} color="#666" />
        <Text style={styles.title}>Map Skins</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.subtitle}>Choose a visual style for your map</Text>

        {/* Active Skin Section */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Active Skin</Text>
          {activeSkin ? (
            <View>
              <Text style={styles.statsText}>
                {availableSkins.find((s) => s.id === activeSkin)?.name ?? 'Unknown'}
              </Text>
              <TouchableOpacity
                style={[styles.optionButton, { backgroundColor: '#FF3B30', marginTop: 12 }]}
                onPress={handleRemoveSkin}
                testID="remove-skin-button"
              >
                <Text style={styles.optionButtonText}>Remove Skin</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.statsText}>None (Base Map)</Text>
          )}
        </View>

        {/* Available Skins Section */}
        <Text style={styles.sectionHeader}>Available Skins</Text>

        {availableSkins.length === 0 && (
          <View style={styles.statsContainer}>
            <Text style={styles.statsText}>No skins available yet.</Text>
            <Text style={[styles.statsText, { fontSize: 12, color: '#999', marginTop: 8 }]}>
              Skins will be available in a future update.
            </Text>
          </View>
        )}

        {availableSkins.map((skin) => (
          <View key={skin.id} style={styles.menuItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuItemText}>{skin.name}</Text>
              <Text style={styles.menuItemDescription}>{skin.description}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                {skin.coverage === 'local' && (
                  <View
                    style={{
                      backgroundColor: '#E3F2FD',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 4,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: '#1976D2', fontWeight: '600' }}>LOCAL</Text>
                  </View>
                )}
                {!skin.isDownloaded && (
                  <View
                    style={{
                      backgroundColor: '#FFF3E0',
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 4,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: '#E65100', fontWeight: '600' }}>
                      NOT DOWNLOADED
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Preview thumbnail */}
            {skin.previewImage && (
              <Image
                source={{ uri: skin.previewImage }}
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 8,
                  marginRight: 12,
                  backgroundColor: '#f0f0f0',
                }}
                resizeMode="cover"
              />
            )}

            {/* Action button */}
            {skin.isDownloaded ? (
              activeSkin === skin.id ? (
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: '#4CAF50',
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>ACTIVE</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor: '#007AFF',
                    borderRadius: 6,
                  }}
                  onPress={() => handleApplySkin(skin.id)}
                  testID={`apply-skin-${skin.id}`}
                >
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>APPLY</Text>
                </TouchableOpacity>
              )
            ) : (
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: '#999',
                  borderRadius: 6,
                }}
              >
                <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>UNAVAILABLE</Text>
              </View>
            )}
          </View>
        ))}

        {/* Info section */}
        <View style={styles.warningContainer}>
          <MaterialIcons name="info-outline" size={20} color="#E65100" />
          <Text style={styles.warningText}>
            Skins apply visual styles to your revealed map areas. They do not affect fog rendering or GPS
            tracking. Tiles are loaded from local storage for best performance.
          </Text>
        </View>
      </ScrollView>
    </>
  );
};
/* eslint-enable max-lines-per-function */
