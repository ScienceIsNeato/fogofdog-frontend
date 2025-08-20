# Stats Service State Machine Design

## Overview
The StatsCalculationService needs to be redesigned as a proper state machine to handle:
- Initialization from historical GPS data
- Session management (start/pause/resume/end)
- Reinitialization after history management changes
- Real-time GPS point processing
- Persistence of stats across app sessions

## State Definitions

### 1. **Uninitialized**
- **Description**: Service just created, no data loaded
- **Entry Conditions**: Service instantiation
- **Available Actions**: `initialize()`
- **Data State**: No stats, no history

### 2. **InitializingFromHistory** 
- **Description**: Loading complete GPS history from storage
- **Entry Conditions**: `initialize()` called from Uninitialized
- **Available Actions**: None (async operation in progress)
- **Data State**: Loading historical GPS points

### 3. **CalculatingHistoricalStats**
- **Description**: Processing entire GPS history to calculate lifetime totals
- **Entry Conditions**: GPS history loaded successfully
- **Available Actions**: None (calculation in progress)
- **Data State**: Processing all historical GPS points as "initial session"

### 4. **EndingInitialSession**
- **Description**: Finalizing historical data as completed session
- **Entry Conditions**: Historical calculation complete
- **Available Actions**: None (session finalization in progress)
- **Data State**: Moving calculated totals to lifetime stats, resetting session stats

### 5. **Ready**
- **Description**: Active tracking state, processing new GPS points
- **Entry Conditions**: 
  - Initialization complete
  - Resume from Paused
  - New session started
- **Available Actions**: 
  - `processGPSPoint()`
  - `pauseSession()`
  - `endSession()`
  - `reinitializeFromHistory()`
  - `saveStats()`
- **Data State**: Session timer running, real-time GPS processing

### 6. **Paused**
- **Description**: Session temporarily paused by user
- **Entry Conditions**: `pauseSession()` called from Ready
- **Available Actions**:
  - `resumeSession()`
  - `endSession()`
  - `reinitializeFromHistory()`
  - `saveStats()`
- **Data State**: Session timer stopped, no GPS processing

### 7. **EndingSession**
- **Description**: Finalizing current session stats
- **Entry Conditions**: `endSession()` called from Ready or Paused
- **Available Actions**: None (session finalization in progress)
- **Data State**: Adding session totals to lifetime totals, preparing for new session

### 8. **Reinitializing**
- **Description**: Recalculating all stats from scratch (after history changes)
- **Entry Conditions**: `reinitializeFromHistory()` called
- **Available Actions**: None (reinitialization in progress)
- **Data State**: Clearing current stats, reloading and recalculating from full history

### 9. **Persisting**
- **Description**: Saving stats to persistent storage
- **Entry Conditions**: `saveStats()` called
- **Available Actions**: None (save operation in progress)
- **Data State**: Writing current stats to AsyncStorage

## State Transitions

| From State | Action | To State | Notes |
|------------|--------|----------|-------|
| Uninitialized | `initialize()` | InitializingFromHistory | Load GPS history |
| InitializingFromHistory | GPS history loaded | CalculatingHistoricalStats | Process all historical points |
| CalculatingHistoricalStats | Calculation complete | EndingInitialSession | Finalize historical session |
| EndingInitialSession | Session ended | Ready | Start new active session |
| Ready | `processGPSPoint()` | Ready | Update current session stats |
| Ready | `pauseSession()` | Paused | Stop session timer |
| Ready | `endSession()` | EndingSession | Finalize current session |
| Ready | `reinitializeFromHistory()` | Reinitializing | Recalculate from scratch |
| Ready | `saveStats()` | Persisting | Save to storage |
| Paused | `resumeSession()` | Ready | Resume session timer |
| Paused | `endSession()` | EndingSession | Finalize paused session |
| Paused | `reinitializeFromHistory()` | Reinitializing | Recalculate from scratch |
| Paused | `saveStats()` | Persisting | Save to storage |
| EndingSession | Session finalized | Ready | Start new session |
| Reinitializing | Reinitialization complete | Ready | Resume with recalculated stats |
| Persisting | Save complete | Ready/Paused | Return to previous state |

## Service Interface

```typescript
interface StatsServiceState {
  currentState: 'uninitialized' | 'initializing' | 'calculating' | 'ending_initial' | 
                'ready' | 'paused' | 'ending_session' | 'reinitializing' | 'persisting';
  totalStats: TotalStats;
  sessionStats: SessionStats;
  sessionStartTime: number | null;
  lastProcessedPoint: SerializableGPSPoint | null;
  exploredPath: SerializableGPSPoint[];
  isSessionActive: boolean;
}

interface StatsServiceActions {
  // Lifecycle
  initialize(): Promise<void>;
  reinitializeFromHistory(): Promise<void>;
  
  // Session Management
  startNewSession(): void;
  pauseSession(): void;
  resumeSession(): void;
  endSession(): void;
  
  // GPS Processing
  processGPSPoint(point: SerializableGPSPoint): void;
  
  // Persistence
  saveStats(): Promise<void>;
  loadPersistedStats(): Promise<void>;
  
  // State Queries
  getCurrentState(): string;
  getFormattedStats(): FormattedStats;
  isInitialized(): boolean;
  isSessionActive(): boolean;
}
```

## Integration Points

### 1. **App Startup**
```typescript
// On app launch
await statsService.initialize();
// Service will load history, calculate totals, start new session
```

### 2. **GPS Point Processing**
```typescript
// In BackgroundLocationService
if (statsService.isInitialized() && statsService.isSessionActive()) {
  statsService.processGPSPoint(gpsPoint);
}
```

### 3. **User Actions**
```typescript
// Pause/Resume tracking
onPausePressed() {
  statsService.pauseSession();
}

onResumePressed() {
  statsService.resumeSession();
}
```

### 4. **History Management**
```typescript
// After clearing GPS history
await dataService.clearGPSHistory();
await statsService.reinitializeFromHistory();
```

### 5. **App Backgrounding**
```typescript
// Before app goes to background
await statsService.saveStats();
```

## Error Handling

- **Initialization Failures**: Retry with exponential backoff
- **GPS History Loading Errors**: Fall back to empty history (new user scenario)
- **Calculation Errors**: Log error, continue with partial stats
- **Persistence Errors**: Queue for retry, don't block user experience

## Testing Strategy

### Unit Tests
- State transitions for all valid paths
- Invalid transition handling
- GPS point processing accuracy
- Session timing calculations
- Persistence round-trip testing

### Integration Tests
- Full initialization flow with real GPS data
- Session lifecycle (start → pause → resume → end)
- History management integration
- Background/foreground state transitions

### Edge Cases
- Empty GPS history (new user)
- Corrupted persistent stats
- App crash during calculation
- Memory pressure during large history processing
- Concurrent GPS points during state transitions

## Benefits of This Approach

1. **Handles Existing Users**: Calculates proper totals from existing GPS history
2. **Clean Session Management**: Clear start/stop semantics for user actions
3. **History Management Integration**: Easy recalculation after data changes
4. **Testable**: Each state and transition can be unit tested
5. **Debuggable**: Clear state visibility for troubleshooting
6. **Extensible**: Easy to add new states/actions for future features
7. **Robust**: Proper error handling and recovery paths

