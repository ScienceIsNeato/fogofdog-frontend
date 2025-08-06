import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { OnboardingService } from '../services/OnboardingService';
import { logger } from '../utils/logger';

const { width, height } = Dimensions.get('window');

interface OnboardingOverlayProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'Welcome to FogOfDog!',
    description: 'Explore & Track Your Adventures',
    icon: 'explore',
  },
  {
    id: 2,
    title: 'Understanding the Fog',
    description: 'Gray areas are unexplored, clear areas show where you\'ve been. Move around to reveal the map!',
    icon: 'visibility',
  },
  {
    id: 3,
    title: 'Location Button',
    description: 'Tap the location button to center the map on your current position. It turns blue when active.',
    icon: 'my-location',
  },
  {
    id: 4,
    title: 'Tracking Control',
    description: 'Use the pause button to stop or resume tracking your exploration. Perfect for breaks!',
    icon: 'play-circle-outline',
  },
  {
    id: 5,
    title: 'Settings & History',
    description: 'Access app settings and manage your exploration history through the settings menu.',
    icon: 'settings',
  },
  {
    id: 6,
    title: 'Start Exploring!',
    description: 'You\'re ready to go! Start moving around to clear the fog and discover new areas.',
    icon: 'flag',
  },
];

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  visible,
  onComplete,
  onSkip,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (isCompleting) return;
    
    setIsCompleting(true);
    try {
      await OnboardingService.markOnboardingCompleted();
      logger.info('Onboarding completed by user', {
        component: 'OnboardingOverlay',
        action: 'handleComplete',
        completed: true,
      });
      onComplete();
    } catch (error) {
      logger.error('Failed to mark onboarding as completed', error, {
        component: 'OnboardingOverlay',
        action: 'handleComplete',
      });
      // Still call onComplete even if storage fails
      onComplete();
    } finally {
      setIsCompleting(false);
    }
  };

  const handleSkip = async () => {
    if (isCompleting) return;
    
    setIsCompleting(true);
    try {
      await OnboardingService.markOnboardingCompleted();
      logger.info('Onboarding skipped by user', {
        component: 'OnboardingOverlay',
        action: 'handleSkip',
        skipped: true,
      });
      onSkip();
    } catch (error) {
      logger.error('Failed to mark onboarding as completed on skip', error, {
        component: 'OnboardingOverlay',
        action: 'handleSkip',
      });
      // Still call onSkip even if storage fails
      onSkip();
    } finally {
      setIsCompleting(false);
    }
  };

  if (!visible) {
    return null;
  }

  const currentStepData = ONBOARDING_STEPS[currentStep - 1];
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === ONBOARDING_STEPS.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay} testID="onboarding-overlay">
        <SafeAreaView style={styles.container}>
          {/* Header with progress and skip */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={isCompleting}
              accessibilityLabel="Skip onboarding tutorial"
              accessibilityRole="button"
            >
              <Text style={styles.skipText}>Skip Tutorial</Text>
            </TouchableOpacity>
          </View>

          {/* Main content */}
          <View style={styles.content}>
            {/* Step indicator */}
            <Text style={styles.stepIndicator}>
              Step {currentStep} of {ONBOARDING_STEPS.length}
            </Text>

            {/* Icon */}
            <View style={styles.iconContainer}>
              <MaterialIcons
                name={currentStepData.icon}
                size={80}
                color="#007AFF"
              />
            </View>

            {/* Title and description */}
            <Text style={styles.title}>{currentStepData.title}</Text>
            <Text style={styles.description}>{currentStepData.description}</Text>
          </View>

          {/* Navigation buttons */}
          <View style={styles.footer}>
            <View style={styles.buttonRow}>
              {!isFirstStep && (
                <TouchableOpacity
                  style={[styles.button, styles.backButton]}
                  onPress={handleBack}
                  disabled={isCompleting}
                  accessibilityLabel="Go back to previous step"
                  accessibilityRole="button"
                >
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              )}

              <View style={styles.buttonSpacer} />

              {isLastStep ? (
                <TouchableOpacity
                  style={[styles.button, styles.finishButton]}
                  onPress={handleComplete}
                  disabled={isCompleting}
                  accessibilityLabel="Complete onboarding tutorial"
                  accessibilityRole="button"
                >
                  <Text style={styles.finishButtonText}>
                    {isCompleting ? 'Starting...' : 'Get Started!'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.button, styles.continueButton]}
                  onPress={handleNext}
                  disabled={isCompleting}
                  accessibilityLabel="Continue to next step"
                  accessibilityRole="button"
                >
                  <Text style={styles.continueButtonText}>Continue</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
  },
  container: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    alignItems: 'flex-end',
  },
  skipButton: {
    padding: 10,
  },
  skipText: {
    color: '#FFFFFF',
    fontSize: 16,
    opacity: 0.8,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  stepIndicator: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 30,
  },
  iconContainer: {
    marginBottom: 30,
    padding: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 60,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  description: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    opacity: 0.9,
    maxWidth: width * 0.8,
  },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonSpacer: {
    flex: 1,
  },
  button: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    minWidth: 120,
    alignItems: 'center',
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#007AFF',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  finishButton: {
    backgroundColor: '#34C759',
  },
  finishButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
}); 