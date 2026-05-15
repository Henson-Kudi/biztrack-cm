const { spawn } = require('child_process')
const { resolve } = require('path')

const electronBinary = require('electron')
const appDir = resolve(__dirname, '..')
const childEnv = {
  ...process.env,
  NODE_ENV: 'production',
  DESKTOP_FORCE_PRODUCTION: '1',
}

delete childEnv.ELECTRON_RUN_AS_NODE

const child = spawn(electronBinary, ['.'], {
  cwd: appDir,
  stdio: 'inherit',
  env: childEnv,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})
