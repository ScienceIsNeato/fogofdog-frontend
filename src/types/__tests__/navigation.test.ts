import type {
  RootStackParamList,
  AuthStackParamList,
  MainStackParamList,
  MapRegion,
} from '../navigation';

describe('navigation types', () => {
  it('should define RootStackParamList correctly', () => {
    const authParams: RootStackParamList['Auth'] = undefined;
    const mainParams: RootStackParamList['Main'] = { isFirstTimeUser: true };

    expect(authParams).toBeUndefined();
    expect(mainParams.isFirstTimeUser).toBe(true);
  });

  it('should define AuthStackParamList correctly', () => {
    const signInParams: AuthStackParamList['SignIn'] = undefined;
    const signUpParams: AuthStackParamList['SignUp'] = undefined;

    expect(signInParams).toBeUndefined();
    expect(signUpParams).toBeUndefined();
  });

  it('should define MainStackParamList correctly', () => {
    const mapParams: MainStackParamList['Map'] = { isFirstTimeUser: false };
    const profileParams: MainStackParamList['Profile'] = undefined;

    expect(mapParams.isFirstTimeUser).toBe(false);
    expect(profileParams).toBeUndefined();
  });

  it('should define MapRegion interface correctly', () => {
    const mapRegion: MapRegion = {
      latitude: 41.6867,
      longitude: -91.5802,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };

    expect(typeof mapRegion.latitude).toBe('number');
    expect(typeof mapRegion.longitude).toBe('number');
    expect(typeof mapRegion.latitudeDelta).toBe('number');
    expect(typeof mapRegion.longitudeDelta).toBe('number');
    expect(mapRegion.latitude).toBe(41.6867);
    expect(mapRegion.longitude).toBe(-91.5802);
  });
});
