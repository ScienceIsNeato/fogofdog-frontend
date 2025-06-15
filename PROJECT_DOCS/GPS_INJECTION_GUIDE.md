# 🗺️ GPS Injection Guide for FogOfDog Testing

## Quick Reference

### Maestro Tests (Automated)
```yaml
appId: com.fogofdog.app
jsEngine: graaljs  # REQUIRED for modern JavaScript
---
- setLocation:
    latitude: 37.787352  # Pre-calculated coordinates
    longitude: -122.4324
```

### Development Testing (Manual)
```bash
node tools/gps-injector-direct.js --mode relative --angle 90 --distance 1000
```

---

## ⚠️ Critical Requirements

### Always Use GraalJS in Maestro
Maestro defaults to Rhino (ES5 only). Modern JavaScript requires GraalJS:
```yaml
jsEngine: graaljs  # MANDATORY
```

### No Node.js Modules in Maestro
Use pre-calculated coordinates, not runtime calculations:
```yaml
# ✅ CORRECT
- setLocation: { latitude: 37.787352, longitude: -122.4324 }

# ❌ WRONG - Node.js modules not available
- runScript: const fs = require('fs');
```

---

## 📍 Coordinate Reference

**Base Location**: San Francisco `37.78825, -122.4324`

| Direction | Distance | Latitude | Longitude |
|-----------|----------|----------|-----------|
| North | 1000m | `37.797234` | `-122.4324` |
| South | 1000m | `37.779266` | `-122.4324` |
| East | 2000m | `37.78825` | `-122.409572` |
| West | 2000m | `37.78825` | `-122.455228` |

---

## 🧪 Maestro Test Template

```yaml
appId: com.fogofdog.app
jsEngine: graaljs
---
- launchApp: { appId: com.fogofdog.app, clearState: true }
- runFlow: { file: login-to-map-test.yaml }
- assertVisible: { text: "You are here" }

# Background app (optional)
- pressKey: Home
- waitForAnimationToEnd: { timeout: 1000 }

# Inject GPS location
- setLocation: { latitude: 37.779266, longitude: -122.4324 }
- waitForAnimationToEnd: { timeout: 2000 }

# Return to app
- tapOn: { text: "FogOfDog" }
- waitForAnimationToEnd: { timeout: 3000 }
- assertVisible: { text: "You are here" }
```

---

## 🛠️ Development Commands

```bash
# Quick movements
node tools/gps-injector-direct.js --mode relative --angle 0 --distance 1000    # East
node tools/gps-injector-direct.js --mode relative --angle 90 --distance 1000   # North
node tools/gps-injector-direct.js --mode relative --angle 180 --distance 1000  # West
node tools/gps-injector-direct.js --mode relative --angle 270 --distance 1000  # South

# Absolute positioning
node tools/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194
```

**Angles**: `0°`=East, `90°`=North, `180°`=West, `270°`=South

---

## Best Practices

- Pre-calculate coordinates for Maestro tests
- Use meaningful distances (1000m+ for clear results)  
- Wait for animations after location changes
- Test background injection scenarios
- Start with clean state (`clearState: true`) 