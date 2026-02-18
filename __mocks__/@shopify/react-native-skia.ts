import React from 'react';
import { View } from 'react-native';

// Mock Skia image/surface for offscreen rendering
const mockSkImage = {
  encodeToBase64: jest.fn(() => 'mockBase64ImageData'),
  encodeToBytes: jest.fn(() => new Uint8Array()),
  dispose: jest.fn(),
  width: jest.fn(() => 400),
  height: jest.fn(() => 800),
};

const mockSkSurface = {
  getCanvas: jest.fn(() => ({
    drawRect: jest.fn(),
    drawPath: jest.fn(),
    drawCircle: jest.fn(),
    clear: jest.fn(),
  })),
  makeImageSnapshot: jest.fn(() => mockSkImage),
  flush: jest.fn(),
  width: jest.fn(() => 400),
  height: jest.fn(() => 800),
};

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
    setStrokeCap: jest.fn(),
    setStrokeJoin: jest.fn(),
    setBlendMode: jest.fn(),
    setAlphaf: jest.fn(),
  })),
  Color: jest.fn((c: string) => c),
  XYWHRect: jest.fn((x: number, y: number, w: number, h: number) => ({
    x,
    y,
    width: w,
    height: h,
  })),
  Surface: {
    Make: jest.fn(() => mockSkSurface),
    MakeOffscreen: jest.fn(() => mockSkSurface),
  },
};

// Enums mirroring Skia paint configuration used by tests
export const PaintStyle = { Fill: 0, Stroke: 1 };
export const StrokeCap = { Butt: 0, Round: 1, Square: 2 };
export const StrokeJoin = { Miter: 0, Round: 1, Bevel: 2 };
export const BlendMode = {
  Clear: 0,
  Src: 1,
  Dst: 2,
  SrcOver: 3,
  DstOver: 4,
  SrcIn: 5,
  DstIn: 6,
  SrcOut: 7,
  DstOut: 8,
  SrcATop: 9,
  DstATop: 10,
  Xor: 11,
  Plus: 12,
  Modulate: 13,
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
