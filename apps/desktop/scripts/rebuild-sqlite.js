/**
 * Rebuilds better-sqlite3 for the installed Electron ABI.
 * Uses @electron/rebuild programmatic API so only better-sqlite3 is targeted,
 * avoiding false failures on other native packages (e.g. @parcel/watcher).
 */
const path = require('path')
const { rebuild } = require('@electron/rebuild')

const electronPkg = require(path.resolve(__dirname, '../node_modules/electron/package.json'))

rebuild({
  buildPath: path.resolve(__dirname, '..'),
  electronVersion: electronPkg.version,
  force: true,
  onlyModules: ['better-sqlite3'],
})
  .then(() => {
    console.log(`✔ better-sqlite3 rebuilt for Electron ${electronPkg.version}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('✗ Rebuild failed:', err?.message ?? err)
    process.exit(1)
  })
