import { contextBridge, ipcRenderer } from "electron";
import type { Attachment } from "../shared/types";

const api = {
  // Config
  getHermesHome: (): Promise<string> =>
    ipcRenderer.invoke("get-hermes-home"),
  getActiveProfile: (): Promise<string> =>
    ipcRenderer.invoke("get-active-profile"),
  readEnv: (profile?: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke("read-env", profile),
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
  listProfiles: (): Promise<string[]> =>
    ipcRenderer.invoke("list-profiles"),

  // Soul (persona / SOUL.md)
  readSoul: (profile?: string): Promise<string> =>
    ipcRenderer.invoke("read-soul", profile),
  writeSoul: (content: string, profile?: string): Promise<boolean> =>
    ipcRenderer.invoke("write-soul", content, profile),
  resetSoul: (profile?: string): Promise<string> =>
    ipcRenderer.invoke("reset-soul", profile),

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

  // SSH tunnel
  sshTunnelActive: () => ipcRenderer.invoke("ssh-tunnel-active"),
  startSshTunnel: () => ipcRenderer.invoke("start-ssh-tunnel"),
  stopSshTunnel: () => ipcRenderer.invoke("stop-ssh-tunnel"),
};

contextBridge.exposeInMainWorld("hermes", api);

export type HermesAPI = typeof api;
