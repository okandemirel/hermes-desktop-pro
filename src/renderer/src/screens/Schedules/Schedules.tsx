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
  Badge,
  Tag,
  StatusDot,
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

  return (
    <Screen
      icon={<Clock size={19} />}
      title="Schedules"
      sub="Automate agent tasks with cron jobs — they run on the Hermes engine and deliver where you choose."
      actions={
        <Button variant="primary" leftIcon={<Plus size={15} />} onClick={openCreate}>
          Add Schedule
        </Button>
      }
    >
      {/* Summary stats rail */}
      {jobs.length > 0 && (
        <div className="flex items-center flex-wrap gap-2 mb-5">
          <Badge variant="accent">
            <Calendar size={12} />
            <span className="font-mono">{jobs.length}</span> job{jobs.length !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="success">
            <StatusDot color="var(--success)" />
            <span className="font-mono">{activeCount}</span> active
          </Badge>
          <Badge variant="neutral">
            <Pause size={11} />
            <span className="font-mono">{jobs.length - activeCount}</span> paused
          </Badge>
        </div>
      )}

      {/* Jobs list — stacked full-width rows */}
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
        <div className="flex flex-col gap-3 stagger">
          {jobs.map((job) => {
            const isActive = job.status === "active";
            return (
              <Card key={job.id} pad interactive className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  {/* Status dot */}
                  <span className="flex items-center justify-center shrink-0 w-9 h-9 rounded-[10px] bg-[var(--surface-3)] border border-[var(--border)]">
                    <StatusDot color={isActive ? "var(--success)" : "var(--text-3)"} pulse={isActive} />
                  </span>

                  <div className="flex-1 min-w-0">
                    {/* Top row: name + status + cron */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-[14px] font-semibold text-[var(--text)] truncate">{job.name}</h3>
                      <Badge variant={isActive ? "success" : "neutral"}>
                        {isActive ? "Active" : "Paused"}
                      </Badge>
                      <Tag className="font-mono text-[var(--accent-text)]">{job.schedule}</Tag>
                      <span className="text-[12px] text-[var(--text-3)]">{job.scheduleHuman}</span>
                    </div>

                    {/* Prompt preview */}
                    <p className="text-[13px] leading-relaxed text-[var(--text-2)] mt-2 line-clamp-2">
                      {job.prompt}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
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
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-[var(--border)]">
                  <Tag>
                    <Timer size={12} className="mr-1 text-[var(--text-3)]" />
                    Next:&nbsp;<span className="text-[var(--text-2)]">{job.nextRun}</span>
                  </Tag>
                  <Tag>
                    <Calendar size={12} className="mr-1 text-[var(--text-3)]" />
                    Last:&nbsp;<span className="text-[var(--text-2)]">{job.lastRun}</span>
                  </Tag>
                  <Tag>
                    <Bell size={12} className="mr-1 text-[var(--text-3)]" />
                    <span className="text-[var(--text-2)]">{job.deliveryTarget}</span>
                  </Tag>
                </div>
              </Card>
            );
          })}
        </div>
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
