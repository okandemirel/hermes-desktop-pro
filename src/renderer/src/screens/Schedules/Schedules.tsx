import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Clock,
  Calendar,
  Trash2,
  Play,
  Pause,
  Bell,
  Timer,
} from "lucide-react";
import type { CronJob } from "@shared/types";
import {
  Screen,
  Card,
  Button,
  IconButton,
  StatusDot,
  SectionLabel,
  Field,
  Input,
  Textarea,
  Select,
  Segment,
  SegmentItem,
  Modal,
  EmptyState,
} from "../../ui";

interface ScheduleJob {
  id: string;
  name: string;
  schedule: string;
  scheduleHuman: string;
  status: "active" | "paused";
  nextRun: string;
  lastRun: string;
  deliveryTarget: string;
  prompt: string;
}

const DELIVERY_TARGETS = ["local", "telegram", "discord", "email", "slack"];

// Humanize an ISO timestamp into a short relative-ish label. Honest "—" when
// the backend has no timestamp (e.g. paused / never run).
function humanizeTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Best-effort human description of a 5-field cron expression. Falls back to the
// raw expression when it isn't a shape we recognise — never invents detail.
function humanizeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, mon, dow] = parts;

  const everyN = (field: string): number | null => {
    const m = field.match(/^\*\/(\d+)$/);
    return m ? parseInt(m[1], 10) : null;
  };

  const minEvery = everyN(min);
  if (minEvery && hour === "*" && dom === "*" && mon === "*" && dow === "*") {
    return `Every ${minEvery} minute${minEvery !== 1 ? "s" : ""}`;
  }
  const hourEvery = everyN(hour);
  if (
    min === "0" &&
    hourEvery &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    return `Every ${hourEvery} hour${hourEvery !== 1 ? "s" : ""}`;
  }
  if (
    /^\d+$/.test(min) &&
    /^\d+$/.test(hour) &&
    dom === "*" &&
    mon === "*" &&
    dow === "*"
  ) {
    const time = new Date();
    time.setHours(parseInt(hour, 10), parseInt(min, 10), 0, 0);
    return `Every day at ${time.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }
  return expr;
}

function toScheduleJob(job: CronJob): ScheduleJob {
  return {
    id: job.id,
    name: job.name,
    schedule: job.schedule,
    scheduleHuman: humanizeCron(job.schedule),
    status: job.state === "active" ? "active" : "paused",
    nextRun: humanizeTimestamp(job.next_run_at),
    lastRun: humanizeTimestamp(job.last_run_at),
    deliveryTarget: job.deliver[0] || "local",
    prompt: job.prompt,
  };
}

export default function SchedulesView() {
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<"every" | "custom">("every");
  const [formEveryValue, setFormEveryValue] = useState(30);
  const [formEveryUnit, setFormEveryUnit] = useState<"min" | "hour" | "day">("min");
  const [formCustomCron, setFormCustomCron] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formTarget, setFormTarget] = useState(DELIVERY_TARGETS[0]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await window.hermes.listCronJobs(true);
      setJobs(list.map(toScheduleJob));
      setError("");
    } catch (err) {
      // Honest empty state on failure — no mock fallback.
      setJobs([]);
      setError((err as Error)?.message || "Failed to load schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setFormName("");
    setFormScheduleType("every");
    setFormEveryValue(30);
    setFormEveryUnit("min");
    setFormCustomCron("");
    setFormPrompt("");
    setFormTarget(DELIVERY_TARGETS[0]);
  };

  // Build a real 5-field cron expression from the "Recurring" controls.
  const buildCron = (): string => {
    if (formScheduleType === "custom") return formCustomCron.trim();
    const n = Math.max(1, formEveryValue);
    if (formEveryUnit === "min") return `*/${n} * * * *`;
    if (formEveryUnit === "hour") return `0 */${n} * * *`;
    return `0 0 */${n} * *`; // day
  };

  const handleAdd = async () => {
    const schedule = buildCron();
    if (!formName.trim() || !formPrompt.trim() || !schedule) return;
    setBusy(true);
    try {
      const result = await window.hermes.createCronJob(
        schedule,
        formPrompt.trim(),
        formName.trim(),
        formTarget,
      );
      if (!result.success) {
        setError(result.error || "Failed to create schedule.");
        return;
      }
      setShowForm(false);
      resetForm();
      await load();
    } finally {
      setBusy(false);
    }
  };

  const openCreate = () => {
    setError("");
    resetForm();
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const toggleStatus = async (job: ScheduleJob) => {
    setBusy(true);
    try {
      const result =
        job.status === "active"
          ? await window.hermes.pauseCronJob(job.id)
          : await window.hermes.resumeCronJob(job.id);
      if (!result.success) {
        setError(result.error || "Failed to update schedule.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const triggerJob = async (job: ScheduleJob) => {
    setBusy(true);
    try {
      const result = await window.hermes.triggerCronJob(job.id);
      if (!result.success) {
        setError(result.error || "Failed to run schedule.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const deleteJob = async (id: string) => {
    setBusy(true);
    try {
      const result = await window.hermes.removeCronJob(id);
      if (!result.success) {
        setError(result.error || "Failed to delete schedule.");
        return;
      }
      setDeleteConfirmId(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const activeCount = useMemo(
    () => jobs.filter((j) => j.status === "active").length,
    [jobs],
  );
  const canSubmit = !!formName.trim() && !!formPrompt.trim() && !busy;

  // Signature hero: the soonest next-to-run active job (first active in order),
  // promoted to a struck-gold focal moment. The rest fall into the calm list.
  const heroJob = jobs.find((j) => j.status === "active") ?? null;
  const restJobs = jobs.filter((j) => j.id !== heroJob?.id);

  return (
    <Screen
      icon={<Clock size={19} />}
      kicker={jobs.length > 0 ? `Automation · ${activeCount} running` : "Automation"}
      title="Schedules"
      sub="Automate agent tasks with cron jobs — they run on the Hermes engine and deliver where you choose."
      actions={
        <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openCreate}>
          Add Schedule
        </Button>
      }
    >
      {/* Gold filament — the Hallmark section rhythm */}
      {jobs.length > 0 && <hr className="ui-divider-gold mt-5 mb-7 mint-in mint-in-1" />}

      {error && (
        <div className="mb-5 text-[12.5px] text-[var(--danger)] mint-in mint-in-1">
          {error}
        </div>
      )}

      {/* Jobs list — one struck hero + a calm list */}
      {loading ? (
        <div className="text-[13px] text-[var(--text-3)] py-8">Loading schedules…</div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Clock size={24} />}
          title="No schedules yet"
          sub="Create your first cron job to automate agent tasks."
          action={
            <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openCreate}>
              Create Schedule
            </Button>
          }
        />
      ) : (
        <>
          {/* ── Signature: the soonest active job, struck as the focal hero ── */}
          {heroJob && (
            <Card pad className="mb-7 mint-in mint-in-1">
              <div className="flex items-start gap-5">
                <span className="ui-stamp shrink-0 w-[58px] h-[58px] rounded-full text-[var(--accent-text)]">
                  <Timer size={24} />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="ui-eyebrow">Next to run</div>
                  <h2
                    className="serif text-[var(--text)] leading-none truncate"
                    style={{ fontSize: "clamp(22px, 2.4vw, 29px)", letterSpacing: "-0.012em" }}
                  >
                    {heroJob.name}
                  </h2>

                  <p className="text-[13.5px] leading-relaxed text-[var(--text-2)] mt-3 line-clamp-2 max-w-[58ch]">
                    {heroJob.prompt}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 text-[12.5px]">
                    <span className="text-[var(--text-3)]">
                      Runs{" "}
                      <span className="serif text-[var(--accent-text)] text-[15px] align-baseline">
                        {heroJob.nextRun}
                      </span>
                    </span>
                    <code className="font-mono text-[var(--text-3)]">{heroJob.schedule}</code>
                    <span className="text-[var(--text-3)]">
                      <Bell size={12} className="inline mr-1 -mt-0.5" />
                      {heroJob.deliveryTarget}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <IconButton onClick={() => triggerJob(heroJob)} title="Run now">
                    <Play size={15} />
                  </IconButton>
                  <IconButton onClick={() => toggleStatus(heroJob)} title="Pause">
                    <Pause size={15} />
                  </IconButton>
                  <IconButton danger onClick={() => setDeleteConfirmId(heroJob.id)} title="Delete">
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>
            </Card>
          )}

          {/* ── The calm list — quieter, near-monochrome rows ── */}
          {restJobs.length > 0 && (
            <>
              {heroJob && <SectionLabel className="mb-3 mint-in mint-in-2">Other schedules</SectionLabel>}
              <div className="flex flex-col gap-2 stagger">
                {restJobs.map((job) => {
                  const isActive = job.status === "active";
                  return (
                    <Card
                      key={job.id}
                      pad
                      interactive
                      className="group flex items-center gap-3.5"
                    >
                      <StatusDot
                        color={isActive ? "var(--success)" : "var(--text-3)"}
                        pulse={isActive}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2.5 min-w-0">
                          <h3 className="text-[13.5px] font-medium text-[var(--text)] truncate">
                            {job.name}
                          </h3>
                          <code className="font-mono text-[11.5px] text-[var(--text-3)] shrink-0">
                            {job.schedule}
                          </code>
                          {!isActive && (
                            <span className="text-[11px] text-[var(--text-3)] uppercase tracking-wide shrink-0">
                              Paused
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-x-4 gap-y-0.5 mt-1 text-[12px] text-[var(--text-3)] min-w-0">
                          <span className="truncate">
                            Next <span className="text-[var(--text-2)]">{job.nextRun}</span>
                          </span>
                          <span className="shrink-0">{job.deliveryTarget}</span>
                          <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            Last <span className="text-[var(--text-2)]">{job.lastRun}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                        <IconButton onClick={() => triggerJob(job)} title="Run now">
                          <Play size={15} />
                        </IconButton>
                        <IconButton onClick={() => toggleStatus(job)} title={isActive ? "Pause" : "Resume"}>
                          {isActive ? <Pause size={15} /> : <Play size={15} />}
                        </IconButton>
                        <IconButton danger onClick={() => setDeleteConfirmId(job.id)} title="Delete">
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* New schedule modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title="New Schedule"
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAdd} disabled={!canSubmit}>
              Add Schedule
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Schedule Name">
            <Input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Morning Briefing"
            />
          </Field>

          <Field label="Schedule Type">
            <Segment className="w-full">
              <SegmentItem active={formScheduleType === "every"} onClick={() => setFormScheduleType("every")}>
                <Timer size={14} /> Recurring
              </SegmentItem>
              <SegmentItem active={formScheduleType === "custom"} onClick={() => setFormScheduleType("custom")}>
                <Calendar size={14} /> Custom Cron
              </SegmentItem>
            </Segment>
          </Field>

          {formScheduleType === "every" && (
            <div className="flex items-center gap-2.5">
              <span className="text-[13px] text-[var(--text-3)]">Every</span>
              <Input
                type="number"
                value={formEveryValue}
                onChange={(e) => setFormEveryValue(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                className="text-center !w-24"
              />
              <Select
                value={formEveryUnit}
                onChange={(e) => setFormEveryUnit(e.target.value as "min" | "hour" | "day")}
                className="!w-auto"
              >
                <option value="min">Minutes</option>
                <option value="hour">Hours</option>
                <option value="day">Days</option>
              </Select>
            </div>
          )}

          {formScheduleType === "custom" && (
            <Field label="Cron Expression" hint="Standard 5-field cron expression: minute hour day month weekday">
              <Input
                type="text"
                value={formCustomCron}
                onChange={(e) => setFormCustomCron(e.target.value)}
                placeholder="e.g. 0 8 * * *"
                className="font-mono"
              />
            </Field>
          )}

          <Field label="Prompt">
            <Textarea
              value={formPrompt}
              onChange={(e) => setFormPrompt(e.target.value)}
              placeholder="What should the agent do on this schedule?"
              rows={4}
            />
          </Field>

          <Field label="Delivery Target">
            <Select value={formTarget} onChange={(e) => setFormTarget(e.target.value)}>
              {DELIVERY_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete schedule?"
        width={420}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              leftIcon={<Trash2 size={14} />}
              onClick={() => deleteConfirmId && deleteJob(deleteConfirmId)}
              disabled={busy}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-[var(--text-2)]">
          This will permanently remove the schedule. This action cannot be undone.
        </p>
      </Modal>
    </Screen>
  );
}
