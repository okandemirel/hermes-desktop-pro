import { useState, useCallback } from "react";
import {
  Send, MessageCircle, Hash, MessagesSquare, ShieldCheck, Network,
  MessageSquare, Mail, Smartphone, Apple, Building, Feather,
  Zap, Webhook, Home, Play, Square, RotateCcw,
  Check, Activity,
} from "lucide-react";
import { BrandMedallion } from "../../components/BrandMark";
import {
  Screen, Card, Button, IconChip, Badge, StatusDot, Field, Input, Modal, EmptyState,
} from "../../ui";

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

// ─── Status → token mapping ──────────────────────────────────────────────

const STATUS_COLOR: Record<PlatformConfig["status"], string> = {
  connected: "var(--success)",
  disconnected: "var(--text-3)",
  error: "var(--error)",
};
const STATUS_LABEL: Record<PlatformConfig["status"], string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
};

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

  const stopGateway = useCallback(() => {
    setGatewayStatus("stopped");
    setPlatforms(prev => prev.map(p => ({ ...p, status: "disconnected" as const })));
  }, []);

  const connectedCount = platforms.filter(p => p.status === "connected").length;
  const errorCount = platforms.filter(p => p.status === "error").length;
  const offlineCount = platforms.length - connectedCount - errorCount;
  const isRunning = gatewayStatus === "running";

  const expandedPlatform = platforms.find(p => p.id === expandedId) || null;

  return (
    <Screen
      kicker="Local Server"
      icon={<Activity size={19} />}
      title={`Gateway ${isRunning ? "Running" : "Stopped"}`}
      sub={
        <span className="inline-flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot color={isRunning ? "var(--success)" : "var(--text-3)"} pulse={isRunning} />
            {isRunning ? "Live" : "Idle"}
          </span>
          <span>·</span>
          <span className={connectedCount > 0 ? "gold-text font-semibold" : undefined}>{connectedCount} connected</span>
          <span>·</span>
          <span>{offlineCount} offline</span>
          {errorCount > 0 && <><span>·</span><span className="text-[var(--error)]">{errorCount} errors</span></>}
        </span>
      }
      actions={
        isRunning ? (
          <>
            <Button variant="danger" size="sm" leftIcon={<Square size={13} />} onClick={stopGateway}>Stop</Button>
            <Button variant="secondary" size="sm" leftIcon={<RotateCcw size={13} />} onClick={toggleGateway}>Restart</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" leftIcon={<Play size={13} />} onClick={toggleGateway}>Start Gateway</Button>
        )
      }
    >
      <div className="mx-auto" style={{ maxWidth: 960 }}>
        {connectedCount === 0 && gatewayStatus === "stopped" && (
          <Card pad className="flex flex-col items-center text-center mb-7 fade-in">
            <BrandMedallion size={72} className="mb-4" />
            <h2 className="text-[18px] font-semibold text-[var(--text)]">Connect your channels</h2>
            <p className="text-[13px] text-[var(--text-2)] mt-1.5 max-w-md">
              Configure a platform below, then start the gateway to bring Hermes into Telegram, Discord, Slack and more.
            </p>
          </Card>
        )}

        <hr className="ui-divider-gold mb-6" />

        <div className="ui-grid stagger">
          {platforms.map(platform => {
            const Icon = platform.icon;
            const showStatus = platform.status === "connected" || platform.status === "error";
            return (
              <Card
                key={platform.id}
                pad
                interactive
                active={platform.configured}
                onClick={() => toggleExpand(platform.id)}
                className="flex items-center gap-3"
              >
                <IconChip>
                  <Icon size={17} />
                </IconChip>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-[var(--text)] truncate">{platform.name}</div>
                  {showStatus && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <StatusDot color={STATUS_COLOR[platform.status]} pulse={platform.status === "connected"} />
                      <span
                        className="text-[11.5px] font-medium"
                        style={{ color: STATUS_COLOR[platform.status] }}
                      >
                        {STATUS_LABEL[platform.status]}
                      </span>
                    </div>
                  )}
                </div>
                {platform.configured && <Badge variant="accent">Configured</Badge>}
              </Card>
            );
          })}
        </div>

        {platforms.length === 0 && (
          <EmptyState
            icon={<Activity size={22} />}
            title="No channels"
            sub="No platforms are available to configure."
          />
        )}
      </div>

      <Modal
        open={!!expandedPlatform}
        onClose={() => setExpandedId(null)}
        title={
          expandedPlatform ? (
            <span className="flex items-center gap-2.5">
              <expandedPlatform.icon size={16} className="text-[var(--accent-text)]" />
              {expandedPlatform.name}
            </span>
          ) : null
        }
        footer={
          expandedPlatform ? (
            <>
              {expandedPlatform.configured && (
                <Button variant="danger" onClick={() => { handleDisconnect(expandedPlatform.id); setExpandedId(null); }}>
                  Disconnect
                </Button>
              )}
              <Button variant="ghost" onClick={() => setExpandedId(null)}>Cancel</Button>
              <Button variant="primary" leftIcon={<Check size={15} />} onClick={() => handleSave(expandedPlatform.id)}>
                Save &amp; Connect
              </Button>
            </>
          ) : null
        }
      >
        {expandedPlatform && (
          <div className="flex flex-col gap-4">
            {expandedPlatform.fields.map(field => (
              <Field key={field.key} label={field.label}>
                <Input
                  type={field.type || "text"}
                  value={editingValues[field.key] || ""}
                  onChange={e => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              </Field>
            ))}
          </div>
        )}
      </Modal>
    </Screen>
  );
}
