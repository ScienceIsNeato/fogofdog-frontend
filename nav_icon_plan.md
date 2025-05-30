# Navigation Icon Implementation Plan

## Overview

This document outlines the plan to add a "center on user location" button to the FogOfDog map screen. This button will be positioned in the upper right corner and will center the map on the user's current GPS location when tapped.

## Design Requirements

### Visual Design
- **Position**: Upper right corner of the screen, with appropriate padding from edges
- **Icon**: Use a standard "location" icon that users will recognize:
  - Primary option: Crosshair/target icon (⊕ or similar)
  - Alternative: Arrow pointing to dot (common in Google Maps/Apple Maps)
- **Size**: 44x44 points minimum (Apple HIG recommendation for touch targets)
- **Style**: 
  - White icon on semi-transparent dark background (for visibility over any map style)
  - Circular button with subtle shadow for depth
  - Visual feedback on press (opacity change or scale animation)

### Behavior
- **Tap Action**: Centers map on user's current GPS location with smooth animation
- **State Indication**: 
  - Normal state: Icon visible when user location is available
  - Disabled state: Grayed out if location not available
  - Active state: Different appearance when map is already centered on user
- **Error Handling**: Show appropriate feedback if location services are disabled

## Technical Implementation

### 1. Component Structure

Create a new component `LocationButton.tsx` in `frontend/src/components/`:

```typescript
interface LocationButtonProps {
  onPress: () => void;
  isLocationAvailable: boolean;
  isCentered: boolean;
  style?: ViewStyle;
}
```

### 2. Icon Selection

We'll use react-native-vector-icons (already likely in the project) or Expo's vector icons:
- Primary choice: `MaterialIcons.my-location` (crosshair icon)
- Fallback: `Ionicons.locate` or `FontAwesome.location-arrow`

### 3. Integration with MapScreen

The MapScreen will need to:
1. Track whether the map is currently centered on user location
2. Provide a method to center the map on current location
3. Position the LocationButton appropriately

### 4. State Management

Add to Redux exploration slice:
- `isMapCenteredOnUser: boolean` - tracks if map is following user
- Action: `setCenterOnUser(boolean)` - updates centering state

### 5. Implementation Steps

#### Step 1: Create LocationButton Component
- Implement the visual component with proper styling
- Add touch feedback (TouchableOpacity or Pressable)
- Handle disabled/active states visually

#### Step 2: Add Map Centering Logic
- Create `centerOnUserLocation` method in MapScreen
- Use MapView's `animateToRegion` for smooth transition
- Calculate appropriate zoom level (maintain current or default to reasonable level)

#### Step 3: Track Centering State
- Monitor map region changes to detect when user manually pans away
- Update `isMapCenteredOnUser` accordingly
- Reset state when user manually interacts with map

#### Step 4: Position Button on Screen
- Use absolute positioning within MapScreen
- Account for safe area insets (notch, status bar)
- Ensure button doesn't overlap with other UI elements

## Testing Strategy

### 1. Unit Tests

**LocationButton Component Tests** (`LocationButton.test.tsx`):
- Renders correctly in all states (normal, disabled, active)
- Calls onPress when tapped (if not disabled)
- Applies correct styles based on props
- Shows correct icon based on state

**Redux State Tests** (update `explorationSlice.test.ts`):
- `setCenterOnUser` action updates state correctly
- State initializes with correct default

### 2. Integration Tests

**MapScreen Integration Tests** (`MapScreen.test.tsx`):
- LocationButton appears when location is available
- Button is disabled when location is unavailable
- Tapping button calls map centering logic
- Map region updates trigger state changes
- Button visual state reflects centering status

### 3. E2E Tests

**New E2E Test** (`e2e/mapNavigation.test.js`):
```javascript
describe('Map Navigation', () => {
  it('should center map on user location when button is tapped', async () => {
    // Login and navigate to map
    // Verify location button is visible
    // Pan map away from current location
    // Tap location button
    // Verify map animates back to user location
    // Verify button shows "active" state
  });

  it('should exit centered mode when user pans map', async () => {
    // Center on location
    // Manually pan map
    // Verify button returns to normal state
  });
});
```

### 4. Manual Testing Checklist

- [ ] Button appears in correct position on all device sizes
- [ ] Button is visible over different map styles/colors
- [ ] Touch target is large enough (44x44 minimum)
- [ ] Animation is smooth when centering
- [ ] Button state updates correctly when panning
- [ ] Works correctly when app returns from background
- [ ] Handles location permission changes gracefully
- [ ] No performance impact on map interactions

## Accessibility Considerations

- Add `accessibilityLabel`: "Center on current location"
- Add `accessibilityHint`: "Double tap to center the map on your current location"
- Ensure button has proper `accessibilityRole`: "button"
- Support VoiceOver/TalkBack announcements for state changes

## Future Enhancements (Out of Scope)

- Long press to enable "follow mode" (continuous centering)
- Different icon when in follow mode vs one-time center
- Compass integration (show rotation, tap to reset north)
- 3D/tilt view toggle
- Location accuracy indicator

## Implementation Order

1. Create LocationButton component with tests
2. Add Redux state management
3. Integrate into MapScreen
4. Add map centering logic
5. Implement state tracking
6. Add E2E tests
7. Manual testing and refinement

## Success Criteria

- Button is intuitive and matches user expectations from other map apps
- Centering animation is smooth and responsive
- State management is reliable and predictable
- All automated tests pass
- Manual testing confirms good UX on physical devices

## Estimated Timeline

- Component creation and unit tests: 1-2 hours
- MapScreen integration: 1-2 hours  
- State management and tracking: 1 hour
- E2E tests: 1 hour
- Testing and refinement: 1 hour

Total: 5-7 hours of focused development 