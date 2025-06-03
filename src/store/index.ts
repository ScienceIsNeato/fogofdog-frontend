import { configureStore } from '@reduxjs/toolkit';
import userReducer from './slices/userSlice';
import explorationReducer from './slices/explorationSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    exploration: explorationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;