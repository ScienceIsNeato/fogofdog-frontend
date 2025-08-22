import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import {
  mockNavigation,
  createMockStore,
  createMockStoreWithUser,
  createMockRoute,
} from './shared-mocks';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../types/navigation';

// Import screens directly
import { ProfileScreen } from '../screens/Profile/Profile';
import { SignInScreen } from '../screens/Auth/SignIn';
import { SignUpScreen } from '../screens/Auth/SignUp';

// Generic render function for screens with Redux provider
export const renderWithProvider = (component: React.ReactElement, store = createMockStore()) => {
  return render(<Provider store={store}>{component}</Provider>);
};

// Screen-specific render utilities
export const renderScreen = <T extends keyof MainStackParamList>(
  ScreenComponent: React.ComponentType<NativeStackScreenProps<MainStackParamList, T>>,
  screenName: T,
  store = createMockStore()
) => {
  const route = createMockRoute(screenName);
  return renderWithProvider(
    <ScreenComponent navigation={mockNavigation as any} route={route as any} />,
    store
  );
};

// Convenience functions for common test scenarios
export const renderProfileScreen = (store = createMockStore()) => {
  return renderWithProvider(
    <ProfileScreen navigation={mockNavigation as any} route={createMockRoute('Profile') as any} />,
    store
  );
};

export const renderAuthScreen = (screenType: 'SignIn' | 'SignUp', store = createMockStore()) => {
  if (screenType === 'SignIn') {
    return renderWithProvider(
      <SignInScreen navigation={mockNavigation as any} route={createMockRoute('SignIn') as any} />,
      store
    );
  } else {
    return renderWithProvider(
      <SignUpScreen navigation={mockNavigation as any} route={createMockRoute('SignUp') as any} />,
      store
    );
  }
};

// Test data generators for common scenarios
export const getScreenTestData = (screenName: string) => ({
  store: createMockStore(),
  storeWithUser: createMockStoreWithUser(),
  navigation: mockNavigation,
  route: createMockRoute(screenName),
});

// Mock cleanup utility
export const clearAllMocks = () => {
  Object.values(mockNavigation).forEach((fn) => {
    if (jest.isMockFunction(fn)) {
      fn.mockClear();
    }
  });
};
