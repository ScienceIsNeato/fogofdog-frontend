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
      "This is a neighborhood exploration experience from the perspective of a fictional dog who just moved into your home. That's you.\n\nYou're a dog now.",
    icon: 'pets',
  },
  {
    id: 2,
    title: 'The world around you is shrouded in fog.',
    description:
      "As you sniff around your neighborhood, you'll develop a mental map, remembering places you've been before.",
    icon: 'pets', // Will be dog snoot - using pets as closest available
  },
  {
    id: 3,
    title: 'Location Button (Top Right)',
    description:
      'Tap this button to center the map on you. Tap again to enter "follow mode" — it turns blue and keeps you centered as you move.',
    icon: 'my-location',
    pointTo: 'location-button',
  },
  {
    id: 4,
    title: 'Settings Button (Top Left)',
    description: 'Access app settings like location data management and developer settings.',
    icon: 'settings',
    pointTo: 'settings-button',
  },
  {
    id: 5,
    title: 'Tracking Control (Bottom Center)',
    description:
      'Pause tracking when not actively exploring. Like exiting a route in Google Maps, this saves battery and stops GPS usage.',
    icon: 'pause-circle-outline',
    pointTo: 'tracking-button',
  },
  {
    id: 6,
    title: 'Adventure Time!',
    description:
      'Time to hit the pavement and start carving some fun out of the fog!\n\nFYI: Location permission request incoming — required since this is a real-world adventure app. GPS data is securely stored on your device and nowhere else.',
    icon: 'meeting-room',
  },
];

export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;
