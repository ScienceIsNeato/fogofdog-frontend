export interface User {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface UserState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
  timestamp: number; // Unix timestamp in milliseconds
}
