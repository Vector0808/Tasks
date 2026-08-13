import { useState, useEffect, useMemo, useRef } from "react";
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from "recharts";
import { Plus, X, ChevronLeft, ChevronRight, Flame, RotateCcw, Pencil, Check } from "lucide-react";

/* ---------------------------------------------------------
   DISCIPLINE LOG — a gamified habit ledger
   Daily / Weekly / Monthly tracking, all in localStorage
   Storage key: "disciplineLog.v2"
--------------------------------------------------------- */

const STORAGE_KEY = "disciplineLog.v2";
const OLD_STORAGE_KEY = "disciplineLog.v1";
const XP_PER_CHECK = 10;
const XP_PER_LEVEL = 150;

const DEFAULT_HABITS = [
  { id: "h1", name: "Wake up at 05:00", icon: "⏰", frequency: "daily" },
  { id: "h2", name: "Gym", icon: "🏋️", frequency: "daily" },
  { id: "h3", name: "Reading / Learning", icon: "📖", frequency: "daily" },
  { id: "h4", name: "Plan Tomorrow", icon: "🗒️", frequency: "daily" },
  { id: "h5", name: "No Alcohol", icon: "🚫", frequency: "daily" },
  { id: "h6", name: "Meal Prep", icon: "🍱", frequency: "weekly" },
  { id: "h7", name: "Deep Clean", icon: "🧹", frequency: "weekly" },
  { id: "h8", name: "Weekly Review", icon: "🧭", frequency: "weekly" },
  { id: "h9", name: "Pay Bills", icon: "💳", frequency: "monthly" },
  { id: "h10", name: "Budget Review", icon: "📊", frequency: "monthly" },
];

const RANKS = [
  { min: 1, title: "Recruit" },
  { min: 3, title: "Cadet" },
  { min: 6, title: "Operative" },
  { min: 10, title: "Specialist" },
  { min: 15, title: "Veteran" },
  { min: 22, title: "Elite" },
  { min: 30, title: "Vanguard" },
];

const MOODS = ["😞", "😐", "🙂", "😄", "🔥"];
const WEEKDAY_LETTERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TABS = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

function pad2(n) { return String(n).padStart(2, "0"); }
function dateKey(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function monthKey(y, m) { return `${y}-${pad2(m + 1)}`; }
function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

/* ---- ISO week helpers ---- */
function isoWeekInfo(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { isoYear: d.getUTCFullYear(), week };
}
function isoWeekKeyForDate(date) {
  const { isoYear, week } = isoWeekInfo(date);
  return `${isoYear}-W${pad2(week)}`;
}
function isoWeekStartDate(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  if (dow <= 4) simple.setUTCDate(simple.getUTCDate() - dow + 1);
  else simple.setUTCDate(simple.getUTCDate() + 8 - dow);
  return simple;
}
function isoWeeksInYear(year) {
  return isoWeekInfo(new Date(year, 11, 28)).week;
}
function fmtShort(d) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.habits && parsed.checks) return parsed;
    }
    // migrate from v1 (all-daily habits, no frequency field)
    const old = localStorage.getItem(OLD_STORAGE_KEY);
    if (old) {
      const parsedOld = JSON.parse(old);
      const habits = (parsedOld.habits || []).map((h) => ({ ...h, frequency: h.frequency || "daily" }));
      return { habits, checks: parsedOld.checks || {}, mood: parsedOld.mood || {}, sleep: parsedOld.sleep || {} };
    }
    throw new Error("no data");
  } catch {
    return { habits: DEFAULT_HABITS, checks: {}, mood: {}, sleep: {} };
  }
}

function rankForLevel(level) {
  let title = RANKS[0].title;
  for (const r of RANKS) if (level >= r.min) title = r.title;
  return title;
}

