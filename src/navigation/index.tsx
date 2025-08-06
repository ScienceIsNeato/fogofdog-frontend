import React, { useEffect, useState, createContext, useContext, useRef } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector, useAppDispatch } from '../store/hooks';
// import { restorePersistedUser } from '../store/slices/userSlice'; // FUTURE: For user accounts
import { restorePersistedState } from '../store/slices/explorationSlice';
import { AuthPersistenceService } from '../services/AuthPersistenceService';
import { OnboardingService } from '../services/OnboardingService';
import { RootStackParamList, MainStackParamList } from '../types/navigation';
// import { AuthStackParamList } from '../types/navigation'; // FUTURE: For user accounts
// import { GeoPoint } from '../types/user'; // FUTURE: For user accounts
import { MapScreen } from '../screens/Map';
// import { SignInScreen, SignUpScreen } from '../screens/Auth'; // FUTURE: For user accounts
import { ProfileScreen } from '../screens/Profile';
import { logger } from '../utils/logger';

// const AuthStack = createNativeStackNavigator<AuthStackParamList>(); // FUTURE: For user accounts
const MainStack = createNativeStackNavigator<MainStackParamList>();

// Context for sharing onboarding state
interface OnboardingContextType {
  isFirstTimeUser: boolean;
}

const OnboardingContext = createContext<OnboardingContextType>({ isFirstTimeUser: false });

export const useOnboardingContext = () => useContext(OnboardingContext);

// FUTURE: Reactivate for user accounts - Auth Navigator
// This component is preserved for future user account functionality
// const _AuthNavigator = () => (
//   <AuthStack.Navigator screenOptions={{ headerShown: false }}>
//     <AuthStack.Screen name="SignIn" component={SignInScreen} options={{ title: 'Sign In' }} />
//     <AuthStack.Screen name="SignUp" component={SignUpScreen} options={{ title: 'Sign Up' }} />
//   </AuthStack.Navigator>
// );

const MainNavigator = () => {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
      <MainStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </MainStack.Navigator>
  );
};

const RootStack = createNativeStackNavigator<RootStackParamList>();

const LoadingScreen = () => (
  <View style={styles.loadingContainer} testID="loading-screen">
    <ActivityIndicator size="large" color="#007AFF" />
    <Text style={styles.loadingText}>Loading...</Text>
  </View>
);

interface InitializationHookResult {
  isInitializing: boolean;
  user: any;
  isFirstTimeUser: boolean;
}

const useAppInitialization = (): InitializationHookResult => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.user);
  // const explorationState = useAppSelector((state) => state.exploration); // FUTURE: For user accounts
  const [isInitializing, setIsInitializing] = useState(true);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const initializationStarted = useRef(false);

  useEffect(() => {
    if (initializationStarted.current) return;
    initializationStarted.current = true;

    let isMounted = true;
    const initializeApp = async () => {
      try {
        logger.info('Initializing app with onboarding detection', {
          component: 'Navigation',
          action: 'initializeApp',
        });

        // FUTURE: Reactivate for user accounts - Load user authentication state
        // const userData = await AuthPersistenceService.getUser();
        // if (userData) {
        //   dispatch(restorePersistedUser(userData));
        // }

        // Check if this is a first-time user
        const firstTime = await OnboardingService.isFirstTimeUser();
        if (isMounted) {
          setIsFirstTimeUser(firstTime);
        }

        // Small delay to ensure location services are ready (especially in simulator)
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Restore exploration state from persistence
        const explorationData = await AuthPersistenceService.getExplorationState();
        if (explorationData && isMounted) {
          // Convert persisted coordinates to GeoPoints with timestamps
          const currentTimestamp = Date.now();
          const convertedData = {
            ...explorationData,
            currentLocation: explorationData.currentLocation
              ? { ...explorationData.currentLocation, timestamp: currentTimestamp }
              : null,
            path: explorationData.path.map((coord) => ({ ...coord, timestamp: currentTimestamp })),
            exploredAreas: explorationData.exploredAreas.map((coord) => ({
              ...coord,
              timestamp: currentTimestamp,
            })),
          };
          dispatch(restorePersistedState(convertedData));
        }

        logger.info('First-time user detection completed', {
          component: 'Navigation',
          action: 'initializeApp',
          isFirstTimeUser: firstTime,
        });
      } catch (error) {
        logger.error('Failed to initialize app', error, {
          component: 'Navigation',
          action: 'initializeApp',
        });
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    initializeApp();

    return () => {
      isMounted = false;
    };
  }, [dispatch]); // Keep dispatch dependency as required by React hooks rules

  return { isInitializing, user, isFirstTimeUser };
};

export default function Navigation() {
  const { isInitializing, isFirstTimeUser } = useAppInitialization();

  logger.debug('Navigation component rendering', {
    component: 'Navigation',
    action: 'render',
    isFirstTimeUser,
    isInitializing,
  });

  if (isInitializing) {
    return <LoadingScreen />;
  }

  return (
    <OnboardingContext.Provider value={{ isFirstTimeUser }}>
      <View style={styles.container}>
        <NavigationContainer>
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            {/* BYPASS AUTH: Always show Main navigator regardless of user state */}
            {/* FUTURE: Reactivate for user accounts - Conditional auth/main navigation */}
            {/* {user ? ( */}
            <RootStack.Screen name="Main" component={MainNavigator} />
            {/* ) : (
              <RootStack.Screen name="Auth" component={AuthNavigator} />
            )} */}
          </RootStack.Navigator>
        </NavigationContainer>
      </View>
    </OnboardingContext.Provider>
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
