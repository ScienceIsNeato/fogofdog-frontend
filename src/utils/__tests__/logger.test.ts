import { logger } from '../logger';

// Mock __DEV__ global
const originalDev = (global as any).__DEV__;

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    (global as any).__DEV__ = originalDev;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('in development mode', () => {
    beforeEach(() => {
      (global as any).__DEV__ = true;
    });

    describe('info method', () => {
      it('should log info message without context', () => {
        logger.info('Test info message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[App\] Test info message/
          ),
          ''
        );
      });

      it('should log info message with context', () => {
        const context = { component: 'TestComponent', action: 'testAction', extra: 'data' };
        logger.info('Test info message', context);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[TestComponent::testAction\] Test info message/
          ),
          context
        );
      });

      it('should log info message with partial context (component only)', () => {
        const context = { component: 'TestComponent' };
        logger.info('Test info message', context);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[TestComponent\] Test info message/
          ),
          context
        );
      });
    });

    describe('warn method', () => {
      it('should log warning message without context', () => {
        logger.warn('Test warning message');

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] WARN \[App\] Test warning message/
          ),
          ''
        );
      });

      it('should log warning message with context', () => {
        const context = { component: 'TestComponent', action: 'testAction' };
        logger.warn('Test warning message', context);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] WARN \[TestComponent::testAction\] Test warning message/
          ),
          context
        );
      });
    });

    describe('error method', () => {
      it('should log error message without error or context', () => {
        logger.error('Test error message');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] ERROR \[App\] Test error message/
          ),
          '',
          ''
        );
      });

      it('should log error message with error object', () => {
        const error = new Error('Test error');
        logger.error('Test error message', error);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] ERROR \[App\] Test error message/
          ),
          error,
          ''
        );
      });

      it('should log error message with error and context', () => {
        const error = new Error('Test error');
        const context = { component: 'TestComponent', action: 'testAction' };
        logger.error('Test error message', error, context);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] ERROR \[TestComponent::testAction\] Test error message/
          ),
          error,
          context
        );
      });

      it('should log error message with context but no error', () => {
        const context = { component: 'TestComponent', action: 'testAction' };
        logger.error('Test error message', undefined, context);

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] ERROR \[TestComponent::testAction\] Test error message/
          ),
          '',
          context
        );
      });
    });

    describe('debug method', () => {
      it('should log debug message without context', () => {
        logger.debug('Test debug message');

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] DEBUG \[App\] Test debug message/
          ),
          ''
        );
      });

      it('should log debug message with context', () => {
        const context = { component: 'TestComponent', action: 'testAction' };
        logger.debug('Test debug message', context);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringMatching(
            /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] DEBUG \[TestComponent::testAction\] Test debug message/
          ),
          context
        );
      });
    });
  });

  describe('in production mode', () => {
    beforeEach(() => {
      (global as any).__DEV__ = false;
    });

    it('should not log info messages', () => {
      logger.info('Test info message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should not log warning messages', () => {
      logger.warn('Test warning message');
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not log error messages', () => {
      logger.error('Test error message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should not log debug messages', () => {
      logger.debug('Test debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('formatPrefix private method behavior', () => {
    beforeEach(() => {
      (global as any).__DEV__ = true;
    });

    it('should handle context with empty action', () => {
      const context = { component: 'TestComponent', action: '' };
      logger.info('Test message', context);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[TestComponent\] Test message/
        ),
        context
      );
    });

    it('should handle context with null/undefined component', () => {
      const context = {
        component: 'TestComponent',
        action: 'test',
      };
      logger.info('Test message', context);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] INFO \[TestComponent::test\] Test message/
        ),
        context
      );
    });
  });
});
