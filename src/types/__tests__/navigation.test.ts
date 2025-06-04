import {
  RootStackParamList,
  AuthStackParamList,
  MainStackParamList,
  MapRegion,
} from '../navigation';

describe('Navigation Types', () => {
  describe('RootStackParamList', () => {
    it('should have correct type structure', () => {
      const mockRootParams: RootStackParamList = {
        Auth: undefined,
        Main: undefined,
      };

      expect(mockRootParams.Auth).toBeUndefined();
      expect(mockRootParams.Main).toBeUndefined();
    });
  });

  describe('AuthStackParamList', () => {
    it('should have correct type structure', () => {
      const mockAuthParams: AuthStackParamList = {
        SignIn: undefined,
        SignUp: undefined,
      };

      expect(mockAuthParams.SignIn).toBeUndefined();
      expect(mockAuthParams.SignUp).toBeUndefined();
    });
  });

  describe('MainStackParamList', () => {
    it('should have correct type structure', () => {
      const mockMainParams: MainStackParamList = {
        Map: undefined,
        Profile: undefined,
      };

      expect(mockMainParams.Map).toBeUndefined();
      expect(mockMainParams.Profile).toBeUndefined();
    });
  });

  describe('MapRegion', () => {
    it('should have correct type structure for map region', () => {
      const mockRegion: MapRegion = {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      };

      expect(typeof mockRegion.latitude).toBe('number');
      expect(typeof mockRegion.longitude).toBe('number');
      expect(typeof mockRegion.latitudeDelta).toBe('number');
      expect(typeof mockRegion.longitudeDelta).toBe('number');
    });

    it('should accept valid coordinate values', () => {
      const validRegion: MapRegion = {
        latitude: 40.7128,
        longitude: -74.006,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      expect(validRegion.latitude).toBe(40.7128);
      expect(validRegion.longitude).toBe(-74.006);
      expect(validRegion.latitudeDelta).toBe(0.01);
      expect(validRegion.longitudeDelta).toBe(0.01);
    });
  });
});
