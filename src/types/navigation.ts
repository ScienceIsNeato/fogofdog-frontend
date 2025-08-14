export type RootStackParamList = {
  Auth: undefined;
  Main: { isFirstTimeUser?: boolean }; // Add first-time user status
};

export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
};

export type MainStackParamList = {
  Map: { isFirstTimeUser?: boolean }; // Pass through first-time user status
  Profile: undefined;
};

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// Add navigation prop types for use in screens
declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
