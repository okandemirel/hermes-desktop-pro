import { describe, it, expect } from "vitest";
import { assertSafeSshConfig } from "./ssh-options";

const VALID_CONFIG = {
  host: "vps.example.com",
  username: "deploy",
  keyPath: "/Users/x/.ssh/id_rsa",
  port: 22,
  remotePort: 8642,
  localPort: 18642,
};

describe("assertSafeSshConfig", () => {
  it("accepts a valid config without throwing", () => {
    expect(() => assertSafeSshConfig(VALID_CONFIG)).not.toThrow();
  });

  it("accepts a tilde-prefixed keyPath", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, keyPath: "~/.ssh/id_rsa" }),
    ).not.toThrow();
  });

  it("accepts an IPv4 host", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, host: "192.168.1.10" }),
    ).not.toThrow();
  });

  it("rejects a host that starts with a dash (flag smuggling)", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, host: "-oProxyCommand=evil" }),
    ).toThrow("Invalid SSH host");
  });

  it("rejects a username that starts with a dash", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, username: "-oProxyCommand=evil" }),
    ).toThrow("Invalid SSH username");
  });

  it("rejects a keyPath that starts with a dash", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, keyPath: "-oProxyCommand=evil" }),
    ).toThrow("Invalid SSH key path");
  });

  it("rejects a username containing a space", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, username: "bad user" }),
    ).toThrow("Invalid SSH username");
  });

  it("rejects a username containing a semicolon", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, username: "bad;user" }),
    ).toThrow("Invalid SSH username");
  });

  it("rejects port 0", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, port: 0 }),
    ).toThrow("Invalid SSH port");
  });

  it("rejects port 70000", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, port: 70000 }),
    ).toThrow("Invalid SSH port");
  });

  it("rejects a non-integer port", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, port: 22.5 }),
    ).toThrow("Invalid SSH port");
  });

  it("rejects remotePort 0", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, remotePort: 0 }),
    ).toThrow("Invalid SSH remotePort");
  });

  it("rejects localPort out of range", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, localPort: 99999 }),
    ).toThrow("Invalid SSH localPort");
  });

  it("rejects a keyPath containing a null byte", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, keyPath: "/valid\0path" }),
    ).toThrow("Invalid SSH key path");
  });

  it("rejects a host containing a newline", () => {
    expect(() =>
      assertSafeSshConfig({ ...VALID_CONFIG, host: "vps.example.com\nevil" }),
    ).toThrow("Invalid SSH host");
  });
});
