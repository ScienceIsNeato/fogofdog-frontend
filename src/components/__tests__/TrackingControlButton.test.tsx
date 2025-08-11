import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { TrackingControlButton } from '../TrackingControlButton';
import explorationSlice from '../../store/slices/explorationSlice';
import userSlice from '../../store/slices/userSlice';

describe('TrackingControlButton', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        exploration: explorationSlice,
        user: userSlice,
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

  it('renders resume button when tracking is paused', () => {
    // Set tracking to paused
    store.dispatch({ type: 'exploration/setTrackingPaused', payload: true });

    const { getByTestId } = render(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    expect(getByTestId('resume-tracking-button')).toBeTruthy();
    // Should show play icon when tracking is paused
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

  it('shows correct button colors for pause and resume states', () => {
    const { getByTestId, rerender } = render(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    // Check pause button color (subtle gray)
    let button = getByTestId('pause-tracking-button');
    expect(button.props.style).toEqual(expect.objectContaining({ backgroundColor: '#F8F9FA' }));

    // Set to paused state
    act(() => {
      store.dispatch({ type: 'exploration/setTrackingPaused', payload: true });
    });

    rerender(
      <Provider store={store}>
        <TrackingControlButton />
      </Provider>
    );

    // Check resume button color (subtle green)
    button = getByTestId('resume-tracking-button');
    expect(button.props.style).toEqual(expect.objectContaining({ backgroundColor: '#E8F5E8' }));
  });
});
