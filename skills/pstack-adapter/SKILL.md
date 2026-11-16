---
name: pstack-adapter
description: Read once per session before following any pstack skill. Maps the Cursor tool names, subagent fields, model roles, and paths in pstack skills to DeepSeek Harness.
---

# pstack in DeepSeek Harness

pstack skills use Cursor names. In DSH, load this skill once per session, then map each Cursor name in a skill with the tables below. If a Cursor field has no row, drop it and say so. Never pass a field or value that a tool schema rejects.

This tree already changes two things for DSH. Every skill is model-invocable, so the `skill` tool loads any pstack skill by name. The `poteto-agent` and `comment-sicko` bundles are skills a delegate loads. They are not agent types.

## Tools

| Cursor | DSH |
| --- | --- |
| `Task` | `subagent` with `name`, `description`, and `prompt`. Use `subagent_fork` only when the child needs this conversation's completed turns. |
| `AskQuestion` | `ask_user_question`. |
| Open a todolist | `todo_write`, one item per step, in the order the playbook gives. |
| Run another pstack skill (`/name` or "the **name** skill") | `skill` with `name: "<name>"`. A user types `/name`, because every pstack skill is user-invocable too. |
| `Grep`, `Glob` | `grep` and `glob`. |
| Cursor's shell tool | The session's own shell tool, `pwsh` on Windows and `bash` elsewhere. A long run passes its `run_in_background` argument and is read with `job_output`. |

A skill body names its resources relative to its own directory, such as `playbooks/feature.md` or `references/bugbot-triage.md`. Resolve them against the base directory the `skill` tool reports.

## Subagent fields

| Cursor | DSH |
| --- | --- |
| `subagent_type: generalPurpose` | Omit. Every `subagent` call is a fresh agent with its own context. |
| `subagent_type: "poteto-agent"` | `subagent`, with `Load the poteto-agent skill first. It tells you to load poteto-mode in full.` as the first line of `prompt`. |
| `subagent_type: "comment-sicko"` | `subagent`, with `Load the comment-sicko skill first. Its body is the brief.` as the first line of `prompt`. |
| `readonly: true` | There is no readonly agent type. Put `Do not edit files. Report only.` in the brief, then check `git status` yourself. |
| `readonly: false` | Omit. |
| `environment: "cloud"` | No per-agent machine. Give the worker its own checkout with the shell tool, such as `git worktree add <path> <base>`, and pass `<path>` as `cwd`. `create_worktree` also makes one, but it moves this session, so use it only when the parent is the one moving. |
| `environment: "local"` | Omit. |
| `cloud_base_branch: <b>` | Name `<b>` in the brief, and have the child check it out in its worktree first. |
| `run_in_background: true` | Omit. `subagent` returns as soon as the child starts. |
| `resume` | `send_message` to that agent. DSH keeps a subagent continuable after it returns, so a resume works, but poteto-mode prefers a fresh `subagent` with the earlier report pasted into the brief. |
| `file_attachments` | List the absolute paths in `prompt`. |
| A panel that needs another vendor | `subagent_claude_code` or `subagent_codex` when the session offers it. When neither is offered, the panel repeats a model or drops the seat, and you say which. |

`prompt` is the whole brief. The child cannot see this chat, so restate the goal and the done check there, and give it the playbook step it must follow. Give each child a name that says what it does, in lowercase words joined by hyphens.

Every child runs on this machine and in this checkout unless `cwd` says otherwise, so two writers on one checkout overwrite each other.

Spawning does not block. After a fan-out, call `wait_agent` when the next step needs every report, or end the turn and let the completion notices arrive. `list_agents` shows who still runs.

## Models

| Cursor | DSH |
| --- | --- |
| `claude-<family>-<version>-<effort>[-fast]`, or a role value such as `opus high` | `provider` and `model` from `list_subagent_models`, plus `reasoning_effort` when that model lists one. Both `provider` and `model` are required together. |
| `auto` or `inherit-parent` | Omit `provider`, `model`, and `reasoning_effort`. The child runs on this session's model. |
| A `-fast` slug | No DSH equivalent. Speed belongs to the provider and model, not to an argument. Keep the family and the level. |
| An effort the model does not list | Use the nearest listed effort below it, and say so. |
| A slug the tool rejects | Do not try a second invented slug. Use a model the error lists, or omit both fields and run on this session's model, and say which. |
| `pstack-models.mdc`, `~/.cursor/rules/pstack-models.mdc` | A `## pstack models` section in `$DSH_HOME/AGENTS.md`. DSH loads that file into every session, so the role lines are already in context. If they are not, read the file. If the section or a role's line is missing, use the default the skill names. |
| A role value `inherit-parent` in the section | Omit the model fields for that role. |

