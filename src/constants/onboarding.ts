import { MaterialIcons } from '@expo/vector-icons';

export interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  pointTo?: 'location-button' | 'settings-button' | 'tracking-button';
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: 'Welcome!',
    description:
      "You're a dog in a new neighborhood. Everything is unknown. Explore & track your adventures as you discover this new world! This tutorial will show you the three main buttons you need.",
    icon: 'pets',
  },
  {
    id: 2,
    title: 'The world around you is shrouded in fog.',
    description:
      "Dark areas are unexplored, revealed areas show where you've been. As you move around in real life, the fog lifts to reveal your discoveries!",
    icon: 'visibility',
  },
  {
    id: 3,
    title: '📍 Location Button (Top Right)',
    description:
      'Tap this button to center the map on your current position. TAP AGAIN to enter "follow mode" - it turns blue and keeps you centered as you move.',
    icon: 'my-location',
    pointTo: 'location-button',
  },
  {
    id: 4,
    title: '⚙️ Settings Button (Top Left)',
    description:
      'Access app settings, manage your exploration history, clear data, and configure developer options through this menu.',
    icon: 'settings',
    pointTo: 'settings-button',
  },
  {
    id: 5,
    title: '⏸️ Tracking Control (Bottom Center)',
    description:
      'Pause tracking when not actively exploring! Like exiting a route in Google Maps, this saves battery and stops GPS usage.',
    icon: 'pause-circle-outline',
    pointTo: 'tracking-button',
  },
  {
    id: 6,
    title: "Let's Explore!",
    description:
      "You'll see some permission screens next - we need location access to track your adventures. Don't worry, your data stays private on your device!",
    icon: 'meeting-room',
  },
];

export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;
