import { Alert, Platform, Linking } from 'react-native';
import { PermissionAlert } from '../PermissionAlert';

// Mock React Native modules
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
  Platform: {
    OS: 'ios',
  },
  Linking: {
    openURL: jest.fn(),
    openSettings: jest.fn(),
  },
}));

const mockedAlert = Alert as jest.Mocked<typeof Alert>;
const mockedLinking = Linking as jest.Mocked<typeof Linking>;

// Test helpers
const getAlertCall = () => {
  const alertCall = mockedAlert.alert.mock.calls[0];
  expect(alertCall).toBeDefined();
  return alertCall!;
};

const getSettingsButton = () => {
  const [, , buttons] = getAlertCall();
  return buttons?.find((button: any) => button.text === 'Open Settings');
};

const getFirstButton = () => {
  const [, , buttons] = getAlertCall();
  return buttons?.[0];
};

const pressSettingsButton = () => {
  const settingsButton = getSettingsButton();
  expect(settingsButton).toBeDefined();
  expect(settingsButton?.onPress).toBeDefined();
  settingsButton!.onPress!();
};

const pressFirstButton = () => {
  const firstButton = getFirstButton();
  expect(firstButton).toBeDefined();
  expect(firstButton?.onPress).toBeDefined();
  firstButton!.onPress!();
};

const setPlatform = (platform: string) => {
  (Platform as any).OS = platform;
};

const createProps = (onDismiss?: jest.Mock) => ({
  errorMessage: 'Location permission is required',
  ...(onDismiss && { onDismiss }),
});

describe('PermissionAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPlatform('ios');
    // Enable test mode to bypass guard
    PermissionAlert._testGuard.setTestMode(true);
    PermissionAlert._testGuard.reset();
  });

  describe('show method', () => {
    it('should show alert with correct title and message', () => {
      const props = createProps(jest.fn());

      PermissionAlert.show(props);

      expect(mockedAlert.alert).toHaveBeenCalledWith(
        'Location Permission Required',
        'Location permission is required',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: expect.any(Function), // Now wrapped
          },
          {
            text: 'Open Settings',
            onPress: expect.any(Function),
          },
        ],
        { cancelable: false }
      );
    });

    it('should show alert without onDismiss callback', () => {
      const props = createProps();

      PermissionAlert.show(props);

      expect(mockedAlert.alert).toHaveBeenCalledWith(
        'Location Permission Required',
        'Location permission is required',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: expect.any(Function), // Now wrapped
          },
          {
            text: 'Open Settings',
            onPress: expect.any(Function),
          },
        ],
        { cancelable: false }
      );
    });

    it('should open iOS settings when settings button is pressed', () => {
      const props = createProps(jest.fn());
      PermissionAlert.show(props);

      pressSettingsButton();

      expect(mockedLinking.openURL).toHaveBeenCalledWith('app-settings:');
      expect(props.onDismiss).toHaveBeenCalled();
    });

    it('should open Android settings when settings button is pressed', () => {
      setPlatform('android');
      const props = createProps(jest.fn());
      PermissionAlert.show(props);

      pressSettingsButton();

      expect(mockedLinking.openSettings).toHaveBeenCalled();
      expect(props.onDismiss).toHaveBeenCalled();
    });

    it('should handle settings button press without onDismiss', () => {
      const props = createProps();
      PermissionAlert.show(props);

      expect(() => pressSettingsButton()).not.toThrow();
      expect(mockedLinking.openURL).toHaveBeenCalledWith('app-settings:');
    });
  });

  describe('showCritical method', () => {
    it('should show critical alert with enhanced message', () => {
      const props = createProps(jest.fn());

      PermissionAlert.showCritical(props);

      const expectedMessage = `Location permission is required\n\nFogOfDog is a location-based exploration game that requires location access to work. Without location permissions, the app cannot track your exploration or clear the fog of war.`;

      expect(mockedAlert.alert).toHaveBeenCalledWith(
        'FogOfDog Cannot Function',
        expectedMessage,
        [
          {
            text: 'Open Settings',
            onPress: expect.any(Function),
          },
        ],
        { cancelable: false }
      );
    });

    it('should show critical alert without onDismiss callback', () => {
      const props = createProps();

      PermissionAlert.showCritical(props);

      const expectedMessage = `Location permission is required\n\nFogOfDog is a location-based exploration game that requires location access to work. Without location permissions, the app cannot track your exploration or clear the fog of war.`;

      expect(mockedAlert.alert).toHaveBeenCalledWith(
        'FogOfDog Cannot Function',
        expectedMessage,
        [
          {
            text: 'Open Settings',
            onPress: expect.any(Function),
          },
        ],
        { cancelable: false }
      );
    });

    it('should open iOS settings when critical alert settings button is pressed', () => {
      const props = createProps(jest.fn());
      PermissionAlert.showCritical(props);

      pressFirstButton();

      expect(mockedLinking.openURL).toHaveBeenCalledWith('app-settings:');
      expect(props.onDismiss).toHaveBeenCalled();
    });

    it('should open Android settings when critical alert settings button is pressed', () => {
      setPlatform('android');
      const props = createProps(jest.fn());
      PermissionAlert.showCritical(props);

      pressFirstButton();

      expect(mockedLinking.openSettings).toHaveBeenCalled();
      expect(props.onDismiss).toHaveBeenCalled();
    });

    it('should handle critical alert settings button press without onDismiss', () => {
      const props = createProps();
      PermissionAlert.showCritical(props);

      expect(() => pressFirstButton()).not.toThrow();
      expect(mockedLinking.openURL).toHaveBeenCalledWith('app-settings:');
    });
  });

  describe('Platform-specific behavior', () => {
    it('should use correct settings URL for iOS', () => {
      setPlatform('ios');
      const props = createProps(jest.fn());
      PermissionAlert.show(props);

      pressSettingsButton();

      expect(mockedLinking.openURL).toHaveBeenCalledWith('app-settings:');
      expect(mockedLinking.openSettings).not.toHaveBeenCalled();
    });

    it('should use correct settings method for Android', () => {
      setPlatform('android');
      const props = createProps(jest.fn());
      PermissionAlert.show(props);

      pressSettingsButton();

      expect(mockedLinking.openSettings).toHaveBeenCalled();
      expect(mockedLinking.openURL).not.toHaveBeenCalled();
    });

    it('should handle unknown platform gracefully', () => {
      setPlatform('web');
      const props = createProps(jest.fn());
      PermissionAlert.show(props);

      expect(() => pressSettingsButton()).not.toThrow();
      expect(mockedLinking.openSettings).toHaveBeenCalled();
      expect(props.onDismiss).toHaveBeenCalled();
    });
  });
});
