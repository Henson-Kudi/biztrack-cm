const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
// config.resolver.unstable_enableSymlinks = true

config.resolver.extraNodeModules = {
  '@biztrack/types': path.resolve(workspaceRoot, 'packages/types/src'),
  '@biztrack/utils': path.resolve(workspaceRoot, 'packages/utils/src'),
  '@biztrack/validators': path.resolve(workspaceRoot, 'packages/validators/src'),
}

// @tanstack/query-core v5.x ships without a build/legacy folder.
// Metro's FallbackWatcher on Windows crashes with ENOENT when it tries to watch
// that non-existent path, causing the "infinite reloading" screen. Blocking it
// here is the permanent fix — no stub directory required.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  /node_modules[/\\]\.pnpm[/\\]@tanstack\+query-core@[^/\\]+[/\\]node_modules[/\\]@tanstack[/\\]query-core[/\\]build[/\\]legacy.*/,
]

// withNativeWind MUST be the last step — it registers the CSS transformer
// that processes global.css. Without this, Metro cannot handle CSS imports
// and the bundle crashes silently on startup (causing the "reloading forever" screen).
module.exports = withNativeWind(config, { input: './global.css' })
