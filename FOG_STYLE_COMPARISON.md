# Fog Style Visual Comparison

## Quick Style Guide

To test different fog styles, modify these values in `src/screens/Map/index.tsx`:

```tsx
// In useMapScreenState hook:
const [fogStyle] = useState<'none' | 'gradient' | 'blur' | 'layered' | 'combined'>('gradient');
const [blurIntensity] = useState(1); // Range: 0.5 to 2
```

## Style Descriptions

### 🔲 Style: `'none'` - Hard Edges
```tsx
const [fogStyle] = useState('none');
```
- **Appearance**: Sharp, stark borders between fog and clear areas
- **Performance**: ⚡⚡⚡⚡⚡ Fastest
- **Use Case**: Maximum performance, retro game aesthetic

### 🌫️ Style: `'gradient'` - Radial Gradients (Recommended)
```tsx
const [fogStyle] = useState('gradient');
const [blurIntensity] = useState(1);
```
- **Appearance**: Smooth circular gradients fading from clear to foggy
- **Performance**: ⚡⚡⚡⚡ Fast
- **Use Case**: Best balance of quality and performance

### 💨 Style: `'blur'` - Gaussian Blur
```tsx
const [fogStyle] = useState('blur');
const [blurIntensity] = useState(1);
```
- **Appearance**: Soft, dreamy edges with gaussian blur effect
- **Performance**: ⚡⚡⚡ Moderate
- **Use Case**: Atmospheric, mystical feel

### 📚 Style: `'layered'` - Multiple Opacity Layers
```tsx
const [fogStyle] = useState('layered');
const [blurIntensity] = useState(1);
```
- **Appearance**: Gradual fade through multiple semi-transparent layers
- **Performance**: ⚡⚡ Slower
- **Use Case**: Depth effect, volumetric fog appearance

### ✨ Style: `'combined'` - Gradient + Blur
```tsx
const [fogStyle] = useState('combined');
const [blurIntensity] = useState(1.5);
```
- **Appearance**: Softest edges combining gradients and blur
- **Performance**: ⚡ Slowest
- **Use Case**: Premium visual quality, cinematic effect

## Intensity Settings

### Low Intensity (0.5)
```tsx
const [blurIntensity] = useState(0.5);
```
- Subtle soft edges
- Minimal performance impact
- Good for maintaining visibility

### Medium Intensity (1.0) - Default
```tsx
const [blurIntensity] = useState(1);
```
- Balanced effect
- Noticeable but not overwhelming
- Recommended for most apps

### High Intensity (1.5-2.0)
```tsx
const [blurIntensity] = useState(1.5);
```
- Very soft, dreamy edges
- Dramatic fog effect
- Higher performance cost

## Visual Effect Comparison

| Style | Edge Type | Blur Radius | Performance | Visual Impact |
|-------|-----------|-------------|-------------|---------------|
| none | Hard | 0px | 100% | Sharp |
| gradient | Soft gradient | ~20-40px | 95% | Natural |
| blur | Gaussian | ~10-20px | 80% | Dreamy |
| layered | Stepped | ~30-50px | 70% | Volumetric |
| combined | Very soft | ~30-60px | 60% | Cinematic |

## Quick Test Configurations

### Configuration 1: Performance Priority
```tsx
const [fogStyle] = useState('gradient');
const [blurIntensity] = useState(0.5);
```

### Configuration 2: Balanced (Default)
```tsx
const [fogStyle] = useState('gradient');
const [blurIntensity] = useState(1);
```

### Configuration 3: Visual Priority
```tsx
const [fogStyle] = useState('combined');
const [blurIntensity] = useState(1.5);
```

### Configuration 4: Artistic/Atmospheric
```tsx
const [fogStyle] = useState('blur');
const [blurIntensity] = useState(1.2);
```

## Tips for Testing

1. **Hot Reload**: Change the values and save to see instant updates
2. **Performance Testing**: Use React Native's performance monitor while panning the map
3. **Device Testing**: Test on both high-end and low-end devices
4. **User Movement**: Walk around to see how the fog reveals with different styles
5. **Zoom Levels**: Test at different zoom levels as effects scale with zoom