export function assertSafeSshConfig(config: {
  host: string;
  username: string;
  keyPath: string;
  port: number;
  remotePort: number;
  localPort: number;
}): void {
  const noFlag = (s: string) =>
    typeof s === "string" &&
    s.length > 0 &&
    !s.startsWith("-") &&
    !/[\0\n\r]/.test(s);
  if (!noFlag(config.username) || !/^[A-Za-z0-9._-]+$/.test(config.username))
    throw new Error("Invalid SSH username");
	  if (
	    !noFlag(config.host) ||
	    !/^[\]A-Za-z0-9._:[-]+$/.test(config.host)
	  )
    throw new Error("Invalid SSH host");
  if (!noFlag(config.keyPath)) throw new Error("Invalid SSH key path");
  for (const [name, p] of [
    ["port", config.port],
    ["remotePort", config.remotePort],
    ["localPort", config.localPort],
  ] as const) {
    if (!Number.isInteger(p) || p < 1 || p > 65535)
      throw new Error(`Invalid SSH ${name}`);
  }
}

export interface SshControlOptions {
  // Long-running tunnel processes (ssh -N -L) must keep the spawned ssh
  // process in the foreground so tunnelProcess lifecycle tracking works.
  // ControlPersist forks a background master and exits the foreground
  // process, which breaks lifecycle tracking on Linux and macOS (#195, #159).
  forTunnel?: boolean;
}

export function buildSshControlOptions(
  platform = process.platform,
  options: SshControlOptions = {},
): string[] {
  if (platform === "win32" || options.forTunnel) {
    return [
      "-o",
      "ControlMaster=no",
      "-o",
      "ControlPath=none",
      "-o",
      "ControlPersist=no",
    ];
  }

  return [
    "-o",
    "ControlMaster=auto",
    "-o",
    "ControlPath=~/.ssh/cm-hermes-%r@%h:%p",
    "-o",
    "ControlPersist=60s",
  ];
}
