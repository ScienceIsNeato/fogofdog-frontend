import React from 'react';
import { View } from 'react-native';

// Mock all Skia components as simple Views
export const Skia = {
  Path: {
    Make: jest.fn(() => ({
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      quadTo: jest.fn(),
      cubicTo: jest.fn(),
      close: jest.fn(),
      addCircle: jest.fn(),
      addRect: jest.fn(),
      dispose: jest.fn(),
    })),
    MakeFromSVGString: jest.fn(() => ({
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      close: jest.fn(),
      dispose: jest.fn(),
    })),
  },
  Paint: jest.fn(() => ({
    setColor: jest.fn(),
    setStyle: jest.fn(),
    setStrokeWidth: jest.fn(),
  })),
};

// Preserve all props including testID for better testing
export const Canvas = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-canvas' });
export const Path = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-path' });
export const Fill = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-fill' });
export const Circle = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-circle' });
export const Mask = ({ mask, children, testID, ...rest }: any) =>
  React.createElement(View, { ...rest, testID: testID || 'mock-skia-mask' }, mask, children);
export const Rect = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-rect' });
export const Group = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-group' });
export const BlurMask = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-blur-mask' });
export const Paint = (props: any) =>
  React.createElement(View, { ...props, testID: props.testID || 'mock-skia-paint' });

export const useSharedValueEffect = jest.fn();
export const useDerivedValue = jest.fn();
export const useValue = jest.fn();

// Mock types
export type SkPath = any;
export type SkPaint = any;
export type SkCanvas = any;
