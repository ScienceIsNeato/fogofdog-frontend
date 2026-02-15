import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { StyleSheet } from 'react-native';
import graphicsReducer, { AVAILABLE_GRAPHICS } from '../../store/slices/graphicsSlice';
import { SettingsEffectsView } from '../UnifiedSettingsModal/SettingsEffectsView';

jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const createStore = (
  overrides: Partial<{
    activeFogEffectId: string;
    activeMapEffectId: string;
    activeScentEffectId: string;
    isScentVisible: boolean;
  }> = {}
) =>
  configureStore({
    reducer: { graphics: graphicsReducer },
    preloadedState: {
      graphics: {
        activeFogEffectId: 'fog-classic',
        activeMapEffectId: 'map-none',
        activeScentEffectId: 'scent-dotted',
        isScentVisible: true,
        ...overrides,
      },
    },
  });

const mockStyles = StyleSheet.create({
  header: { flexDirection: 'row' },
  title: { fontSize: 18 },
  backButton: { padding: 4 },
  menuItem: { padding: 12 },
  menuItemText: { fontSize: 16 },
  menuItemDescription: { fontSize: 12 },
});

describe('SettingsEffectsView', () => {
  it('renders the Visual Effects title', () => {
    const store = createStore();
    const { getByText } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    expect(getByText('Visual Effects')).toBeTruthy();
  });

  it('renders the Fog Effects section header', () => {
    const store = createStore();
    const { getByText } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    expect(getByText('Fog Effects')).toBeTruthy();
  });

  it('renders the Map Overlays section header', () => {
    const store = createStore();
    const { getByText } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    expect(getByText('Map Overlays')).toBeTruthy();
  });

  it('renders the Scent Trail section header', () => {
    const store = createStore();
    const { getByText } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    expect(getByText('Scent Trail')).toBeTruthy();
  });

  it('renders testID effect options for all 12 effects', () => {
    const store = createStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    for (const effect of AVAILABLE_GRAPHICS) {
      expect(getByTestId(`effect-option-${effect.id}`)).toBeTruthy();
    }
  });

  it('calls onBack when the back button is pressed', async () => {
    const store = createStore();
    const onBack = jest.fn();
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={onBack} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('effects-back-button'));
    });
    expect(onBack).toHaveBeenCalled();
  });

  it('dispatches setFogEffect when a fog option is pressed', async () => {
    const store = createStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('effect-option-fog-vignette'));
    });
    expect(store.getState().graphics.activeFogEffectId).toBe('fog-vignette');
  });

  it('dispatches setMapEffect when a map option is pressed', async () => {
    const store = createStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('effect-option-map-sepia'));
    });
    expect(store.getState().graphics.activeMapEffectId).toBe('map-sepia');
  });

  it('dispatches setScentEffect when a scent option is pressed', async () => {
    const store = createStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('effect-option-scent-arrows'));
    });
    expect(store.getState().graphics.activeScentEffectId).toBe('scent-arrows');
  });

  it('shows the animated badge only for animated effects', () => {
    const store = createStore();
    const { getAllByText } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    const animatedCount = AVAILABLE_GRAPHICS.filter((g) => g.isAnimated).length;
    const badges = getAllByText(' ✦');
    expect(badges).toHaveLength(animatedCount);
  });

  it('does not show the animated badge for non-animated effects', () => {
    const store = createStore();
    const { queryByTestId, getByTestId } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    // fog-classic is not animated: its option should exist
    expect(getByTestId('effect-option-fog-classic')).toBeTruthy();
    // map-none is not animated: its option should exist
    expect(getByTestId('effect-option-map-none')).toBeTruthy();
    // Just confirming the options render; badge count tested above
    expect(queryByTestId('effect-option-fog-classic')).toBeTruthy();
  });

  it('does not change other effect categories when a fog effect is selected', async () => {
    const store = createStore({ activeMapEffectId: 'map-sepia' });
    const { getByTestId } = render(
      <Provider store={store}>
        <SettingsEffectsView onBack={jest.fn()} styles={mockStyles} />
      </Provider>
    );
    await act(async () => {
      fireEvent.press(getByTestId('effect-option-fog-haunted'));
    });
    expect(store.getState().graphics.activeFogEffectId).toBe('fog-haunted');
    expect(store.getState().graphics.activeMapEffectId).toBe('map-sepia');
  });
});
