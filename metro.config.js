const { getDefaultConfig } = require("expo/metro-config");
const { FileStore } = require("metro-cache");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Persist Metro transform cache in the project directory so it survives
// container restarts. Without this every restart forces full recompilation.
// The cache dir is excluded from git via .gitignore.
config.cacheStores = [
  new FileStore({ root: path.join(__dirname, ".metro-cache") }),
];

// Ensure Metro watches the entire project root (relevant in Docker bind-mount).
config.watchFolders = [__dirname];

module.exports = config;
