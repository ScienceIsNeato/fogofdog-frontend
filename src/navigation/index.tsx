import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { restorePersistedUser } from '../store/slices/userSlice';
import { restorePersistedState } from '../store/slices/explorationSlice';
import { AuthPersistenceService } from '../services/AuthPersistenceService';
import { RootStackParamList, AuthStackParamList, MainStackParamList } from '../types/navigation';
import { GeoPoint } from '../types/user';
import { MapScreen } from '../screens/Map';
import { SignInScreen, SignUpScreen } from '../screens/Auth';
import { ProfileScreen } from '../screens/Profile';
import { logger } from '../utils/logger';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const AuthNavigator = () => (
  <AuthStack.Navigator screenOptions={{ headerShown: false }}>
    <AuthStack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign In' }} />
    <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Sign Up' }} />
  </AuthStack.Navigator>
);

const MainNavigator = () => (
  <MainStack.Navigator screenOptions={{ headerShown: false }}>
    <MainStack.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
    <MainStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
  </MainStack.Navigator>
);

const RootStack = createNativeStackNavigator<RootStackParamList>();

const LoadingScreen = () => (
  <View style={styles.loadingContainer}>
    <ActivityIndicator testID="activity-indicator" size="large" color="#007AFF" />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
);

// Helper function for legacy data validation
const validateDataForTimestamps = (explorationData: any) => {
  const hasLegacyData = (point: any) => {
    return point && typeof point.timestamp !== 'number';
  };

  const hasLegacyPoints = (points: any[]) => {
    return points?.some(hasLegacyData);
  };

  return (
    hasLegacyData(explorationData.currentLocation) || // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
    hasLegacyPoints(explorationData.path) || // eslint-disable-line @typescript-eslint/prefer-nullish-coalescing
    hasLegacyPoints(explorationData.exploredAreas)
  );
};

// Helper function for restoring exploration state
const restoreExplorationState = async (dispatch: any) => {
  const persistedExploration = await AuthPersistenceService.getExplorationState();

  if (!persistedExploration) {
    logger.info('⚠️ No persisted exploration state found', {
      component: 'Navigation',
      action: 'initializeApp',
    });
    return;
  }

  logger.info('✅ Found persisted exploration state, restoring', {
    component: 'Navigation',
    action: 'initializeApp',
    pathPoints: persistedExploration.path.length,
    hasCurrentLocation: !!persistedExploration.currentLocation,
    exploredAreas: persistedExploration.exploredAreas.length,
    zoomLevel: persistedExploration.zoomLevel,
  });

  // Check for legacy data without timestamps - require data clearing
  if (validateDataForTimestamps(persistedExploration)) {
    throw new Error(
      'LEGACY_DATA_DETECTED: Your app contains old location data that is incompatible with the new GPS line filtering system. Please clear all app data using the Profile screen to continue.'
    );
  }

  // Type assertions are safe here since we validated the data above
  dispatch(
    restorePersistedState({
      currentLocation: persistedExploration.currentLocation as GeoPoint | null,
      path: (persistedExploration.path ?? []) as GeoPoint[],
      exploredAreas: (persistedExploration.exploredAreas ?? []) as GeoPoint[],
      zoomLevel: persistedExploration.zoomLevel,
    })
  );
};

// Helper function for restoring authentication state
const restoreAuthenticationState = async (dispatch: any) => {
  const persistedAuth = await AuthPersistenceService.getAuthState();

  if (!persistedAuth) {
    logger.info('⚠️ No valid persisted authentication found', {
      component: 'Navigation',
      action: 'initializeApp',
    });
    return;
  }

  logger.info('✅ Found valid persisted authentication, restoring user', {
    component: 'Navigation',
    action: 'initializeApp',
    userId: persistedAuth.user.id,
    expiresAt: new Date(persistedAuth.expiresAt).toISOString(),
    keepLoggedIn: persistedAuth.keepLoggedIn,
  });

  // Restore user to Redux
  dispatch(restorePersistedUser(persistedAuth.user));

  // Try to restore exploration state as well
  await restoreExplorationState(dispatch);
};

// Custom hook for app initialization
const useAppInitialization = () => {
  const dispatch = useAppDispatch();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        logger.info('🚀 App initialization starting', {
          component: 'Navigation',
          action: 'initializeApp',
        });

        await restoreAuthenticationState(dispatch);
      } catch (error) {
        logger.error('❌ Error initializing app', error, {
          component: 'Navigation',
          action: 'initializeApp',
        });
      } finally {
        logger.info('🏁 App initialization completed', {
          component: 'Navigation',
          action: 'initializeApp',
        });
        setIsInitializing(false);
      }
    };

    initializeApp();
  }, [dispatch]);

  return isInitializing;
};

export default function Navigation() {
  const user = useAppSelector((state) => state.user.user);
  const isInitializing = useAppInitialization();

  logger.debug('Navigation component rendering', {
    component: 'Navigation',
    action: 'render',
    user,
    isInitializing,
  });

  // Show loading screen while initializing
  if (isInitializing) {
    return <LoadingScreen />;
  }

  return (
    <View testID="navigation-root" style={styles.container}>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <RootStack.Screen name="Main" component={MainNavigator} />
          ) : (
            <RootStack.Screen name="Auth" component={AuthNavigator} />
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
});
