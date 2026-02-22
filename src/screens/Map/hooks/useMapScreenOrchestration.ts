/**
 * MapScreen orchestration — hooks that compose all map screen concerns.
 * Contains map event handlers, data clearing, exploration persistence,
 * service coordination, and the top-level useMapScreenLogic hook.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Dimensions } from 'react-native';
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  updateLocation,
  updateZoom,
  setCenterOnUser,
  toggleFollowMode,
  setFollowMode,
} from '../../../store/slices/explorationSlice';
import { AuthPersistenceService } from '../../../services/AuthPersistenceService';
import { BackgroundLocationService } from '../../../services/BackgroundLocationService';
import { DataClearingService } from '../../../services/DataClearingService';
import { GPSInjectionService } from '../../../services/GPSInjectionService';
import { logger } from '../../../utils/logger';
import { constrainRegion } from '../../../constants/mapConstraints';
import type { MapRegion } from '../../../types/map';
import type { GeoPoint } from '../../../types/user';
import { DataStats, ClearType } from '../../../types/dataClear';

import { animateMapToRegion, centerMapOnCoordinate, isNullIslandRegion } from '../utils/mapCamera';
import { useUnifiedLocationService, getInitialLocation } from './useLocationService';
import { useFogRegionState } from './useFogRegionState';
import type { useMapScreenOnboarding } from './useMapScreenOnboarding';

// ─── Map Event Handlers ───────────────────────────────────────────────────────

const createZoomHandler = (dispatch: ReturnType<typeof useAppDispatch>) => (newZoom: number) => {
  dispatch(updateZoom(newZoom));
};

function handleRegionChange({
  region,
  setCurrentRegion,
  mapDimensions,
  workletUpdateRegion,
}: {
  region: MapRegion;
  setCurrentRegion: (region: MapRegion) => void;
  mapDimensions: { width: number; height: number };
  workletUpdateRegion: (region: MapRegion & { width: number; height: number }) => void;
}) {
  if (isNullIslandRegion(region)) return;

  const regionWithDimensions = {
    ...region,
    width: mapDimensions.width,
    height: mapDimensions.height,
  };

  workletUpdateRegion(regionWithDimensions);
  setCurrentRegion(region);
}

function handlePanDrag({ dispatch }: { dispatch: ReturnType<typeof useAppDispatch> }) {
  dispatch(setCenterOnUser(false));
  dispatch(setFollowMode(false));

  logger.throttledDebug(
    'MapScreen:onPanDrag',
    'User dragged map - follow mode disabled',
    { component: 'MapScreen', action: 'onPanDrag' },
    1000
  );
}

function handleRegionChangeComplete({
  region,
  setCurrentRegion,
  handleZoomChange,
  mapRef,
  cinematicZoomActiveRef,
}: {
  region: MapRegion;
  setCurrentRegion: (region: MapRegion) => void;
  handleZoomChange: (zoom: number) => void;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
}) {
  if (isNullIslandRegion(region)) return;

  const constrainedRegion = constrainRegion(region);
  const zoom = Math.round(Math.log(360 / constrainedRegion.latitudeDelta) / Math.LN2);

  if (
    (constrainedRegion.latitudeDelta !== region.latitudeDelta ||
      constrainedRegion.longitudeDelta !== region.longitudeDelta) &&
    !cinematicZoomActiveRef.current
  ) {
    logger.debug('Applying zoom constraints', {
      component: 'MapScreen',
      reason: 'zoom_constraint_violation',
    });
    animateMapToRegion(mapRef, constrainedRegion, 200);
  }

  setCurrentRegion(constrainedRegion);
  handleZoomChange(zoom);
}

export const useMapEventHandlers = (options: {
  dispatch: ReturnType<typeof useAppDispatch>;
  currentLocation: GeoPoint | null;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  setCurrentRegion: (region: MapRegion) => void;
  mapDimensions: { width: number; height: number };
  workletUpdateRegion: (region: MapRegion & { width: number; height: number }) => void;
}) => {
  const {
    dispatch,
    currentLocation,
    isFollowModeActive,
    mapRef,
    cinematicZoomActiveRef,
    setCurrentRegion,
    mapDimensions,
    workletUpdateRegion,
  } = options;

  const lastRegionCallRef = useRef(0);
  const handleZoomChange = useMemo(() => createZoomHandler(dispatch), [dispatch]);

  const centerOnUserLocation = useCallback(() => {
    dispatch(toggleFollowMode());
    if (!isFollowModeActive) {
      // Turning ON → snap camera to user (if possible) and mark as centered
      if (currentLocation && mapRef.current && !cinematicZoomActiveRef.current) {
        centerMapOnCoordinate(mapRef, currentLocation, 300);
      }
      dispatch(setCenterOnUser(true));
    } else {
      // Turning OFF → clear centered flag so button visually deactivates
      dispatch(setCenterOnUser(false));
    }
  }, [dispatch, isFollowModeActive, currentLocation, mapRef, cinematicZoomActiveRef]);

  const onRegionChange = useCallback(
    (region: MapRegion) => {
      const now = Date.now();
      if (now - lastRegionCallRef.current >= 16) {
        lastRegionCallRef.current = now;
        handleRegionChange({ region, setCurrentRegion, mapDimensions, workletUpdateRegion });
      }
    },
    [setCurrentRegion, mapDimensions, workletUpdateRegion]
  );

  const onPanDrag = useCallback(() => handlePanDrag({ dispatch }), [dispatch]);

  const onRegionChangeComplete = useCallback(
    (region: MapRegion) =>
      handleRegionChangeComplete({
        region,
        setCurrentRegion,
        handleZoomChange,
        mapRef,
        cinematicZoomActiveRef,
      }),
    [setCurrentRegion, handleZoomChange, mapRef, cinematicZoomActiveRef]
  );

  return { centerOnUserLocation, onRegionChange, onPanDrag, onRegionChangeComplete };
};

// ─── Exploration State Persistence ────────────────────────────────────────────

const useExplorationStatePersistence = (explorationState: any) => {
  useEffect(() => {
    const persistExplorationState = async () => {
      try {
        logger.info('🔄 Starting exploration state persistence', {
          component: 'MapScreen',
          action: 'persistExplorationState',
          pathLength: explorationState.path.length,
          hasCurrentLocation: !!explorationState.currentLocation,
        });

        await AuthPersistenceService.saveExplorationState({
          currentLocation: explorationState.currentLocation,
          path: explorationState.path,
          exploredAreas: explorationState.exploredAreas,
          zoomLevel: explorationState.zoomLevel,
          isTrackingPaused: explorationState.isTrackingPaused,
        });

        logger.info('✅ Exploration state persistence completed successfully', {
          component: 'MapScreen',
          action: 'persistExplorationState',
          pathLength: explorationState.path.length,
        });

        const savedState = await AuthPersistenceService.getExplorationState();
        logger.info('🔍 Verified saved exploration state', {
          component: 'MapScreen',
          action: 'persistExplorationState',
          savedPathLength: savedState?.path.length ?? 0,
          savedSuccessfully: savedState !== null,
        });
      } catch (error) {
        logger.error('❌ Failed to persist exploration state', error, {
          component: 'MapScreen',
          action: 'persistExplorationState',
        });
      }
    };

    if (explorationState.path.length > 0 || explorationState.currentLocation) {
      logger.info('📊 Triggering exploration state persistence', {
        component: 'MapScreen',
        pathLength: explorationState.path.length,
        hasCurrentLocation: !!explorationState.currentLocation,
      });
      persistExplorationState();
    }
  }, [
    explorationState.currentLocation,
    explorationState.path,
    explorationState.exploredAreas,
    explorationState.zoomLevel,
    explorationState.isTrackingPaused,
  ]);
};

// ─── App State Change Handler ─────────────────────────────────────────────────

const processStoredBackgroundLocations = async (
  storedLocations: any[],
  options: {
    dispatch: ReturnType<typeof useAppDispatch>;
    isMapCenteredOnUser: boolean;
    mapRef: React.RefObject<CameraRef | null>;
  }
) => {
  const { dispatch, isMapCenteredOnUser, mapRef } = options;

  if (storedLocations.length === 0) return;

  logger.info(`Processed ${storedLocations.length} stored background locations`);
  const mostRecent = storedLocations[storedLocations.length - 1];
  if (!mostRecent) return;

  dispatch(
    updateLocation({
      latitude: mostRecent.latitude,
      longitude: mostRecent.longitude,
      timestamp: mostRecent.timestamp,
    })
  );

  if (isMapCenteredOnUser && mapRef.current && !(mapRef.current as any)?._cinematicZoomActive) {
    centerMapOnCoordinate(mapRef, mostRecent, 500);
  }
};

const useAppStateChangeHandler = (
  dispatch: ReturnType<typeof useAppDispatch>,
  isMapCenteredOnUser: boolean,
  mapRef: React.RefObject<CameraRef | null>
) => {
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState !== 'active') return;

      logger.info('App became active, processing stored background locations');
      try {
        const storedLocations = await BackgroundLocationService.processStoredLocations();
        await processStoredBackgroundLocations(storedLocations, {
          dispatch,
          isMapCenteredOnUser,
          mapRef,
        });
      } catch (error) {
        logger.error('Failed to process stored locations on app state change', error);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [dispatch, isMapCenteredOnUser, mapRef]);
};

// ─── Data Clearing ────────────────────────────────────────────────────────────

const performDataClear = async (type: ClearType) => {
  if (type === 'all') {
    await DataClearingService.clearAllData();
  } else {
    const hours = type === 'hour' ? 1 : 24;
    const startTime = Date.now() - hours * 60 * 60 * 1000;
    await DataClearingService.clearDataByTimeRange(startTime);
  }
};

const refetchLocationAfterClear = async (
  type: ClearType,
  options: {
    dispatch: ReturnType<typeof useAppDispatch>;
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    isMapCenteredOnUser: boolean;
  }
) => {
  logger.info('Re-fetching current location after data clear', {
    component: 'MapScreen',
    action: 'handleClearSelection',
    clearType: type,
  });

  const isActiveRef = { current: true };
  await getInitialLocation({
    isActiveRef,
    dispatch: options.dispatch,
    mapRef: options.mapRef,
    cinematicZoomActiveRef: options.cinematicZoomActiveRef,
    isMapCenteredOnUser: options.isMapCenteredOnUser,
    isFollowModeActive: false,
    explorationPath: [],
    isSessionActive: false,
  });
};

const createDataClearHandler = (
  state: {
    isClearing: boolean;
    setIsClearing: React.Dispatch<React.SetStateAction<boolean>>;
    setDataStats: React.Dispatch<React.SetStateAction<DataStats>>;
    setIsDataClearDialogVisible: React.Dispatch<React.SetStateAction<boolean>>;
  },
  config: {
    dispatch: ReturnType<typeof useAppDispatch>;
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    isMapCenteredOnUser: boolean;
  }
) => {
  const { isClearing, setIsClearing, setDataStats, setIsDataClearDialogVisible } = state;
  return async (type: ClearType) => {
    logger.info('handleClearSelection called', {
      component: 'MapScreen',
      action: 'handleClearSelection',
      clearType: type,
      isClearing: isClearing,
    });

    if (isClearing) {
      logger.warn('handleClearSelection blocked - already clearing', {
        component: 'MapScreen',
        action: 'handleClearSelection',
        clearType: type,
      });
      return;
    }

    setIsClearing(true);
    try {
      await performDataClear(type);
      await refetchLocationAfterClear(type, config);

      Alert.alert('Success', 'Exploration data has been cleared.');
      const newStats = await DataClearingService.getDataStats();
      setDataStats(newStats);
    } catch (error) {
      logger.error('Failed to clear data', { error });
      Alert.alert('Error', 'Failed to clear exploration data.');
    } finally {
      setIsClearing(false);
      setIsDataClearDialogVisible(false);
    }
  };
};

const useDataClearing = (
  dispatch: ReturnType<typeof useAppDispatch>,
  mapConfig: {
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    isMapCenteredOnUser: boolean;
  },
  explorationState: any
) => {
  const [dataStats, setDataStats] = useState<DataStats>({
    totalPoints: 0,
    recentPoints: 0,
    oldestDate: null,
    newestDate: null,
  });
  const [isClearing, setIsClearing] = useState(false);
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);

  const updateDataStats = useCallback(async () => {
    try {
      const stats = await DataClearingService.getDataStats();
      setDataStats(stats);
    } catch (error) {
      logger.debug('Failed to update data stats', {
        component: 'MapScreen',
        action: 'updateDataStats',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    updateDataStats();
  }, [updateDataStats]);

  useEffect(() => {
    if (explorationState.path.length > 0) {
      updateDataStats();
    }
  }, [explorationState.path.length, updateDataStats]);

  const handleClearSelection = createDataClearHandler(
    { isClearing, setIsClearing, setDataStats, setIsDataClearDialogVisible: () => {} },
    { dispatch, ...mapConfig }
  );

  return {
    dataStats,
    isClearing,
    handleClearSelection,
    isSettingsModalVisible,
    setIsSettingsModalVisible,
  };
};

// ─── Data Clearing State ──────────────────────────────────────────────────────

const useDataClearingState = () => {
  const [dataStats, setDataStats] = useState<DataStats>({
    totalPoints: 0,
    recentPoints: 0,
    oldestDate: null,
    newestDate: null,
  });
  const [isDataClearDialogVisible, setIsDataClearDialogVisible] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSettingsMenuVisible, setIsSettingsMenuVisible] = useState(false);

  return {
    dataStats,
    setDataStats,
    isDataClearDialogVisible,
    setIsDataClearDialogVisible,
    isClearing,
    setIsClearing,
    isSettingsMenuVisible,
    setIsSettingsMenuVisible,
  };
};

// ─── MapScreen State ──────────────────────────────────────────────────────────

export const useMapScreenState = () => {
  const dispatch = useAppDispatch();
  const { currentLocation, isMapCenteredOnUser, isFollowModeActive } = useAppSelector(
    (state) => state.exploration
  );

  React.useEffect(() => {
    logger.info('🗺️ MapScreen currentLocation changed', {
      component: 'MapScreen',
      action: 'currentLocationChange',
      location: currentLocation
        ? `${currentLocation.latitude}, ${currentLocation.longitude}`
        : 'null',
      timestamp: Date.now(),
    });
  }, [currentLocation]);

  const mapRef = useRef<CameraRef>(null);
  const cinematicZoomActiveRef = useRef(false);
  const [currentRegion, setCurrentRegion] = useState<MapRegion | undefined>(undefined);
  const [mapDimensions, setMapDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  });

  const fogRegionState = useFogRegionState(currentLocation, mapDimensions, currentRegion);
  const dataClearingState = useDataClearingState();

  return {
    dispatch,
    currentLocation,
    isMapCenteredOnUser,
    isFollowModeActive,
    mapRef,
    cinematicZoomActiveRef,
    currentRegion,
    setCurrentRegion,
    setMapDimensions,
    mapDimensions,
    ...fogRegionState,
    ...dataClearingState,
  };
};

// ─── MapScreen Services ───────────────────────────────────────────────────────

export interface MapScreenServicesConfig {
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  isTrackingPaused: boolean;
  explorationState: any;
}

export interface MapScreenServicesFullConfig {
  dispatch: ReturnType<typeof useAppDispatch>;
  servicesConfig: MapScreenServicesConfig;
  allowLocationRequests?: boolean;
  setPermissionsGranted?: (granted: boolean) => void;
  permissionsVerified?: boolean;
  backgroundGranted?: boolean;
}

const useMapScreenServices = (config: MapScreenServicesFullConfig) => {
  const {
    dispatch,
    servicesConfig,
    allowLocationRequests = true,
    setPermissionsGranted,
    permissionsVerified = false,
    backgroundGranted = false,
  } = config;

  const {
    mapRef,
    cinematicZoomActiveRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    isTrackingPaused,
    explorationState,
  } = servicesConfig;

  const isSessionActive = useAppSelector(
    (state) => state.stats.currentSession && !state.stats.currentSession.endTime
  );

  // CRITICAL: Memoize locationConfig to prevent infinite re-render loop.
  const memoizedLocationConfig = useMemo(
    () => ({
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      isTrackingPaused,
      explorationPath: explorationState.path,
      isSessionActive,
    }),
    [
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      isTrackingPaused,
      explorationState.path.length,
      isSessionActive,
    ]
  );

  useUnifiedLocationService({
    dispatch,
    locationConfig: memoizedLocationConfig,
    allowLocationRequests,
    ...(setPermissionsGranted && { onPermissionsGranted: setPermissionsGranted }),
    permissionsVerified,
    backgroundGranted,
  });

  useExplorationStatePersistence(explorationState);

  // Only start GPS injection check AFTER permissions are verified
  useEffect(() => {
    if (permissionsVerified) {
      logger.info('📍 GPS_DEBUG: Permissions verified - starting GPS services', {
        component: 'useMapScreenServices',
        action: 'startGPSInjection',
        permissionsVerified,
        backgroundGranted,
        allowLocationRequests,
        timestamp: new Date().toISOString(),
      });

      GPSInjectionService.checkForInjectionOnce()
        .then((injectedData) => {
          if (injectedData.length > 0) {
            logger.info('Found GPS injection data after permission verification', {
              component: 'useMapScreenServices',
              dataCount: injectedData.length,
            });
          }
        })
        .catch((error) => {
          logger.warn('Error checking for GPS injection after permission verification', {
            component: 'useMapScreenServices',
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }, [permissionsVerified, backgroundGranted, allowLocationRequests]);

  useAppStateChangeHandler(dispatch, isMapCenteredOnUser, mapRef);
};

// ─── MapScreen Redux State ────────────────────────────────────────────────────

export const useMapScreenReduxState = () => {
  const explorationState = useAppSelector((state) => state.exploration);
  const isTrackingPaused = useAppSelector((state) => state.exploration.isTrackingPaused);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    logger.info('📍 GPS_DEBUG: Redux currentLocation state change', {
      component: 'useMapScreenReduxState',
      hasCurrentLocation: !!explorationState.currentLocation,
      currentLocation: explorationState.currentLocation
        ? `${explorationState.currentLocation.latitude.toFixed(6)}, ${explorationState.currentLocation.longitude.toFixed(6)}`
        : null,
      timestamp: new Date().toISOString(),
    });
  }, [explorationState.currentLocation]);

  return {
    explorationState,
    isTrackingPaused,
    insets,
    gpsInjectionStatus: explorationState.gpsInjectionStatus,
  };
};

// ─── Navigation ───────────────────────────────────────────────────────────────

const useMapScreenNavigation = (setIsSettingsModalVisible: (visible: boolean) => void) => {
  const handleSettingsPress = useCallback(() => {
    logger.info('Settings button pressed - showing unified settings modal', {
      component: 'MapScreen',
      action: 'handleSettingsPress',
    });
    setIsSettingsModalVisible(true);
  }, [setIsSettingsModalVisible]);

  return { handleSettingsPress };
};

// ─── Hook State Composition ───────────────────────────────────────────────────

const useMapScreenHookStates = (onboarding: ReturnType<typeof useMapScreenOnboarding>) => {
  const mapState = useMapScreenState();
  const reduxState = useMapScreenReduxState();
  return { onboarding, mapState, reduxState };
};

interface MapScreenServicesHandlersConfig {
  onboarding: any;
  mapState: any;
  reduxState: any;
  permissionsVerified?: boolean;
  backgroundGranted?: boolean;
}

const useMapScreenServicesAndHandlers = (config: MapScreenServicesHandlersConfig) => {
  const {
    onboarding,
    mapState,
    reduxState,
    permissionsVerified = false,
    backgroundGranted = false,
  } = config;

  const dataClearing = useDataClearing(
    mapState.dispatch,
    {
      mapRef: mapState.mapRef,
      cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
    },
    reduxState.explorationState
  );
  const navigation = useMapScreenNavigation(dataClearing.setIsSettingsModalVisible);

  useEffect(() => {
    logger.debug('useMapScreenServicesAndHandlers - allowLocationRequests state', {
      component: 'useMapScreenServicesAndHandlers',
      action: 'allowLocationRequests',
      canStartLocationServices: onboarding.canStartLocationServices,
      permissionsVerified,
      backgroundGranted,
      showOnboarding: onboarding.showOnboarding,
      hasCompletedOnboarding: onboarding.hasCompletedOnboarding,
      timestamp: Date.now(),
    });
  }, [
    onboarding.canStartLocationServices,
    permissionsVerified,
    backgroundGranted,
    onboarding.showOnboarding,
    onboarding.hasCompletedOnboarding,
  ]);

  useMapScreenServices({
    dispatch: mapState.dispatch,
    servicesConfig: {
      mapRef: mapState.mapRef,
      cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
      isFollowModeActive: mapState.isFollowModeActive,
      isTrackingPaused: reduxState.isTrackingPaused,
      explorationState: reduxState.explorationState,
    },
    allowLocationRequests: onboarding.canStartLocationServices,
    permissionsVerified,
    backgroundGranted,
  });

  const eventHandlers = useMapEventHandlers({
    dispatch: mapState.dispatch,
    currentLocation: mapState.currentLocation,
    isMapCenteredOnUser: mapState.isMapCenteredOnUser,
    isFollowModeActive: mapState.isFollowModeActive,
    mapRef: mapState.mapRef,
    cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
    setCurrentRegion: mapState.setCurrentRegion,
    mapDimensions: mapState.mapDimensions,
    workletUpdateRegion: mapState.updateFogRegion,
  });

  return { dataClearing, navigation, eventHandlers };
};

// ─── Top-Level Orchestrator ───────────────────────────────────────────────────

export const useMapScreenLogic = (
  onboarding: ReturnType<typeof useMapScreenOnboarding>,
  permissionsVerified: boolean = false,
  backgroundGranted: boolean = false
) => {
  const { mapState, reduxState } = useMapScreenHookStates(onboarding);

  const { dataClearing, navigation, eventHandlers } = useMapScreenServicesAndHandlers({
    onboarding,
    mapState,
    reduxState,
    permissionsVerified,
    backgroundGranted,
  });

  return {
    showOnboarding: onboarding.showOnboarding,
    handleOnboardingComplete: onboarding.handleOnboardingComplete,
    handleOnboardingSkip: onboarding.handleOnboardingSkip,
    uiProps: {
      mapRef: mapState.mapRef,
      cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
      currentLocation: mapState.currentLocation,
      insets: reduxState.insets,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
      isFollowModeActive: mapState.isFollowModeActive,
      onRegionChange: eventHandlers.onRegionChange,
      onPanDrag: eventHandlers.onPanDrag,
      onRegionChangeComplete: eventHandlers.onRegionChangeComplete,
      centerOnUserLocation: eventHandlers.centerOnUserLocation,
      setMapDimensions: mapState.setMapDimensions,
      currentFogRegion: mapState.currentFogRegion,
      isClearing: dataClearing.isClearing,
      dataStats: dataClearing.dataStats,
      handleClearSelection: dataClearing.handleClearSelection,
      handleSettingsPress: navigation.handleSettingsPress,
      isSettingsModalVisible: dataClearing.isSettingsModalVisible,
      setIsSettingsModalVisible: dataClearing.setIsSettingsModalVisible,
      gpsInjectionStatus: reduxState.gpsInjectionStatus,
    },
  };
};
