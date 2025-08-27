/**
 * State Recovery View - Developer tool for diagnosing and fixing state corruption
 *
 * Provides UI for:
 * - Running state health checks
 * - Viewing detected issues
 * - Performing selective or emergency recovery
 * - Viewing AsyncStorage contents
 */

import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAppDispatch } from '../../store/hooks';
import {
  reset as resetExploration,
  setFollowMode,
  setCenterOnUser,
} from '../../store/slices/explorationSlice';
import { StateRecoveryService, type StateHealthCheck } from '../../services/StateRecoveryService';
import { logger } from '../../utils/logger';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SettingsStateRecoveryView: React.FC = () => {
  const dispatch = useAppDispatch();
  const [healthCheck, setHealthCheck] = useState<StateHealthCheck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [asyncStorageData, setAsyncStorageData] = useState<Record<string, any>>({});

  const performHealthCheck = useCallback(async () => {
    setIsLoading(true);
    try {
      logger.info('🔍 Running state health check from developer settings', {
        component: 'SettingsStateRecoveryView',
        action: 'performHealthCheck',
      });

      const result = await StateRecoveryService.performHealthCheck();
      setHealthCheck(result);

      logger.info('Health check completed', {
        component: 'SettingsStateRecoveryView',
        isHealthy: result.isHealthy,
        issuesCount: result.issues.length,
      });
    } catch (error) {
      logger.error('Health check failed', error, {
        component: 'SettingsStateRecoveryView',
        action: 'performHealthCheck',
      });
      Alert.alert('Error', 'Failed to perform health check. Check logs for details.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const viewAsyncStorageData = useCallback(async () => {
    setIsLoading(true);
    try {
      const keys = [
        '@fogofdog_exploration_state',
        '@fogofdog_auth_state',
        '@fogofdog_state_recovery',
        'fogofdog_exploration_stats',
      ];

      const data: Record<string, any> = {};
      for (const key of keys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          try {
            data[key] = JSON.parse(value);
          } catch {
            data[key] = value; // Store as string if not JSON
          }
        } else {
          data[key] = null;
        }
      }

      setAsyncStorageData(data);
      logger.info('AsyncStorage data retrieved', {
        component: 'SettingsStateRecoveryView',
        keysFound: Object.keys(data).filter((k) => data[k] !== null).length,
      });
    } catch (error) {
      logger.error('Failed to retrieve AsyncStorage data', error, {
        component: 'SettingsStateRecoveryView',
        action: 'viewAsyncStorageData',
      });
      Alert.alert('Error', 'Failed to retrieve AsyncStorage data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const performSelectiveRecovery = useCallback(() => {
    Alert.alert(
      'Selective Recovery',
      'This will clear exploration state (GPS path, current location) but keep your login. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Recover',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await StateRecoveryService.createStateBackup();
              await StateRecoveryService.performSelectiveRecovery();

              // Reset Redux exploration state
              dispatch(resetExploration());
              dispatch(setFollowMode(false));
              dispatch(setCenterOnUser(false));

              Alert.alert('Success', 'Selective recovery completed. App will restart shortly.');

              // Trigger app restart by throwing error (will be caught by error boundary)
              setTimeout(() => {
                throw new Error('State recovery completed - app restart required');
              }, 2000);
            } catch (error) {
              logger.error('Selective recovery failed', error, {
                component: 'SettingsStateRecoveryView',
                action: 'performSelectiveRecovery',
              });
              Alert.alert('Error', 'Recovery failed. Check logs for details.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }, [dispatch]);

  const performEmergencyRecovery = useCallback(() => {
    Alert.alert(
      '🚨 Emergency Recovery',
      'This will clear ALL stored data (including login). Use only if selective recovery fails. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Emergency Recovery',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await StateRecoveryService.createStateBackup();
              await StateRecoveryService.performEmergencyRecovery();

              // Reset Redux state
              dispatch(resetExploration());
              dispatch(setFollowMode(false));
              dispatch(setCenterOnUser(false));

              Alert.alert('Success', 'Emergency recovery completed. App will restart shortly.');

              // Trigger app restart
              setTimeout(() => {
                throw new Error('Emergency recovery completed - app restart required');
              }, 2000);
            } catch (error) {
              logger.error('Emergency recovery failed', error, {
                component: 'SettingsStateRecoveryView',
                action: 'performEmergencyRecovery',
              });
              Alert.alert('Error', 'Emergency recovery failed. Check logs for details.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  }, [dispatch]);

  const resetReduxState = useCallback(() => {
    Alert.alert(
      'Reset Redux State',
      'This will reset Redux exploration state without clearing AsyncStorage. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: () => {
            dispatch(resetExploration());
            dispatch(setFollowMode(false));
            dispatch(setCenterOnUser(false));

            logger.info('Redux state reset from developer settings', {
              component: 'SettingsStateRecoveryView',
              action: 'resetReduxState',
            });

            Alert.alert('Success', 'Redux state has been reset.');
          },
        },
      ]
    );
  }, [dispatch]);

  const buttonStyle = {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center' as const,
  };

  const buttonTextStyle = {
    color: 'white',
    fontWeight: 'bold' as const,
  };

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#000' }}>
        🛠️ State Recovery Tools
      </Text>

      <Text style={{ color: '#666', marginBottom: 16 }}>
        Use these tools to diagnose and fix GPS/follow mode issues caused by corrupted app state.
      </Text>

      {isLoading && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={{ marginLeft: 8, color: '#000' }}>Processing...</Text>
        </View>
      )}

      {/* Health Check Section */}
      <View style={{ marginBottom: 24 }}>
        <TouchableOpacity
          style={[buttonStyle, isLoading && { opacity: 0.5 }]}
          onPress={performHealthCheck}
          disabled={isLoading}
        >
          <Text style={buttonTextStyle}>🔍 Run Health Check</Text>
        </TouchableOpacity>

        {healthCheck && (
          <View style={{ marginTop: 12, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
            <Text style={{ fontWeight: 'bold', color: healthCheck.isHealthy ? 'green' : 'red' }}>
              {healthCheck.isHealthy ? '✅ State is healthy' : '⚠️ Issues detected'}
            </Text>

            {healthCheck.issues.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#000' }}>Issues:</Text>
                {healthCheck.issues.map((issue, index) => (
                  <Text
                    key={`issue-${issue.substring(0, 10)}-${index}`}
                    style={{ color: 'red', marginLeft: 8 }}
                  >
                    • {issue}
                  </Text>
                ))}
              </View>
            )}

            {healthCheck.recommendations.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontWeight: 'bold', color: '#000' }}>Recommendations:</Text>
                {healthCheck.recommendations.map((rec, index) => (
                  <Text
                    key={`rec-${rec.substring(0, 10)}-${index}`}
                    style={{ color: 'orange', marginLeft: 8 }}
                  >
                    • {rec}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Quick Fixes */}
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#000' }}>
        Quick Fixes
      </Text>

      <TouchableOpacity
        style={[buttonStyle, isLoading && { opacity: 0.5 }]}
        onPress={resetReduxState}
        disabled={isLoading}
      >
        <Text style={buttonTextStyle}>🔄 Reset Redux State</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[buttonStyle, { backgroundColor: 'orange' }, isLoading && { opacity: 0.5 }]}
        onPress={performSelectiveRecovery}
        disabled={isLoading}
      >
        <Text style={buttonTextStyle}>🔧 Selective Recovery</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          buttonStyle,
          { backgroundColor: '#FF3B30', marginBottom: 16 },
          isLoading && { opacity: 0.5 },
        ]}
        onPress={performEmergencyRecovery}
        disabled={isLoading}
      >
        <Text style={buttonTextStyle}>🚨 Emergency Recovery</Text>
      </TouchableOpacity>

      {/* Data Inspection */}
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#000' }}>
        Data Inspection
      </Text>

      <TouchableOpacity
        style={[buttonStyle, { backgroundColor: '#666' }, isLoading && { opacity: 0.5 }]}
        onPress={viewAsyncStorageData}
        disabled={isLoading}
      >
        <Text style={buttonTextStyle}>👁️ View AsyncStorage Data</Text>
      </TouchableOpacity>

      {Object.keys(asyncStorageData).length > 0 && (
        <View style={{ marginTop: 12, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
          <Text style={{ fontWeight: 'bold', marginBottom: 8, color: '#000' }}>
            AsyncStorage Contents:
          </Text>
          {Object.entries(asyncStorageData).map(([key, value]) => (
            <View key={key} style={{ marginBottom: 8 }}>
              <Text style={{ fontWeight: 'bold', color: '#000' }}>{key}:</Text>
              <Text style={{ color: '#666', fontSize: 12 }}>
                {value === null ? 'null' : JSON.stringify(value, null, 2).substring(0, 200)}
                {JSON.stringify(value).length > 200 && '...'}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ height: 50 }} />
    </ScrollView>
  );
};
