// Map zoom and region constraints
// These constants define the maximum allowed zoom-out levels to prevent
// app lockups and maintain performance at extreme zoom levels

// Maximum allowed region deltas (approximately 20km at mid-latitudes)
export const MAX_LATITUDE_DELTA = 0.18;
export const MAX_LONGITUDE_DELTA = 0.18;

// Constrain region to prevent zooming out too far (max 20km width)
export const constrainRegion = (region: {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}) => {
  const constrainedRegion = { ...region };

  // Limit latitude delta (north-south extent)
  if (constrainedRegion.latitudeDelta > MAX_LATITUDE_DELTA) {
    constrainedRegion.latitudeDelta = MAX_LATITUDE_DELTA;
  }

  // Limit longitude delta (east-west extent)
  if (constrainedRegion.longitudeDelta > MAX_LONGITUDE_DELTA) {
    constrainedRegion.longitudeDelta = MAX_LONGITUDE_DELTA;
  }

  return constrainedRegion;
};
