const { spawn } = require('child_process')
const path = require('path')
const dotenv = require('dotenv')

const cwd = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(cwd, '.env') })

const processes = []

const run = (label, command) => {
  const child = spawn(command, {
    cwd,
    shell: true,
    stdio: 'inherit',
    env: process.env,
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      // Exit everything if one process dies
      processes.forEach((proc) => proc && proc.kill && proc.kill())
      process.exit(code)
    }
  })

  child.on('error', (err) => {
    console.error(`[${label}] failed to start:`, err.message)
    processes.forEach((proc) => proc && proc.kill && proc.kill())
    process.exit(1)
  })

  processes.push(child)
}

const rendererPort = process.env.DESKTOP_RENDERER_PORT
const rendererUrl =
  process.env.DESKTOP_RENDERER_URL ||
  (rendererPort ? `http://localhost:${rendererPort}` : undefined)

if (!rendererUrl) {
  console.error(
    'Missing renderer URL. Set DESKTOP_RENDERER_URL or DESKTOP_RENDERER_PORT in apps/desktop/.env',
  )
  process.exit(1)
}

const nextPortArg = rendererPort ? `-p ${rendererPort}` : ''

run('tsc', 'tsc -p tsconfig.electron.json -w')
run('next', `next dev ${nextPortArg}`.trim())
run('electron', `wait-on dist/electron/main.js ${rendererUrl} && electron .`)

process.on('SIGINT', () => {
  processes.forEach((proc) => proc && proc.kill && proc.kill())
  process.exit(0)
})
