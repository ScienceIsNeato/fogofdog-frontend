# Development Testing Tools

This directory contains tools for testing GPS coordinate processing, permission flows, and fog clearing functionality in FogOfDog.

## Permission Reset Script

For rapid development of permission flows, use the permission reset script:

```bash
# Reset location permissions only
./scripts/reset-permissions.sh

# Reset permissions and refresh the app
./scripts/reset-permissions.sh --refresh

# Reset permissions for specific simulator
./scripts/reset-permissions.sh --simulator ABC123-DEF456

# Show help
./scripts/reset-permissions.sh --help
```

This script is especially useful when testing:
- Permission dialog flows
- Onboarding sequences  
- Location service initialization
- Permission denial/grant scenarios

**Note**: The script automatically detects the booted iOS Simulator and resets location permissions for the FogOfDog app.

## GPS Injector Tool

The GPS injector allows you to inject specific GPS coordinates for testing background location processing and fog clearing.

### Usage

#### Absolute Coordinates
```bash
# Add a specific GPS coordinate
node tools/gps-injector-simple.js --mode absolute --lat 37.7749 --lon -122.4194
```

#### Relative Coordinates  
```bash
# Move relative to current position
node tools/gps-injector-simple.js --mode relative --angle 45 --distance 100

# Create a path with multiple points
node tools/gps-injector-simple.js --mode relative --angle 0 --distance 50 --count 5
```

### Parameters

- `--mode`: Either `absolute` or `relative`
- `--lat`: Latitude (absolute mode only)
- `--lon`: Longitude (absolute mode only) 
- `--angle`: Direction in degrees (relative mode) - 0°=East, 90°=North, 180°=West, 270°=South
- `--distance`: Distance in meters (relative mode)
- `--count`: Number of points to generate (optional, default: 1)

### Coordinate System

For relative mode, angles follow standard mathematical convention:
- **0°**: East (positive longitude direction)
- **90°**: North (positive latitude direction) 
- **180°**: West (negative longitude direction)
- **270°**: South (negative latitude direction)

## Testing Workflows

### Manual Developer Testing

1. **Setup**: Launch your app and login to reach the map screen
2. **Background**: Press Home button to background the app
3. **Inject GPS**: Run the GPS injector tool with desired coordinates
4. **Foreground**: Tap the app icon to bring app back to foreground
5. **Verify**: Check that new fog holes appear at the injected coordinates

Example complete workflow:
```bash
# Generate coordinates moving northeast 
node tools/gps-injector-simple.js --mode relative --angle 45 --distance 100 --count 3

# Copy the generated AsyncStorage commands to React Native debugger console
# Background and foreground the app
# Verify fog clearing at the new coordinates
```

### Maestro Automation Testing

For Maestro tests, you can use the GPS injector to create deterministic test scenarios:

```yaml
# Example Maestro test step
- runScript: |
    cd /path/to/project && node tools/gps-injector-simple.js --mode relative --angle 90 --distance 200 --count 2

# Then execute the AsyncStorage commands in the app context
# And proceed with background/foreground testing
```

### Test Validation

After GPS injection and app foregrounding, verify:

1. **Redux State**: New coordinates added to `exploration.path`
2. **Fog Overlay**: Clear circular areas (~75m radius) at injected coordinates  
3. **Visual Confirmation**: Screenshots show fog holes at expected locations
4. **Map Interaction**: Fog overlay moves correctly during pan/zoom

## Expected Behavior

### Coordinate Processing Flow

1. GPS coordinates injected → AsyncStorage (`gps_injection_data`)
2. App foreground → `GPSInjectionService.processInjectedGPS()`
3. Coordinates processed → `processBackgroundLocations()` Redux action
4. Path updated → `explorationSlice.path` 
5. Fog re-rendered → `FogOverlay` with new cleared areas

### Fog Clearing Specifications

- **Radius**: 75 meters (configurable in `FOG_CONFIG.RADIUS_METERS`)
- **Shape**: Circular holes connected by paths
- **Visual**: Black fog with transparent cleared areas
- **Scaling**: Fog holes scale with map zoom level

## Troubleshooting

### Common Issues

1. **No fog clearing**: Check AsyncStorage contains injection data
2. **Wrong coordinates**: Verify coordinate math with known reference points
3. **App restart**: Use tap app icon, not `launchApp` which restarts the app
4. **Permission issues**: Ensure location permissions are granted

### Debug Commands

```javascript
// Check injection status
await AsyncStorage.getItem('gps_injection_data');

// Check exploration path
// (Access via Redux DevTools or add console.log in app)

// Clear injection data
await AsyncStorage.removeItem('gps_injection_data');
```

## File Structure

```
tools/
├── README.md                    # This documentation
├── gps-injector-simple.js      # Main GPS injection tool
└── gps-injector.js             # Original complex version (reference)

# Generated files:
current-location.json            # Tracks last coordinate for relative positioning
```

## Integration Points

### App Integration

- `src/services/GPSInjectionService.ts`: Handles injection data processing
- `src/screens/Map/index.tsx`: Processes injected coordinates on app foreground
- `src/store/slices/explorationSlice.ts`: Updates path with new coordinates

### Test Integration

- `.maestro/`: Maestro test files using GPS injection
- Manual testing via React Native debugger console
- CI/CD integration for automated testing

## Examples

### Create a Square Path
```bash
# Start at center point
node tools/gps-injector-simple.js --mode absolute --lat 37.7849 --lon -122.4294

# Move north 100m
node tools/gps-injector-simple.js --mode relative --angle 90 --distance 100

# Move east 100m  
node tools/gps-injector-simple.js --mode relative --angle 0 --distance 100

# Move south 100m
node tools/gps-injector-simple.js --mode relative --angle 270 --distance 100

# Move west 100m (back to start)
node tools/gps-injector-simple.js --mode relative --angle 180 --distance 100
```

### Simulate Walking Path
```bash
# Irregular walking pattern with varying distances
node tools/gps-injector-simple.js --mode relative --angle 30 --distance 75
node tools/gps-injector-simple.js --mode relative --angle 120 --distance 50  
node tools/gps-injector-simple.js --mode relative --angle 200 --distance 125
node tools/gps-injector-simple.js --mode relative --angle 350 --distance 80
``` 