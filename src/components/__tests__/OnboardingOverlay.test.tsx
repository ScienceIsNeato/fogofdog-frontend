import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { OnboardingOverlay } from '../OnboardingOverlay';
import { OnboardingService } from '../../services/OnboardingService';

// Mock the OnboardingService
jest.mock('../../services/OnboardingService');
const mockedOnboardingService = OnboardingService as jest.Mocked<typeof OnboardingService>;

describe('OnboardingOverlay', () => {
  const mockOnComplete = jest.fn();
  const mockOnSkip = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedOnboardingService.markOnboardingCompleted.mockResolvedValue(undefined);
  });

  describe('visibility and initial state', () => {
    it('should not render when visible is false', () => {
      render(
        <OnboardingOverlay 
          visible={false} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
    });

    it('should render welcome step when visible is true', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      expect(screen.getByTestId('onboarding-overlay')).toBeTruthy();
      expect(screen.getByText('Welcome to FogOfDog!')).toBeTruthy();
      expect(screen.getByText('Explore & Track Your Adventures')).toBeTruthy();
      expect(screen.getByText('Step 1 of 6')).toBeTruthy();
    });

    it('should show skip and continue buttons', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      expect(screen.getByText('Skip Tutorial')).toBeTruthy();
      expect(screen.getByText('Continue')).toBeTruthy();
    });
  });

  describe('step navigation', () => {
    it('should advance to next step when continue is pressed', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      // Start at step 1
      expect(screen.getByText('Step 1 of 6')).toBeTruthy();

      // Press continue
      fireEvent.press(screen.getByText('Continue'));

      // Should advance to step 2
      expect(screen.getByText('Step 2 of 6')).toBeTruthy();
      expect(screen.getByText('Understanding the Fog')).toBeTruthy();
    });

    it('should go back to previous step when back is pressed', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      // Advance to step 2
      fireEvent.press(screen.getByText('Continue'));
      expect(screen.getByText('Step 2 of 6')).toBeTruthy();

      // Press back
      fireEvent.press(screen.getByText('Back'));

      // Should return to step 1
      expect(screen.getByText('Step 1 of 6')).toBeTruthy();
      expect(screen.getByText('Welcome to FogOfDog!')).toBeTruthy();
    });

    it('should not show back button on first step', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      expect(screen.queryByText('Back')).toBeNull();
    });

    it('should show back button on steps after first', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      // Advance to step 2
      fireEvent.press(screen.getByText('Continue'));

      expect(screen.getByText('Back')).toBeTruthy();
    });
  });

  describe('tutorial steps content', () => {
    it('should show all tutorial steps in correct order', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      // Step 1: Welcome
      expect(screen.getByText('Welcome to FogOfDog!')).toBeTruthy();

      // Step 2: Fog explanation
      fireEvent.press(screen.getByText('Continue'));
      expect(screen.getByText('Understanding the Fog')).toBeTruthy();

      // Step 3: Location button
      fireEvent.press(screen.getByText('Continue'));
      expect(screen.getByText('Location Button')).toBeTruthy();

      // Step 4: Tracking control
      fireEvent.press(screen.getByText('Continue'));
      expect(screen.getByText('Tracking Control')).toBeTruthy();

      // Step 5: Settings access
      fireEvent.press(screen.getByText('Continue'));
      expect(screen.getByText('Settings & History')).toBeTruthy();

      // Step 6: Get started
      fireEvent.press(screen.getByText('Continue'));
      expect(screen.getByText('Start Exploring!')).toBeTruthy();
    });

    it('should show finish button on last step', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      // Navigate to last step
      for (let i = 0; i < 5; i++) {
        fireEvent.press(screen.getByText('Continue'));
      }

      expect(screen.getByText('Get Started!')).toBeTruthy();
      expect(screen.queryByText('Continue')).toBeNull();
    });
  });

  describe('completion and skip handling', () => {
    it('should call onComplete and mark onboarding completed when finish is pressed', async () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      // Navigate to last step
      for (let i = 0; i < 5; i++) {
        fireEvent.press(screen.getByText('Continue'));
      }

      // Press finish
      fireEvent.press(screen.getByText('Get Started!'));

      await waitFor(() => {
        expect(mockedOnboardingService.markOnboardingCompleted).toHaveBeenCalled();
        expect(mockOnComplete).toHaveBeenCalled();
      });
    });

    it('should call onSkip and mark onboarding completed when skip is pressed', async () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      fireEvent.press(screen.getByText('Skip Tutorial'));

      await waitFor(() => {
        expect(mockedOnboardingService.markOnboardingCompleted).toHaveBeenCalled();
        expect(mockOnSkip).toHaveBeenCalled();
      });
    });

    it('should handle onboarding completion errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedOnboardingService.markOnboardingCompleted.mockRejectedValue(new Error('Storage error'));

      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      fireEvent.press(screen.getByText('Skip Tutorial'));

      await waitFor(() => {
        expect(mockOnSkip).toHaveBeenCalled();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('accessibility', () => {
    it('should have proper accessibility labels', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      expect(screen.getByLabelText('Skip onboarding tutorial')).toBeTruthy();
      expect(screen.getByLabelText('Continue to next step')).toBeTruthy();
    });

    it('should have proper accessibility labels for back and finish buttons', () => {
      render(
        <OnboardingOverlay 
          visible={true} 
          onComplete={mockOnComplete} 
          onSkip={mockOnSkip} 
        />
      );

      // Navigate to step 2 to show back button
      fireEvent.press(screen.getByText('Continue'));
      expect(screen.getByLabelText('Go back to previous step')).toBeTruthy();

      // Navigate to last step to show finish button
      for (let i = 0; i < 4; i++) {
        fireEvent.press(screen.getByText('Continue'));
      }
      expect(screen.getByLabelText('Complete onboarding tutorial')).toBeTruthy();
    });
  });
}); 