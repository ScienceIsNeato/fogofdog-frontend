import { MaterialIcons } from '@expo/vector-icons';

export interface OnboardingStep {
  id: number;
  title: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "You're a dog in a new neighborhood.",
    description:
      'Everything is unknown. Explore & track your adventures as you discover this new world!',
    icon: 'pets',
  },
  {
    id: 2,
    title: 'The world around you is shrouded in fog.',
    description:
      "You can only see your immediate surroundings. Gray areas are unexplored, clear areas show where you've been. Move around to reveal the map!",
    icon: 'visibility',
  },
  {
    id: 3,
    title: 'As you walk around in real life,',
    description:
      'the fog lifts to reveal what you discover. Tap the location button to center the map on your current position. It turns blue when active.',
    icon: 'directions-walk',
  },
  {
    id: 4,
    title: 'Every step you take unveils more',
    description:
      'of your new territory. Use the pause button to stop or resume tracking your exploration. Perfect for breaks!',
    icon: 'explore',
  },
  {
    id: 5,
    title: "Places you've been before stay revealed.",
    description:
      'You build a memory of your world. Access app settings and manage your exploration history through the settings menu.',
    icon: 'my-location',
  },
  {
    id: 6,
    title: 'Ready to explore your neighborhood?',
    description:
      'Time to start sniffing around! Start moving around to clear the fog and discover new areas.',
    icon: 'flag',
  },
];

export const TOTAL_ONBOARDING_STEPS = ONBOARDING_STEPS.length;
