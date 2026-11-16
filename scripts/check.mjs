#!/usr/bin/env node
/**
 * Fail on anything DSH would skip, hide, or render wrong.
 *
 * The skill tree is generated, so this checks the packaging around it: the
 * bundle row, the manifest exports, the locale metadata, the icon, and every
 * `skills/<name>/SKILL.md` that discovery would otherwise drop silently.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSkill } from '../lib/frontmatter.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKILLS = join(ROOT, 'skills')
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DESCRIPTION_MAX = 500
const ICON_MAX = 256 * 1024
const FORBIDDEN_SVG = ['<script', '<style', '<text', '<image', 'foreignObject', 'onload=']
const problems = []

/**
 * Record every reason a value fails a predicate.
 * @param {boolean} ok whether the value passed
 * @param {string} message what is wrong when it did not
 */
function check(ok, message) {
  if (!ok) problems.push(message)
}

/**
 * Read one JSON file from the bundle.
 * @param {string} path path relative to the bundle root
 * @returns {Promise<Record<string, any> | undefined>} parsed value, or nothing when absent or malformed
 */
async function json(path) {
  try {
    return JSON.parse(await readFile(join(ROOT, path), 'utf8'))
  } catch (error) {
    problems.push(`${path}: ${error.message}`)
    return undefined
  }
}

async function walk(dir) {
  const found = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await walk(path))
    else found.push(path)
  }
  return found
}

const manifest = await json('package.json')
if (manifest !== undefined) {
  check(typeof manifest.name === 'string' && manifest.name.length > 0, 'package.json: no name')
  check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? ''), `package.json: version ${JSON.stringify(manifest.version)} is not semver`)
  check(manifest.type === 'module', 'package.json: type must be module')
  check(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'package.json: dsh.bundle.patch must be ./cordis.patch.yml')
  for (const entry of ['.', './locale/*.json', './icon']) {
    check(manifest.exports?.[entry] !== undefined, `package.json: exports is missing ${entry}`)
  }
  const files = manifest.files ?? []
  for (const entry of ['index.js', 'lib', 'cordis.patch.yml', 'skills', 'scripts', 'UPSTREAM.json', 'locale/*.json', 'icon.svg']) {
    check(files.includes(entry), `package.json: files is missing ${entry}`)
  }
  check(manifest.engines === undefined, 'package.json: do not pin engines.dsh yet; a prerelease DSH version fails a plain range')
}

const patch = await readFile(join(ROOT, 'cordis.patch.yml'), 'utf8').catch((error) => {
  problems.push(`cordis.patch.yml: ${error.message}`)
  return ''
})
if (patch !== '') {
  check(/^- insert:$/m.test(patch), 'cordis.patch.yml: the patch must start with "- insert:"')
  check(new RegExp(`^\\s+- id: ${manifest?.name}$`, 'm').test(patch), `cordis.patch.yml: no plugin row with id ${manifest?.name}`)
  check(new RegExp(`^\\s+name: ${manifest?.name}$`, 'm').test(patch), `cordis.patch.yml: no plugin row named ${manifest?.name}`)
}

const plugin = await import(new URL('../index.js', import.meta.url)).catch((error) => {
  problems.push(`index.js: ${error.message}`)
  return undefined
})
if (plugin !== undefined) {
  check(typeof plugin.apply === 'function', 'index.js: exports no apply(ctx)')
  check(Array.isArray(plugin.inject) && plugin.inject.includes('skills'), 'index.js: inject must name the skills service')
}

for (const language of ['en', 'zh']) {
  const locale = await json(`locale/${language}.json`)
  if (locale === undefined) continue
  check(typeof locale.meta?.title === 'string' && locale.meta.title.length > 0, `locale/${language}.json: no meta.title`)
  check(typeof locale.meta?.description === 'string' && locale.meta.description.length > 0, `locale/${language}.json: no meta.description`)
}

