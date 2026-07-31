"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ShiftStatus = "scheduled" | "completed" | "missed" | "cancelled";
type View = "schedule" | "history" | "settings";
type Range = "week" | "month" | "year";

type Shift = {
  id: string;
  employer: string;
  startAt: number;
  endAt: number;
  rateCents: number;
  breakMinutes: number;
  reminderMinutes: number;
  status: ShiftStatus;
  notes: string;
};

type Settings = {
  currency: string;
  defaultRate: number;
  defaultReminder: number;
  name: string;
};

const DAY = 86_400_000;
const STORAGE_KEY = "shiftly-shifts-v1";
const SETTINGS_KEY = "shiftly-settings-v1";
const employerColors: Record<string, string> = {
  KFC: "coral",
  McDonalds: "gold",
  "Coffee Club": "mint",
};

const defaultSettings: Settings = {
  currency: "SGD",
  defaultRate: 12,
  defaultReminder: 60,
  name: "Jamie",
};

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + distance);
  result.setHours(0, 0, 0, 0);
  return result;
}

function atTime(date: Date, hour: number, minute = 0) {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result.getTime();
}

function sampleShifts(): Shift[] {
  const monday = startOfWeek(new Date());
  const friday = new Date(monday.getTime() + 4 * DAY);
  return [
    {
      id: "sample-mon",
      employer: "KFC",
      startAt: atTime(monday, 11),
      endAt: atTime(monday, 17),
      rateCents: 1200,
      breakMinutes: 30,
      reminderMinutes: 60,
      status: Date.now() > atTime(monday, 17) ? "completed" : "scheduled",
      notes: "Front counter",
    },
    {
      id: "sample-tue",
      employer: "McDonalds",
      startAt: atTime(new Date(monday.getTime() + DAY), 7),
      endAt: atTime(new Date(monday.getTime() + DAY), 12),
      rateCents: 1350,
      breakMinutes: 0,
      reminderMinutes: 60,
      status:
        Date.now() > atTime(new Date(monday.getTime() + DAY), 12)
          ? "completed"
          : "scheduled",
      notes: "Breakfast shift",
    },
    {
      id: "sample-thu",
      employer: "KFC",
      startAt: atTime(new Date(monday.getTime() + 3 * DAY), 18),
      endAt: atTime(new Date(monday.getTime() + 3 * DAY), 23),
      rateCents: 1200,
      breakMinutes: 0,
      reminderMinutes: 60,
      status:
        Date.now() > atTime(new Date(monday.getTime() + 3 * DAY), 23)
          ? "completed"
          : "scheduled",
      notes: "",
    },
    {
      id: "sample-fri",
      employer: "McDonalds",
      startAt: atTime(friday, 19),
      endAt: atTime(new Date(friday.getTime() + DAY), 2),
      rateCents: 1500,
      breakMinutes: 30,
      reminderMinutes: 60,
      status: "scheduled",
      notes: "Closing shift",
    },
  ];
}

