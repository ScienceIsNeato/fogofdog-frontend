import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { StyleSheet } from 'react-native';
import skinReducer from '../../store/slices/skinSlice';
import { SettingsSkinView } from '../UnifiedSettingsModal/SettingsSkinView';

jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('expo-haptics');

const createStore = (activeSkin = 'none') =>
  configureStore({
    reducer: { skin: skinReducer },
    preloadedState: { skin: { activeSkin: activeSkin as any, isInitializing: false } },
  });

// Minimal styles to pass to component
const mockStyles = StyleSheet.create({
  header: { flexDirection: 'row' },
  title: { fontSize: 18 },
  backButton: { padding: 4 },
  content: {},
  subtitle: { fontSize: 14 },
  menuItem: { padding: 12 },
  menuItemContent: { flex: 1 },
  menuItemText: { fontSize: 16 },
  menuItemDescription: { fontSize: 12 },
});

describe('SettingsSkinView', () => {
  it('renders the Map Style title', () => {
    const store = createStore();
    const onBack = jest.fn();
    const { getByText } = render(
      <Provider store={store}>
        <SettingsSkinView onBack={onBack} styles={mockStyles} />
      </Provider>
    );
    expect(getByText('Map Style')).toBeTruthy();
  });

  it('renders Standard and Cartoon skin options', () => {
    const store = createStore();
    const { getByText } = render(
      <Provider store={store}>
        <SettingsSkinView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    expect(getByText('Standard')).toBeTruthy();
    expect(getByText('Cartoon')).toBeTruthy();
  });

  it('calls onBack when back button is pressed', async () => {
    const store = createStore();
    const onBack = jest.fn();
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsSkinView onBack={onBack} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('back-button'));
    });
    expect(onBack).toHaveBeenCalled();
  });

  it('dispatches setSkin when cartoon option is pressed', async () => {
    const store = createStore('none');
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsSkinView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('skin-option-cartoon'));
    });
    expect(store.getState().skin.activeSkin).toBe('cartoon');
  });

  it('dispatches setSkin to none when Standard is pressed', async () => {
    const store = createStore('cartoon');
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsSkinView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('skin-option-none'));
    });
    expect(store.getState().skin.activeSkin).toBe('none');
  });

  it('shows loading indicator when isInitializing is true', () => {
    const store = configureStore({
      reducer: { skin: skinReducer },
      preloadedState: { skin: { activeSkin: 'cartoon' as const, isInitializing: true } },
    });
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsSkinView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    expect(getByTestId('skin-loading-indicator')).toBeTruthy();
  });
});
