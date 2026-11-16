#!/usr/bin/env node
/**
 * Regenerate `skills/` from the pstack sources.
 *
 * pstack lives in cursor/plugins, and the DSH tree comes from that
 * repository's `scripts/generate-pstack-harness-trees.mjs`. This clones the
 * branch that carries both, runs that generator, and copies the result here,
 * so the vendored tree is never edited by hand.
 *
 * Usage:
 *   node scripts/sync-upstream.mjs
 *   node scripts/sync-upstream.mjs --repo https://github.com/cursor/plugins --ref main
 */

import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// Duo's branch carries the DSH generator and its self-contained-tree fix. Point
// this at cursor/plugins once the DSH tree lands upstream.
const DEFAULT_REPO = 'https://github.com/duo2530/plugins'
const DEFAULT_REF = 'pstack-dsh-harness'
const GENERATOR = 'scripts/generate-pstack-harness-trees.mjs'
const TREE = 'harness/pstack/dsh/skills'

/**
 * Read one `--name value` argument.
 * @param {string} name argument name without dashes
 * @param {string} fallback value when the argument is absent
 * @returns {string} the resolved value
 */
function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return fallback
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`)
  return value
}

const repo = option('repo', DEFAULT_REPO)
const ref = option('ref', DEFAULT_REF)
const work = await mkdtemp(join(tmpdir(), 'pstack-dsh-sync-'))
const checkout = join(work, 'plugins')

try {
  console.log(`Cloning ${repo}#${ref}`)
  execFileSync('git', ['clone', '--depth', '1', '--branch', ref, '--quiet', repo, checkout], { stdio: 'inherit' })
  const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

  console.log(`Generating ${TREE} with ${GENERATOR}`)
  execFileSync(process.execPath, [join(checkout, GENERATOR)], { cwd: checkout, stdio: 'inherit' })

  const tree = join(ROOT, 'skills')
  await rm(tree, { recursive: true, force: true })
  await cp(join(checkout, TREE), tree, { recursive: true })
  await cp(join(checkout, 'pstack', 'LICENSE'), join(ROOT, 'LICENSE'))

  const skills = (await readdir(tree, { withFileTypes: true })).filter((entry) => entry.isDirectory()).length
  const previous = JSON.parse(await readFile(join(ROOT, 'UPSTREAM.json'), 'utf8').catch(() => '{}'))
  await writeFile(join(ROOT, 'UPSTREAM.json'), `${JSON.stringify({
    repository: repo,
    ref,
    commit,
    generatedBy: GENERATOR,
    skills,
    syncedAt: new Date().toISOString(),
  }, null, 2)}\n`)

  console.log(previous.commit === commit
    ? `${skills} skills, unchanged upstream commit ${commit}`
    : `${skills} skills, upstream commit ${previous.commit ?? '(none)'} -> ${commit}`)
  console.log('Review `git status`, then run `node scripts/check.mjs` and `node --check index.js`.')
} finally {
  await rm(work, { recursive: true, force: true })
}