function toInputDate(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toInputTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatTime(timestamp: number) {
  return new Date(timestamp)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
    .replace(":00", "");
}

function shiftHours(shift: Shift) {
  if (shift.status === "missed" || shift.status === "cancelled") return 0;
  return Math.max(0, (shift.endAt - shift.startAt) / 3_600_000 - shift.breakMinutes / 60);
}

function shiftPay(shift: Shift) {
  return shiftHours(shift) * (shift.rateCents / 100);
}

function formatHours(hours: number) {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function currency(value: number, code: string) {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function dateFromParts(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime();
}

export default function Home() {
  const [view, setView] = useState<View>("schedule");
  const [range, setRange] = useState<Range>("month");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const [editing, setEditing] = useState<Shift | null | "new">(null);
  const [notificationState, setNotificationState] = useState<
    NotificationPermission | "unsupported"
  >("default");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const savedSettings = window.localStorage.getItem(SETTINGS_KEY);
    setShifts(saved ? JSON.parse(saved) : sampleShifts());
    if (savedSettings) setSettings(JSON.parse(savedSettings));
    setNotificationState(
      "Notification" in window ? Notification.permission : "unsupported",
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(shifts));
  }, [shifts, hydrated]);

  useEffect(() => {
    if (hydrated)
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings, hydrated]);

  useEffect(() => {
    if (notificationState !== "granted") return;
    const timers = shifts
      .filter((shift) => shift.status === "scheduled")
      .map((shift) => {
        const delay = shift.startAt - shift.reminderMinutes * 60_000 - Date.now();
        if (delay <= 0 || delay > 2_147_000_000) return undefined;
        return window.setTimeout(() => {
          new Notification(`${shift.employer} shift in ${shift.reminderMinutes} minutes`, {
            body: `${formatTime(shift.startAt)}–${formatTime(shift.endAt)} · ${formatHours(
              shiftHours(shift),
            )}`,
          });
        }, delay);
      })
      .filter((timer): timer is number => timer !== undefined);
    return () => timers.forEach(window.clearTimeout);
  }, [shifts, notificationState]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => new Date(weekStart.getTime() + index * DAY)),
    [weekStart],
  );

  const weekShifts = useMemo(
    () =>
      shifts
        .filter(
          (shift) =>
            shift.startAt >= weekStart.getTime() &&
            shift.startAt < weekStart.getTime() + 7 * DAY,
        )
        .sort((a, b) => a.startAt - b.startAt),
    [shifts, weekStart],
  );

  const weekHours = weekShifts.reduce((sum, shift) => sum + shiftHours(shift), 0);
  const weekPay = weekShifts.reduce((sum, shift) => sum + shiftPay(shift), 0);
  const upcoming = shifts
    .filter((shift) => shift.status === "scheduled" && shift.startAt > Date.now())
    .sort((a, b) => a.startAt - b.startAt)[0];

  const historyShifts = useMemo(() => {
    const now = new Date();
    let start: number;
    if (range === "week") start = startOfWeek(now).getTime();
    else if (range === "month")
      start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    else start = new Date(now.getFullYear(), 0, 1).getTime();
    return shifts.filter(
      (shift) =>
        shift.startAt >= start &&
        shift.startAt <= Date.now() &&
        shift.status !== "cancelled",
    );
  }, [range, shifts]);

  const historyHours = historyShifts.reduce((sum, shift) => sum + shiftHours(shift), 0);
  const historyPay = historyShifts.reduce((sum, shift) => sum + shiftPay(shift), 0);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setNotificationState("unsupported");
      return;
    }
    setNotificationState(await Notification.requestPermission());
  }

  function saveShift(shift: Shift) {
    setShifts((current) => {
      const exists = current.some((item) => item.id === shift.id);
      return exists
        ? current.map((item) => (item.id === shift.id ? shift : item))
        : [...current, shift];
    });
    setEditing(null);
  }

  function updateStatus(id: string, status: ShiftStatus) {
    setShifts((current) =>
      current.map((shift) => (shift.id === id ? { ...shift, status } : shift)),
    );
  }

  const monthLabel = `${weekDays[0].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })} – ${weekDays[6].toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("schedule")} aria-label="Shiftly home">
          <span className="brand-mark">S</span>
          <span>Shiftly</span>
        </button>
        <nav aria-label="Main navigation">
          <button className={view === "schedule" ? "active" : ""} onClick={() => setView("schedule")}>
            <span>▦</span> Schedule
          </button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
            <span>↗</span> History
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
            <span>⚙</span> Settings
          </button>
        </nav>
        <div className="sidebar-card">
          <span className="eyebrow">NEXT SHIFT</span>
          {upcoming ? (
            <>
              <strong>{upcoming.employer}</strong>
              <span>
                {new Date(upcoming.startAt).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
                , {formatTime(upcoming.startAt)}
              </span>
              <button onClick={() => setEditing(upcoming)}>View shift →</button>
            </>
          ) : (
            <span>No upcoming shifts</span>
          )}
        </div>
        <div className="profile">
          <span className="avatar">{settings.name.slice(0, 2).toUpperCase()}</span>
          <span>
            <strong>{settings.name}</strong>
            <small>Personal workspace</small>
          </span>
        </div>
      </aside>

      <main>
        {view === "schedule" && (
          <>
            <header className="page-header">
              <div>
                <p className="kicker">MY WORK WEEK</p>
                <h1>Good {new Date().getHours() < 12 ? "morning" : "afternoon"}, {settings.name}.</h1>
                <p>Here’s how your week is shaping up.</p>
              </div>
              <button className="primary-button" onClick={() => setEditing("new")}>
                <span>＋</span> Add shift
              </button>
            </header>

            {notificationState !== "granted" && (
              <section className="notice">
                <span className="notice-icon">◷</span>
                <div>
                  <strong>Never miss the start of a shift</strong>
                  <p>Enable reminders while this local app is open.</p>
                </div>
                <button onClick={enableNotifications}>
                  {notificationState === "denied" ? "Blocked in browser" : "Enable reminders"}
                </button>
              </section>
            )}

            <section className="summary-grid" aria-label="Weekly summary">
              <article className="summary-card violet">
                <div>
                  <span className="eyebrow">SCHEDULED HOURS</span>
                  <strong>{formatHours(weekHours)}</strong>
                  <small>across {weekShifts.length} shifts</small>
                </div>
                <span className="summary-icon">◷</span>
              </article>
              <article className="summary-card mint">
                <div>
                  <span className="eyebrow">ESTIMATED PAY</span>
                  <strong>{currency(weekPay, settings.currency)}</strong>
                  <small>before deductions</small>
                </div>
                <span className="summary-icon">$</span>
              </article>
              <article className="summary-card cream">
                <div>
                  <span className="eyebrow">NEXT UP</span>
                  <strong className="next-up">
                    {upcoming ? `${upcoming.employer} · ${formatTime(upcoming.startAt)}` : "All clear"}
                  </strong>
                  <small>
                    {upcoming
                      ? new Date(upcoming.startAt).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                        })
                      : "No shift scheduled"}
                  </small>
                </div>
                <span className="summary-icon">→</span>
              </article>
            </section>

            <section className="calendar-card">
              <div className="calendar-toolbar">
                <div>
                  <h2>This week</h2>
                  <span>{monthLabel}</span>
                </div>
                <div className="week-controls">
                  <button
                    aria-label="Previous week"
                    onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY))}
                  >
                    ‹
                  </button>
                  <button onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
                  <button
                    aria-label="Next week"
                    onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY))}
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="week-grid">
                {weekDays.map((day) => {
                  const dayShifts = weekShifts.filter(
                    (shift) => new Date(shift.startAt).toDateString() === day.toDateString(),
                  );
                  const isToday = day.toDateString() === new Date().toDateString();
                  return (
                    <div className={`day-column ${isToday ? "today" : ""}`} key={day.toISOString()}>
                      <div className="day-heading">
                        <span>{day.toLocaleDateString("en-US", { weekday: "short" })}</span>
                        <strong>{day.getDate()}</strong>
                      </div>
                      <div className="day-body">
                        {dayShifts.length ? (
                          dayShifts.map((shift) => (
                            <button
                              key={shift.id}
                              className={`shift-block ${
                                employerColors[shift.employer] ?? "violet"
                              } ${shift.status}`}
                              onClick={() => setEditing(shift)}
                            >
                              <span className="shift-dot" />
                              <strong>{shift.employer}</strong>
                              <span>
                                {formatTime(shift.startAt)} – {formatTime(shift.endAt)}
                                {new Date(shift.endAt).getDate() !==
                                  new Date(shift.startAt).getDate() && " +1"}
                              </span>
                              <small>
                                {formatHours(shiftHours(shift))} ·{" "}
                                {currency(shift.rateCents / 100, settings.currency)}/hr
                              </small>
                            </button>
                          ))
                        ) : (
                          <button
                            className="empty-day"
                            onClick={() => setEditing("new")}
                            aria-label={`Add a shift on ${day.toDateString()}`}
                          >
                            <span>＋</span>
                            <small>No shift</small>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="calendar-footer">
                <span><i className="legend-dot completed" /> Completed</span>
                <span><i className="legend-dot scheduled" /> Scheduled</span>
                <span>Tap any shift to update it</span>
              </div>
            </section>
          </>
        )}

        {view === "history" && (
          <HistoryView
            range={range}
            setRange={setRange}
            shifts={historyShifts}
            hours={historyHours}
            pay={historyPay}
            settings={settings}
            onEdit={setEditing}
          />
        )}

        {view === "settings" && (
          <SettingsView
            settings={settings}
            setSettings={setSettings}
            notificationState={notificationState}
            enableNotifications={enableNotifications}
            clearData={() => {
              if (window.confirm("Replace your local data with the sample schedule?")) {
                setShifts(sampleShifts());
                setWeekStart(startOfWeek(new Date()));
              }
            }}
          />
        )}
      </main>

      {editing && (
        <ShiftEditor
          shift={editing === "new" ? null : editing}
          settings={settings}
          initialDate={toInputDate(weekStart.getTime())}
          onClose={() => setEditing(null)}
          onSave={saveShift}
          onDelete={(id) => {
            setShifts((current) => current.filter((shift) => shift.id !== id));
            setEditing(null);
          }}
          onStatus={updateStatus}
        />
      )}

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={view === "schedule" ? "active" : ""} onClick={() => setView("schedule")}>
          <span>▦</span>Schedule
        </button>
        <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>
          <span>↗</span>History
        </button>
        <button className="mobile-add" onClick={() => setEditing("new")} aria-label="Add shift">＋</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>
          <span>⚙</span>Settings
        </button>
      </nav>
    </div>
  );
}

function HistoryView({
  range,
  setRange,
  shifts,
  hours,
  pay,
  settings,
  onEdit,
}: {
  range: Range;
  setRange: (range: Range) => void;
  shifts: Shift[];
  hours: number;
  pay: number;
  settings: Settings;
  onEdit: (shift: Shift) => void;
}) {
  const employers = Array.from(new Set(shifts.map((shift) => shift.employer)));
  return (
    <>
      <header className="page-header">
        <div>
          <p className="kicker">YOUR PROGRESS</p>
          <h1>Hours & earnings</h1>
          <p>A clear record of the time you’ve put in.</p>
        </div>
        <div className="segmented">
          {(["week", "month", "year"] as Range[]).map((item) => (
            <button
              key={item}
              className={range === item ? "active" : ""}
              onClick={() => setRange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </header>
      <section className="history-hero">
        <div>
          <span className="eyebrow">ELIGIBLE EARNINGS</span>
          <strong>{currency(pay, settings.currency)}</strong>
          <small>Based on completed and scheduled hours to date</small>
        </div>
        <div className="history-stat">
          <span>Total hours</span>
          <strong>{formatHours(hours)}</strong>
        </div>
        <div className="history-stat">
          <span>Average rate</span>
          <strong>{currency(hours ? pay / hours : 0, settings.currency)}</strong>
        </div>
      </section>
      <section className="history-grid">
        <article className="panel employer-panel">
          <div className="panel-heading">
            <div>
              <h2>By employer</h2>
              <p>Your earnings breakdown</p>
            </div>
          </div>
          {employers.length ? employers.map((employer) => {
            const employerShifts = shifts.filter((shift) => shift.employer === employer);
            const employerPay = employerShifts.reduce((sum, shift) => sum + shiftPay(shift), 0);
            const percentage = pay ? (employerPay / pay) * 100 : 0;
            return (
              <div className="employer-row" key={employer}>
                <span className={`employer-badge ${employerColors[employer] ?? "violet"}`}>
                  {employer.slice(0, 1)}
                </span>
                <div>
                  <strong>{employer}</strong>
                  <span>{formatHours(employerShifts.reduce((sum, shift) => sum + shiftHours(shift), 0))}</span>
                  <i><b style={{ width: `${percentage}%` }} /></i>
                </div>
                <strong>{currency(employerPay, settings.currency)}</strong>
              </div>
            );
          }) : <p className="empty-copy">No completed shifts in this period yet.</p>}
        </article>
        <article className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent shifts</h2>
              <p>Tap a shift to review it</p>
            </div>
          </div>
          {[...shifts].sort((a, b) => b.startAt - a.startAt).slice(0, 6).map((shift) => (
            <button className="activity-row" key={shift.id} onClick={() => onEdit(shift)}>
              <span className="activity-date">
                <b>{new Date(shift.startAt).getDate()}</b>
                {new Date(shift.startAt).toLocaleDateString("en-US", { month: "short" })}
              </span>
              <span>
                <strong>{shift.employer}</strong>
                <small>{formatTime(shift.startAt)} – {formatTime(shift.endAt)}</small>
              </span>
              <span className={`status-pill ${shift.status}`}>{shift.status}</span>
              <strong>{currency(shiftPay(shift), settings.currency)}</strong>
            </button>
          ))}
          {!shifts.length && <p className="empty-copy">Your shift history will appear here.</p>}
        </article>
      </section>
    </>
  );
}

function SettingsView({
  settings,
  setSettings,
  notificationState,
  enableNotifications,
  clearData,
}: {
  settings: Settings;
  setSettings: (settings: Settings) => void;
  notificationState: NotificationPermission | "unsupported";
  enableNotifications: () => void;
  clearData: () => void;
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="kicker">YOUR PREFERENCES</p>
          <h1>Settings</h1>
          <p>Set sensible defaults to make scheduling faster.</p>
        </div>
      </header>
      <section className="settings-layout">
        <article className="panel settings-panel">
          <div className="panel-heading">
            <div><h2>Profile & defaults</h2><p>Saved automatically on this device</p></div>
          </div>
          <label>
            Your name
            <input
              value={settings.name}
              onChange={(event) => setSettings({ ...settings, name: event.target.value })}
            />
          </label>
          <div className="field-row">
            <label>
              Currency
              <select
                value={settings.currency}
                onChange={(event) => setSettings({ ...settings, currency: event.target.value })}
              >
                <option value="SGD">SGD — Singapore dollar</option>
                <option value="USD">USD — US dollar</option>
                <option value="AUD">AUD — Australian dollar</option>
                <option value="GBP">GBP — British pound</option>
              </select>
            </label>
            <label>
              Default hourly rate
              <input
                type="number"
                min="0"
                step="0.5"
                value={settings.defaultRate}
                onChange={(event) =>
                  setSettings({ ...settings, defaultRate: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <label>
            Default reminder
            <select
              value={settings.defaultReminder}
              onChange={(event) =>
                setSettings({ ...settings, defaultReminder: Number(event.target.value) })
              }
            >
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="120">2 hours before</option>
            </select>
          </label>
        </article>
        <aside className="settings-side">
          <article className="panel reminder-panel">
            <span className="settings-icon">◷</span>
            <div><h3>Shift reminders</h3><p>Get a browser notification before work starts.</p></div>
            <button onClick={enableNotifications} disabled={notificationState === "granted"}>
              {notificationState === "granted" ? "Reminders enabled" : "Enable reminders"}
            </button>
          </article>
          <article className="panel local-panel">
            <span className="settings-icon">⌂</span>
            <div><h3>Local pilot</h3><p>Your information currently stays in this browser. Cloud sync and sign-in come next.</p></div>
            <button className="text-button" onClick={clearData}>Restore sample schedule</button>
          </article>
        </aside>
      </section>
    </>
  );
}

function ShiftEditor({
  shift,
  settings,
  initialDate,
  onClose,
  onSave,
  onDelete,
  onStatus,
}: {
  shift: Shift | null;
  settings: Settings;
  initialDate: string;
  onClose: () => void;
  onSave: (shift: Shift) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, status: ShiftStatus) => void;
}) {
  const [employer, setEmployer] = useState(shift?.employer ?? "KFC");
  const [date, setDate] = useState(shift ? toInputDate(shift.startAt) : initialDate);
  const [start, setStart] = useState(shift ? toInputTime(shift.startAt) : "09:00");
  const [end, setEnd] = useState(shift ? toInputTime(shift.endAt) : "17:00");
  const [rate, setRate] = useState(shift ? shift.rateCents / 100 : settings.defaultRate);
  const [breakMinutes, setBreakMinutes] = useState(shift?.breakMinutes ?? 0);
  const [reminderMinutes, setReminderMinutes] = useState(
    shift?.reminderMinutes ?? settings.defaultReminder,
  );
  const [notes, setNotes] = useState(shift?.notes ?? "");
  const previewStart = dateFromParts(date, start);
  let previewEnd = dateFromParts(date, end);
  if (previewEnd <= previewStart) previewEnd += DAY;
  const preview: Shift = {
    id: shift?.id ?? "preview",
    employer,
    startAt: previewStart,
    endAt: previewEnd,
    rateCents: Math.round(rate * 100),
    breakMinutes,
    reminderMinutes,
    notes,
    status: shift?.status ?? "scheduled",
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      ...preview,
      id: shift?.id ?? crypto.randomUUID(),
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="shift-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="editor-heading">
          <div>
            <span className="kicker">{shift ? "UPDATE YOUR SCHEDULE" : "PLAN YOUR WEEK"}</span>
            <h2 id="shift-editor-title">{shift ? "Edit shift" : "Add a shift"}</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <label>
            Employer
            <input
              list="employers"
              required
              value={employer}
              onChange={(event) => setEmployer(event.target.value)}
            />
            <datalist id="employers">
              <option value="KFC" />
              <option value="McDonalds" />
              <option value="Coffee Club" />
            </datalist>
          </label>
          <label>
            Shift date
            <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <div className="field-row">
            <label>
              Starts
              <input type="time" required value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label>
              Ends
              <input type="time" required value={end} onChange={(event) => setEnd(event.target.value)} />
            </label>
          </div>
          {previewEnd - previewStart > 20 * 3_600_000 && (
            <p className="form-warning">This shift is longer than 20 hours. Check the end time.</p>
          )}
          {previewEnd > dateFromParts(date, "23:59") && (
            <p className="overnight-note">↳ Ends the following day</p>
          )}
          <div className="field-row">
            <label>
              Hourly rate ({settings.currency})
              <input type="number" min="0" step="0.5" required value={rate} onChange={(event) => setRate(Number(event.target.value))} />
            </label>
            <label>
              Unpaid break
              <select value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))}>
                <option value="0">No break</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </label>
          </div>
          <label>
            Reminder
            <select value={reminderMinutes} onChange={(event) => setReminderMinutes(Number(event.target.value))}>
              <option value="15">15 minutes before</option>
              <option value="30">30 minutes before</option>
              <option value="60">1 hour before</option>
              <option value="120">2 hours before</option>
            </select>
          </label>
          <label>
            Notes <span className="optional">Optional</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Role, location, or anything to remember" />
          </label>
          <div className="shift-preview">
            <span><small>PAID HOURS</small><strong>{formatHours(shiftHours(preview))}</strong></span>
            <span><small>ESTIMATED PAY</small><strong>{currency(shiftPay(preview), settings.currency)}</strong></span>
          </div>
          {shift && (
            <div className="status-actions">
              <span>Shift status</span>
              <div>
                {(["scheduled", "completed", "missed"] as ShiftStatus[]).map((status) => (
                  <button
                    type="button"
                    key={status}
                    className={shift.status === status ? "active" : ""}
                    onClick={() => onStatus(shift.id, status)}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="editor-actions">
            {shift && (
              <button
                type="button"
                className="delete-button"
                onClick={() => window.confirm("Delete this shift?") && onDelete(shift.id)}
              >
                Delete
              </button>
            )}
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-button">{shift ? "Save changes" : "Add shift"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
