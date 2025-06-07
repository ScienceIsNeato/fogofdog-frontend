# Fuzzy Fog Border Implementation

This document explains the implementation of soft, fuzzy borders for the fog of war effect in the FogOfDog app.

## Overview

The fog overlay has been enhanced to support multiple blur styles that create soft, gradual transitions between explored and unexplored areas instead of stark, hard-edged borders.

## Available Blur Styles

### 1. **None** (Original Hard Edges)
- Stark, 100% opaque borders
- Clear distinction between explored/unexplored
- Most performant option

### 2. **Gradient** (Recommended)
- Uses radial gradients for each explored point
- Smooth fade from transparent center to opaque edges
- Natural-looking fog dissipation
- Good performance

### 3. **Blur**
- Applies Gaussian blur filter to mask edges
- Soft, dreamy effect
- Medium performance impact

### 4. **Layered**
- Multiple overlapping circles with decreasing opacity
- Creates depth through layering
- Smooth transitions
- Higher performance cost due to multiple layers

### 5. **Combined**
- Combines radial gradients with blur filter
- Softest, most realistic effect
- Highest visual quality
- Highest performance cost

## Implementation Details

The `FogOverlay` component now accepts two new props:

```tsx
interface FogOverlayProps {
  mapRegion: MapRegion & { width: number; height: number };
  blurStyle?: 'none' | 'gradient' | 'blur' | 'layered' | 'combined';
  blurIntensity?: number; // 0.5 to 2, default is 1
}
```

## Usage

To use the fuzzy fog borders, update the FogOverlay usage in your MapScreen:

```tsx
<FogOverlay
  mapRegion={{
    ...currentRegion,
    width: mapDimensions.width,
    height: mapDimensions.height,
  }}
  blurStyle="gradient"  // Choose your preferred style
  blurIntensity={1}     // Adjust intensity (0.5-2)
/>
```

## Technical Implementation

### Gradient Approach
- Uses React Native Skia's `RadialGradient` component
- Each explored point has a gradient from black (transparent) to transparent
- Gradient positions: `[0, 0.6, 0.8, 1]` for smooth transitions

### Blur Approach
- Uses React Native Skia's `BlurMask` filter
- Applied to a group containing all the mask shapes
- Blur amount scales with intensity setting

### Layered Approach
- Creates 5 layers of circles with decreasing opacity
- Each layer has a slightly larger radius
- Opacity decreases from 1.0 to 0.2

### Combined Approach
- First applies radial gradients to each point
- Then adds a blur filter on top
- Results in the softest edges

## Performance Considerations

1. **Gradient** - Best balance of quality and performance
2. **Blur** - GPU-accelerated but requires additional processing
3. **Layered** - More draw calls due to multiple layers
4. **Combined** - Highest quality but most expensive

## Customization Tips

### Adjusting Blur Intensity
- Lower values (0.5) create subtle soft edges
- Higher values (2.0) create very fuzzy, dream-like borders
- Default (1.0) provides a good balance

### Modifying Gradient Falloff
In `FogMaskGradient`, adjust the colors and positions arrays:
```tsx
colors={['black', 'black', 'rgba(0,0,0,0.5)', 'transparent']}
positions={[0, 0.6, 0.8, 1]}  // Adjust these for different falloff curves
```

### Changing Blur Strength
In `FogMaskBlur`, modify the blur calculation:
```tsx
const blurAmount = 10 * blurIntensity; // Change 10 to adjust base blur
```

## Testing Different Styles

To test different styles in development:

1. Change the `blurStyle` prop in MapScreen
2. Adjust `blurIntensity` to fine-tune the effect
3. Use React Native's hot reload to see changes instantly

## Recommendations

- **For production**: Use "gradient" style with intensity 1.0
- **For dramatic effect**: Use "combined" style with intensity 1.5
- **For performance-critical apps**: Use "none" or "gradient" with intensity 0.5
- **For artistic apps**: Experiment with "blur" or "combined" styles

## Future Enhancements

1. **Animated transitions** between fog states
2. **Custom gradient patterns** for different terrain types
3. **Dynamic intensity** based on zoom level
4. **Texture-based fog** for more realistic effects