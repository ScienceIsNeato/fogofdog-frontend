import { StatsCalculationService } from '../StatsCalculationService';

describe('StatsCalculationService - Pause-Aware Timing', () => {
  let mockDateNow: jest.SpyInstance;

  beforeEach(() => {
    mockDateNow = jest.spyOn(Date, 'now');
  });

  afterEach(() => {
    mockDateNow.mockRestore();
  });

  describe('pauseSession', () => {
    it('should record the pause start time', () => {
      const currentTime = 1000000;
      mockDateNow.mockReturnValue(currentTime);

      const initialState = StatsCalculationService.createInitialState();
      const pausedState = StatsCalculationService.pauseSession(initialState);

      expect(pausedState.currentSession.lastActiveTime).toBe(currentTime);
      expect(pausedState.currentSession.totalPausedTime).toBe(0); // No change yet
    });
  });

  describe('resumeSession', () => {
    it('should calculate and add paused time duration', () => {
      const sessionStartTime = 1000000;
      const pauseStartTime = 1005000; // 5 seconds after start
      const resumeTime = 1015000; // 10 seconds after pause (15 seconds total)

      // Create initial session with known start time
      const initialState = {
        total: { distance: 0, area: 0, time: 0 },
        session: { distance: 0, area: 0, time: 0 },
        currentSession: {
          sessionId: 'test-session',
          startTime: sessionStartTime,
          totalPausedTime: 0,
          lastActiveTime: sessionStartTime,
        },
        lastProcessedPoint: null,
        isInitialized: true,
      };

      // Pause the session
      mockDateNow.mockReturnValueOnce(pauseStartTime);
      const pausedState = StatsCalculationService.pauseSession(initialState);
      expect(pausedState.currentSession.lastActiveTime).toBe(pauseStartTime);

      // Resume the session
      mockDateNow.mockReturnValueOnce(resumeTime);
      const resumedState = StatsCalculationService.resumeSession(pausedState);

      const expectedPauseDuration = resumeTime - pauseStartTime; // 10 seconds
      expect(resumedState.currentSession.totalPausedTime).toBe(expectedPauseDuration);
      expect(resumedState.currentSession.lastActiveTime).toBe(resumeTime);
    });

    it('should accumulate multiple pause periods', () => {
      const sessionStartTime = 1000000;
      const firstPauseTime = 1005000; // Pause at 5s
      const firstResumeTime = 1010000; // Resume at 10s (5s pause)
      const secondPauseTime = 1020000; // Pause at 20s
      const secondResumeTime = 1030000; // Resume at 30s (10s pause)

      // Create initial session with known start time
      const initialState = {
        total: { distance: 0, area: 0, time: 0 },
        session: { distance: 0, area: 0, time: 0 },
        currentSession: {
          sessionId: 'test-session',
          startTime: sessionStartTime,
          totalPausedTime: 0,
          lastActiveTime: sessionStartTime,
        },
        lastProcessedPoint: null,
        isInitialized: true,
      };

      // First pause/resume cycle
      mockDateNow.mockReturnValueOnce(firstPauseTime);
      const firstPaused = StatsCalculationService.pauseSession(initialState);
      mockDateNow.mockReturnValueOnce(firstResumeTime);
      const firstResumed = StatsCalculationService.resumeSession(firstPaused);

      expect(firstResumed.currentSession.totalPausedTime).toBe(5000); // 5 seconds

      // Second pause/resume cycle
      mockDateNow.mockReturnValueOnce(secondPauseTime);
      const secondPaused = StatsCalculationService.pauseSession(firstResumed);
      mockDateNow.mockReturnValueOnce(secondResumeTime);
      const secondResumed = StatsCalculationService.resumeSession(secondPaused);

      expect(secondResumed.currentSession.totalPausedTime).toBe(15000); // 5s + 10s = 15 seconds
    });

    it('should handle resume without previous pause gracefully', () => {
      const currentTime = 1000000;
      mockDateNow.mockReturnValue(currentTime);

      const initialState = StatsCalculationService.createInitialState();
      const resumedState = StatsCalculationService.resumeSession(initialState);

      // Should just update lastActiveTime without changing totalPausedTime
      expect(resumedState.currentSession.lastActiveTime).toBe(currentTime);
      expect(resumedState.currentSession.totalPausedTime).toBe(0);
    });
  });

  describe('Active time calculation in updateSessionTimer', () => {
    it('should exclude paused time from session duration', () => {
      const sessionStartTime = 1000000;
      const pauseTime = 1005000; // Pause after 5 seconds
      const resumeTime = 1015000; // Resume after 10 second pause
      const currentTime = 1025000; // Check timer 10 seconds after resume

      // Total elapsed: 25 seconds
      // Paused time: 10 seconds
      // Active time should be: 15 seconds (5s before pause + 10s after resume)

      // Create initial session with known start time
      const initialState = {
        total: { distance: 0, area: 0, time: 0 },
        session: { distance: 0, area: 0, time: 0 },
        currentSession: {
          sessionId: 'test-session',
          startTime: sessionStartTime,
          totalPausedTime: 0,
          lastActiveTime: sessionStartTime,
        },
        lastProcessedPoint: null,
        isInitialized: true,
      };

      // Pause the session
      mockDateNow.mockReturnValueOnce(pauseTime);
      const pausedState = StatsCalculationService.pauseSession(initialState);

      // Resume the session
      mockDateNow.mockReturnValueOnce(resumeTime);
      const resumedState = StatsCalculationService.resumeSession(pausedState);

      // Simulate timer calculation
      const totalElapsedTime = currentTime - sessionStartTime; // 25 seconds
      const totalPausedTime = resumedState.currentSession.totalPausedTime; // 10 seconds
      const activeElapsedTime = totalElapsedTime - totalPausedTime; // 15 seconds

      expect(totalElapsedTime).toBe(25000);
      expect(totalPausedTime).toBe(10000);
      expect(activeElapsedTime).toBe(15000);
    });
  });

  describe('Integration with session lifecycle', () => {
    it('should reset pause tracking when starting new session', () => {
      const initialTime = 1000000;
      const pauseTime = 1005000;
      const resumeTime = 1015000;
      const newSessionTime = 1020000;

      // Create initial session with known start time
      const initialState = {
        total: { distance: 0, area: 0, time: 0 },
        session: { distance: 0, area: 0, time: 0 },
        currentSession: {
          sessionId: 'test-session',
          startTime: initialTime,
          totalPausedTime: 0,
          lastActiveTime: initialTime,
        },
        lastProcessedPoint: null,
        isInitialized: true,
      };

      // Create session and accumulate some pause time
      mockDateNow.mockReturnValueOnce(pauseTime);
      const pausedState = StatsCalculationService.pauseSession(initialState);
      mockDateNow.mockReturnValueOnce(resumeTime);
      const resumedState = StatsCalculationService.resumeSession(pausedState);

      expect(resumedState.currentSession.totalPausedTime).toBe(10000);

      // Start new session (needs 3 calls: generateSessionId, startTime, lastActiveTime)
      mockDateNow
        .mockReturnValueOnce(newSessionTime) // generateSessionId
        .mockReturnValueOnce(newSessionTime) // startTime
        .mockReturnValueOnce(newSessionTime); // lastActiveTime
      const newSessionState = StatsCalculationService.startNewSession(resumedState);

      // New session should have clean pause tracking
      expect(newSessionState.currentSession.totalPausedTime).toBe(0);
      expect(newSessionState.currentSession.lastActiveTime).toBe(newSessionTime);
      expect(newSessionState.currentSession.startTime).toBe(newSessionTime);
    });
  });
});