export default function App() {
  const [state, setState] = useState(loadState);
  const [activeTab, setActiveTab] = useState("daily");
  const now = useMemo(() => new Date(), []);
  const [dailyView, setDailyView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [weeklyView, setWeeklyView] = useState({ year: isoWeekInfo(now).isoYear });
  const [monthlyView, setMonthlyView] = useState({ year: now.getFullYear() });

  const [managing, setManaging] = useState(false);
  const [newHabitName, setNewHabitName] = useState("");
  const [newHabitIcon, setNewHabitIcon] = useState("✅");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  function flash(msg) {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1600);
  }

  const { habits, checks, mood, sleep } = state;
  const habitsForTab = useMemo(() => habits.filter((h) => h.frequency === activeTab), [habits, activeTab]);

  /* ---------------- columns per tab ---------------- */
  const columns = useMemo(() => {
    if (activeTab === "daily") {
      const { year, month } = dailyView;
      const n = daysInMonth(year, month);
      const cols = [];
      for (let d = 1; d <= n; d++) {
        const key = dateKey(year, month, d);
        const wd = new Date(year, month, d).getDay();
        cols.push({ key, top: WEEKDAY_LETTERS[wd], bottom: String(d), isCurrent: key === todayKey(), day: d });
      }
      return cols;
    }
    if (activeTab === "weekly") {
      const { year } = weeklyView;
      const total = isoWeeksInYear(year);
      const curKey = isoWeekKeyForDate(now);
      const cols = [];
      for (let w = 1; w <= total; w++) {
        const key = `${year}-W${pad2(w)}`;
        const start = isoWeekStartDate(year, w);
        const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
        cols.push({ key, top: "W", bottom: String(w), isCurrent: key === curKey, title: `${fmtShort(start)} – ${fmtShort(end)}` });
      }
      return cols;
    }
    // monthly
    const { year } = monthlyView;
    const curKey = monthKey(now.getFullYear(), now.getMonth());
    const cols = [];
    for (let m = 0; m < 12; m++) {
      const key = monthKey(year, m);
      cols.push({ key, top: "", bottom: MONTH_NAMES[m].slice(0, 3), isCurrent: key === curKey });
    }
    return cols;
  }, [activeTab, dailyView, weeklyView, monthlyView, now]);

  const colWidth = activeTab === "monthly" ? 44 : 34;

  function toggleCheck(habitId, colKey) {
    setState((s) => {
      const bucket = { ...(s.checks[colKey] || {}) };
      if (bucket[habitId]) delete bucket[habitId];
      else bucket[habitId] = true;
      return { ...s, checks: { ...s.checks, [colKey]: bucket } };
    });
  }

  function cycleMood(day) {
    const key = dateKey(dailyView.year, dailyView.month, day);
    setState((s) => {
      const cur = s.mood[key];
      const idx = cur === undefined ? -1 : MOODS.indexOf(cur);
      const next = MOODS[(idx + 1) % MOODS.length];
      return { ...s, mood: { ...s.mood, [key]: next } };
    });
  }

  function setSleep(day, val) {
    const key = dateKey(dailyView.year, dailyView.month, day);
    const num = val === "" ? undefined : Math.max(0, Math.min(24, Number(val)));
    setState((s) => {
      const next = { ...s.sleep };
      if (num === undefined) delete next[key];
      else next[key] = num;
      return { ...s, sleep: next };
    });
  }

  function addHabit() {
    const name = newHabitName.trim();
    if (!name) return;
    const id = "h" + Date.now();
    setState((s) => ({ ...s, habits: [...s.habits, { id, name, icon: newHabitIcon || "✅", frequency: activeTab }] }));
    setNewHabitName("");
    setNewHabitIcon("✅");
    flash("Habit added");
  }

  function removeHabit(id) {
    setState((s) => ({ ...s, habits: s.habits.filter((h) => h.id !== id) }));
    flash("Habit removed");
  }

  function startEdit(h) {
    setEditingId(h.id);
    setEditName(h.name);
    setEditIcon(h.icon);
  }

  function saveEdit(id) {
    setState((s) => ({
      ...s,
      habits: s.habits.map((h) => (h.id === id ? { ...h, name: editName.trim() || h.name, icon: editIcon || h.icon } : h)),
    }));
    setEditingId(null);
  }

  function resetAll() {
    setState({ habits: DEFAULT_HABITS, checks: {}, mood: {}, sleep: {} });
    setConfirmReset(false);
    flash("Ledger wiped clean");
  }

  /* ---------------- global XP / level (all tabs combined) ---------------- */
  const totalXP = useMemo(() => {
    let n = 0;
    for (const key in checks) n += Object.keys(checks[key]).length;
    return n * XP_PER_CHECK;
  }, [checks]);
  const level = Math.floor(totalXP / XP_PER_LEVEL) + 1;
  const xpIntoLevel = totalXP % XP_PER_LEVEL;
  const xpPct = Math.round((xpIntoLevel / XP_PER_LEVEL) * 100);
  const rank = rankForLevel(level);
  const ringCirc = 2 * Math.PI * 42;

  /* ---------------- streaks, scoped to the active tab's frequency ---------------- */
  function isComplete(key, habitList) {
    if (habitList.length === 0) return false;
    const bucket = checks[key];
    if (!bucket) return false;
    return habitList.every((h) => bucket[h.id]);
  }

  const streaks = useMemo(() => {
    if (habitsForTab.length === 0) return { current: 0, best: 0 };

    if (activeTab === "daily") {
      let current = 0;
      const cursor = new Date();
      let k = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (!isComplete(k, habitsForTab)) cursor.setDate(cursor.getDate() - 1);
      while (true) {
        k = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
        if (isComplete(k, habitsForTab)) { current++; cursor.setDate(cursor.getDate() - 1); } else break;
        if (current > 3650) break;
      }
      const allKeys = Object.keys(checks).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && isComplete(x, habitsForTab)).sort();
      let best = 0, run = 0, prev = null;
      for (const key of allKeys) {
        const d = new Date(key + "T00:00:00");
        run = prev && Math.round((d - prev) / 86400000) === 1 ? run + 1 : 1;
        prev = d;
        if (run > best) best = run;
      }
      return { current, best };
    }

    if (activeTab === "weekly") {
      let current = 0;
      const cursor = new Date();
      let k = isoWeekKeyForDate(cursor);
      if (!isComplete(k, habitsForTab)) cursor.setDate(cursor.getDate() - 7);
      while (true) {
        k = isoWeekKeyForDate(cursor);
        if (isComplete(k, habitsForTab)) { current++; cursor.setDate(cursor.getDate() - 7); } else break;
        if (current > 1000) break;
      }
      const allKeys = Object.keys(checks).filter((x) => /^\d{4}-W\d{2}$/.test(x) && isComplete(x, habitsForTab));
      const withDates = allKeys.map((key) => {
        const [y, w] = key.split("-W");
        return { key, date: isoWeekStartDate(Number(y), Number(w)) };
      }).sort((a, b) => a.date - b.date);
      let best = 0, run = 0, prev = null;
      for (const { date } of withDates) {
        run = prev && Math.round((date - prev) / 86400000) === 7 ? run + 1 : 1;
        prev = date;
        if (run > best) best = run;
      }
      return { current, best };
    }

    // monthly
    let current = 0;
    const cursor = new Date();
    let k = monthKey(cursor.getFullYear(), cursor.getMonth());
    if (!isComplete(k, habitsForTab)) cursor.setMonth(cursor.getMonth() - 1);
    while (true) {
      k = monthKey(cursor.getFullYear(), cursor.getMonth());
      if (isComplete(k, habitsForTab)) { current++; cursor.setMonth(cursor.getMonth() - 1); } else break;
      if (current > 1000) break;
    }
    const allKeys = Object.keys(checks).filter((x) => /^\d{4}-\d{2}$/.test(x) && isComplete(x, habitsForTab));
    const idxs = allKeys.map((key) => {
      const [y, m] = key.split("-").map(Number);
      return y * 12 + (m - 1);
    }).sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    for (const idx of idxs) {
      run = prev !== null && idx - prev === 1 ? run + 1 : 1;
      prev = idx;
      if (run > best) best = run;
    }
    return { current, best };
  }, [activeTab, habitsForTab, checks]);

  /* ---------------- period completion % (all columns currently shown) ---------------- */
  const periodPct = useMemo(() => {
    if (habitsForTab.length === 0 || columns.length === 0) return 0;
    let checked = 0;
    for (const c of columns) checked += Object.keys(checks[c.key] || {}).filter((id) => habitsForTab.some((h) => h.id === id)).length;
    const total = habitsForTab.length * columns.length;
    return total === 0 ? 0 : Math.round((checked / total) * 100);
  }, [checks, habitsForTab, columns]);

  const chartData = useMemo(() => {
    return columns.map((c) => {
      const bucket = checks[c.key] || {};
      const n = habitsForTab.length ? Math.round((habitsForTab.filter((h) => bucket[h.id]).length / habitsForTab.length) * 100) : 0;
      return { label: c.bottom, pct: n, isCurrent: c.isCurrent };
    });
  }, [columns, checks, habitsForTab]);

  function shiftDaily(delta) {
    let m = dailyView.month + delta, y = dailyView.year;
    if (m < 0) { m = 11; y -= 1; } if (m > 11) { m = 0; y += 1; }
    setDailyView({ year: y, month: m });
  }
  function shiftWeekly(delta) { setWeeklyView((v) => ({ year: v.year + delta })); }
  function shiftMonthly(delta) { setMonthlyView((v) => ({ year: v.year + delta })); }

  const periodLabel =
    activeTab === "daily" ? `${MONTH_NAMES[dailyView.month]} ${dailyView.year}` :
    activeTab === "weekly" ? `${weeklyView.year}` : `${monthlyView.year}`;

  const shiftFn = activeTab === "daily" ? shiftDaily : activeTab === "weekly" ? shiftWeekly : shiftMonthly;
  const periodStatLabel = activeTab === "daily" ? "MONTH CLEAR" : "YEAR CLEAR";
  const streakUnit = activeTab === "daily" ? "DAY STREAK" : activeTab === "weekly" ? "WEEK STREAK" : "MONTH STREAK";
  const bestUnit = activeTab === "daily" ? "BEST (DAYS)" : activeTab === "weekly" ? "BEST (WEEKS)" : "BEST (MONTHS)";

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh", color: "var(--ink)", fontFamily: "var(--font-body)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
        :root {
          --bg: #10120f; --panel: #171a16; --panel2: #1d2119; --border: #2c3129;
          --ink: #ece7d8; --ink-muted: #8d9182; --gold: #d3a44a; --gold-dim: #7a6534;
          --moss: #7fa06b; --rust: #b85c42;
          --font-display: 'Space Grotesk', sans-serif; --font-mono: 'JetBrains Mono', monospace; --font-body: 'Inter', sans-serif;
        }
        * { box-sizing: border-box; }
        .disp { font-family: var(--font-display); }
        .mono { font-family: var(--font-mono); }
        .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; }
        .cell-btn {
          width: 30px; height: 30px; min-width: 30px; border: 1px solid var(--border); background: #14160f;
          border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer;
          transition: transform 0.08s ease, background 0.15s ease, border-color 0.15s ease; color: transparent;
        }
        .cell-btn:hover { border-color: var(--gold-dim); }
        .cell-btn:active { transform: scale(0.92); }
        .cell-btn.checked { background: linear-gradient(155deg, #3c4a30, #29331f); border-color: var(--moss); color: var(--moss); }
        .cell-btn.today { box-shadow: 0 0 0 1px var(--gold) inset; }
        .row-label { position: sticky; left: 0; z-index: 5; background: var(--panel); }
        .scrollbar-thin::-webkit-scrollbar { height: 8px; width: 8px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
        .stamp-check { animation: stampIn 0.16s ease-out; }
        @keyframes stampIn { 0% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        .toast {
          position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
          background: var(--panel2); border: 1px solid var(--gold-dim); color: var(--gold);
          padding: 8px 16px; border-radius: 999px; font-family: var(--font-mono); font-size: 12px;
          letter-spacing: 0.04em; z-index: 50;
        }
        .tab-btn {
          font-family: var(--font-mono); font-size: 11.5px; letter-spacing: 0.06em; padding: 8px 16px;
          border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--ink-muted); cursor: pointer;
        }
        .tab-btn.active { background: var(--gold); border-color: var(--gold); color: #151710; font-weight: 600; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 14px 60px" }}>
        {/* HEADER */}
        <div className="flex items-start justify-between" style={{ marginBottom: 18 }}>
          <div>
            <div className="mono" style={{ color: "var(--gold)", fontSize: 11, letterSpacing: "0.18em", marginBottom: 4 }}>MISSION LEDGER</div>
            <h1 className="disp" style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>Discipline Log</h1>
          </div>
          <button onClick={() => setConfirmReset(true)} className="mono" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--ink-muted)", borderRadius: 6, padding: "7px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <RotateCcw size={13} /> RESET
          </button>
        </div>

        {/* GLOBAL XP STRIP */}
        <div className="panel" style={{ padding: 16, marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <svg width="64" height="64" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#2a2e24" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--gold)" strokeWidth="8"
                strokeDasharray={`${ringCirc}`} strokeDashoffset={`${ringCirc * (1 - xpPct / 100)}`}
                strokeLinecap="round" transform="rotate(-90 50 50)" />
              <text x="50" y="47" textAnchor="middle" className="disp" fontSize="22" fill="var(--ink)" fontWeight="700">{level}</text>
              <text x="50" y="63" textAnchor="middle" className="mono" fontSize="9" fill="var(--ink-muted)">LVL</text>
            </svg>
            <div>
              <div className="disp" style={{ fontWeight: 600, fontSize: 15 }}>{rank}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-muted)" }}>{xpIntoLevel} / {XP_PER_LEVEL} XP · {totalXP} total</div>
            </div>
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Flame size={22} color="var(--rust)" fill={streaks.current > 0 ? "var(--rust)" : "none"} />
            <div>
              <div className="disp" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>{streaks.current}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-muted)" }}>{streakUnit}</div>
            </div>
          </div>
          <div>
            <div className="disp" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>{streaks.best}</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-muted)" }}>{bestUnit}</div>
          </div>
          <div>
            <div className="disp" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>{periodPct}%</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-muted)" }}>{periodStatLabel}</div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {TABS.map((t) => (
            <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>
              {t.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* PERIOD NAV */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => shiftFn(-1)} style={navBtnStyle}><ChevronLeft size={16} /></button>
            <div className="disp" style={{ fontSize: 17, fontWeight: 600, minWidth: 130, textAlign: "center" }}>{periodLabel}</div>
            <button onClick={() => shiftFn(1)} style={navBtnStyle}><ChevronRight size={16} /></button>
          </div>
          <button onClick={() => setManaging((m) => !m)} className="mono" style={{ background: managing ? "var(--gold-dim)" : "transparent", border: "1px solid var(--border)", color: managing ? "var(--bg)" : "var(--ink-muted)", borderRadius: 6, padding: "7px 10px", fontSize: 11, cursor: "pointer" }}>
            {managing ? "DONE" : `MANAGE ${activeTab.toUpperCase()}`}
          </button>
        </div>

        {/* HABIT MANAGER (scoped to active tab) */}
        {managing && (
          <div className="panel" style={{ padding: 14, marginBottom: 16 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "0.1em", marginBottom: 10 }}>
              {activeTab.toUpperCase()} TASKS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
              {habitsForTab.map((h) => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 6, padding: "7px 9px" }}>
                  {editingId === h.id ? (
                    <>
                      <input value={editIcon} onChange={(e) => setEditIcon(e.target.value)} style={{ ...inputStyle, width: 42, textAlign: "center" }} />
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={() => saveEdit(h.id)} style={iconBtnStyle}><Check size={14} color="var(--moss)" /></button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 16 }}>{h.icon}</span>
                      <span style={{ flex: 1, fontSize: 13.5 }}>{h.name}</span>
                      <button onClick={() => startEdit(h)} style={iconBtnStyle}><Pencil size={13} color="var(--ink-muted)" /></button>
                      <button onClick={() => removeHabit(h.id)} style={iconBtnStyle}><X size={14} color="var(--rust)" /></button>
                    </>
                  )}
                </div>
              ))}
              {habitsForTab.length === 0 && <div className="mono" style={{ fontSize: 12, color: "var(--ink-muted)" }}>No {activeTab} tasks yet — add one below.</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newHabitIcon} onChange={(e) => setNewHabitIcon(e.target.value)} placeholder="🔥" style={{ ...inputStyle, width: 42, textAlign: "center" }} />
              <input value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} placeholder={`New ${activeTab} task`} style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addHabit()} />
              <button onClick={addHabit} style={{ ...iconBtnStyle, background: "var(--gold)", borderColor: "var(--gold)" }}><Plus size={15} color="#151710" /></button>
            </div>
          </div>
        )}

        {/* GRID */}
        <div className="panel scrollbar-thin" style={{ overflowX: "auto", marginBottom: 16 }}>
          <div style={{ minWidth: 170 + columns.length * colWidth }}>
            <div style={{ display: "flex" }}>
              <div className="row-label" style={{ width: 170, minWidth: 170, padding: "10px 12px", borderBottom: "1px solid var(--border)" }} />
              {columns.map((c) => (
                <div key={c.key} title={c.title} className="mono" style={{ width: colWidth, minWidth: colWidth, textAlign: "center", fontSize: 9.5, color: "var(--ink-muted)", padding: "10px 0 0", borderBottom: "1px solid var(--border)" }}>
                  {c.top}
                </div>
              ))}
            </div>
            <div style={{ display: "flex" }}>
              <div className="row-label" style={{ width: 170, minWidth: 170, padding: "0 12px 8px", borderBottom: "1px solid var(--border)" }} />
              {columns.map((c) => (
                <div key={c.key} title={c.title} className="mono" style={{ width: colWidth, minWidth: colWidth, textAlign: "center", fontSize: activeTab === "monthly" ? 10.5 : 11, color: "var(--ink)", padding: "0 0 8px", borderBottom: "1px solid var(--border)" }}>
                  {c.bottom}
                </div>
              ))}
            </div>

            {habitsForTab.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center" }}>
                <div className="row-label" style={{ width: 170, minWidth: 170, padding: "6px 12px", fontSize: 13, display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid var(--border)" }}>
                  <span>{h.icon}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                </div>
                {columns.map((c) => {
                  const isChecked = !!(checks[c.key] && checks[c.key][h.id]);
                  return (
                    <div key={c.key} style={{ width: colWidth, minWidth: colWidth, display: "flex", justifyContent: "center", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                      <button onClick={() => toggleCheck(h.id, c.key)} className={`cell-btn ${isChecked ? "checked" : ""} ${c.isCurrent ? "today" : ""}`}>
                        {isChecked && <Check size={15} className="stamp-check" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
            {habitsForTab.length === 0 && (
              <div className="mono" style={{ padding: "18px 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>
                Nothing here yet — tap "MANAGE {activeTab.toUpperCase()}" to add your {activeTab} tasks.
              </div>
            )}

            {/* mood + sleep rows: daily tab only */}
            {activeTab === "daily" && habitsForTab.length > 0 && (
              <>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div className="row-label" style={{ width: 170, minWidth: 170, padding: "6px 12px", fontSize: 12.5, color: "var(--ink-muted)", borderBottom: "1px solid var(--border)" }}>Mood</div>
                  {columns.map((c) => {
                    const m = mood[c.key];
                    return (
                      <div key={c.key} style={{ width: colWidth, minWidth: colWidth, display: "flex", justifyContent: "center", padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
                        <button onClick={() => cycleMood(c.day)} style={{ width: 28, height: 28, background: "#14160f", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>{m || ""}</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div className="row-label" style={{ width: 170, minWidth: 170, padding: "6px 12px", fontSize: 12.5, color: "var(--ink-muted)" }}>Sleep (h)</div>
                  {columns.map((c) => {
                    const v = sleep[c.key];
                    return (
                      <div key={c.key} style={{ width: colWidth, minWidth: colWidth, display: "flex", justifyContent: "center", padding: "5px 0" }}>
                        <input type="number" min="0" max="24" value={v === undefined ? "" : v} onChange={(e) => setSleep(c.day, e.target.value)} className="mono" style={{ width: 28, height: 24, background: "#14160f", border: "1px solid var(--border)", borderRadius: 4, color: "var(--ink)", fontSize: 10.5, textAlign: "center", padding: 0 }} />
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* PROGRESS CHART */}
        {habitsForTab.length > 0 && (
          <div className="panel" style={{ padding: 16 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--gold)", letterSpacing: "0.1em", marginBottom: 10 }}>
              {activeTab.toUpperCase()} PROGRESS
            </div>
            <div style={{ width: "100%", height: 160 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#8d9182" }} axisLine={{ stroke: "#2c3129" }} tickLine={false} interval={chartData.length > 20 ? 3 : 0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#8d9182" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "#1d2119", border: "1px solid #2c3129", borderRadius: 6, fontSize: 11 }} labelStyle={{ color: "#ece7d8" }} formatter={(v) => [`${v}%`, "complete"]} />
                  <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
                    {chartData.map((entry, i) => (<Cell key={i} fill={entry.isCurrent ? "#d3a44a" : "#5b6650"} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {confirmReset && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 20 }}>
          <div className="panel" style={{ padding: 20, maxWidth: 320 }}>
            <div className="disp" style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Wipe the ledger?</div>
            <div style={{ fontSize: 13, color: "var(--ink-muted)", marginBottom: 16 }}>This clears every daily, weekly, and monthly task, check, mood, and sleep entry. This can't be undone.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmReset(false)} className="mono" style={{ ...navBtnStyle, width: "auto", padding: "8px 12px" }}>Cancel</button>
              <button onClick={resetAll} className="mono" style={{ background: "var(--rust)", border: "1px solid var(--rust)", color: "#1a0f0a", borderRadius: 6, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>Reset everything</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

const navBtnStyle = { width: 30, height: 30, background: "var(--panel2)", border: "1px solid var(--border)", borderRadius: 6, color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const iconBtnStyle = { width: 26, height: 26, background: "transparent", border: "1px solid var(--border)", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
const inputStyle = { background: "#14160f", border: "1px solid var(--border)", borderRadius: 5, color: "var(--ink)", fontSize: 13, padding: "7px 9px", outline: "none" };
