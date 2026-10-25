import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const children = []
let stopping = false
let deadline
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  deadline = setTimeout(() => {
    for (const child of children) if (child.exitCode === null) child.kill('SIGKILL')
  }, 6000)
  deadline.unref()
}
const commands = [
  ['apps/server', ['server.js']],
  ['apps/client', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', process.env.VFRIEND_WEB_PORT || '5173', '--strictPort']],
]
for (const [directory, args] of commands) {
  const child = spawn(process.execPath, args, { cwd: join(root, directory), stdio: 'inherit' })
  children.push(child)
  child.once('error', error => { console.error(error.message); stop(1) })
  child.once('exit', code => {
    if (!stopping) stop(code || 1)
    if (children.every(process => process.exitCode !== null || process.signalCode !== null)) clearTimeout(deadline)
  })
}
// Keep handlers installed: terminals and npm can deliver the same signal twice.
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