const iconPath = join(ROOT, 'icon.svg')
const icon = await readFile(iconPath, 'utf8').catch(() => undefined)
if (icon === undefined) {
  problems.push('icon.svg: missing')
} else {
  check((await stat(iconPath)).size <= ICON_MAX, `icon.svg: over ${ICON_MAX} bytes`)
  check(icon.trimStart().startsWith('<svg'), 'icon.svg: not an SVG')
  check(icon.includes('viewBox="0 0 36 36"'), 'icon.svg: viewBox must be 0 0 36 36')
  for (const tag of FORBIDDEN_SVG) {
    check(!icon.includes(tag), `icon.svg: carries ${tag}, which an icon must not`)
  }
}

const folders = (await readdir(SKILLS, { withFileTypes: true }).catch((error) => {
  problems.push(`skills/: ${error.message}`)
  return []
})).filter((entry) => entry.isDirectory())
check(folders.length > 0, 'skills/: no skill directories')

for (const path of await walk(SKILLS)) {
  const relative = path.slice(SKILLS.length + 1).split('\\').join('/')
  if (!path.endsWith('SKILL.md')) continue
  check(/^[^/]+\/SKILL\.md$/.test(relative), `skills/${relative}: discovery does not descend into a nested SKILL.md`)
}

for (const folder of folders) {
  const label = `skills/${folder.name}/SKILL.md`
  const source = await readFile(join(SKILLS, folder.name, 'SKILL.md'), 'utf8').catch(() => undefined)
  if (source === undefined) {
    problems.push(`${label}: missing`)
    continue
  }
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1]
  if (block === undefined) {
    problems.push(`${label}: no YAML frontmatter`)
    continue
  }
  const skill = parseSkill(source)
  check(SKILL_NAME.test(folder.name), `${label}: folder name is not lowercase words joined by hyphens`)
  check(skill.name === folder.name, `${label}: name ${JSON.stringify(skill.name)} is not the folder name`)
  check(skill.description.length > 0, `${label}: no description`)
  check(skill.description.length <= DESCRIPTION_MAX, `${label}: ${skill.description.length}-character description, over the ${DESCRIPTION_MAX} bound`)
  // A block-scalar marker that reached the catalog as text is the failure a
  // minimal parser makes; assert prose, not just a non-empty string.
  check(!/^[>|"'&*!\-[\]{},#]/.test(skill.description), `${label}: description ${JSON.stringify(skill.description.slice(0, 20))} is a YAML marker, not prose`)
  check(skill.description.includes(' '), `${label}: description is not a sentence`)
  check(!/^disable-model-invocation:/m.test(block), `${label}: disable-model-invocation would hide it from the skill tool`)
}

const upstream = await json('UPSTREAM.json')
if (upstream !== undefined) {
  check(/^[0-9a-f]{40}$/.test(upstream.commit ?? ''), 'UPSTREAM.json: commit must be a full 40-character hash')
  check(upstream.skills === folders.length, `UPSTREAM.json: records ${upstream.skills} skills, the tree has ${folders.length}`)
}

// A tagged install packs the README at that tag, and that README is the bundle
// page in Plugins. It must name the tag it ships in, or a new user copies the
// install spec of the previous release. GitHub Actions sets both values on a
// tag push; a local run skips this.
if (process.env.GITHUB_REF_TYPE === 'tag') {
  const tag = process.env.GITHUB_REF_NAME
  const readme = await readFile(join(ROOT, 'README.md'), 'utf8').catch(() => '')
  check(readme.includes(`${manifest?.name}#${tag}`), `README.md: does not name the release tag ${manifest?.name}#${tag}`)
}

if (problems.length > 0) {
  for (const problem of problems) console.log(`FAIL ${problem}`)
  console.log(`${problems.length} problem(s).`)
  process.exit(1)
}
console.log(`OK ${folders.length} skills, ${manifest.name}@${manifest.version}.`)
