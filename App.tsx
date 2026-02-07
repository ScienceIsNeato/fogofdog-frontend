import React from 'react';
import { LogBox } from 'react-native';
import { Provider } from 'react-redux';
import { store } from './src/store';
import Navigation from './src/navigation';

// Suppress harmless Fabric touch-tracking warning from react-native-maps.
// MKMapView's native gesture recognizer (pinch/pan) fires touch events that
// React's ResponderTouchHistoryStore can't correlate to an active JS touch.
// This only appears in dev builds and has no functional impact.
// Upstream: https://github.com/react-native-maps/react-native-maps/issues/4860
LogBox.ignoreLogs(['Cannot find single active touch']);

export default function App() {
  return (
    <Provider store={store}>
      <Navigation />
    </Provider>
  );
}
