# pstack for DeepSeek Harness

[pstack](https://github.com/cursor/plugins/tree/main/pstack) is Lauren Tan's agent workflow stack: go deep before you go fast, plan before you build, delegate deliberately, write prose nobody has to decode, and verify the work before you call it done.

This repository packages it for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) as one plugin. Install the bundle once and every session in the profile gets all 61 pstack skills, including `pstack-adapter`, which maps the Cursor tool names inside a pstack skill onto the DSH tools that replace them.

- **One install, no copies.** The skills ship inside the bundle and are served through DSH's skill registry, so nothing is written to `~/.dsh/skills` and nothing has to be repeated per repository.
- **The real skills, not a rewrite.** The bodies are pstack's own, generated for DSH from the pstack sources. See [Provenance](#provenance).
- **One switch.** Turn the plugin off and all 61 leave the catalog together.

## Install

The bundle is `github:duo2530/pstack-dsh#v0.1.0`.

**Plugins page.** In DSH, open the sidebar's **Plugins** page, install a bundle, and give it that spec.

**Ask the agent.** Tell it to install the bundle:

> Install the bundle `github:duo2530/pstack-dsh#v0.1.0` with `plugin_manager` `install_bundle`.

**From a checkout.** Clone the repository, then use **Plugins** > **Add plugin** with the directory you cloned into:

```sh
git clone https://github.com/duo2530/pstack-dsh
```

A checkout install is a link, so keep that directory where it is. The spec installs a copy inside the profile instead, which survives deleting the checkout.

The plugin is enabled for the whole profile: every session, not one project. Restarting is not needed when the profile applies changes live; a profile that only reads its composition at startup needs one restart.

## Use it

Start a task with `/poteto-mode`, or call any skill by name: `/architect`, `/interrogate`, `/unslop`, `/statechart`. Every pstack skill begins by telling the model to load `pstack-adapter` first, so the Cursor names in its text resolve before it acts.

Run `/setup-pstack` once to decide which model each pstack role uses. It writes a `## pstack models` section into `$DSH_HOME/AGENTS.md`, which every session reads. Without that section each role runs on the session's own model. Keep the section out of a project `AGENTS.md`, which governs one repository.

## What is inside

| Group | Skills |
|---|---|
| Style and routing | `poteto-mode`, `poteto-help`, `pstack-adapter`, `poteto-agent`, `comment-sicko`, `unslop`, `bro`, `no-comments`, `in-your-own-words`, `ketchup`, `ketchup-video`, `technical-writing`, `typescript-best-practices`, `teach` |
| Plan and design | `architect`, `figure-it-out`, `sharpen`, `how`, `why`, `recall`, `reflect`, `automate-me` |
| Build and review | `interrogate`, `arena`, `swarm`, `blast-radius`, `correct`, `tdd` |
| Verify and ship | `create-verification-skill`, `maintain-verification-skill`, `create-formal-verification-skill`, `statechart`, `benchmark-checklist` |
| Long runs | `show-me-your-work`, and the overnight, autopilot, and orchestrate playbooks under `poteto-mode/playbooks/` |
| Principles | 24 `principle-*` leaves, from `principle-foundational-thinking` to `principle-prove-it-works` |

`pstack-help` answers questions about the stack and points at the skill for a task; start there when you do not know which one you want.

## What differs from the Cursor edition

The tree is generated from the pstack sources with a DSH target, because a few things cannot be carried over:

- **Every skill is model-invocable.** Cursor hides most of them behind a person's menu; DSH routes skills through its `skill` tool, which cannot load a skill the catalog hides.
- **The agents are skills.** `poteto-agent` and `comment-sicko` are briefs a delegate loads, because DSH has no agent types. The adapter says how to spawn one.
- **Role models live in `$DSH_HOME/AGENTS.md`**, which replaces `~/.cursor/rules/pstack-models.mdc`.
- **Cursor-only features are replaced or skipped.** Bugbot becomes an ordinary review thread on the forge, Cursor Automations become `schedule_create`, `/loop` becomes `create_goal` or `schedule_create`, and Custom Modes become `/poteto-mode`. The adapter lists each substitution and each skip.

## If you already copied the skills

Earlier instructions copied `skills/*` into `~/.dsh/skills`. A user copy outranks a packaged one, so a stale copy would shadow the plugin and keep receiving the fixes you install. From a checkout, delete exactly the directories this bundle provides and leave everything else in that shared root alone:

```sh
# macOS, Linux, Git Bash
for d in pstack-dsh/skills/*/; do rm -rf "$HOME/.dsh/skills/$(basename "$d")"; done
```

```powershell
# Windows
Get-ChildItem .\pstack-dsh\skills -Directory | ForEach-Object {
  Remove-Item "$env:USERPROFILE\.dsh\skills\$($_.Name)" -Recurse -Force -ErrorAction SilentlyContinue
}
```

If your copies and the plugin carry the same version, leaving them costs one duplicate warning per name in the log and nothing else.

## Update

Install the newer tag spec over the installed bundle, which replaces it. Tags are on [Releases](https://github.com/duo2530/pstack-dsh/releases); each one names the upstream pstack commit it was generated from.

## Layout

```
index.js                  the skill provider: reads skills/*/SKILL.md into ctx.skills
lib/frontmatter.js        the SKILL.md frontmatter parser the provider and checks share
cordis.patch.yml          the bundle row that mounts index.js
skills/                   the generated pstack DSH tree; do not edit by hand
locale/{en,zh}.json       title and description for the Plugins page
icon.svg                  plugin icon
scripts/check.mjs         bundle invariants; runs in CI on every push
scripts/test.mjs          drives list() and get() with a stand-in skill registry
scripts/sync-upstream.mjs regenerate skills/ from the pstack sources
UPSTREAM.json             the commit this tree was generated from
```

`node scripts/check.mjs` fails on a skill whose frontmatter name does not match its folder, a description over the catalog limit, a nested `SKILL.md`, a broken manifest, a malformed locale, or an icon that is not a plain 36×36 SVG. `node scripts/test.mjs` then loads all 61 through the same calls DSH makes.

## Provenance

The skill bodies come from pstack, which lives in [cursor/plugins](https://github.com/cursor/plugins). The DSH target is generated by that repository's `scripts/generate-pstack-harness-trees.mjs`, and `UPSTREAM.json` records the commit used. `scripts/sync-upstream.mjs` runs the same generation against a checkout and rewrites `skills/`, `LICENSE`, and `UPSTREAM.json`.

pstack is MIT licensed, copyright Lauren Tan; see [LICENSE](LICENSE). The packaging code in this repository is MIT as well.
