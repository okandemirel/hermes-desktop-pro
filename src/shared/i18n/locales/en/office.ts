export default {
  title: "Office",
  checkingStatus: "Checking workspace status...",
  setupTitle: "Set Up Hermes Workspace",
  installTitle: "Setting Up Workspace",
  processLogs: "Process Logs",
  noLogs: "No logs yet. Start the workspace to see output.",
  loadingClaw3d: "Loading Hermes workspace...",
  installClaw3d: "Install Workspace",
  setupFailed: "Setup failed",
  startFailed: "Failed to start workspace",
  portInUse: "Port {{port}} is in use. Change it in settings to start.",
  websocketUrl: "WebSocket URL",
  viewOnGithub: "Diagnostics",
  waitingToStart: "Waiting to start...",
  starting: "Starting...",
  openInBrowser: "Open Diagnostics",
  viewLogs: "View Logs",
  portInUseWarning:
    "Port {{port}} is in use. Please change the port in settings or stop other processes.",
  close: "Close",
  cannotLoadClaw3d: "Cannot load Hermes workspace",
  startingClaw3dService: "Starting workspace...",
  clickToStart: 'Click "Start" to run the workspace',
  setupDesc1:
    "Hermes Workspace is the live command floor for your agents. It keeps the 3D workspace inside Hermes Desktop Pro.",
  setupDesc2:
    "Click below to automatically set up the workspace engine. This will install the required local dependencies.",
} as const;
