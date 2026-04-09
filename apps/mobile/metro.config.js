const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')
const { withNativewind } = require('nativewind/metro')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.unstable_enableSymlinks = true

config.resolver.extraNodeModules = {
  '@biztrack/types': path.resolve(workspaceRoot, 'packages/types/src'),
  '@biztrack/utils': path.resolve(workspaceRoot, 'packages/utils/src'),
  '@biztrack/validators': path.resolve(workspaceRoot, 'packages/validators/src'),
}

module.exports = withNativewind(config, { input: './global.css' })
