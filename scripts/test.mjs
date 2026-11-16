#!/usr/bin/env node
/**
 * Exercise the provider the way `ctx.skills` does, without a running Harness.
 *
 * `check.mjs` inspects the files; this drives `apply`, `list`, and `get` with a
 * stand-in for the skill registry, so a parser or locator mistake fails here
 * instead of disappearing from someone's catalog.
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSkill } from '../lib/frontmatter.js'
import { apply, inject } from '../index.js'

const SKILLS = fileURLToPath(new URL('../skills/', import.meta.url))
const warnings = []
let registered

// The parser is the piece that degrades a catalog silently, so pin every shape
// a hand edit or the generator may write. `make-bot-ui` really uses `>-`.
const shapes = [
  ['plain', '---\nname: x\ndescription: one two\n---\n\nbody\n', 'one two'],
  ['folded', '---\nname: x\ndescription: >-\n  one\n  two\n---\n\nbody\n', 'one two'],
  ['literal', '---\nname: x\ndescription: |\n  one\n  two\n---\n\nbody\n', 'one\ntwo'],
  ['quoted', '---\nname: x\ndescription: "one: two"\n---\n\nbody\n', 'one: two'],
]
for (const [label, source, expected] of shapes) {
  const parsed = parseSkill(source)
  if (parsed?.description !== expected) throw new Error(`${label} description parsed as ${JSON.stringify(parsed?.description)}`)
  if (parsed?.content !== 'body') throw new Error(`${label} body parsed as ${JSON.stringify(parsed?.content)}`)
}

apply({
  logger: { warn: (message) => warnings.push(message) },
  skills: { registerProvider: (create) => { registered = create({ signal: new AbortController().signal, invalidate: () => {} }) } },
})

if (inject.join() !== 'skills') throw new Error(`inject is ${JSON.stringify(inject)}, expected skills`)
if (registered === undefined) throw new Error('apply registered no provider')
if (registered.name !== 'pstack') throw new Error(`provider is named ${registered.name}`)

const candidates = await registered.list()
const expected = (await readdir(SKILLS, { withFileTypes: true })).filter((entry) => entry.isDirectory()).length
if (candidates.length !== expected) throw new Error(`listed ${candidates.length} of ${expected} skills`)
if (warnings.length > 0) throw new Error(`discovery warned: ${warnings.join('; ')}`)

for (const candidate of candidates) {
  const skill = await registered.get(candidate)
  if (skill === undefined) throw new Error(`${candidate.name} loaded nothing`)
  if (skill.name !== candidate.name) throw new Error(`${candidate.name} loaded as ${skill.name}`)
  if (skill.provider !== 'pstack') throw new Error(`${candidate.name} reports provider ${skill.provider}`)
  if (skill.description !== candidate.description) throw new Error(`${candidate.name} changed description between list and get`)
  if (skill.resourceBase?.path !== join(SKILLS, candidate.name)) throw new Error(`${candidate.name} lost its resource base`)
  if (skill.content.trim().length === 0) throw new Error(`${candidate.name} has an empty body`)
  if (skill.content.startsWith('---')) throw new Error(`${candidate.name} kept its frontmatter in the body`)
  if (skill.description.length === 0) throw new Error(`${candidate.name} has no description`)
  if (!skill.description.includes(' ')) throw new Error(`${candidate.name} description is not a sentence: ${JSON.stringify(skill.description)}`)
}

const missing = await registered.get({ name: 'nonexistent', description: 'x', locator: { path: join(SKILLS, 'nonexistent', 'SKILL.md'), directory: join(SKILLS, 'nonexistent') } })
if (missing !== undefined) throw new Error('a missing skill loaded a definition')

console.log(`OK ${candidates.length} skills served, first ${candidates[0].name}, last ${candidates.at(-1).name}.`)
