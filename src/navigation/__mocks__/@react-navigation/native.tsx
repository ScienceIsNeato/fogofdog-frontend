import React from 'react';

export const NavigationContainer = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const createNativeStackNavigator = () => ({
  Navigator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Screen: ({ children }: { children: React.ReactNode }) => <>{children}</>,
});
