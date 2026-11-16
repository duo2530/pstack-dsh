/**
 * pstack for DeepSeek Harness.
 *
 * The skills in `skills/` use the `<name>/SKILL.md` layout that
 * `@deepseek-ai/dsh-skill-filesystem` discovers, so this provider serves the
 * same files to `ctx.skills` without copying them into a profile skill root.
 * Every catalog entry keeps its own directory as the resource base, which is
 * how `playbooks/`, `references/`, and `scripts/` paths in a skill body resolve.
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Precedence of a packaged provider: `BUNDLED_SKILL_RANK` in `@deepseek-ai/dsh-skill`. */
const RANK = 600
const PROVIDER = 'pstack'
const SOURCE = 'bundled'
const INVOCATION = Object.freeze({ modelInvocable: true, userInvocable: true })
const SKILLS_ROOT = fileURLToPath(new URL('./skills/', import.meta.url))
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/**
 * A catalog description longer than this routes on a clipped sentence, so
 * `scripts/check.mjs` fails the build instead of shipping one. This bound
 * mirrors the skill tool's catalog limit.
 */
const DESCRIPTION_MAX = 500
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export const name = 'pstack-dsh'
export const inject = ['skills']

/**
 * Register the pstack provider on `ctx.skills`.
 * @param {import('@deepseek-ai/cordis').Context} ctx host plugin context
 */
export function apply(ctx) {
  ctx.skills.registerProvider(() => new PstackSkills(ctx))
}

class PstackSkills {
  name = PROVIDER

  /** @type {{ logger: { warn: (message: string) => void } }} */
  #ctx
  /** @type {Promise<readonly object[]> | undefined} */
  #catalog

  /**
   * @param {{ logger: { warn: (message: string) => void } }} ctx host plugin context
   */
  constructor(ctx) {
    this.#ctx = ctx
  }

  /**
   * List every bundled skill once per process; a failed discovery is retried
   * on the next catalog read.
   * @returns {Promise<readonly object[]>} candidates for `ctx.skills`
   */
  list() {
    this.#catalog ??= discover(this.#ctx).catch((error) => {
      this.#catalog = undefined
      throw error
    })
    return this.#catalog
  }

  /**
   * Load one skill body for a candidate this provider listed.
   * @param {{ locator: { path: string, directory: string } }} candidate catalog entry
   * @returns {Promise<object | undefined>} the definition, or nothing when the file is gone
   */
  async get(candidate) {
    const { path, directory } = candidate.locator
    const skill = await read(path)
    if (skill === undefined) return undefined
    return {
      name: skill.name,
      description: skill.description,
      invocation: INVOCATION,
      source: SOURCE,
      provider: PROVIDER,
      resourceBase: { kind: 'directory', path: directory },
      path,
      content: skill.content,
    }
  }
}

/**
 * Read `skills/` and turn each readable skill into a catalog candidate.
 * @param {{ logger: { warn: (message: string) => void } }} ctx host plugin context
 * @returns {Promise<readonly object[]>} candidates sorted by name
 */
async function discover(ctx) {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true })
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !SKILL_NAME.test(entry.name)) continue
    const directory = join(SKILLS_ROOT, entry.name)
    const path = join(directory, 'SKILL.md')
    const skill = await read(path)
    const problem = inspect(skill, entry.name)
    if (problem !== undefined) {
      ctx.logger.warn(`pstack-dsh: skills/${entry.name}/SKILL.md ignored: ${problem}`)
      continue
    }
    candidates.push({
      name: skill.name,
      description: skill.description,
      invocation: INVOCATION,
      source: SOURCE,
      provider: PROVIDER,
      resourceBase: { kind: 'directory', path: directory },
      path,
      rank: RANK,
      locator: { path, directory },
    })
  }
  return candidates.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
}

/**
 * Name one reason a skill must not reach the catalog.
 * @param {{ name: string, description: string } | undefined} skill parsed frontmatter
 * @param {string} folder the skill directory name
 * @returns {string | undefined} the reason, or nothing when the skill is usable
 */
function inspect(skill, folder) {
  if (skill === undefined) return 'no YAML frontmatter'
  if (skill.name !== folder) return `frontmatter name ${JSON.stringify(skill.name)} is not the folder name`
  if (skill.description === '') return 'no description'
  if (skill.description.length > DESCRIPTION_MAX) {
    return `a ${skill.description.length}-character description, over the ${DESCRIPTION_MAX}-character catalog bound`
  }
  return undefined
}

/**
 * Parse one `SKILL.md` into its frontmatter fields and body.
 * @param {string} path absolute file path
 * @returns {Promise<{ name: string, description: string, content: string } | undefined>} parsed skill, or nothing when unreadable
 */
async function read(path) {
  let source
  try {
    source = await readFile(path, 'utf8')
  } catch {
    return undefined
  }
  const block = FRONTMATTER.exec(source)
  if (block === null) return undefined
  return {
    name: field(block[1], 'name'),
    description: field(block[1], 'description'),
    content: source.slice(block[0].length).trim(),
  }
}

/**
 * Read one single-line frontmatter value, dropping the quotes a generator may add.
 * @param {string} frontmatter the YAML block between the delimiters
 * @param {string} key the field to read
 * @returns {string} the trimmed value, or an empty string when absent
 */
function field(frontmatter, key) {
  const line = new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(frontmatter)
  const value = line?.[1].trim() ?? ''
  const quote = value[0]
  return (quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)
    ? value.slice(1, -1)
    : value
}
