import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppDispatch } from '../../store/hooks';
import { setUser } from '../../store/slices/userSlice';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types/navigation';
import { commonStyles } from '../../styles/commonStyles';

// FUTURE: Reactivate for user accounts - SignUp Screen
// This screen is preserved for future user account functionality
// When user accounts are needed, this screen provides:
// - Basic sign up flow structure
// - Navigation back to sign in
// - Ready for integration with user registration API
//
// To reactivate:
// 1. Add user registration form fields (email, password, etc.)
// 2. Connect to user registration service/API
// 3. Add form validation and error handling
// 4. Integrate with AuthPersistenceService for auto-login

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export const SignUpScreen: React.FC<Props> = ({ navigation }) => {
  const dispatch = useAppDispatch();

  const handleSignUp = () => {
    dispatch(
      setUser({
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      })
    );
  };

  const handleSignIn = () => {
    navigation.navigate('SignIn');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <TouchableOpacity onPress={handleSignUp} style={styles.button}>
        <Text style={styles.buttonText}>Sign Up</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleSignIn} style={[styles.button, styles.secondaryButton]}>
        <Text style={[styles.buttonText, styles.secondaryButtonText]}>
          Already have an account?
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: commonStyles.centeredContainer,
  title: commonStyles.screenTitle,
  button: commonStyles.primaryButton,
  buttonText: commonStyles.buttonText,
  secondaryButton: commonStyles.secondaryButton,
  secondaryButtonText: commonStyles.secondaryButtonText,
});
