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
    title: 'Welcome to the Fog!',
    description:
      'Games like Warcraft and Age of Empires use an exploration mechanic called "Fog of War", where maps start out completely black and only come to life as you explore it. This game brings that concept out into the real world from the perspective of a dog.\n\nYou are a dog now.',
    icon: 'pets',
  },
  {
    id: 2,
    title: 'The world around you is shrouded in fog.',
    description:
      "As you sniff around your 'hood, your mental map will start lighting up, and you'll remember places that you've been before.",
    icon: 'pets', // Will be dog snoot - using pets as closest available
  },
  {
    id: 3,
    title: 'Location Button (Top Right)',
    description:
      'Tap this button to center the map on your current position. Tap again to enter "follow mode" - it turns blue and keeps you centered as you move.',
    icon: 'my-location',
    pointTo: 'location-button',
  },
  {
    id: 4,
    title: 'Settings Button (Top Left)',
    description:
      'Access app settings, manage your exploration history, clear data, and configure developer options through this menu.',
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
    title: "Let's Explore!",
    description:
      "You'll see some permission screens next - we need location access to track your adventures. Don't worry, your data stays private on your device!",
    icon: 'meeting-room',
  },
];

export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;
