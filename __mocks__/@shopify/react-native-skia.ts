import React from 'react';
import { View } from 'react-native';

// Mock all Skia components as simple Views
export const Skia = {
  Path: {
    Make: jest.fn(() => ({
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      close: jest.fn(),
      addCircle: jest.fn(),
      addRect: jest.fn(),
    })),
  },
  Paint: jest.fn(() => ({
    setColor: jest.fn(),
    setStyle: jest.fn(),
    setStrokeWidth: jest.fn(),
  })),
};

export const Canvas = (props: any) => React.createElement(View, props);
export const Path = (props: any) => React.createElement(View, props);
export const Fill = (props: any) => React.createElement(View, props);
export const Circle = (props: any) => React.createElement(View, props);
export const Mask = (props: any) => React.createElement(View, props);
export const Rect = (props: any) => React.createElement(View, props);
export const Group = (props: any) => React.createElement(View, props);

export const useSharedValueEffect = jest.fn();
export const useDerivedValue = jest.fn();
export const useValue = jest.fn();

// Mock types
export type SkPath = any;
export type SkPaint = any;
export type SkCanvas = any;