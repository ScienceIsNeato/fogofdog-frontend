/**
 * MapScreen — thin entry-point that wires together extracted modules.
 *
 * Business logic lives in:
 *   hooks/useMapScreenOrchestration.ts   (state, services, event handlers)
 *   hooks/useLocationService.ts          (foreground + background GPS)
 *   hooks/useFogRegionState.ts           (threshold-gated fog region)
 *   hooks/useCinematicZoom.ts            (initial zoom animation)
 *   hooks/useMapScreenOnboarding.ts      (first-launch onboarding)
 *   hooks/usePermissionVerification.ts   (location permission flow)
 *   hooks/useStatsInitialization.ts      (stats bootstrapping)
 *
 * Rendering lives in:
 *   components/MapScreenRenderer.tsx     (MapScreenUI, MapScreenRenderer)
 *
 * Shared utilities:
 *   utils/mapCamera.ts                   (camera animation helpers)
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import {
  PermissionDeniedScreen,
  PermissionLoadingScreen,
  AllowOnceWarningOverlay,
} from './components';
import { useMapScreenOnboarding } from './hooks/useMapScreenOnboarding';
import { usePermissionVerification } from './hooks/usePermissionVerification';
import { useStatsInitialization } from './hooks/useStatsInitialization';
import { useMapScreenLogic } from './hooks/useMapScreenOrchestration';
import { MapScreenUI } from './components/MapScreenRenderer';
import { HUDStatsPanel } from '../../components/HUDStatsPanel';
import { ExplorationNudge } from '../../components/ExplorationNudge';
import { OnboardingOverlay } from '../../components/OnboardingOverlay';
import { logger } from '../../utils/logger';
import { styles } from './styles';

// Re-export for backwards compatibility (used by useCinematicZoom, tests)
export { calculateExplorationBounds, isNullIslandRegion } from './utils/mapCamera';

export const MapScreen = () => {
  useStatsInitialization();

  const onboardingHookState = useMapScreenOnboarding();
  const { showOnboarding, handleOnboardingComplete, handleOnboardingSkip } = onboardingHookState;

  const shouldVerifyPermissions = !showOnboarding;
  const {
    isVerifying,
    isVerified,
    hasPermissions,
    backgroundGranted,
    mode,
    error,
    resetVerification,
  } = usePermissionVerification(shouldVerifyPermissions);

  const permissionsVerified = isVerified && hasPermissions;

  // DEBUG: Track state transitions that could cause white screen
  useEffect(() => {
    logger.info('MapScreen state transition', {
      component: 'MapScreen',
      showOnboarding,
      shouldVerifyPermissions,
      isVerifying,
      isVerified,
      hasPermissions,
      permissionsVerified,
      backgroundGranted,
      timestamp: new Date().toISOString(),
    });
  }, [
    showOnboarding,
    shouldVerifyPermissions,
    isVerifying,
    isVerified,
    hasPermissions,
    permissionsVerified,
    backgroundGranted,
  ]);

  useEffect(() => {
    logger.info('MapScreen onboarding state', {
      component: 'MapScreen',
      hookShowOnboarding: onboardingHookState.showOnboarding,
      hookHasCompletedOnboarding: onboardingHookState.hasCompletedOnboarding,
      hookCanStartLocationServices: onboardingHookState.canStartLocationServices,
      mainShowOnboarding: showOnboarding,
      timestamp: new Date().toISOString(),
    });
  }, [
    onboardingHookState.showOnboarding,
    onboardingHookState.hasCompletedOnboarding,
    onboardingHookState.canStartLocationServices,
    showOnboarding,
  ]);

  const { uiProps } = useMapScreenLogic(
    onboardingHookState,
    permissionsVerified,
    backgroundGranted
  );

  const showPermissionScreen =
    shouldVerifyPermissions && (isVerifying || (isVerified && !hasPermissions));
  const showOnceOnlyWarning = isVerified && mode === 'once_only';
  const canStartCinematicAnimation = !showOnboarding && permissionsVerified;

  return (
    <>
      <MapScreenUI {...uiProps} canStartCinematicAnimation={canStartCinematicAnimation} />
      <HUDStatsPanel />
      <ExplorationNudge />
      <OnboardingOverlay
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
      {showPermissionScreen && (
        <View style={styles.loadingContainer}>
          {mode === 'denied' ? (
            <PermissionDeniedScreen error={error} onRetry={resetVerification} />
          ) : (
            <PermissionLoadingScreen error={error} onRetry={resetVerification} />
          )}
        </View>
      )}
      <AllowOnceWarningOverlay visible={showOnceOnlyWarning} onDismiss={resetVerification} />
    </>
  );
};
