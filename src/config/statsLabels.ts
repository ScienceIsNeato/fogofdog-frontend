/**
 * Stats Labels Configuration
 * 
 * Centralized location for all stats-related labels to ensure consistency
 * across the application and make updates easier.
 */

export const STATS_LABELS = {
  // Column headers for HUD stats panel
  DISTANCE_HEADER: 'Distance\nTravelled',
  AREA_HEADER: 'Area\nRevealed', 
  TIME_HEADER: 'Exploration\nTime',
  
  // Row labels for data types
  SESSION_LABEL: 'Session',
  ALL_TIME_LABEL: 'All Time',
  
  // Loading states
  LOADING_MESSAGE: 'Loading stats...',
  
  // Icons (Material Icons names)
  DISTANCE_ICON: 'pets',
  AREA_ICON: 'map', 
  TIME_ICON: 'access-time',
  SESSION_ICON: 'play-circle-outline',
  ALL_TIME_ICON: 'all-inclusive',
} as const;

/**
 * Alternative single-word labels for compact displays
 */
export const COMPACT_STATS_LABELS = {
  DISTANCE: 'Distance',
  AREA: 'Area',
  TIME: 'Time',
} as const;
