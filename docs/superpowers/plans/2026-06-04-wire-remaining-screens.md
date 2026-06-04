# Milestone — Wire All Remaining Screens to the Real Backend

> Continuation of `2026-06-04-connection-layer-and-chat`. Same architecture (thin client → gateway, 3 modes local/remote/ssh), same port-from-`/tmp/hermes-ref` approach, same subagent-driven discipline (implement → review → green gate per slice). Branch: `feat/wire-remaining-screens`.

**Goal:** Replace every remaining mock screen with real data/actions, working in local + remote + **ssh(VPS)** modes (the user's real mode). Test, then merge to main.

**Dispatch pattern (per the ref):** each IPC handler branches `const conn = getConnectionConfig(); if (conn.mode === "ssh" && conn.ssh) return sshXxx(conn.ssh, ...); return localXxx(...);`. Exceptions: **Cron** branches inside `cronjobs.ts` (ssh uses HTTP `/api/jobs` over the tunnel, not sshExec); **Kanban** branches inside `kanban.ts` via `sshRunKanban`. Keep the 6 `stream-*` chat channels untouched.

## Execution order (sequential vertical slices; hub files appended, conflict-free)

### Feature 0 — Foundation (do first; everything depends on it)
- Port missing shared deps from `/tmp/hermes-ref/src/main/`: `locale.ts`, `attachment-staging.ts`, `provider-registry.ts`, `default-models.ts`, and `src/shared/i18n/` (whole dir). Adapt imports to ours; keep pure where possible.
- Extend `src/shared/types.ts` with: `MemoryInfo`/`MemoryEntry`, `InstalledSkill`/`SkillSearchResult`, `ToolsetInfo`, `CronJob`, `KanbanTask`/`KanbanBoard`/`KanbanTaskDetail`/`KanbanResult`, `SavedModel`. Reconcile `ProfileInfo` to the ref `profiles.ts` shape (`name,path,isDefault,model,provider,hasEnv,hasSoul,skillCount,gatewayRunning`). Confirm `SessionSummary`/`SessionSearchResult`/`ModelConfig` match the ref.
- Gate: `npm run typecheck` clean.

### Feature slices (each: reader module + sshXxx proxy in ssh-remote.ts + IPC handlers in index.ts + preload methods + renderer wire/reshape; typecheck+build+commit; then review)
Ref module · ssh fns · IPC channels · preload methods · renderer file · shape notes:

1. **Soul** — `soul.ts` (readSoul/writeSoul/resetSoul) · `sshReadSoul/sshWriteSoul/sshResetSoul` · `read-soul`/`write-soul`/`reset-soul` · `readSoul/writeSoul/resetSoul` · `screens/Soul/Soul.tsx` (raw string; on mount readSoul, empty→local default; Save→writeSoul; Reset→resetSoul). Simplest — establishes the pattern.
2. **Tools** — `tools.ts` (getToolsets/setToolsetEnabled) · `sshGetToolsets/sshSetToolsetEnabled` · `get-toolsets`/`set-toolset-enabled` · `getToolsets/setToolsetEnabled` · `screens/Tools/Tools.tsx`. RESHAPE: 15 fixed keys `{key,label,description,enabled}`, no category/toolCount (map keys→client-side groups if desired). enable/disable-all = loop.
3. **Memory** — `memory.ts` (readMemory/addMemoryEntry/updateMemoryEntry/removeMemoryEntry/writeUserProfile) · matching `sshXxx` · `read-memory`/`add|update|remove-memory-entry`/`write-user-profile` · preload mirrors · `screens/Memory/Memory.tsx`. RESHAPE: single MEMORY.md → indexed entries `{index,content}` + charCount/charLimit (2200); drop key/value/category; capacity hero = char %.
4. **Models** — `models.ts` (listModels/addModel/removeModel/updateModel) + default via existing `getModelConfig/setModelConfig` · `sshListModels/sshAddModel/sshRemoveModel/sshUpdateModel` · `list-models`/`add-model`/`remove-model`/`update-model` · preload mirrors · `screens/Models/Models.tsx`. RESHAPE: `SavedModel{id,name,provider,model,baseUrl,apiMode?,createdAt}` — no contextWindow/temp/price/caps (derive caps from `@shared/providers` or display-only). Default = `getModelConfig` (not a stored flag).
5. **Sessions** — `sessions.ts`+`session-cache.ts` (listSessions/searchSessions/getSessionMessages/deleteSession; better-sqlite3 readonly + FTS) · `sshListSessions/sshSearchSessions/sshGetSessionMessages` (+ list/sync cached) · `list-sessions`(exists)/`search-sessions`(exists)/`get-session-messages`(exists)/`delete-session`(local-only) · preload (listSessions/searchSessions/getSessionMessages exist; add deleteSession) · `components/SessionsView.tsx`. Replace local `Session` with `SessionSummary`; Open/Resume → route to Chat with `resumeSessionId`.
6. **Profiles** — `profiles.ts` (listProfiles rich/createProfile/deleteProfile/setActiveProfile) · `sshListProfiles/sshCreateProfile/sshDeleteProfile` · `list-profiles`(upgrade signature)/`create-profile`/`delete-profile`/`set-active-profile`(local-only) · preload mirrors · `components/ProfilesView.tsx`. Reconcile rich `ProfileInfo`; clone=create(name,true); no rename/description backend (drop or local).
7. **Skills** — `skills.ts` (listInstalledSkills/listBundledSkills/getSkillContent/installSkill/uninstallSkill) · matching `sshXxx` · `list-installed-skills`/`list-bundled-skills`/`get-skill-content`/`install-skill`/`uninstall-skill` · preload mirrors · `screens/Skills/Skills.tsx`. RESHAPE: `{name,category,description,path}` (no version/tags/author). Install/uninstall = async CLI (real latency/error); replace fake setTimeout.
8. **Schedules/Cron** — `cronjobs.ts` (listCronJobs/createCronJob/removeCronJob/pause/resume/triggerCronJob) — **branches internally**: local CLI `hermes cron …`, ssh via `remoteFetch /api/jobs` over tunnel (needs gateway+tunnel up). IPC `list-cron-jobs`/`create-cron-job`/`remove-cron-job`/`pause|resume|trigger-cron-job` · preload mirrors · `screens/Schedules/Schedules.tsx`. RESHAPE: `CronJob{id,name,schedule,prompt,state,enabled,next_run_at,last_run_at,...,deliver[]}`; status←state, no edit endpoint (remove+create); scheduleHuman derived locally.
9. **Gateway** — gateway run-state exists (`gatewayStatus/gatewayStart/gatewayStop`); ADD per-platform `getPlatformEnabled/setPlatformEnabled` (`get-platform-enabled`/`set-platform-enabled`, ssh proxies) + wire credential fields to `.env` via existing `getEnvValue/setEnvValue`. `screens/Gateway/Gateway.tsx`. Per-platform "connected" derived from enabled + gateway running (not individually queryable).
10. **Kanban** — `kanban.ts` (all ops via `sshRunKanban`/local CLI) · `kanban-*` channels (list-boards/current-board/switch/create/remove-board, list-tasks/get/create/assign/complete/block/unblock/archive/specify/reclaim/comment-task, dispatch, list-claw3d-hq-tasks) · preload mirrors · `screens/Kanban/Kanban.tsx`. RESHAPE: ref `KanbanTask{id,title,body,assignee,status(free string),priority(number),...}` — no tags/comments/dueDate; comments via getTask. Handle `unsupportedMode` (CLI-only; plain remote → "switch modes" empty state).

**Providers** — already real (renderer-side `@shared/providers`). Optional: key-status enrichment via `readEnv()` — defer.
**Deferred (separate later work):** full Install wizard (`installer.ts` clone/venv), CLI-spawn chat fallback, model-discovery autocomplete.

## Verify + finish
- After each slice: `npm run typecheck && npm run build` clean; main unit tests still green.
- After all: launch the built app, smoke-test each screen renders real data in ssh mode (Sessions list, Soul content, Memory entries, Skills, Tools toggles, Schedules, Models, Profiles, Gateway platforms, Kanban) or shows an honest empty/error state. Fix regressions.
- Merge `feat/wire-remaining-screens` → main, push.

## Guardrails
- Preserve the Hallmark visual design — wire/reshape data only, reuse `ui/` primitives, keep `Screen kicker`/`Eyebrow`/two-pane/`ui-*` classes.
- Honest states only (no mock/simulated data left; empty/error states honest).
- No secrets logged; `.env`/`desktop.json` stay 0600; never display raw keys.
- Each slice ports the NON-ssh branch AND the ssh proxy (the user's real mode). If a feature can't be made to build cleanly, STOP/report rather than commit broken code.
