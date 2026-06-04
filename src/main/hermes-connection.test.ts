import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("./config", () => ({ getConnectionConfig: vi.fn() }));
vi.mock("./ssh-tunnel", () => ({
  getSshTunnelUrl: vi.fn(() => "http://127.0.0.1:18642"),
  isSshTunnelActive: vi.fn(() => true), isSshTunnelHealthy: vi.fn(async () => true), startSshTunnel: vi.fn(),
}));
vi.mock("./ssh-remote", () => ({ sshReadRemoteApiKey: vi.fn(async () => "RK"), sshGatewayStatus: vi.fn(async () => true), sshStartGateway: vi.fn() }));
vi.mock("./gateway-ports", () => ({ getProfilePort: vi.fn(() => 8642), DEFAULT_API_SERVER_PORT: 8642 }));
vi.mock("./utils", () => ({ getActiveProfileNameSync: vi.fn(() => "default") }));
import { getApiUrl, getRemoteAuthHeader, normaliseRemoteUrl, setSshRemoteApiKey } from "./hermes";
import { getConnectionConfig } from "./config";
describe("connection resolution", () => {
  beforeEach(() => vi.clearAllMocks());
  it("local → 127.0.0.1:profilePort, no auth", () => {
    (getConnectionConfig as any).mockReturnValue({ mode: "local", remoteUrl: "", apiKey: "", ssh: {} });
    expect(getApiUrl()).toBe("http://127.0.0.1:8642");
    expect(getRemoteAuthHeader()).toEqual({});
  });
  it("remote → normalised url + bearer", () => {
    (getConnectionConfig as any).mockReturnValue({ mode: "remote", remoteUrl: "https://vps.example/v1/", apiKey: "K", ssh: {} });
    expect(getApiUrl()).toBe("https://vps.example");
    expect(getRemoteAuthHeader()).toEqual({ Authorization: "Bearer K" });
  });
  it("ssh → tunnel url + remote bearer", () => {
    (getConnectionConfig as any).mockReturnValue({ mode: "ssh", remoteUrl: "", apiKey: "", ssh: { host: "h" } });
    setSshRemoteApiKey("RK");
    expect(getApiUrl()).toBe("http://127.0.0.1:18642");
    expect(getRemoteAuthHeader()).toEqual({ Authorization: "Bearer RK" });
  });
  it("normaliseRemoteUrl strips trailing / and /v1", () => { expect(normaliseRemoteUrl("http://x/v1/")).toBe("http://x"); });
});
