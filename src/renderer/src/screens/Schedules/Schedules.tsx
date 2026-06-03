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
  X,
  Bot,
} from "../../components/Icons";

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

  return (
    <div className="flex-1 flex flex-col min-h-0" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <div
        className="px-8 py-5 flex items-center justify-between flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: "var(--accent-subtle)", border: "1px solid var(--accent)" }}
          >
            <Clock size={17} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
              Schedules
            </h1>
            <p className="text-[11.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {jobs.length} cron job{jobs.length !== 1 ? "s" : ""} ·{" "}
              {jobs.filter((j) => j.status === "active").length} active
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          <Plus size={13} /> Add Schedule
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="flex-1 overflow-y-auto p-8">
          <div
            className="max-w-lg mx-auto rounded-xl p-6 animate-slide-up"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[14px] font-bold" style={{ color: "var(--text-primary)" }}>
                {editingId ? "Edit Schedule" : "New Schedule"}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="p-1 rounded transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Name */}
            <label
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Schedule Name
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Morning Briefing"
              className="w-full rounded-lg px-3 py-2 text-[12px] outline-none mb-4 transition-colors"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />

            {/* Schedule type */}
            <label
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Schedule Type
            </label>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setFormScheduleType("every")}
                className="flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
                style={{
                  background:
                    formScheduleType === "every" ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                  color:
                    formScheduleType === "every" ? "var(--accent)" : "var(--text-secondary)",
                  border: `1px solid ${
                    formScheduleType === "every" ? "var(--accent)" : "var(--border)"
                  }`,
                }}
              >
                <Timer size={12} className="inline mr-1" /> Recurring
              </button>
              <button
                onClick={() => setFormScheduleType("custom")}
                className="flex-1 rounded-lg px-3 py-2 text-[12px] font-medium transition-colors"
                style={{
                  background:
                    formScheduleType === "custom" ? "var(--accent-subtle)" : "var(--bg-tertiary)",
                  color:
                    formScheduleType === "custom" ? "var(--accent)" : "var(--text-secondary)",
                  border: `1px solid ${
                    formScheduleType === "custom" ? "var(--accent)" : "var(--border)"
                  }`,
                }}
              >
                <Calendar size={12} className="inline mr-1" /> Custom Cron
              </button>
            </div>

            {/* Every X */}
            {formScheduleType === "every" && (
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Every
                </span>
                <input
                  type="number"
                  value={formEveryValue}
                  onChange={(e) => setFormEveryValue(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className="w-20 rounded-lg px-3 py-2 text-[12px] text-center outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
                <select
                  value={formEveryUnit}
                  onChange={(e) => setFormEveryUnit(e.target.value as "min" | "hour" | "day")}
                  className="rounded-lg px-3 py-2 text-[12px] outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <option value="min">Minutes</option>
                  <option value="hour">Hours</option>
                  <option value="day">Days</option>
                </select>
              </div>
            )}

            {/* Custom cron */}
            {formScheduleType === "custom" && (
              <div className="mb-4">
                <input
                  type="text"
                  value={formCustomCron}
                  onChange={(e) => setFormCustomCron(e.target.value)}
                  placeholder="e.g., 0 8 * * *"
                  className="w-full rounded-lg px-3 py-2 text-[12px] font-mono outline-none"
                  style={{
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                />
                <p className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>
                  Standard 5-field cron expression: minute hour day month weekday
                </p>
              </div>
            )}

            {/* Prompt */}
            <label
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Prompt
            </label>
            <textarea
              value={formPrompt}
              onChange={(e) => setFormPrompt(e.target.value)}
              placeholder="What should the agent do on this schedule?"
              rows={4}
              className="w-full resize-none rounded-lg px-3 py-2 text-[12px] outline-none mb-4"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            />

            {/* Delivery target */}
            <label
              className="block text-[11px] font-medium mb-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Delivery Target
            </label>
            <select
              value={formTarget}
              onChange={(e) => setFormTarget(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-[12px] outline-none mb-5"
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
              }}
            >
              {DELIVERY_TARGETS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Submit */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="flex-1 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors"
                style={{
                  background: "var(--bg-tertiary)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddOrEdit}
                className="flex-1 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {editingId ? "Save Changes" : "Add Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Jobs list */}
      {!showForm && (
        <div className="flex-1 overflow-y-auto p-8">
          {jobs.length === 0 ? (
            /* Empty state */
            <div className="flex items-center justify-center h-full animate-fade-in">
              <div className="text-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}
                >
                  <Clock size={28} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                </div>
                <h3 className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                  No schedules yet
                </h3>
                <p className="text-[12px] mb-4" style={{ color: "var(--text-secondary)" }}>
                  Create your first cron job to automate agent tasks.
                </p>
                <button
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-medium transition-colors"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  <Plus size={13} /> Create Schedule
                </button>
              </div>
            </div>
          ) : (
            /* Job cards */
            <div className="max-w-2xl mx-auto space-y-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-xl p-5 transition-all duration-200 animate-slide-up"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {/* Delete confirmation */}
                  {deleteConfirmId === job.id && (
                    <div
                      className="mb-4 rounded-lg p-3 flex items-center justify-between"
                      style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                      }}
                    >
                      <span className="text-[11.5px]" style={{ color: "var(--error)" }}>
                        Delete this schedule?
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="rounded px-2.5 py-1 text-[11px] transition-colors"
                          style={{
                            background: "var(--bg-tertiary)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => deleteJob(job.id)}
                          className="rounded px-2.5 py-1 text-[11px] transition-colors"
                          style={{ background: "var(--error)", color: "#fff" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-4">
                    {/* Status indicator */}
                    <div className="flex-shrink-0 mt-0.5">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          background: job.status === "active" ? "var(--success)" : "var(--text-muted)",
                          boxShadow:
                            job.status === "active"
                              ? "0 0 8px rgba(34, 197, 94, 0.5)"
                              : "none",
                        }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Top row: name + actions */}
                      <div className="flex items-center justify-between mb-1.5">
                        <h3
                          className="text-[13px] font-semibold truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {job.name}
                        </h3>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {/* Toggle play/pause */}
                          <button
                            onClick={() => toggleStatus(job.id)}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: "var(--text-muted)" }}
                            title={job.status === "active" ? "Pause" : "Resume"}
                          >
                            {job.status === "active" ? (
                              <Pause size={14} />
                            ) : (
                              <Play size={14} />
                            )}
                          </button>
                          {/* Edit */}
                          <button
                            onClick={() => startEdit(job)}
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: "var(--text-muted)" }}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          {/* Delete */}
                          <button
                            onClick={() =>
                              setDeleteConfirmId(
                                deleteConfirmId === job.id ? null : job.id
                              )
                            }
                            className="p-1.5 rounded-md transition-colors"
                            style={{ color: "var(--text-muted)" }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Schedule description */}
                      <div className="flex items-center gap-1.5 mb-2">
                        <Clock size={11} style={{ color: "var(--text-muted)" }} />
                        <code
                          className="text-[11px] font-mono"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {job.schedule}
                        </code>
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          · {job.scheduleHuman}
                        </span>
                      </div>

                      {/* Prompt preview */}
                      <p
                        className="text-[11.5px] leading-relaxed mb-3 line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {job.prompt}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <span
                          className="text-[10.5px] flex items-center gap-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Timer size={11} />
                          Next: {job.nextRun}
                        </span>
                        <span
                          className="text-[10.5px] flex items-center gap-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Calendar size={11} />
                          Last: {job.lastRun}
                        </span>
                        <span
                          className="text-[10.5px] flex items-center gap-1"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Bell size={11} />
                          {job.deliveryTarget}
                        </span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            background:
                              job.status === "active"
                                ? "rgba(34, 197, 94, 0.1)"
                                : "rgba(158, 158, 158, 0.1)",
                            color: job.status === "active" ? "var(--success)" : "var(--text-muted)",
                          }}
                        >
                          {job.status === "active" ? "Active" : "Paused"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {!showForm && jobs.length > 0 && (
        <div
          className="px-8 py-3 flex items-center gap-4 flex-shrink-0"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <Bot size={13} style={{ color: "var(--text-muted)" }} />
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Schedules run via the Hermes cron engine. Jobs execute automatically according to their
            configured schedule.
          </span>
          <div className="flex-1" />
          <span className="text-[10.5px] font-mono" style={{ color: "var(--text-muted)" }}>
            {jobs.filter((j) => j.status === "active").length} of {jobs.length} active
          </span>
        </div>
      )}
    </div>
  );
}
