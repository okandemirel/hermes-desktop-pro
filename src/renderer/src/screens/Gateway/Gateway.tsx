import { useState, useCallback, useEffect } from "react";
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

// ─── Platform catalog (UI metadata) ──────────────────────────────────────
// `id` matches the backend platform key (getPlatformEnabled / setPlatformEnabled).
// Each field `key` is the real .env variable name read/written via getEnvValue /
// setEnvValue. The first field is treated as the platform's credential.

interface PlatformField {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
}

interface PlatformDef {
  id: string;
  name: string;
  icon: typeof Send;
  fields: PlatformField[];
}

interface PlatformState {
  def: PlatformDef;
  status: "connected" | "disconnected" | "error";
  values: Record<string, string>;
  configured: boolean;
}

const PLATFORM_CATALOG: PlatformDef[] = [
  { id: "telegram", name: "Telegram", icon: Send,
    fields: [
      { key: "TELEGRAM_BOT_TOKEN", label: "Bot Token", placeholder: "123456:ABC-DEF...", type: "password" },
      { key: "TELEGRAM_ALLOWED_USERS", label: "Allowed Users", placeholder: "123456789,987654321" },
    ] },
  { id: "discord", name: "Discord", icon: MessageCircle,
    fields: [
      { key: "DISCORD_BOT_TOKEN", label: "Bot Token", placeholder: "MTAx...", type: "password" },
      { key: "DISCORD_ALLOWED_CHANNELS", label: "Allowed Channels", placeholder: "123,456" },
    ] },
  { id: "slack", name: "Slack", icon: Hash,
    fields: [
      { key: "SLACK_BOT_TOKEN", label: "Bot Token", placeholder: "xoxb-...", type: "password" },
      { key: "SLACK_APP_TOKEN", label: "App Token", placeholder: "xapp-...", type: "password" },
    ] },
  { id: "whatsapp", name: "WhatsApp", icon: MessagesSquare,
    fields: [
      { key: "WHATSAPP_API_URL", label: "API URL", placeholder: "https://..." },
      { key: "WHATSAPP_API_TOKEN", label: "API Token", placeholder: "...", type: "password" },
    ] },
  { id: "signal", name: "Signal", icon: ShieldCheck,
    fields: [
      { key: "SIGNAL_PHONE_NUMBER", label: "Phone Number", placeholder: "+123****7890" },
    ] },
  { id: "matrix", name: "Matrix", icon: Network,
    fields: [
      { key: "MATRIX_HOMESERVER", label: "Homeserver URL", placeholder: "https://matrix.org" },
      { key: "MATRIX_USER_ID", label: "User ID", placeholder: "@bot:matrix.org" },
      { key: "MATRIX_ACCESS_TOKEN", label: "Access Token", placeholder: "syt_...", type: "password" },
    ] },
  { id: "mattermost", name: "Mattermost", icon: MessageSquare,
    fields: [
      { key: "MATTERMOST_URL", label: "Server URL", placeholder: "https://mattermost.example.com" },
      { key: "MATTERMOST_TOKEN", label: "Bot Token", placeholder: "...", type: "password" },
    ] },
  { id: "email", name: "Email", icon: Mail,
    fields: [
      { key: "EMAIL_IMAP_SERVER", label: "IMAP Server", placeholder: "imap.gmail.com" },
      { key: "EMAIL_SMTP_SERVER", label: "SMTP Server", placeholder: "smtp.gmail.com" },
      { key: "EMAIL_ADDRESS", label: "Email Address", placeholder: "bot@example.com" },
      { key: "EMAIL_PASSWORD", label: "Password", placeholder: "...", type: "password" },
    ] },
  { id: "sms", name: "SMS", icon: Smartphone,
    fields: [
      { key: "SMS_PROVIDER", label: "Provider", placeholder: "twilio" },
      { key: "TWILIO_ACCOUNT_SID", label: "Twilio SID", placeholder: "AC..." },
      { key: "TWILIO_AUTH_TOKEN", label: "Twilio Token", placeholder: "...", type: "password" },
      { key: "TWILIO_PHONE_NUMBER", label: "Phone Number", placeholder: "+123****7890" },
    ] },
  { id: "bluebubbles", name: "iMessage", icon: Apple,
    fields: [
      { key: "BLUEBUBBLES_URL", label: "Bridge URL", placeholder: "http://localhost:8080" },
      { key: "BLUEBUBBLES_PASSWORD", label: "Password", placeholder: "...", type: "password" },
    ] },
  { id: "dingtalk", name: "DingTalk", icon: Building,
    fields: [
      { key: "DINGTALK_APP_KEY", label: "App Key", placeholder: "ding...", type: "password" },
      { key: "DINGTALK_APP_SECRET", label: "App Secret", placeholder: "...", type: "password" },
    ] },
  { id: "feishu", name: "Feishu", icon: Feather,
    fields: [
      { key: "FEISHU_APP_ID", label: "App ID", placeholder: "cli_..." },
      { key: "FEISHU_APP_SECRET", label: "App Secret", placeholder: "...", type: "password" },
    ] },
  { id: "wecom", name: "WeCom", icon: Zap,
    fields: [
      { key: "WECOM_CORP_ID", label: "Corp ID", placeholder: "ww..." },
      { key: "WECOM_AGENT_ID", label: "Agent ID", placeholder: "1000002" },
      { key: "WECOM_SECRET", label: "Secret", placeholder: "...", type: "password" },
    ] },
  { id: "weixin", name: "WeChat", icon: MessageCircle,
    fields: [
      { key: "WEIXIN_BOT_TOKEN", label: "Bot Token", placeholder: "...", type: "password" },
    ] },
  { id: "webhooks", name: "Webhooks", icon: Webhook,
    fields: [
      { key: "WEBHOOK_SECRET", label: "Secret", placeholder: "whsec_...", type: "password" },
    ] },
  { id: "home_assistant", name: "Home Assistant", icon: Home,
    fields: [
      { key: "HASS_URL", label: "HA URL", placeholder: "http://homeassistant.local:8123" },
      { key: "HASS_TOKEN", label: "Long-Lived Token", placeholder: "eyJ...", type: "password" },
    ] },
];

