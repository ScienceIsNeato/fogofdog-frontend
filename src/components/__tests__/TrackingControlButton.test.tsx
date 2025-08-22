import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { TrackingControlButton } from '../TrackingControlButton';
import explorationSlice from '../../store/slices/explorationSlice';
import userSlice from '../../store/slices/userSlice';
import statsSlice from '../../store/slices/statsSlice';

describe('TrackingControlButton', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        exploration: explorationSlice,
        user: userSlice,
        stats: statsSlice,
      },
    });
  });

  it('renders pause button when tracking is active', () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    expect(getByTestId('pause-tracking-button')).toBeTruthy();
    // Should show pause icon when tracking is active
  });

  it('renders play button when tracking is paused', () => {
    // Set tracking to paused
    store.dispatch({ type: 'exploration/setTrackingPaused', payload: true });

    const { getByTestId } = render(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    expect(getByTestId('play-tracking-button')).toBeTruthy();
    // Should show play button when paused
  });

  it('toggles tracking state when pressed', () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    const button = getByTestId('pause-tracking-button');

    // Initially tracking should be active (not paused)
    expect(store.getState().exploration.isTrackingPaused).toBe(false);

    // Press the button to pause
    fireEvent.press(button);
    expect(store.getState().exploration.isTrackingPaused).toBe(true);
  });

  it('applies custom styles correctly', () => {
    const customStyle = { backgroundColor: 'red' };

    const { getByTestId } = render(
      <Provider store={store}>
        <TrackingControlButton style={customStyle} />
      </Provider>
    );

    const button = getByTestId('pause-tracking-button');
    expect(button.props.style).toEqual(expect.objectContaining(customStyle));
  });

  it('toggles from paused to active when play button is pressed', () => {
    // Set tracking to paused first
    store.dispatch({ type: 'exploration/setTrackingPaused', payload: true });

    const { getByTestId } = render(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    const playButton = getByTestId('play-tracking-button');

    // Initially tracking should be paused
    expect(store.getState().exploration.isTrackingPaused).toBe(true);

    // Press the play button
    fireEvent.press(playButton);

    // Should resume tracking
    expect(store.getState().exploration.isTrackingPaused).toBe(false);
  });

  it('shows correct button colors for pause and play states', () => {
    const { getByTestId, rerender } = render(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    // Check pause button color (gray)
    let button = getByTestId('pause-tracking-button');
    expect(button.props.style).toEqual(expect.objectContaining({ backgroundColor: '#F5F5F5' }));

    // Set to paused state
    act(() => {
      store.dispatch({ type: 'exploration/setTrackingPaused', payload: true });
    });

    rerender(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    // Check play button color (green)
    button = getByTestId('play-tracking-button');
    expect(button.props.style).toEqual(expect.objectContaining({ backgroundColor: '#E8F5E8' }));
  });
});
