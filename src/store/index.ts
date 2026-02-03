import { configureStore } from '@reduxjs/toolkit';
import userReducer from './slices/userSlice';
import explorationReducer from './slices/explorationSlice';
import statsReducer from './slices/statsSlice';
import streetReducer from './slices/streetSlice';

export const store = configureStore({
  reducer: {
    user: userReducer,
    exploration: explorationReducer,
    stats: statsReducer,
    street: streetReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