// ─── Status → token mapping ──────────────────────────────────────────────

const STATUS_COLOR: Record<PlatformState["status"], string> = {
  connected: "var(--success)",
  disconnected: "var(--text-3)",
  error: "var(--error)",
};
const STATUS_LABEL: Record<PlatformState["status"], string> = {
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
};

function initialState(): PlatformState[] {
  return PLATFORM_CATALOG.map((def) => ({
    def,
    status: "disconnected" as const,
    values: {},
    configured: false,
  }));
}

// ─── GatewayView ────────────────────────────────────────────────────────

export default function GatewayView() {
  const [platforms, setPlatforms] = useState<PlatformState[]>(initialState);
  const [running, setRunning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>({});

  // Load real gateway status, per-platform enablement and credential env values
  // on mount. A platform counts as "connected" only when it is enabled AND the
  // gateway is running — that mirrors the backend semantics exactly. On read
  // failure we keep the honest disconnected/idle empty state.
  const load = useCallback(async () => {
    try {
      const status = await window.hermes.gatewayStatus();
      const isRunning = !!status?.running;
      const enabled = await window.hermes.getPlatformEnabled();

      const next = await Promise.all(
        PLATFORM_CATALOG.map(async (def) => {
          const values: Record<string, string> = {};
          for (const field of def.fields) {
            try {
              const v = await window.hermes.getEnvValue(field.key);
              if (v) values[field.key] = v;
            } catch {
              // leave field blank on read failure
            }
          }
          const isEnabled = !!enabled[def.id];
          return {
            def,
            configured: isEnabled,
            status: (isEnabled && isRunning
              ? "connected"
              : "disconnected") as PlatformState["status"],
            values,
          };
        }),
      );

      setRunning(isRunning);
      setPlatforms(next);
    } catch {
      // keep honest idle/disconnected state; screen stays usable
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    const plat = platforms.find((p) => p.def.id === id);
    if (plat) setEditingValues({ ...plat.values });
  }, [platforms]);

  const handleFieldChange = useCallback((key: string, value: string) => {
    setEditingValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Persist the platform's credentials to .env, then enable it. Connection is
  // reflected only once the gateway is running (which setPlatformEnabled
  // restarts on the backend when already up).
  const handleSave = useCallback(async (id: string) => {
    const plat = platforms.find((p) => p.def.id === id);
    if (!plat) return;
    try {
      for (const field of plat.def.fields) {
        const value = editingValues[field.key] ?? "";
        await window.hermes.setEnvValue(field.key, value);
      }
      await window.hermes.setPlatformEnabled(id, true);
    } catch {
      // fall through to a reload which surfaces the true state
    }
    setExpandedId(null);
    await load();
  }, [editingValues, platforms, load]);

  // Force-disable the platform (config.yaml enabled: false). Credentials in
  // .env are left intact so re-enabling doesn't require re-entry.
  const handleDisconnect = useCallback(async (id: string) => {
    try {
      await window.hermes.setPlatformEnabled(id, false);
    } catch {
      // reload surfaces the true state
    }
    setExpandedId(null);
    await load();
  }, [load]);

  const startGateway = useCallback(async () => {
    try {
      await window.hermes.gatewayStart();
    } catch {
      // reload surfaces the true state
    }
    await load();
  }, [load]);

  const stopGateway = useCallback(async () => {
    try {
      await window.hermes.gatewayStop();
    } catch {
      // reload surfaces the true state
    }
    await load();
  }, [load]);

  const restartGateway = useCallback(async () => {
    try {
      await window.hermes.gatewayStop();
      await window.hermes.gatewayStart();
    } catch {
      // reload surfaces the true state
    }
    await load();
  }, [load]);

  const connectedCount = platforms.filter((p) => p.status === "connected").length;
  const errorCount = platforms.filter((p) => p.status === "error").length;
  const offlineCount = platforms.length - connectedCount - errorCount;

  const expandedPlatform = platforms.find((p) => p.def.id === expandedId) || null;

  return (
    <Screen
      kicker="Local Server"
      icon={<Activity size={19} />}
      title={`Gateway ${running ? "Running" : "Stopped"}`}
      sub={
        <span className="inline-flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5">
            <StatusDot color={running ? "var(--success)" : "var(--text-3)"} pulse={running} />
            {running ? "Live" : "Idle"}
          </span>
          <span>·</span>
          <span className={connectedCount > 0 ? "gold-text font-semibold" : undefined}>{connectedCount} connected</span>
          <span>·</span>
          <span>{offlineCount} offline</span>
          {errorCount > 0 && <><span>·</span><span className="text-[var(--error)]">{errorCount} errors</span></>}
        </span>
      }
      actions={
        running ? (
          <>
            <Button variant="danger" size="sm" leftIcon={<Square size={13} />} onClick={stopGateway}>Stop</Button>
            <Button variant="secondary" size="sm" leftIcon={<RotateCcw size={13} />} onClick={restartGateway}>Restart</Button>
          </>
        ) : (
          <Button variant="primary" size="sm" leftIcon={<Play size={13} />} onClick={startGateway}>Start Gateway</Button>
        )
      }
    >
      <div className="mx-auto" style={{ maxWidth: 960 }}>
        {connectedCount === 0 && !running && (
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
          {platforms.map((platform) => {
            const Icon = platform.def.icon;
            const showStatus = platform.status === "connected" || platform.status === "error";
            return (
              <Card
                key={platform.def.id}
                pad
                interactive
                active={platform.configured}
                onClick={() => toggleExpand(platform.def.id)}
                className="flex items-center gap-3"
              >
                <IconChip>
                  <Icon size={17} />
                </IconChip>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold text-[var(--text)] truncate">{platform.def.name}</div>
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
                {platform.configured && <Badge variant="accent">Enabled</Badge>}
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
              <expandedPlatform.def.icon size={16} className="text-[var(--accent-text)]" />
              {expandedPlatform.def.name}
            </span>
          ) : null
        }
        footer={
          expandedPlatform ? (
            <>
              {expandedPlatform.configured && (
                <Button variant="danger" onClick={() => handleDisconnect(expandedPlatform.def.id)}>
                  Disable
                </Button>
              )}
              <Button variant="ghost" onClick={() => setExpandedId(null)}>Cancel</Button>
              <Button variant="primary" leftIcon={<Check size={15} />} onClick={() => handleSave(expandedPlatform.def.id)}>
                Save &amp; Enable
              </Button>
            </>
          ) : null
        }
      >
        {expandedPlatform && (
          <div className="flex flex-col gap-4">
            {expandedPlatform.def.fields.map((field) => (
              <Field key={field.key} label={field.label}>
                <Input
                  type={field.type || "text"}
                  value={editingValues[field.key] || ""}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
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
