// Pomodoro Reading Desk
// Sample data: page totals are placeholders.
const BOOK_TOTALS = { A: 256, B: 320 };

const LS_KEY = 'pomodoroDesk.v1';

const DEFAULTS = {
  durations: { focus: 25 * 60000, short: 5 * 60000, long: 15 * 60000 },
  pagesPerSession: 10,
};

let state = {
  durations: { ...DEFAULTS.durations },
  pagesPerSession: DEFAULTS.pagesPerSession,
  activeBook: 'A',
  books: { A: 0, B: 0 },
  bookOpen: { A: false, B: false },
  timer: {
    mode: 'focus',        // focus | short | long
    status: 'idle',       // idle | running | paused
    remainingMs: 25 * 60000,
    endTime: null,
    cycleFocusCount: 0,
    sessionsToday: { date: todayKey(), count: 0 },
    currentSessionId: null,
    lastCountedSessionId: null,
    completing: false,
  },
};

let intervalId = null;
let sessionIdCounter = 0;

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function clampPage(book, page) { return clamp(Math.round(page), 0, BOOK_TOTALS[book]); }

function modeLabel(mode) {
  if (mode === 'focus') return 'Focus';
  if (mode === 'short') return 'Short break';
  return 'Long break';
}

function fullDuration(mode) { return state.durations[mode === 'short' ? 'short' : mode === 'long' ? 'long' : 'focus']; }

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      if (parsed.durations) {
        state.durations.focus = parsed.durations.focus ?? state.durations.focus;
        state.durations.short = parsed.durations.short ?? state.durations.short;
        state.durations.long = parsed.durations.long ?? state.durations.long;
      }
      if (typeof parsed.pagesPerSession === 'number') state.pagesPerSession = parsed.pagesPerSession;
      if (parsed.activeBook === 'A' || parsed.activeBook === 'B') state.activeBook = parsed.activeBook;
      if (parsed.books) {
        state.books.A = clampPage('A', parsed.books.A ?? 0);
        state.books.B = clampPage('B', parsed.books.B ?? 0);
      }
      if (parsed.bookOpen) {
        state.bookOpen.A = !!parsed.bookOpen.A;
        state.bookOpen.B = !!parsed.bookOpen.B;
      }
      if (parsed.timer) {
        const t = parsed.timer;
        state.timer.mode = ['focus','short','long'].includes(t.mode) ? t.mode : 'focus';
        state.timer.status = ['idle','running','paused'].includes(t.status) ? t.status : 'idle';
        state.timer.cycleFocusCount = clamp(t.cycleFocusCount ?? 0, 0, 4);
        state.timer.sessionsToday = t.sessionsToday && typeof t.sessionsToday === 'object'
          ? { date: t.sessionsToday.date, count: t.sessionsToday.count ?? 0 } : state.timer.sessionsToday;
        state.timer.currentSessionId = t.currentSessionId ?? null;
        state.timer.lastCountedSessionId = t.lastCountedSessionId ?? null;
        state.timer.completing = false;
        if (state.timer.status === 'running') {
          state.timer.endTime = typeof t.endTime === 'number' ? t.endTime : null;
          state.timer.remainingMs = null;
          if (!state.timer.endTime) { state.timer.status = 'idle'; state.timer.remainingMs = fullDuration(state.timer.mode); }
        } else {
          state.timer.endTime = null;
          state.timer.remainingMs = typeof t.remainingMs === 'number' ? t.remainingMs : fullDuration(state.timer.mode);
          state.timer.remainingMs = clamp(state.timer.remainingMs, 0, fullDuration(state.timer.mode));
        }
      }
    }
  } catch (e) {}
  // reset sessions today if new day
  if (state.timer.sessionsToday.date !== todayKey()) {
    state.timer.sessionsToday = { date: todayKey(), count: 0 };
  }
}

function remainingNow() {
  const t = state.timer;
  if (t.status === 'running' && t.endTime) {
    return Math.max(0, t.endTime - Date.now());
  }
  if (t.status === 'paused') return clamp(t.remainingMs ?? fullDuration(t.mode), 0, fullDuration(t.mode));
  return clamp(t.remainingMs ?? fullDuration(t.mode), 0, fullDuration(t.mode));
}

