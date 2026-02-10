# HUD Stats Panel Feature Plan

## 🎯 Feature Overview

**Goal**: Add a persistent bottom HUD panel displaying real-time exploration statistics to enhance user engagement and provide valuable feedback during exploration sessions.

**Status**: Planning Phase - No Implementation Yet
**Priority**: New Feature Development
**Complexity**: Medium

---

## 📋 Feature Requirements

### **Core Display Metrics (6 total)**

1. **Total Distance** - Lifetime distance across all sessions
2. **Session Distance** - Distance traveled in current session
3. **Total Area** - Lifetime area explored across all sessions
4. **Session Area** - Area explored in current session
5. **Total Time** - Lifetime active exploration time
6. **Session Time** - Active exploration time in current session

### **Technical Requirements**

- ✅ **Real-time updates** as GPS points are processed
- ✅ **Persistent data** stored locally on device across sessions
- ✅ **Metric units** hardcoded (km for distance, km² for area, hours/minutes for time)
- ✅ **Bottom panel positioning** with persistent visibility
- ✅ **Semi-transparent background** for visual distinction
- ✅ **Performance optimized** to not impact GPS processing

---

## 🎨 UI/UX Design Specifications

### **Panel Layout**

```
┌─────────────────────────────────────────────────────┐
│ FOGOFDOG MAP SCREEN                                 │
│                                                     │
│  [Map content area]                                 │
│                                                     │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ◐ STATS PANEL (Semi-transparent background)        │
│                                                     │
│ Total: 45.2km | 12.3km² | 2h 34m                   │
│ Session: 3.1km | 0.8km² | 23m                      │
└─────────────────────────────────────────────────────┘
```

### **Visual Specifications**

- **Height**: ~80-100px (enough for 2 rows of stats)
- **Background**: Semi-transparent dark overlay (rgba(0,0,0,0.6))
- **Text Color**: White with good contrast
- **Font Size**: Medium (readable but not dominant)
- **Layout**: Two rows - Total stats on top, Session stats on bottom
- **Padding**: Adequate spacing for touch-friendly interface
- **Border**: Subtle top border to separate from map

### **Positioning Strategy**

- **Fixed bottom positioning** - Always visible during map usage
- **Above navigation elements** - Higher z-index than other UI
- **Respects safe areas** - Accounts for iPhone home indicator
- **Non-intrusive** - Doesn't block critical map interactions

---

## 🏗️ Technical Architecture

### **Data Flow Architecture**

```
GPS Points → LocationStorageService → StatsCalculationService → Redux Store → HUD Component
                    ↓
            StatsPeristenceService (AsyncStorage)
```

### **New Components Required**

#### **1. HUDStatsPanel Component**

- **Purpose**: Main display component for the stats panel
- **Location**: `src/components/HUDStatsPanel.tsx`
- **Responsibilities**:
  - Subscribe to Redux stats state
  - Format and display metrics
  - Handle real-time updates
  - Manage visual styling

#### **2. StatsCalculationService**

- **Purpose**: Calculate exploration metrics from GPS data
- **Location**: `src/services/StatsCalculationService.ts`
- **Responsibilities**:
  - Calculate distance between GPS points (Haversine formula)
  - Calculate area coverage using GPS path data
  - Track active exploration time (exclude pauses)
  - Differentiate between session and total metrics

#### **3. StatsPersistenceService**

- **Purpose**: Handle local storage of statistics
- **Location**: `src/services/StatsPersistenceService.ts`
- **Responsibilities**:
  - Save/load total (lifetime) statistics
  - Manage session data lifecycle
  - Handle data migration if needed

### **Redux State Extension**

#### **New Slice: statsSlice.ts**

```typescript
interface StatsState {
  // Total (lifetime) stats
  totalDistance: number; // meters
  totalArea: number; // square meters
  totalTime: number; // milliseconds

  // Current session stats
  sessionDistance: number; // meters
  sessionArea: number; // square meters
  sessionTime: number; // milliseconds
  sessionStartTime: number; // timestamp

  // Calculation state
  lastProcessedPoint: GPSPoint | null;
  isSessionActive: boolean;
}
```

#### **Actions Required**

- `updateSessionStats(newGPSPoint)` - Process new GPS data
- `startNewSession()` - Initialize session counters
- `pauseSession()` - Pause time tracking
- `resumeSession()` - Resume time tracking
- `loadPersistedStats()` - Load saved data on app start

### **Integration Points**

#### **GPS Data Integration**

- **Hook into existing**: `BackgroundLocationService.ts`
- **Integration point**: When new GPS coordinates are processed
- **Data required**: GPS coordinates, timestamps, movement detection

#### **Map Screen Integration**

