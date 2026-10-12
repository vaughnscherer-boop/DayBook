const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite on web loads wa-sqlite.wasm
config.resolver.assetExts.push('wasm');

module.exports = config;
