import React from 'react';
import { View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAppSelector } from '../store/hooks';
import { RootStackParamList, AuthStackParamList, MainStackParamList } from '../types/navigation';
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

export default function Navigation() {
  const user = useAppSelector((state) => state.user.user);

  logger.debug('Navigation component rendering', {
    component: 'Navigation',
    action: 'render',
    user,
  });

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
});
