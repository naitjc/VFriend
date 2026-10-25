import { readFile, readdir, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, extname, relative } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const errors = []
const json = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'))
const manifest = await json('package.json')
const frontend = await json('qa-app/frontend-vue/package.json')
const rootLock = await json('package-lock.json')
const frontendLock = await json('qa-app/frontend-vue/package-lock.json')
const gradle = await readFile(resolve(root, 'qa-app/frontend-vue/android/app/build.gradle'), 'utf8')
for (const [name, version] of [['frontend', frontend.version], ['root lock', rootLock.version], ['frontend lock', frontendLock.version], ['Android', /versionName "([^"]+)"/.exec(gradle)?.[1]]]) {
  if (version !== manifest.version) errors.push(`${name} version ${version} differs from ${manifest.version}`)
}
for (const [name, lock] of [['root', rootLock], ['frontend', frontendLock]]) {
  if (lock.packages[''].version !== manifest.version) errors.push(`${name} lock package version is stale`)
}
if (!gradle.includes('applicationId "com.naitjc.chatrp"') || !gradle.includes('applicationIdSuffix ".preview"')) errors.push('Existing Android application IDs must be preserved')

// Check local Markdown links without following the network or touching runtime data.
async function documents(directory) {
  const paths = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'build', 'dist', 'android', 'data'].includes(entry.name)) continue
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) paths.push(...await documents(path))
    else if (extname(path) === '.md') paths.push(path)
  }
  return paths
}
for (const path of await documents(root)) {
  const markdown = await readFile(path, 'utf8')
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^\s)]+)\)/g)) {
    const link = match[1]
    if (/^[a-z]+:/i.test(link) || link.startsWith('#')) continue
    const target = decodeURIComponent(link.split('#')[0])
    try { await access(resolve(dirname(path), target)) }
    catch { errors.push(`${relative(root, path)}: broken local link ${link}`) }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1 }
else console.log(`Repository versions (${manifest.version}) and local documentation links are consistent.`)
