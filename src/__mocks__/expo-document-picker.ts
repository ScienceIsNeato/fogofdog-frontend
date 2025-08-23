// Mock for expo-document-picker
export const getDocumentAsync = jest.fn().mockResolvedValue({
  canceled: false,
  assets: [
    {
      uri: '/mock/document.json',
      name: 'test-file.json',
      size: 1000,
      mimeType: 'application/json',
    },
  ],
});

export default {
  getDocumentAsync,
};
