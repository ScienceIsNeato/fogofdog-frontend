/**
 * Entry point for the FogOfDog app
 * Supports both web and native platforms through Expo
 */
import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent handles the app registration for both web and native platforms
// It's the Expo equivalent of:
// - Web: ReactDOM.render()
// - Native: AppRegistry.registerComponent()
registerRootComponent(App);
