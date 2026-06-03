import { useState, useCallback } from "react";
import {
  Send, MessageCircle, Hash, MessagesSquare, ShieldCheck, Network,
  MessageSquare, Mail, Smartphone, Apple, Building, Feather,
  Zap, Webhook, Home, Play, Square, RotateCcw,
  Check, AlertCircle, Wifi, WifiOff, Activity
} from "lucide-react";

// ─── Platform definitions ────────────────────────────────────────────────

interface PlatformConfig {
  id: string;
  name: string;
  icon: typeof Send;
  status: "connected" | "disconnected" | "error";
  fields: { key: string; label: string; placeholder: string; type?: string }[];
  values: Record<string, string>;
  configured: boolean;
}

const PLATFORM_DEFAULTS: PlatformConfig[] = [
  { id: "telegram", name: "Telegram", icon: Send, status: "disconnected",
    fields: [{ key: "botToken", label: "Bot Token", placeholder: "123456:ABC-DEF..." }], values: {}, configured: false },
  { id: "discord", name: "Discord", icon: MessageCircle, status: "disconnected",
    fields: [{ key: "botToken", label: "Bot Token", placeholder: "MTAx..." }], values: {}, configured: false },
  { id: "slack", name: "Slack", icon: Hash, status: "disconnected",
    fields: [{ key: "botToken", label: "Bot Token", placeholder: "xoxb-..." }, { key: "signingSecret", label: "Signing Secret", placeholder: "abc123..." }], values: {}, configured: false },
  { id: "whatsapp", name: "WhatsApp", icon: MessagesSquare, status: "disconnected",
    fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-..." }, { key: "phoneId", label: "Phone Number ID", placeholder: "123456789" }], values: {}, configured: false },
  { id: "signal", name: "Signal", icon: ShieldCheck, status: "disconnected",
    fields: [{ key: "phoneNumber", label: "Phone Number", placeholder: "+123****7890" }], values: {}, configured: false },
  { id: "matrix", name: "Matrix", icon: Network, status: "disconnected",
    fields: [{ key: "homeserver", label: "Homeserver URL", placeholder: "https://matrix.org" }, { key: "accessToken", label: "Access Token", placeholder: "syt_..." }], values: {}, configured: false },
  { id: "mattermost", name: "Mattermost", icon: MessageSquare, status: "disconnected",
    fields: [{ key: "serverUrl", label: "Server URL", placeholder: "https://mattermost.example.com" }, { key: "botToken", label: "Bot Token", placeholder: "abc..." }], values: {}, configured: false },
  { id: "email", name: "Email", icon: Mail, status: "disconnected",
    fields: [{ key: "imapHost", label: "IMAP Host", placeholder: "imap.gmail.com" }, { key: "emailAddress", label: "Email Address", placeholder: "bot@example.com" }], values: {}, configured: false },
  { id: "sms", name: "SMS", icon: Smartphone, status: "disconnected",
    fields: [{ key: "twilioSid", label: "Twilio SID", placeholder: "AC..." }, { key: "twilioToken", label: "Twilio Token", placeholder: "..." }, { key: "phoneNumber", label: "Phone Number", placeholder: "+123****7890" }], values: {}, configured: false },
  { id: "imessage", name: "iMessage", icon: Apple, status: "disconnected",
    fields: [{ key: "bridgeUrl", label: "Bridge URL", placeholder: "http://localhost:8080" }], values: {}, configured: false },
  { id: "dingtalk", name: "DingTalk", icon: Building, status: "disconnected",
    fields: [{ key: "appKey", label: "App Key", placeholder: "ding..." }, { key: "appSecret", label: "App Secret", placeholder: "..." }], values: {}, configured: false },
  { id: "feishu", name: "Feishu", icon: Feather, status: "disconnected",
    fields: [{ key: "appId", label: "App ID", placeholder: "cli_..." }, { key: "appSecret", label: "App Secret", placeholder: "..." }], values: {}, configured: false },
  { id: "wecom", name: "WeCom", icon: Zap, status: "disconnected",
    fields: [{ key: "corpId", label: "Corp ID", placeholder: "ww..." }, { key: "appSecret", label: "App Secret", placeholder: "..." }], values: {}, configured: false },
  { id: "wechat", name: "WeChat", icon: MessageCircle, status: "disconnected",
    fields: [{ key: "appId", label: "App ID", placeholder: "wx..." }, { key: "appSecret", label: "App Secret", placeholder: "..." }], values: {}, configured: false },
  { id: "webhooks", name: "Webhooks", icon: Webhook, status: "disconnected",
    fields: [{ key: "webhookUrl", label: "Webhook URL", placeholder: "https://..." }, { key: "secret", label: "Secret", placeholder: "whsec_..." }], values: {}, configured: false },
  { id: "homeassistant", name: "Home Assistant", icon: Home, status: "disconnected",
    fields: [{ key: "haUrl", label: "HA URL", placeholder: "http://homeassistant.local:8123" }, { key: "haToken", label: "Long-Lived Token", placeholder: "eyJ..." }], values: {}, configured: false },
];

// ─── Status dot helper ──────────────────────────────────────────────────

function StatusDot({ status }: { status: PlatformConfig["status"] }) {
  const colors: Record<typeof status, string> = {
    connected: "bg-green-500 shadow-green-500/30",
    disconnected: "bg-neutral-600",
    error: "bg-red-500 shadow-red-500/30",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]} shadow-sm flex-shrink-0`} />;
}

// ─── GatewayView ────────────────────────────────────────────────────────

export default function GatewayView() {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>(PLATFORM_DEFAULTS);
  const [gatewayStatus, setGatewayStatus] = useState<"running" | "stopped">("stopped");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
    const plat = platforms.find(p => p.id === id);
    if (plat) setEditingValues({ ...plat.values });
  }, [platforms]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditingValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback((id: string) => {
    setPlatforms(prev => prev.map(p =>
      p.id === id ? { ...p, values: { ...editingValues }, configured: true, status: "connected" as const } : p
    ));
    setExpandedId(null);
  }, [editingValues]);

  const handleDisconnect = useCallback((id: string) => {
    setPlatforms(prev => prev.map(p =>
      p.id === id ? { ...p, status: "disconnected" as const, values: {}, configured: false } : p
    ));
  }, []);

  const toggleGateway = useCallback(() => {
    setGatewayStatus(prev => prev === "running" ? "stopped" : "running");
    if (gatewayStatus === "stopped") {
      setPlatforms(prev => prev.map(p => p.configured ? { ...p, status: "connected" as const } : p));
    }
  }, [gatewayStatus]);

  const connectedCount = platforms.filter(p => p.status === "connected").length;
  const errorCount = platforms.filter(p => p.status === "error").length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden" style={{ background: "#0D0D0D" }}>
      {/* ── Gateway status bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-white/5" style={{ background: "#1A1A1A" }}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {gatewayStatus === "running" ? (
              <Activity size={16} className="text-green-400" />
            ) : (
              <Activity size={16} className="text-neutral-500" />
            )}
            <span className="text-sm font-medium text-white/90">
              Gateway {gatewayStatus === "running" ? "Running" : "Stopped"}
            </span>
          </div>
          <span className="text-xs text-white/40">
            {connectedCount} connected · {platforms.length - connectedCount - errorCount} offline{errorCount > 0 ? ` · ${errorCount} errors` : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {gatewayStatus === "running" ? (
            <>
              <button
                onClick={() => { setGatewayStatus("stopped"); setPlatforms(prev => prev.map(p => ({ ...p, status: "disconnected" as const }))); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: "#242424", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <Square size={12} /> Stop
              </button>
              <button
                onClick={toggleGateway}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{ background: "#242424", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}
              >
                <RotateCcw size={12} /> Restart
              </button>
            </>
          ) : (
            <button
              onClick={toggleGateway}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: "#0A84FF", color: "#fff" }}
            >
              <Play size={12} /> Start Gateway
            </button>
          )}
        </div>
      </div>

      {/* ── Platform grid ── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {platforms.map(platform => {
            const Icon = platform.icon;
            const isExpanded = expandedId === platform.id;
            return (
              <div
                key={platform.id}
                className="rounded-xl border transition-all duration-200"
                style={{
                  background: "#242424",
                  borderColor: isExpanded ? "rgba(10,132,255,0.3)" : "rgba(255,255,255,0.05)",
                }}
              >
                {/* Card header */}
                <button
                  onClick={() => toggleExpand(platform.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(10,132,255,0.1)" }}>
                    <Icon size={16} className="text-[#0A84FF]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate">{platform.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <StatusDot status={platform.status} />
                      <span className="text-[11px] text-white/40 capitalize">{platform.status}</span>
                    </div>
                  </div>
                </button>

                {/* Expanded configure form */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 border-t border-white/5">
                    {platform.fields.map(field => (
                      <div key={field.key} className="mb-3">
                        <label className="block text-[11px] font-medium text-white/50 mb-1">{field.label}</label>
                        <input
                          type={field.type || "text"}
                          value={editingValues[field.key] || ""}
                          onChange={e => handleFieldChange(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="w-full rounded-lg px-3 py-2 text-sm transition-colors"
                          style={{
                            background: "#1A1A1A",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "#fff",
                            outline: "none",
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = "rgba(10,132,255,0.4)"; }}
                          onBlur={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                        />
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-4">
                      <button
                        onClick={() => handleSave(platform.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: "#0A84FF", color: "#fff" }}
                      >
                        <Check size={12} /> Save & Connect
                      </button>
                      {platform.configured && (
                        <button
                          onClick={() => handleDisconnect(platform.id)}
                          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }}
                        >
                          Disconnect
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(null)}
                        className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: "#1A1A1A", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Quick status when configured but not expanded */}
                {!isExpanded && platform.configured && (
                  <div className="px-4 pb-3 flex items-center gap-2">
                    {platform.status === "connected" ? (
                      <Wifi size={12} className="text-green-400" />
                    ) : platform.status === "error" ? (
                      <AlertCircle size={12} className="text-red-400" />
                    ) : (
                      <WifiOff size={12} className="text-neutral-500" />
                    )}
                    <span className="text-[11px] text-white/40">Configured</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
