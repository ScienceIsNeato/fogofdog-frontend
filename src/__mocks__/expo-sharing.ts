// Mock for expo-sharing
export const isAvailableAsync = jest.fn().mockResolvedValue(true);

export const shareAsync = jest.fn().mockResolvedValue({
  action: 'shared',
});

export default {
  isAvailableAsync,
  shareAsync,
};
