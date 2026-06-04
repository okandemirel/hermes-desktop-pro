import { useState } from "react";
import {
  Plus,
  Clock,
  Calendar,
  Trash2,
  Play,
  Pause,
  Pencil,
  Bell,
  Timer,
} from "lucide-react";
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

const MOCK_JOBS: ScheduleJob[] = [
  {
    id: "cron-001",
    name: "Morning Briefing",
    schedule: "0 8 * * *",
    scheduleHuman: "Every day at 8:00 AM",
    status: "active",
    nextRun: "Tomorrow 8:00 AM",
    lastRun: "Today 8:00 AM",
    deliveryTarget: "Telegram",
    prompt: "Summarize my calendar, unread emails, and top news headlines.",
  },
  {
    id: "cron-002",
    name: "Code Review Reminder",
    schedule: "0 10 * * 1-5",
    scheduleHuman: "Weekdays at 10:00 AM",
    status: "active",
    nextRun: "Tomorrow 10:00 AM",
    lastRun: "Today 10:00 AM",
    deliveryTarget: "Telegram",
    prompt: "Check open PRs and flag any that need review.",
  },
  {
    id: "cron-003",
    name: "System Health Check",
    schedule: "*/30 * * * *",
    scheduleHuman: "Every 30 minutes",
    status: "paused",
    nextRun: "—",
    lastRun: "2 days ago",
    deliveryTarget: "CLI",
    prompt: "Check CPU, memory, disk usage and report if thresholds exceeded.",
  },
  {
    id: "cron-004",
    name: "Weekly Report",
    schedule: "0 17 * * 5",
    scheduleHuman: "Fridays at 5:00 PM",
    status: "active",
    nextRun: "Friday 5:00 PM",
    lastRun: "Last Friday 5:00 PM",
    deliveryTarget: "Email",
    prompt: "Generate a weekly summary of all completed tasks and project progress.",
  },
];

const DELIVERY_TARGETS = ["Telegram", "Discord", "Email", "CLI", "Slack"];

export default function SchedulesView() {
  const [jobs, setJobs] = useState<ScheduleJob[]>(MOCK_JOBS);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<"every" | "custom">("every");
  const [formEveryValue, setFormEveryValue] = useState(30);
  const [formEveryUnit, setFormEveryUnit] = useState<"min" | "hour" | "day">("min");
  const [formCustomCron, setFormCustomCron] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formTarget, setFormTarget] = useState(DELIVERY_TARGETS[0]);

  const resetForm = () => {
    setFormName("");
    setFormScheduleType("every");
    setFormEveryValue(30);
    setFormEveryUnit("min");
    setFormCustomCron("");
    setFormPrompt("");
    setFormTarget(DELIVERY_TARGETS[0]);
    setEditingId(null);
  };

  const humanizeEvery = () => {
    if (formScheduleType === "every") {
      return `Every ${formEveryValue} ${formEveryUnit}${formEveryValue !== 1 ? "s" : ""}`;
    }
    return formCustomCron || "Custom cron";
  };

  const handleAddOrEdit = () => {
    if (!formName.trim() || !formPrompt.trim()) return;

    const schedule =
      formScheduleType === "every"
        ? `*/${formEveryValue} * * * *`
        : formCustomCron;

    if (editingId) {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === editingId
            ? {
                ...j,
                name: formName,
                schedule,
                scheduleHuman: humanizeEvery(),
                deliveryTarget: formTarget,
                prompt: formPrompt,
              }
            : j
        )
      );
    } else {
      const newJob: ScheduleJob = {
        id: `cron-${Date.now()}`,
        name: formName,
        schedule,
        scheduleHuman: humanizeEvery(),
        status: "active",
        nextRun: "Pending...",
        lastRun: "Never",
        deliveryTarget: formTarget,
        prompt: formPrompt,
      };
      setJobs((prev) => [...prev, newJob]);
    }
    setShowForm(false);
    resetForm();
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    resetForm();
  };

  const startEdit = (job: ScheduleJob) => {
    setFormName(job.name);
    setFormScheduleType("custom");
    setFormCustomCron(job.schedule);
    setFormPrompt(job.prompt);
    setFormTarget(job.deliveryTarget);
    setEditingId(job.id);
    setShowForm(true);
  };

  const toggleStatus = (id: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === id
          ? { ...j, status: j.status === "active" ? ("paused" as const) : ("active" as const) }
          : j
      )
    );
  };

  const deleteJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setDeleteConfirmId(null);
  };

  const activeCount = jobs.filter((j) => j.status === "active").length;
  const canSubmit = !!formName.trim() && !!formPrompt.trim();

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

      {/* Jobs list — one struck hero + a calm list */}
      {jobs.length === 0 ? (
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
                  <IconButton onClick={() => toggleStatus(heroJob.id)} title="Pause">
                    <Pause size={15} />
                  </IconButton>
                  <IconButton onClick={() => startEdit(heroJob)} title="Edit">
                    <Pencil size={15} />
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
                        <IconButton onClick={() => toggleStatus(job.id)} title={isActive ? "Pause" : "Resume"}>
                          {isActive ? <Pause size={15} /> : <Play size={15} />}
                        </IconButton>
                        <IconButton onClick={() => startEdit(job)} title="Edit">
                          <Pencil size={15} />
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

      {/* Add / Edit modal */}
      <Modal
        open={showForm}
        onClose={closeForm}
        title={editingId ? "Edit Schedule" : "New Schedule"}
        width={520}
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleAddOrEdit} disabled={!canSubmit}>
              {editingId ? "Save Changes" : "Add Schedule"}
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