## setup-pstack

Follow the skill with these changes.

- Detect. Call `list_subagent_models` with no argument for the providers, then once per provider for its models and their efforts. A detected entry is `<provider>/<model> <effort>`, such as `deepseek-official/deepseek-flash max`, which splits into the `provider` and `model` arguments. The aliases `auto` and `inherit-parent` are always valid.
- Defaults. Every default role runs on the parent model, so write `inherit-parent` unless the user picks a detected entry. A role pinned to a model the profile does not offer costs a failed spawn on every run.
- Budget. Apply the skill's ladder to the role line's effort token, using the effort ids that model lists. When a rung is absent, use the nearest rung the model lists below it. `inherit-parent` never changes.
- Write. Put the `# defaults: 2` line, the `# budget` line, and the role lines from step 5 in `$DSH_HOME/AGENTS.md` under a `## pstack models` heading. Drop the YAML frontmatter and `alwaysApply: true`, which are Cursor rule fields. Keep the rest of the file, and replace only that section, from its heading to the next `## ` heading, so a re-run stays idempotent. Create the file when it does not exist. Never write the section into a project `AGENTS.md`, which governs one repository.
- Invoke. Steps that tell the user to run `/create-verification-skill` or `/create-formal-verification-skill` work as written, because every pstack skill is user-invocable.

## Paths

| Cursor | DSH |
| --- | --- |
| `.cursor/skills/`, `~/.cursor/skills/` | `<project>/.dsh/skills/` for one repository, `$DSH_HOME/skills/` for every session. The bundle shape is `<root>/<name>/SKILL.md`, one level deep. |
| `~/.cursor/plugins/`, `.cursor-plugin/plugin.json` | No plugin manifest. pstack ships as this skills tree, so its own folder is the file to edit. |
| `.cursor/rules/*.mdc` | `AGENTS.md`. `$DSH_HOME/AGENTS.md` applies to every session, and the project's file applies to one repository. |
| `https://github.com/cursor/plugins/blob/main/pstack/<path>` | A file outside the bundle you are following is linked on GitHub, because DSH installs bundles into one flat root. Read a file inside the bundle from the base directory the `skill` tool reports, and never fetch a copy the tree already links. Give the user the URL when they need a link. |
| `agent-transcripts/`, `~/.cursor/projects/<slug>/agent-transcripts/` | `$DSH_HOME/sessions/<workspace-slug>/session-<id>/session.v4.jsonl.zstd`. The log is zstd-compressed. Use the session-search tool when the profile has one. Otherwise say the transcript cannot be read here and work from what this conversation still holds. Never read another workspace's folder. |
| `plugins/cache/` | `$DSH_HOME/skills/<name>/`, or the custom skill root it was installed under. |
| `.cursor/worktrees/<repo>/<name>` | The checkout path you choose for a worker, not a fixed folder. |

## Cursor-only features

DSH has no Bugbot, no Cursor Automations, no Custom Modes, and no `/loop`. When a step needs one, put one line in your reply, `Skipped in DSH: <step>. <reason>.`, then go on to the next step. Do not stop, ask, or retry. When a later step needs what the skipped step made, such as a URL or a log, leave a placeholder and name it in the line.

| Cursor | DSH |
| --- | --- |
| Bugbot | A review bot on the forge is an ordinary review thread. Triage it with the same reference and the forge commands the step gives. |
| Cursor Automations, routine wakes, `api2.cursor.sh/automations` webhooks | `schedule_create` with `target: "this_session"` when the session has it. Skip `make-bot-ui` entirely, because its webhook targets Cursor Automations. |
| Cursor cloud agents | A worktree plus a `subagent` pointed at it, as in Subagent fields. |
| `/loop` | `create_goal` for run-until-done, or `schedule_create` for a timed tick. Keep the done check a real check, because an interval alone never converges. |
| Custom Modes | DSH has no skill-backed mode. Start each task with `/poteto-mode`, or add a line to `$DSH_HOME/AGENTS.md` that says to load it first. |
| Cursor's built-in babysit skill, `/create-skill`, Plan Mode | No DSH equivalent, and no name clash. Run the pstack playbook or the **authoring-a-skill** playbook. |
| `control-ui`, `control-cli`, and `deslop` from `cursor-team-kit` | Not shipped here. Use the profile's browser or computer-use tools when it has them, and the shell tool otherwise. Read `deslop` as `unslop` plus `no-comments`. |
| A built-in PR tool | The forge command the step gives, such as `gh pr create`. That is not a skip, so write no line. |
