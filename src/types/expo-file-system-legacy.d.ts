/**
 * Type declaration for expo-file-system/legacy subpath.
 *
 * In expo-file-system@19+ the legacy API lives under a /legacy subpath.
 * In @18 (Expo SDK 54) the same API lives at the package root.
 * This declaration re-exports the root so TypeScript resolves both paths.
 */
declare module 'expo-file-system/legacy' {
  export * from 'expo-file-system';
}
