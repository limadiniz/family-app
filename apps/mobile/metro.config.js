// Metro config for a pnpm workspace monorepo. The workspace root .npmrc
// sets `node-linker=hoisted` (Expo's official recommendation for pnpm
// monorepos, see https://docs.expo.dev/guides/monorepos/) so node_modules
// is a flat, non-symlinked tree Metro can resolve normally. We still need
// to point Metro at the workspace root so it watches/resolves
// workspace:* packages (e.g. @family-app/domain) that live outside
// apps/mobile.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
