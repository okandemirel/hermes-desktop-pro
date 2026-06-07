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
  Activity,
  Send,
  Inbox,
  AlertTriangle,
  RefreshCw,
  X,
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
  SearchInput,
  Badge,
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
  const [formError, setFormError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");

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
    setFormError("");
    try {
      const result = await window.hermes.createCronJob(
        schedule,
        formPrompt.trim(),
        formName.trim(),
        formTarget,
      );
      if (!result.success) {
        setFormError(result.error || "Failed to create schedule.");
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
    setFormError("");
    resetForm();
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormError("");
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
    setDeleteError("");
    try {
      const result = await window.hermes.removeCronJob(id);
      if (!result.success) {
        setDeleteError(result.error || "Failed to delete schedule.");
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
  const pausedCount = jobs.length - activeCount;
  const deliveryCount = useMemo(
    () => new Set(jobs.map((j) => j.deliveryTarget)).size,
    [jobs],
  );
  const schedulePreview = buildCron();
  const schedulePreviewLabel = schedulePreview ? humanizeCron(schedulePreview) : "Not configured";
  const canSubmit = !!formName.trim() && !!formPrompt.trim() && !!schedulePreview && !busy;
  const deleteTarget = useMemo(
    () => jobs.find((job) => job.id === deleteConfirmId) ?? null,
    [deleteConfirmId, jobs],
  );

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = statusFilter === "all" || job.status === statusFilter;
      const matchesSearch =
        !q ||
        job.name.toLowerCase().includes(q) ||
        job.prompt.toLowerCase().includes(q) ||
        job.deliveryTarget.toLowerCase().includes(q) ||
        job.schedule.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [jobs, search, statusFilter]);

  // Signature hero: the first filtered active job, promoted to the operational focal card.
  const heroJob = filteredJobs.find((j) => j.status === "active") ?? null;
  const hasFilter = !!search.trim() || statusFilter !== "all";

  return (
    <Screen
      className="ui-schedules-console"
      icon={<Clock size={19} />}
      kicker={jobs.length > 0 ? `Automation · ${activeCount} running` : "Automation"}
      title="Schedules"
      sub="Automate agent tasks with cron jobs — they run on the Hermes engine and deliver where you choose."
      actions={
        <>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={14} />}
            onClick={() => { void load(); }}
            disabled={loading || busy}
          >
            Refresh
          </Button>
          <Button variant="primary" size="sm" leftIcon={<Plus size={15} />} onClick={openCreate}>
            Add Schedule
          </Button>
        </>
      }
    >
      <div className="ui-schedules-shell">
        <Card pad className="ui-schedules-hero mint-in mint-in-1">
          <div className="ui-schedules-hero-mark">
            <Timer size={26} />
          </div>
          <div className="ui-schedules-hero-copy">
            <div className="ui-schedules-hero-kicker">
              <div className="ui-eyebrow">Automation Control</div>
              <Badge variant={heroJob ? "success" : jobs.length > 0 ? "warning" : "neutral"}>
                {heroJob ? "Live queue" : jobs.length > 0 ? "Paused only" : "Not configured"}
              </Badge>
            </div>
            <h2 title={heroJob?.name}>
              {heroJob ? heroJob.name : "No active schedule selected"}
            </h2>
            <p>
              {heroJob
                ? heroJob.prompt
                : jobs.length > 0
                  ? "Paused automations are preserved. Filter or resume a job to bring it back into the live queue."
                  : "Create a schedule to let Hermes run recurring work without opening a chat thread."}
            </p>
            {heroJob ? (
              <div className="ui-schedules-hero-meta">
                <span><Clock size={13} /> {heroJob.scheduleHuman}</span>
                <span><Send size={13} /> {heroJob.deliveryTarget}</span>
                <span><Bell size={13} /> Next {heroJob.nextRun}</span>
                <code>{heroJob.schedule}</code>
              </div>
            ) : (
              <div className="ui-schedules-hero-meta">
                <span><Clock size={13} /> Waiting for first cadence</span>
                <span><Send size={13} /> No delivery target yet</span>
              </div>
            )}
            <div className="ui-schedules-hero-actions">
              {heroJob ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Play size={14} />}
                    onClick={() => triggerJob(heroJob)}
                    disabled={busy}
                  >
                    Run now
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Pause size={14} />}
                    onClick={() => toggleStatus(heroJob)}
                    disabled={busy}
                  >
                    Pause
                  </Button>
                  <IconButton
                    danger
                    disabled={busy}
                    onClick={() => setDeleteConfirmId(heroJob.id)}
                    title="Delete schedule"
                    aria-label="Delete schedule"
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </>
              ) : (
                <Button variant="secondary" size="sm" leftIcon={<Plus size={14} />} onClick={openCreate}>
                  Create schedule
                </Button>
              )}
            </div>
          </div>
          <div className="ui-schedules-metrics">
            <div>
              <span>Active</span>
              <strong>{activeCount}</strong>
            </div>
            <div>
              <span>Paused</span>
              <strong>{pausedCount}</strong>
            </div>
            <div>
              <span>Targets</span>
              <strong>{deliveryCount}</strong>
            </div>
          </div>
        </Card>

        {error && jobs.length > 0 && (
          <div className="ui-schedules-alert mint-in mint-in-1" role="alert">
            <AlertTriangle size={16} />
            <div>
              <strong>Schedule update failed</strong>
              <span>{error}</span>
            </div>
            <IconButton onClick={() => setError("")} title="Dismiss error" aria-label="Dismiss error">
              <X size={14} />
            </IconButton>
          </div>
        )}

        <div className="ui-schedules-toolbar mint-in mint-in-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search schedules, prompts, cron, targets..."
            className="ui-schedules-search"
          />
          <Segment className="ui-schedules-segment">
            <SegmentItem active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>
              All <span className="ui-schedules-filter-count">{jobs.length}</span>
            </SegmentItem>
            <SegmentItem active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>
              Active <span className="ui-schedules-filter-count">{activeCount}</span>
            </SegmentItem>
            <SegmentItem active={statusFilter === "paused"} onClick={() => setStatusFilter("paused")}>
              Paused <span className="ui-schedules-filter-count">{pausedCount}</span>
            </SegmentItem>
          </Segment>
        </div>

        {loading ? (
          <div className="ui-schedules-loading mint-in mint-in-3" role="status" aria-live="polite">
            <div className="ui-schedules-loading-head">
              <Activity size={17} />
              <div>
                <span className="ui-section-label">Schedule Registry</span>
                <strong>Loading automations</strong>
              </div>
            </div>
            <i />
            <i />
            <i />
            <span className="sr-only">Loading schedules</span>
          </div>
        ) : error && jobs.length === 0 ? (
          <Card pad className="ui-schedules-empty ui-schedules-empty-error mint-in mint-in-3">
            <div className="ui-schedules-empty-icon">
              <AlertTriangle size={24} />
            </div>
            <div>
              <div className="ui-eyebrow">Schedule Registry</div>
              <h3>Schedules unavailable</h3>
              <p>{error}</p>
              <div className="ui-schedules-empty-actions">
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<RefreshCw size={14} />}
                  onClick={() => { void load(); }}
                >
                  Retry
                </Button>
              </div>
            </div>
          </Card>
        ) : jobs.length === 0 ? (
          <Card pad className="ui-schedules-empty mint-in mint-in-3">
            <div className="ui-schedules-empty-icon">
              <Clock size={24} />
            </div>
            <div>
              <div className="ui-eyebrow">Schedule Registry</div>
              <h3>No schedules yet</h3>
              <p>Create a cadence once, then Hermes can run it without keeping a chat thread open.</p>
              <div className="ui-schedules-empty-actions">
                <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={openCreate}>
                  Create schedule
                </Button>
              </div>
            </div>
          </Card>
        ) : filteredJobs.length === 0 ? (
          <Card pad className="ui-schedules-empty ui-schedules-empty-filtered mint-in mint-in-3">
            <div className="ui-schedules-empty-icon">
              <Inbox size={24} />
            </div>
            <div>
              <div className="ui-eyebrow">Filtered View</div>
              <h3>No matching schedules</h3>
              <p>Adjust the query or clear filters to return to the full schedule registry.</p>
              {hasFilter && (
                <div className="ui-schedules-empty-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ) : (
          <div className="ui-schedules-list mint-in mint-in-3">
            <div className="ui-schedules-table">
              <div className="ui-schedules-table-head">
                <SectionLabel>{hasFilter ? "Filtered Registry" : "Schedule Registry"}</SectionLabel>
                <Badge variant="neutral">{filteredJobs.length}</Badge>
              </div>
              {filteredJobs.map((job) => {
                const isActive = job.status === "active";
                return (
                  <Card
                    key={job.id}
                    pad
                    interactive
                    className="ui-schedules-row"
                    data-state={job.status}
                  >
                    <div className="ui-schedules-row-state">
                      <StatusDot
                        color={isActive ? "var(--success)" : "var(--text-3)"}
                        pulse={isActive}
                      />
                      <span>{isActive ? "Live" : "Paused"}</span>
                    </div>

                    <div className="ui-schedules-row-copy">
                      <div className="ui-schedules-row-titleline">
                        <h3 title={job.name}>{job.name}</h3>
                        <span title={job.scheduleHuman}>
                          <Clock size={12} />
                          {job.scheduleHuman}
                        </span>
                        <code title={job.schedule}>{job.schedule}</code>
                      </div>
                      <p title={job.prompt}>{job.prompt}</p>
                    </div>

                    <div className="ui-schedules-row-meta">
                      <div>
                        <span>Next</span>
                        <strong>{job.nextRun}</strong>
                      </div>
                      <div>
                        <span>Last</span>
                        <strong>{job.lastRun}</strong>
                      </div>
                      <div>
                        <span>Target</span>
                        <strong>{job.deliveryTarget}</strong>
                      </div>
                    </div>

                    <div className="ui-schedules-row-actions">
                      <IconButton disabled={busy} onClick={() => triggerJob(job)} title="Run now">
                        <Play size={15} />
                      </IconButton>
                      <IconButton disabled={busy} onClick={() => toggleStatus(job)} title={isActive ? "Pause" : "Resume"}>
                        {isActive ? <Pause size={15} /> : <Play size={15} />}
                      </IconButton>
                      <IconButton danger disabled={busy} onClick={() => setDeleteConfirmId(job.id)} title="Delete">
                        <Trash2 size={15} />
                      </IconButton>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* New schedule modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title="New Schedule"
        kicker="Automation Setup"
        width={600}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAdd} disabled={!canSubmit}>
              {busy ? "Creating..." : "Add Schedule"}
            </Button>
          </>
        }
      >
        <div className="ui-modal-form ui-schedules-modal-form">
          {formError && (
            <div className="ui-modal-alert" role="alert">
              {formError}
            </div>
          )}

          <div className="ui-schedules-modal-preview">
            <span className="ui-schedules-modal-preview-icon">
              <Clock size={18} />
            </span>
            <div>
              <span>Cadence Preview</span>
              <strong>{schedulePreviewLabel}</strong>
              <code>{schedulePreview || "—"}</code>
            </div>
          </div>

          <div className="ui-schedules-modal-grid">
            <Field label="Schedule Name" hint="Use a short operational label for the registry.">
              <Input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Morning Briefing"
              />
            </Field>

            <Field label="Delivery Target" hint="Where Hermes sends the scheduled result.">
              <Select value={formTarget} onChange={(e) => setFormTarget(e.target.value)}>
                {DELIVERY_TARGETS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Schedule Type">
            <Segment className="ui-schedules-modal-segment">
              <SegmentItem active={formScheduleType === "every"} onClick={() => setFormScheduleType("every")}>
                <Timer size={14} /> Recurring
              </SegmentItem>
              <SegmentItem active={formScheduleType === "custom"} onClick={() => setFormScheduleType("custom")}>
                <Calendar size={14} /> Custom Cron
              </SegmentItem>
            </Segment>
          </Field>

          {formScheduleType === "every" && (
            <Field label="Cadence" hint="Hermes converts this to a standard 5-field cron expression.">
              <div className="ui-schedules-cadence-row">
                <span>Every</span>
                <Input
                  type="number"
                  value={formEveryValue}
                  onChange={(e) => setFormEveryValue(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className="ui-schedules-cadence-number"
                />
                <Select
                  value={formEveryUnit}
                  onChange={(e) => setFormEveryUnit(e.target.value as "min" | "hour" | "day")}
                  className="ui-schedules-cadence-unit"
                >
                  <option value="min">Minutes</option>
                  <option value="hour">Hours</option>
                  <option value="day">Days</option>
                </Select>
              </div>
            </Field>
          )}

          {formScheduleType === "custom" && (
            <Field label="Cron Expression" hint="Standard 5-field cron expression: minute hour day month weekday">
              <Input
                type="text"
                value={formCustomCron}
                onChange={(e) => setFormCustomCron(e.target.value)}
                placeholder="e.g. 0 8 * * *"
                className="ui-schedules-cron-input"
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
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={deleteConfirmId !== null}
        onClose={() => {
          setDeleteConfirmId(null);
          setDeleteError("");
        }}
        title="Delete schedule?"
        kicker="Schedule Removal"
        width={420}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteConfirmId(null);
                setDeleteError("");
              }}
            >
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
        <div className="ui-confirm-panel ui-confirm-danger">
          <span className="ui-confirm-icon"><Trash2 size={18} /></span>
          <div className="ui-confirm-copy">
            <strong>{deleteTarget ? deleteTarget.name : "Delete schedule?"}</strong>
            <p>
              This will permanently remove the schedule
              {deleteTarget ? ` (${deleteTarget.schedule})` : ""}. This action cannot be undone.
            </p>
            {deleteTarget && (
              <div className="ui-schedules-delete-meta">
                <span>Next <strong>{deleteTarget.nextRun}</strong></span>
                <span>Target <strong>{deleteTarget.deliveryTarget}</strong></span>
              </div>
            )}
          </div>
        </div>
        {deleteError && (
          <div className="ui-modal-alert" role="alert">
            {deleteError}
          </div>
        )}
      </Modal>
    </Screen>
  );
}
