import { createContext, useContext } from 'react';

// Context for sharing onboarding state
interface OnboardingContextType {
  isFirstTimeUser: boolean;
}

export const OnboardingContext = createContext<OnboardingContextType>({ isFirstTimeUser: false });

export const useOnboardingContext = () => useContext(OnboardingContext);
