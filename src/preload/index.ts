import { contextBridge, ipcRenderer } from "electron";
import type {
  Attachment,
  ToolsetInfo,
  MemoryInfo,
  SavedModel,
  ProfileInfo,
  InstalledSkill,
  SkillSearchResult,
  CronJob,
  KanbanTask,
  KanbanBoard,
  KanbanTaskDetail,
  KanbanResult,
} from "../shared/types";

const api = {
  // Config
  getHermesHome: (): Promise<string> =>
    ipcRenderer.invoke("get-hermes-home"),
  getActiveProfile: (): Promise<string> =>
    ipcRenderer.invoke("get-active-profile"),
  readEnv: (profile?: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke("read-env", profile),
  readLogs: (
    logFile?: string,
    lines?: number,
  ): Promise<{ content: string; path: string }> =>
    ipcRenderer.invoke("read-logs", logFile, lines),
  getConfigValue: (key: string, profile?: string): Promise<any> =>
    ipcRenderer.invoke("get-config-value", key, profile),
  setConfigValue: (key: string, value: any, profile?: string): Promise<boolean> =>
    ipcRenderer.invoke("set-config-value", key, value, profile),

  // Model & provider
  getModelConfig: (profile?: string): Promise<{
    model: string;
    provider: string;
    baseUrl: string;
  }> => ipcRenderer.invoke("get-model-config", profile),
  setModelConfig: (
    model: string,
    provider: string,
    baseUrl: string,
    profile?: string,
  ): Promise<boolean> =>
    ipcRenderer.invoke("set-model-config", model, provider, baseUrl, profile),

  // Env vars
  getEnvValue: (key: string, profile?: string): Promise<string | undefined> =>
    ipcRenderer.invoke("get-env-value", key, profile),
  setEnvValue: (key: string, value: string, profile?: string): Promise<void> =>
    ipcRenderer.invoke("set-env-value", key, value, profile),

  // Profiles
  listProfiles: (): Promise<ProfileInfo[]> =>
    ipcRenderer.invoke("list-profiles"),
  createProfile: (
    name: string,
    clone: boolean,
  ): Promise<{ success: boolean; error?: string } | boolean> =>
    ipcRenderer.invoke("create-profile", name, clone),
  deleteProfile: (
    name: string,
  ): Promise<{ success: boolean; error?: string } | boolean> =>
    ipcRenderer.invoke("delete-profile", name),
  setActiveProfile: (name: string): Promise<boolean> =>
    ipcRenderer.invoke("set-active-profile", name),

  // Soul (persona / SOUL.md)
  readSoul: (profile?: string): Promise<string> =>
    ipcRenderer.invoke("read-soul", profile),
  writeSoul: (content: string, profile?: string): Promise<boolean> =>
    ipcRenderer.invoke("write-soul", content, profile),
  resetSoul: (profile?: string): Promise<string> =>
    ipcRenderer.invoke("reset-soul", profile),

  // Skills (SKILL.md walk + hermes skills CLI)
  listInstalledSkills: (profile?: string): Promise<InstalledSkill[]> =>
    ipcRenderer.invoke("list-installed-skills", profile),
  listBundledSkills: (): Promise<SkillSearchResult[]> =>
    ipcRenderer.invoke("list-bundled-skills"),
  getSkillContent: (path: string): Promise<string> =>
    ipcRenderer.invoke("get-skill-content", path),
  installSkill: (
    id: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("install-skill", id, profile),
  uninstallSkill: (
    name: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("uninstall-skill", name, profile),

  // Schedules / Cron (cron/jobs.json + hermes cron CLI / gateway API)
  listCronJobs: (
    includeDisabled?: boolean,
    profile?: string,
  ): Promise<CronJob[]> =>
    ipcRenderer.invoke("list-cron-jobs", includeDisabled, profile),
  createCronJob: (
    schedule: string,
    prompt?: string,
    name?: string,
    deliver?: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(
      "create-cron-job",
      schedule,
      prompt,
      name,
      deliver,
      profile,
    ),
  removeCronJob: (
    jobId: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("remove-cron-job", jobId, profile),
  pauseCronJob: (
    jobId: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("pause-cron-job", jobId, profile),
  resumeCronJob: (
    jobId: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("resume-cron-job", jobId, profile),
  triggerCronJob: (
    jobId: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("trigger-cron-job", jobId, profile),

  // Kanban (hermes kanban CLI / SSH tunnel / remote-only)
  kanbanListBoards: (profile?: string): Promise<KanbanResult<KanbanBoard[]>> =>
    ipcRenderer.invoke("kanban-list-boards", profile),
  kanbanCurrentBoard: (profile?: string): Promise<KanbanResult<string>> =>
    ipcRenderer.invoke("kanban-current-board", profile),
  kanbanListTasks: (filters?: {
    status?: string;
    assignee?: string;
    tenant?: string;
    includeArchived?: boolean;
    profile?: string;
  }): Promise<KanbanResult<KanbanTask[]>> =>
    ipcRenderer.invoke("kanban-list-tasks", filters),
  kanbanGetTask: (
    id: string,
    profile?: string,
  ): Promise<KanbanResult<KanbanTaskDetail>> =>
    ipcRenderer.invoke("kanban-get-task", id, profile),
  kanbanCreateTask: (
    input: {
      title: string;
      body?: string;
      assignee?: string;
      priority?: number;
      tenant?: string;
      workspace?: string;
      triage?: boolean;
      skills?: string[];
      maxRetries?: number;
    },
    profile?: string,
  ): Promise<KanbanResult<{ id: string }>> =>
    ipcRenderer.invoke("kanban-create-task", input, profile),
  kanbanAssignTask: (
    id: string,
    assignee: string | null,
    profile?: string,
  ): Promise<KanbanResult<void>> =>
    ipcRenderer.invoke("kanban-assign-task", id, assignee, profile),
  kanbanCompleteTask: (
    id: string,
    result?: string,
    profile?: string,
  ): Promise<KanbanResult<void>> =>
    ipcRenderer.invoke("kanban-complete-task", id, result, profile),
  kanbanBlockTask: (
    id: string,
    reason?: string,
    profile?: string,
  ): Promise<KanbanResult<void>> =>
    ipcRenderer.invoke("kanban-block-task", id, reason, profile),
  kanbanUnblockTask: (
    id: string,
    profile?: string,
  ): Promise<KanbanResult<void>> =>
    ipcRenderer.invoke("kanban-unblock-task", id, profile),
  kanbanArchiveTask: (
    id: string,
    profile?: string,
  ): Promise<KanbanResult<void>> =>
    ipcRenderer.invoke("kanban-archive-task", id, profile),
  kanbanCommentTask: (
    id: string,
    body: string,
    profile?: string,
  ): Promise<KanbanResult<void>> =>
    ipcRenderer.invoke("kanban-comment-task", id, body, profile),

  // Tools (platform_toolsets.cli)
  getToolsets: (profile?: string): Promise<ToolsetInfo[]> =>
    ipcRenderer.invoke("get-toolsets", profile),
  setToolsetEnabled: (
    key: string,
    enabled: boolean,
    profile?: string,
  ): Promise<boolean> =>
    ipcRenderer.invoke("set-toolset-enabled", key, enabled, profile),

  // Memory (MEMORY.md entries + USER.md)
  readMemory: (profile?: string): Promise<MemoryInfo> =>
    ipcRenderer.invoke("read-memory", profile),
  addMemoryEntry: (
    content: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("add-memory-entry", content, profile),
  updateMemoryEntry: (
    index: number,
    content: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("update-memory-entry", index, content, profile),
  removeMemoryEntry: (index: number, profile?: string): Promise<boolean> =>
    ipcRenderer.invoke("remove-memory-entry", index, profile),
  writeUserProfile: (
    content: string,
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("write-user-profile", content, profile),

  // Models (~/.hermes/models.json)
  listModels: (): Promise<SavedModel[]> =>
    ipcRenderer.invoke("list-models"),
  addModel: (
    name: string,
    provider: string,
    model: string,
    baseUrl: string,
  ): Promise<SavedModel> =>
    ipcRenderer.invoke("add-model", name, provider, model, baseUrl),
  removeModel: (id: string): Promise<boolean> =>
    ipcRenderer.invoke("remove-model", id),
  updateModel: (
    id: string,
    fields: Partial<Pick<SavedModel, "name" | "provider" | "model" | "baseUrl">>,
  ): Promise<boolean> =>
    ipcRenderer.invoke("update-model", id, fields),

  // Chat streaming
  sendMessage: (
    message: string,
    options: {
      profile?: string;
      resumeSessionId?: string;
      history?: Array<{ role: string; content: string }>;
      attachments?: Attachment[];
      contextFolder?: string;
    } = {},
  ): Promise<{ response: string; sessionId?: string }> =>
    ipcRenderer.invoke("send-message", message, options),
  abortChat: (): void => ipcRenderer.send("chat-abort"),

  // Session history
  listSessions: (
    limit?: number,
    offset?: number,
  ): Promise<
    Array<{
      id: string;
      source: string;
      startedAt: number;
      endedAt: number | null;
      messageCount: number;
      model: string;
      title: string | null;
    }>
  > => ipcRenderer.invoke("list-sessions", limit, offset),

  searchSessions: (
    query: string,
    limit?: number,
  ): Promise<
    Array<{
      sessionId: string;
      title: string | null;
      startedAt: number;
      source: string;
      messageCount: number;
      model: string;
      snippet: string;
    }>
  > => ipcRenderer.invoke("search-sessions", query, limit),

  getSessionMessages: (
    sessionId: string,
  ): Promise<Array<any>> =>
    ipcRenderer.invoke("get-session-messages", sessionId),

  deleteSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke("delete-session", sessionId),

  // Events
  onStreamChunk: (cb: (text: string) => void): (() => void) => {
    const handler = (_: any, text: string) => cb(text);
    ipcRenderer.on("stream-chunk", handler);
    return () => ipcRenderer.removeListener("stream-chunk", handler);
  },

  onStreamDone: (cb: (sessionId?: string) => void): (() => void) => {
    const handler = (_: any, sessionId?: string) => cb(sessionId);
    ipcRenderer.on("stream-done", handler);
    return () => ipcRenderer.removeListener("stream-done", handler);
  },

  onStreamError: (cb: (error: string) => void): (() => void) => {
    const handler = (_: any, error: string) => cb(error);
    ipcRenderer.on("stream-error", handler);
    return () => ipcRenderer.removeListener("stream-error", handler);
  },

  onToolProgress: (cb: (tool: string) => void): (() => void) => {
    const handler = (_: any, tool: string) => cb(tool);
    ipcRenderer.on("tool-progress", handler);
    return () => ipcRenderer.removeListener("tool-progress", handler);
  },

  onReasoningChunk: (cb: (text: string) => void): (() => void) => {
    const handler = (_: any, text: string) => cb(text);
    ipcRenderer.on("reasoning-chunk", handler);
    return () => ipcRenderer.removeListener("reasoning-chunk", handler);
  },

  onUsage: (
    cb: (usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cost?: number;
    }) => void,
  ): (() => void) => {
    const handler = (_: any, usage: any) => cb(usage);
    ipcRenderer.on("stream-usage", handler);
    return () => ipcRenderer.removeListener("stream-usage", handler);
  },

  // Claw3D (local mode only)
  claw3dStatus: (): Promise<{
    installed: boolean;
    running: boolean;
    port: number;
    portInUse: boolean;
    wsUrl: string;
    remoteUrl: string | null;
    error?: string;
  }> => ipcRenderer.invoke("claw3d-status"),

  claw3dSetup: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("claw3d-setup"),

  onClaw3dSetupProgress: (
    callback: (progress: {
      step: number;
      totalSteps: number;
      title: string;
      detail: string;
      log: string;
    }) => void,
  ): (() => void) => {
    const handler = (_: any, progress: any) => callback(progress);
    ipcRenderer.on("claw3d-setup-progress", handler);
    return () => ipcRenderer.removeListener("claw3d-setup-progress", handler);
  },

  claw3dGetPort: (): Promise<number> => ipcRenderer.invoke("claw3d-get-port"),
  claw3dSetPort: (port: number): Promise<boolean> =>
    ipcRenderer.invoke("claw3d-set-port", port),
  claw3dGetWsUrl: (): Promise<string> =>
    ipcRenderer.invoke("claw3d-get-ws-url"),
  claw3dSetWsUrl: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("claw3d-set-ws-url", url),

  claw3dStartAll: (
    profile?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("claw3d-start-all", profile),
  claw3dStopAll: (): Promise<boolean> => ipcRenderer.invoke("claw3d-stop-all"),
  claw3dGetLogs: (): Promise<string> => ipcRenderer.invoke("claw3d-get-logs"),

  // External links
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("open-external", url),

  // Connection (local / remote / ssh)
  getConnectionConfig: () => ipcRenderer.invoke("get-connection-config"),
  setConnectionConfig: (input: {
    mode: "local" | "remote" | "ssh";
    remoteUrl?: string;
    apiKey?: string;
    ssh?: {
      host: string;
      port: number;
      username: string;
      keyPath: string;
      remotePort: number;
      localPort: number;
    };
  }) => ipcRenderer.invoke("set-connection-config", input),
  testConnection: () => ipcRenderer.invoke("test-connection"),

  // Gateway
  gatewayStatus: () => ipcRenderer.invoke("gateway-status"),
  gatewayStart: () => ipcRenderer.invoke("gateway-start"),
  gatewayStop: () => ipcRenderer.invoke("gateway-stop"),
  getPlatformEnabled: (
    profile?: string,
  ): Promise<Record<string, boolean>> =>
    ipcRenderer.invoke("get-platform-enabled", profile),
  setPlatformEnabled: (
    platform: string,
    enabled: boolean,
    profile?: string,
  ): Promise<boolean> =>
    ipcRenderer.invoke("set-platform-enabled", platform, enabled, profile),

  // SSH tunnel
  sshTunnelActive: () => ipcRenderer.invoke("ssh-tunnel-active"),
  startSshTunnel: () => ipcRenderer.invoke("start-ssh-tunnel"),
  stopSshTunnel: () => ipcRenderer.invoke("stop-ssh-tunnel"),
};

contextBridge.exposeInMainWorld("hermes", api);

export type HermesAPI = typeof api;
