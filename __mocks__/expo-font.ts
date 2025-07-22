// Mock expo-font to prevent font loading errors
export const Font = {
  loadAsync: jest.fn().mockResolvedValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
  isLoading: jest.fn().mockReturnValue(false),
};

export const FontLoader = {
  loadAsync: jest.fn().mockResolvedValue(undefined),
};

export default Font;