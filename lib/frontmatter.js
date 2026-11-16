/**
 * Parse the frontmatter of a `SKILL.md`.
 *
 * A skill is generated, so its frontmatter is the small YAML subset the
 * generator writes, plus whatever a hand edit adds: plain values, quoted
 * values, and the `>` and `|` block scalars a long description is often
 * written as. `make-bot-ui` uses `>-`, and a parser that stopped at the
 * marker would put `>-` in the catalog instead of the sentence.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Parse one skill file.
 * @param {string} source the whole file
 * @returns {{ name: string, description: string, content: string } | undefined} the fields and the body, or nothing without frontmatter
 */
export function parseSkill(source) {
  const block = FRONTMATTER.exec(source)
  if (block === null) return undefined
  const lines = block[1].split(/\r?\n/)
  return {
    name: field(lines, 'name'),
    description: field(lines, 'description'),
    content: source.slice(block[0].length).trim(),
  }
}

/**
 * Read one frontmatter field, folding a block scalar into prose.
 * @param {string[]} lines the lines between the delimiters
 * @param {string} key the field to read
 * @returns {string} the value, or an empty string when absent
 */
function field(lines, key) {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`))
  if (start < 0) return ''
  const inline = lines[start].slice(key.length + 1).trim()
  if (!/^[>|][+-]?$/.test(inline)) return unquote(inline)
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') {
      body.push('')
      continue
    }
    if (!/^[ \t]/.test(line)) break
    body.push(line.replace(/^[ \t]+/, ''))
  }
  if (inline.startsWith('|')) return body.join('\n').trim()
  return body.filter((line) => line !== '').join(' ').trim()
}

/**
 * Drop the quotes a hand-written value may carry.
 * @param {string} value the trimmed inline value
 * @returns {string} the value without a matching pair of surrounding quotes
 */
function unquote(value) {
  const quote = value[0]
  return (quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)
    ? value.slice(1, -1)
    : value
}