function formatTime(ms) {
  ms = Math.max(0, ms);
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function renderTimer() {
  const t = state.timer;
  const r = remainingNow();
  document.getElementById('timerDisplay').textContent = formatTime(r);
  document.getElementById('timerMode').textContent = modeLabel(t.mode);
  const btn = document.getElementById('startPauseBtn');
  if (t.status === 'running') btn.textContent = 'Pause';
  else if (t.status === 'paused') btn.textContent = 'Resume';
  else btn.textContent = 'Start';
  // mode selector aria
  document.querySelectorAll('.mode-btn').forEach(b => {
    const m = b.dataset.mode;
    const active = m === t.mode;
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  updateRing();
}

const RING_CIRC = 578;
function updateRing() {
  const ring = document.getElementById('timerRing');
  if (!ring) return;
  const t = state.timer;
  const r = remainingNow();
  const full = fullDuration(t.mode);
  const frac = full > 0 ? clamp(r / full, 0, 1) : 0;
  ring.style.strokeDashoffset = (RING_CIRC * (1 - frac)).toFixed(2);
}

function renderBooks() {
  ['A','B'].forEach(b => {
    const page = state.books[b];
    const total = BOOK_TOTALS[b];
    document.getElementById('page' + b).textContent = 'Page ' + page;
    const fill = document.getElementById('progress' + b);
    fill.style.width = (total > 0 ? (page / total) * 100 : 0) + '%';
    const el = document.getElementById('book' + b);
    el.classList.toggle('active', state.activeBook === b);
    el.setAttribute('aria-pressed', state.activeBook === b ? 'true' : 'false');
    el.classList.toggle('open', !!state.bookOpen[b]);
  });
}

function renderProgressLine() {
  const line = document.getElementById('progressLine');
  const name = state.activeBook === 'A' ? 'Deep Work' : 'Atomic Habits';
  line.textContent = 'Sessions today: ' + state.timer.sessionsToday.count + ' · Active: ' + name;
}

function renderSettings() {
  document.getElementById('durFocus').value = Math.round(state.durations.focus / 60000);
  document.getElementById('durShort').value = Math.round(state.durations.short / 60000);
  document.getElementById('durLong').value = Math.round(state.durations.long / 60000);
  document.getElementById('pagesPer').value = state.pagesPerSession;
}

function renderAll() {
  renderTimer();
  renderBooks();
  renderProgressLine();
  renderSettings();
}

function clearTick() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

function scheduleTick() {
  clearTick();
  intervalId = setInterval(tick, 250);
}

function tick() {
  const t = state.timer;
  if (t.status !== 'running') { clearTick(); return; }
  const r = remainingNow();
  document.getElementById('timerDisplay').textContent = formatTime(r);
  updateRing();
  if (r <= 0) {
    completeSession();
  }
}

function start() {
  const t = state.timer;
  if (t.status === 'running') return; // idempotent
  if (t.completing) return;
  const r = (t.status === 'paused')
    ? clamp(t.remainingMs ?? fullDuration(t.mode), 0, fullDuration(t.mode))
    : fullDuration(t.mode);
  t.remainingMs = null;
  t.endTime = Date.now() + r;
  t.status = 'running';
  if (t.mode === 'focus' && !t.currentSessionId) {
    sessionIdCounter++;
    t.currentSessionId = 's' + sessionIdCounter + '-' + Date.now();
  }
  if (t.mode !== 'focus') t.currentSessionId = null;
  scheduleTick();
  renderTimer();
  save();
}

function pause() {
  const t = state.timer;
  if (t.status !== 'running') return;
  const r = Math.max(0, (t.endTime ?? Date.now()) - Date.now());
  t.remainingMs = r;
  t.endTime = null;
  t.status = 'paused';
  clearTick();
  renderTimer();
  save();
}

function reset() {
  const t = state.timer;
  clearTick();
  t.status = 'idle';
  t.endTime = null;
  t.remainingMs = fullDuration(t.mode);
  t.currentSessionId = null;
  renderTimer();
  save();
}

function selectMode(m) {
  if (!['focus','short','long'].includes(m)) return;
  const t = state.timer;
  clearTick();
  t.mode = m;
  t.remainingMs = fullDuration(m);
  t.endTime = null;
  if (t.status === 'running') {
    t.status = 'paused';
  }
  // if idle stays idle; if paused stays paused
  t.currentSessionId = null;
  renderTimer();
  save();
}

function skip() {
  const t = state.timer;
  clearTick();
  if (t.mode === 'focus') {
    // do not count; move to a break based on current cycle position
    t.mode = (t.cycleFocusCount >= 3) ? 'long' : 'short';
  } else {
    t.mode = 'focus';
  }
  t.status = 'idle';
  t.endTime = null;
  t.remainingMs = fullDuration(t.mode);
  t.currentSessionId = null;
  renderAll();
  save();
}

function completeSession() {
  const t = state.timer;
  if (t.completing) return;
  t.completing = true;
  clearTick();
  // clamp display
  t.remainingMs = 0;
  if (t.endTime) t.endTime = Date.now();
  document.getElementById('timerDisplay').textContent = '00:00';

  if (t.mode === 'focus') {
    // advance book once per session
    if (t.currentSessionId && t.lastCountedSessionId !== t.currentSessionId) {
      const book = state.activeBook;
      state.books[book] = clampPage(book, state.books[book] + state.pagesPerSession);
      t.lastCountedSessionId = t.currentSessionId;
    }
    // sessions today
    if (state.timer.sessionsToday.date !== todayKey()) {
      state.timer.sessionsToday = { date: todayKey(), count: 0 };
    }
    state.timer.sessionsToday.count += 1;

    // cycle
    t.cycleFocusCount += 1;
    let nextMode = 'short';
    if (t.cycleFocusCount >= 4) {
      nextMode = 'long';
      t.cycleFocusCount = 0;
    }
    t.mode = nextMode;
  } else {
    t.mode = 'focus';
  }

  t.status = 'idle';
  t.endTime = null;
  t.remainingMs = fullDuration(t.mode);
  t.currentSessionId = null;
  t.completing = false;
  renderAll();
  save();
}

function reconcile() {
  const t = state.timer;
  if (t.status === 'running' && t.endTime) {
    const r = t.endTime - Date.now();
    if (r <= 0) {
      completeSession();
    } else {
      renderTimer();
    }
  }
}

function adjustPage(delta) {
  const b = state.activeBook;
  state.books[b] = clampPage(b, state.books[b] + delta);
  renderBooks();
  renderProgressLine();
  save();
}

function selectBook(book) {
  if (book !== 'A' && book !== 'B') return;
  if (state.activeBook === book) {
    // toggle open/closed
    state.bookOpen[book] = !state.bookOpen[book];
  } else {
    state.activeBook = book;
    // do not change open state of others
  }
  renderBooks();
  renderProgressLine();
  save();
}

function openSettings(open) {
  const panel = document.getElementById('settingsPanel');
  const toggle = document.getElementById('settingsToggle');
  if (open) { panel.hidden = false; toggle.setAttribute('aria-expanded','true'); }
  else { panel.hidden = true; toggle.setAttribute('aria-expanded','false'); }
}

function wireSettings() {
  const toggle = document.getElementById('settingsToggle');
  toggle.addEventListener('click', () => {
    const panel = document.getElementById('settingsPanel');
    openSettings(panel.hidden);
  });
  const apply = () => {
    const f = parseInt(document.getElementById('durFocus').value, 10);
    const s = parseInt(document.getElementById('durShort').value, 10);
    const l = parseInt(document.getElementById('durLong').value, 10);
    const p = parseInt(document.getElementById('pagesPer').value, 10);
    if (Number.isFinite(f) && f > 0) state.durations.focus = f * 60000;
    if (Number.isFinite(s) && s > 0) state.durations.short = s * 60000;
    if (Number.isFinite(l) && l > 0) state.durations.long = l * 60000;
    if (Number.isFinite(p) && p > 0) state.pagesPerSession = p;
    // if idle/paused current mode, refresh remaining
    const t = state.timer;
    if (t.status !== 'running') {
      t.remainingMs = fullDuration(t.mode);
    }
    renderTimer();
    save();
  };
  ['durFocus','durShort','durLong','pagesPer'].forEach(id => {
    document.getElementById(id).addEventListener('change', apply);
  });
}

function wire() {
  document.getElementById('startPauseBtn').addEventListener('click', () => {
    const t = state.timer;
    if (t.status === 'running') pause();
    else start();
  });
  document.getElementById('resetBtn').addEventListener('click', reset);
  document.getElementById('skipBtn').addEventListener('click', skip);
  document.getElementById('pageMinus').addEventListener('click', () => adjustPage(-1));
  document.getElementById('pagePlus').addEventListener('click', () => adjustPage(1));

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => selectMode(btn.dataset.mode));
  });

  ['A','B'].forEach(b => {
    const el = document.getElementById('book' + b);
    const handler = () => selectBook(b);
    el.addEventListener('click', handler);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); }
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) reconcile();
  });

  document.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      const t = state.timer;
      if (t.status === 'running') pause(); else start();
    } else if (e.key === 'r' || e.key === 'R') {
      reset();
    } else if (e.key === 's' || e.key === 'S') {
      skip();
    } else if (e.key === '1') {
      selectMode('focus');
    } else if (e.key === '2') {
      selectMode('short');
    } else if (e.key === '3') {
      selectMode('long');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      adjustPage(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      adjustPage(-1);
    } else if (e.key === 'a' || e.key === 'A') {
      selectBook('A');
    } else if (e.key === 'b' || e.key === 'B') {
      selectBook('B');
    } else if (e.key === 'o' || e.key === 'O') {
      selectBook(state.activeBook);
    }
  });

  wireSettings();
}

function init() {
  load();
  if (state.timer.status === 'running' && state.timer.mode === 'focus' && !state.timer.currentSessionId) {
    sessionIdCounter++;
    state.timer.currentSessionId = 's' + sessionIdCounter + '-' + Date.now();
  }
  // ensure remaining valid
  const t = state.timer;
  if (t.status === 'idle' || t.status === 'paused') {
    if (typeof t.remainingMs !== 'number') t.remainingMs = fullDuration(t.mode);
    t.remainingMs = clamp(t.remainingMs, 0, fullDuration(t.mode));
  }
  // apply open states
  renderAll();
  wire();
  // reconcile on load
  reconcile();
  // if running, schedule tick
  if (state.timer.status === 'running') scheduleTick();
  // apply open classes already in renderBooks
  ['A','B'].forEach(b => {
    document.getElementById('book' + b).classList.toggle('open', !!state.bookOpen[b]);
  });
  save();
}

function initGuarded() {
  if (window.__deskInited) return;
  window.__deskInited = true;
  init();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGuarded, { once: true });
} else {
  initGuarded();
}
