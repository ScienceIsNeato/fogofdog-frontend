const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Configure source file extensions
config.resolver.sourceExts = ['js', 'jsx', 'json', 'ts', 'tsx', 'cjs', 'mjs'];

// Configure asset extensions
config.resolver.assetExts = [...config.resolver.assetExts, 'bin'];

module.exports = config;
