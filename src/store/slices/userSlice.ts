import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User, UserState } from '../../types/user';

const initialState: UserState = {
  user: null,
  isLoading: false,
  error: null,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload;
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearUser: (state) => {
      state.user = null;
      state.error = null;
    },
    restorePersistedUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.error = null;
      state.isLoading = false;
    },
  },
});

export const { setUser, setLoading, setError, clearUser, restorePersistedUser } = userSlice.actions;
export default userSlice.reducer;
