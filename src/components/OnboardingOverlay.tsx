import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { OnboardingService } from '../services/OnboardingService';
import { logger } from '../utils/logger';
import { ONBOARDING_STEPS, TOTAL_ONBOARDING_STEPS, OnboardingStep } from '../constants/onboarding';

const { width } = Dimensions.get('window');

interface OnboardingOverlayProps {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

// Helper component for the onboarding header
const OnboardingHeader: React.FC<{
  onSkip: () => void;
  isCompleting: boolean;
}> = ({ onSkip, isCompleting }) => (
  <View style={styles.header}>
    <TouchableOpacity
      style={styles.skipButton}
      onPress={onSkip}
      disabled={isCompleting}
      accessibilityLabel="Skip onboarding tutorial"
      accessibilityRole="button"
    >
      <Text style={styles.skipText}>Skip Tutorial</Text>
    </TouchableOpacity>
  </View>
);

// Helper component for the step content
const OnboardingStepContent: React.FC<{
  currentStep: number;
  currentStepData: OnboardingStep | undefined;
}> = ({ currentStep, currentStepData }) => (
  <View style={styles.content}>
    {/* Step indicator */}
    <Text style={styles.stepIndicator}>
      Step {currentStep} of {TOTAL_ONBOARDING_STEPS}
    </Text>

    {/* Icon */}
    <View style={styles.iconContainer}>
      <MaterialIcons name={currentStepData?.icon ?? 'help'} size={80} color="#007AFF" />
    </View>

    {/* Title and description */}
    <Text style={styles.title}>{currentStepData?.title ?? 'Welcome'}</Text>
    <Text style={styles.description}>{currentStepData?.description ?? 'Welcome to FogOfDog'}</Text>
  </View>
);

// Spotlight component removed per user feedback - circles were misaligned

// Arrow component that points to specific UI elements
const OnboardingArrow: React.FC<{
  pointTo: 'location-button' | 'settings-button' | 'tracking-button';
  visible: boolean;
}> = ({ pointTo, visible }) => {
  const [pulseAnim] = useState(new Animated.Value(1));

  React.useEffect(() => {
    if (visible) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
    return undefined;
  }, [visible, pulseAnim]);

  if (!visible) return null;

  const getArrowStyle = () => {
    const { width: screenWidth } = Dimensions.get('window');

    switch (pointTo) {
      case 'location-button':
        return {
          position: 'absolute' as const,
          top: 140, // Move down and right to point at actual button
          right: 70,
          transform: [{ rotate: '-45deg' }],
        };
      case 'settings-button':
        return {
          position: 'absolute' as const,
          top: 140, // Adjust to point at actual settings button
          left: 70,
          transform: [{ rotate: '-135deg' }], // Point to top left
        };
      case 'tracking-button':
        return {
          position: 'absolute' as const,
          bottom: 220, // Move slightly up per user feedback
          left: screenWidth / 2 - 20,
          transform: [{ rotate: '90deg' }],
        };
      default:
        return {};
    }
  };

  return (
    <Animated.View
      style={[
        getArrowStyle(),
        {
          transform: [...((getArrowStyle().transform as any) ?? []), { scale: pulseAnim }],
        },
      ]}
    >
      <MaterialIcons name="arrow-forward" size={32} color="#007AFF" />
    </Animated.View>
  );
};

// Helper component for navigation buttons
const OnboardingNavigation: React.FC<{
  currentStep: number;
  totalSteps: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  isCompleting: boolean;
  onBack: () => void;
  onNext: () => void;
  onComplete: () => void;
}> = ({
  currentStep,
  totalSteps: _totalSteps,
  isFirstStep,
  isLastStep,
  isCompleting,
  onBack,
  onNext,
  onComplete,
}) => (
  <View style={styles.footer}>
    <View style={styles.buttonRow}>
      {!isFirstStep && (
        <TouchableOpacity
          style={[styles.button, styles.backButton]}
          onPress={onBack}
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
          onPress={onComplete}
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
          onPress={onNext}
          disabled={isCompleting}
          accessibilityLabel="Continue to next step"
          accessibilityRole="button"
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      )}
    </View>

    {/* Progress indicator dots */}
    <View style={styles.progressContainer}>
      {ONBOARDING_STEPS.map((step, index) => (
        <View
          key={step.id}
          style={[
            styles.progressDot,
            index + 1 <= currentStep ? styles.progressDotActive : styles.progressDotInactive,
          ]}
        />
      ))}
    </View>
  </View>
);

// Custom hook for onboarding logic
const useOnboardingLogic = (onComplete: () => void, onSkip: () => void) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isCompleting, setIsCompleting] = useState(false);

  const handleNext = () => {
    if (currentStep < TOTAL_ONBOARDING_STEPS) {
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

  return {
    currentStep,
    isCompleting,
    handleNext,
    handleBack,
    handleComplete,
    handleSkip,
  };
};

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({
  visible,
  onComplete,
  onSkip,
}) => {
  const { currentStep, isCompleting, handleNext, handleBack, handleComplete, handleSkip } =
    useOnboardingLogic(onComplete, onSkip);

  if (!visible) {
    return null;
  }

  const currentStepData = ONBOARDING_STEPS[currentStep - 1];
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === TOTAL_ONBOARDING_STEPS;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay} testID="onboarding-overlay">
        <SafeAreaView style={styles.container}>
          <OnboardingHeader onSkip={handleSkip} isCompleting={isCompleting} />
          <OnboardingStepContent currentStep={currentStep} currentStepData={currentStepData} />
          <OnboardingNavigation
            currentStep={currentStep}
            totalSteps={TOTAL_ONBOARDING_STEPS}
            isFirstStep={isFirstStep}
            isLastStep={isLastStep}
            isCompleting={isCompleting}
            onBack={handleBack}
            onNext={handleNext}
            onComplete={handleComplete}
          />
        </SafeAreaView>

        {/* Spotlight highlighting UI elements - REMOVED per user feedback */}
        {/* {currentStepData?.pointTo && (
          <OnboardingSpotlight pointTo={currentStepData.pointTo} visible={visible} />
        )} */}

        {/* Arrows pointing to UI elements */}
        {currentStepData?.pointTo && (
          <OnboardingArrow pointTo={currentStepData.pointTo} visible={visible} />
        )}
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
    alignItems: 'center',
    justifyContent: 'center',
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
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  progressDotActive: {
    backgroundColor: '#007AFF',
  },
  progressDotInactive: {
    backgroundColor: '#E0E0E0',
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