- **Component placement**: Add `<HUDStatsPanel />` to `MapScreen`
- **Z-index management**: Ensure proper layering
- **Safe area handling**: Use existing safe area utilities

---

## 🔄 Data Processing Logic

### **Distance Calculation**

- **Algorithm**: Haversine formula for GPS coordinate distance
- **Accuracy**: Account for GPS accuracy variations
- **Filtering**: Use existing coordinate deduplication service
- **Accumulation**: Add to both session and total distance

### **Area Calculation**

- **Algorithm**: Polygon area calculation from GPS path
- **Method**: Shoelace formula or similar for irregular polygons
- **Optimization**: Efficient incremental calculation
- **Deduplication**: Don't double-count revisited areas

### **Time Tracking**

- **Active Time Only**: Exclude periods without movement
- **Session Management**: Reset on app restart or manual reset
- **Persistence**: Save total time, reset session time
- **Pause Detection**: Use existing movement detection logic

---

## 📊 Performance Considerations

### **Update Frequency**

- **GPS Updates**: Process on each new GPS point (existing frequency)
- **UI Updates**: Throttle display updates to ~1-2 seconds for smooth UX
- **Calculation Efficiency**: Incremental calculations, not full recalculation

### **Memory Management**

- **Minimal State**: Store only essential calculation data
- **Efficient Algorithms**: Use optimized distance/area calculations
- **Data Pruning**: Don't store full GPS history for stats

### **Storage Optimization**

- **Compact Format**: Store only essential persistent data
- **Async Operations**: Non-blocking persistence operations
- **Error Handling**: Graceful fallback if storage fails

---

## 🧪 Testing Strategy

### **Unit Tests Required**

- **StatsCalculationService**: Distance, area, time calculations
- **StatsPersistenceService**: Save/load operations
- **HUDStatsPanel**: Component rendering and state updates
- **Redux Integration**: Actions, reducers, selectors

### **Integration Tests**

- **GPS Data Flow**: End-to-end GPS → Stats → Display
- **Session Lifecycle**: Start, pause, resume, persist
- **Cross-session Persistence**: App restart scenarios

### **Manual Testing Scenarios**

- **Real GPS Movement**: Verify accurate distance/area calculation
- **Session Boundaries**: App backgrounding, foregrounding
- **Edge Cases**: No GPS signal, rapid movement, stationary periods

---

## 🚀 Implementation Phases

### **Phase 1: Core Infrastructure**

- Create StatsCalculationService with basic distance calculation
- Set up Redux statsSlice with essential state
- Create StatsPersistenceService for data storage
- Unit tests for core services

### **Phase 2: UI Component**

- Build HUDStatsPanel component with static layout
- Integrate with Redux state for dynamic updates
- Implement visual styling and positioning
- Component unit tests

### **Phase 3: GPS Integration**

- Hook StatsCalculationService into GPS data flow
- Implement real-time stat updates
- Add session lifecycle management
- Integration testing

### **Phase 4: Polish & Optimization**

- Performance optimization and throttling
- Error handling and edge cases
- Cross-session persistence testing
- Final UI/UX refinements

---

## 🔍 Future Considerations

### **Extensibility Points**

- **Additional Metrics**: Easy to add new stats to the service
- **UI Customization**: Panel could become configurable
- **Export Features**: Stats could be exported/shared
- **Historical Tracking**: Could track stats over time periods

### **Performance Monitoring**

- **Battery Impact**: Monitor GPS processing overhead
- **Memory Usage**: Track state size and calculation efficiency
- **UI Performance**: Ensure smooth map interaction

### **User Experience Enhancements**

- **Units Preference**: Future settings integration
- **Panel Toggle**: Option to hide/show panel
- **Detailed View**: Expandable stats with more metrics

---

## ✅ Definition of Done

### **Functional Requirements**

- [ ] HUD panel displays all 6 required metrics accurately
- [ ] Real-time updates as GPS data is processed
- [ ] Statistics persist across app sessions
- [ ] Session stats reset appropriately
- [ ] Panel positioned correctly at bottom with proper styling

### **Technical Requirements**

- [ ] All new services have comprehensive unit tests
- [ ] Integration with existing GPS pipeline works smoothly
- [ ] Redux state management follows existing patterns
- [ ] Performance impact is minimal
- [ ] Code follows project quality standards (ESLint, SonarJS rules, etc.)

### **Quality Gates**

- [ ] All existing tests continue to pass
- [ ] New code coverage meets 80%+ threshold
- [ ] No new ESLint warnings in strict mode
- [ ] Code duplication remains below 3%

---

**Next Step**: Review this plan, make any adjustments, then proceed with Phase 1 implementation.
