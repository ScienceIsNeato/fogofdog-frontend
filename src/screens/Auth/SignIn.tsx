import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAppDispatch } from '../../store/hooks';
import { setUser } from '../../store/slices/userSlice';
import { AuthPersistenceService } from '../../services/AuthPersistenceService';
import { logger } from '../../utils/logger';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export const SignInScreen: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const [keepLoggedIn, setKeepLoggedIn] = useState(true); // Default to true

  const handleSignIn = async () => {
    const user = {
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    };

    // Set user in Redux
    dispatch(setUser(user));

    // Only persist authentication state if "Keep me logged in" is checked
    if (keepLoggedIn) {
      try {
        await AuthPersistenceService.saveAuthState(user, keepLoggedIn);
      } catch (error) {
        logger.error('Failed to save authentication state', error, {
          component: 'SignIn',
          action: 'handleSignIn',
        });
      }
    } else {
      // If not keeping logged in, clear any existing auth state
      try {
        await AuthPersistenceService.clearAuthState();
      } catch (error) {
        logger.error('Failed to clear authentication state', error, {
          component: 'SignIn',
          action: 'handleSignIn',
        });
      }
    }
  };

  const handleSignUp = () => {
    navigation.navigate('SignUp');
  };

  const toggleKeepLoggedIn = () => {
    setKeepLoggedIn(!keepLoggedIn);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>

      {/* Keep me logged in checkbox */}
      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={toggleKeepLoggedIn}
        testID="keepLoggedInCheckbox"
      >
        <View style={[styles.checkbox, keepLoggedIn && styles.checkboxChecked]}>
          {keepLoggedIn && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkboxLabel}>Keep me logged in</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={handleSignIn} style={styles.button} testID="signInButton">
        <Text style={styles.buttonText}>Sign In</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={handleSignUp}
        style={[styles.button, styles.secondaryButton]}
        testID="createAccountButton"
      >
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>Create Account</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 20,
  },
  title: {
    fontSize: 32,
    color: '#000',
    fontWeight: 'bold',
    marginBottom: 40,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 3,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#007AFF',
  },
  checkmark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    marginVertical: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
});
