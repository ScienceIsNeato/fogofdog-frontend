import React from 'react';

const MockView = ({ children, testID, ...props }: any) => (
  <div data-testid={testID} {...props}>{children}</div>
);

const MockText = ({ children, testID, ...props }: any) => (
  <span data-testid={testID} {...props}>{children}</span>
);

const MockPressable = ({ children, testID, onPress, ...props }: any) => (
  <button data-testid={testID} onClick={onPress} {...props}>{children}</button>
);

export const Platform = {
  OS: 'web',
  select: (config: any) => config.web || config.default,
};

export const StyleSheet = {
  create: (styles: any) => styles,
  flatten: (style: any) => {
    if (Array.isArray(style)) {
      return Object.assign({}, ...style);
    }
    return style || {};
  },
};

export const Dimensions = {
  get: () => ({
    width: 375,
    height: 812,
  }),
};

export const View = MockView;
export const Text = MockText;
export const Pressable = MockPressable;
export const Image = MockView; 