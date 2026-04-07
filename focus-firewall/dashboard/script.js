/* =============================================
   Focus Firewall — Dashboard Logic
   Unified storage: chrome.storage when running
   as extension page, localStorage as fallback
   ============================================= */

(function () {
  'use strict';

  // ——— Detect extension context ———
  const isExtension = !!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local);

  // ——— Constants ———
  const STORAGE_KEYS = {
    streak: 'ff_streak',
    bestStreak: 'ff_best_streak',
    lastStudyDate: 'ff_last_study_date',
    sessionActive: 'ff_session_active',
    sessionStart: 'ff_session_start',
    todayMinutes: 'ff_today_minutes',
    todayDate: 'ff_today_date',
    totalMinutes: 'ff_total_minutes',
    totalSessions: 'ff_total_sessions',
    weekData: 'ff_week_data',
    tasks: 'ff_tasks',
  };

  const ALL_KEYS = Object.values(STORAGE_KEYS);

  const MOTIVATIONAL_INSIGHTS = [
    { text: "Your brain rewires itself every time you resist distraction. Each focused minute is literally building a stronger mind.", tag: "neuroscience" },
    { text: "The compound effect of consistency: 1 hour daily for 30 days = 30 hours of deep learning. That's more than most people do in 6 months of scattered effort.", tag: "compound effect" },
    { text: "Flow state typically kicks in after 15-23 minutes of uninterrupted focus. Push past the initial resistance — the reward is waiting.", tag: "flow state" },
    { text: "Studies show it takes 23 minutes to refocus after a distraction. Every time you resist checking social media, you save nearly half an hour.", tag: "productivity" },
    { text: "Your streak isn't just a number — it's evidence of your commitment. Every day you show up, you're voting for the person you want to become.", tag: "identity" },
    { text: "The Zeigarnik Effect: your brain remembers incomplete tasks better than complete ones. Start studying and your mind will naturally want to finish.", tag: "psychology" },
    { text: "Elite performers in any field share one trait: they protect their focus time fiercely. You're developing the same skill right now.", tag: "excellence" },
    { text: "Dopamine from social media is borrowed happiness from your future self. Real satisfaction comes from meaningful progress.", tag: "dopamine" },
    { text: "A 10-day streak means you've beaten over 14,000 potential distractions. That's not discipline — that's mastery.", tag: "mastery" },
    { text: "Research shows that students who study in focused blocks retain 50% more than those who study while multitasking. Quality beats quantity.", tag: "research" },
    { text: "The hardest part isn't the studying — it's starting. You've already conquered that by opening this dashboard.", tag: "momentum" },
    { text: "Your future self is watching you right now through memories. Make them proud.", tag: "perspective" },
    { text: "Consistency doesn't mean perfection. It means showing up again after you miss a day. Your streak is reset-proof if your mindset isn't.", tag: "resilience" },
    { text: "The difference between an expert and a beginner? About 1,000 focused hours. Every session counts.", tag: "expertise" },
    { text: "Willpower is like a muscle — it gets stronger with use. Each distraction you resist makes the next one easier to handle.", tag: "willpower" },
  ];

  // ——— State ———
  let timerInterval = null;
  let sessionSeconds = 0;
  let currentFilter = 'all';

  // ————————————————————————————————————
  // UNIFIED STORAGE LAYER
  // Uses chrome.storage.local in extension context
  // Falls back to localStorage for standalone mode
  // ————————————————————————————————————

  function store(key, value) {
    // Always write to localStorage as cache
    localStorage.setItem(key, JSON.stringify(value));

    // Also write to chrome.storage if in extension context
    if (isExtension) {
      const obj = {};
      obj[key] = value;
      chrome.storage.local.set(obj);
    }
  }

  function load(key, fallback) {
    // Synchronous read from localStorage (works as cache)
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  // Pull all data from chrome.storage into localStorage on init
  function syncFromExtension(callback) {
    if (!isExtension) {
      callback();
      return;
    }

    chrome.storage.local.get(ALL_KEYS, (result) => {
      // Merge: chrome.storage wins for keys that exist there
      for (const key of ALL_KEYS) {
        if (result[key] !== undefined) {
          localStorage.setItem(key, JSON.stringify(result[key]));
        } else {
          // If localStorage has data but chrome.storage doesn't, push it up
          const localVal = localStorage.getItem(key);
          if (localVal !== null) {
            const obj = {};
            try {
              obj[key] = JSON.parse(localVal);
              chrome.storage.local.set(obj);
            } catch { /* skip bad data */ }
          }
        }
      }
      callback();
    });
  }

  // ——— Helpers ———
  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  function getDayOfWeek() {
    return new Date().getDay();
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  // ——— DOM refs ———
  const $ = (id) => document.getElementById(id);

  const els = {
    streakNumber: $('streakNumber'),
    streakBar: $('streakBar'),
    streakGoal: $('streakGoal'),
    streakSubtitle: $('streakSubtitle'),
    streakBadge: $('streakBadge'),
    timerMinutes: $('timerMinutes'),
    timerSeconds: $('timerSeconds'),
    btnStart: $('btnStartSession'),
    btnEnd: $('btnEndSession'),
    statusDot: $('statusDot'),
    statusText: $('statusText'),
    sessionCard: $('sessionCard'),
    todayMinutes: $('todayMinutes'),
    totalMinutes: $('totalMinutes'),
    insightText: $('insightText'),
    insightTag: $('insightTag'),
    btnRefresh: $('btnRefreshInsight'),
    weekChart: $('weekChart'),
    statBestStreak: $('statBestStreak'),
    statSessions: $('statSessions'),
    statHours: $('statHours'),
    // Tasks
    taskInput: $('taskInput'),
    taskPriority: $('taskPriority'),
    taskDeadline: $('taskDeadline'),
    btnAddTask: $('btnAddTask'),
    taskList: $('taskList'),
    taskEmpty: $('taskEmpty'),
    taskFilters: $('taskFilters'),
    taskPendingCount: $('taskPendingCount'),
    taskDoneCount: $('taskDoneCount'),
  };

  // ——— Init ———
  function init() {
    createParticles();

    // Sync from chrome.storage first (if in extension), then render everything
    syncFromExtension(() => {
      checkStreakContinuity();
      renderStreak();
      renderSessionInfo();
      renderInsight();
      renderWeekChart();
      renderStats();
      renderTasks();
      checkActiveSession();
      bindEvents();
    });

    // Listen for chrome.storage changes from popup/content script
    if (isExtension) {
      chrome.storage.onChanged.addListener(onChromeStorageChange);
    }
    // Also listen for localStorage changes (cross-tab)
    window.addEventListener('storage', onLocalStorageChange);
  }

  // ——— Background Particles ———
  function createParticles() {
    const container = $('bgParticles');
    for (let i = 0; i < 25; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.animationDuration = (8 + Math.random() * 14) + 's';
      p.style.animationDelay = Math.random() * 10 + 's';
      p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
      p.style.background = [
        'rgba(108,99,255,0.3)',
        'rgba(255,101,132,0.25)',
        'rgba(78,205,196,0.25)',
      ][Math.floor(Math.random() * 3)];
      container.appendChild(p);
    }
  }

  // ——— Streak Logic ———
  function checkStreakContinuity() {
    const lastDate = load(STORAGE_KEYS.lastStudyDate, null);
    if (!lastDate) return;

    const today = getToday();
    if (lastDate === today) return;

    const last = new Date(lastDate);
    const now = new Date(today);
    const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));

    if (diffDays > 1) {
      store(STORAGE_KEYS.streak, 0);
    }
  }

  function renderStreak() {
    const streak = load(STORAGE_KEYS.streak, 0);
    els.streakNumber.textContent = streak;

    const goal = 7;
    const pct = Math.min((streak / goal) * 100, 100);
    els.streakBar.style.width = pct + '%';

    if (streak === 0) {
      els.streakSubtitle.textContent = 'Start your first session to begin a streak!';
      els.streakBadge.textContent = '🔥';
    } else if (streak < 3) {
      els.streakSubtitle.textContent = 'Great start! Keep the momentum going.';
      els.streakBadge.textContent = '🔥';
    } else if (streak < 7) {
      els.streakSubtitle.textContent = 'You\'re on fire! Almost at your weekly goal.';
      els.streakBadge.textContent = '🔥';
    } else if (streak < 14) {
      els.streakSubtitle.textContent = 'Incredible! You\'ve built a solid habit.';
      els.streakBadge.textContent = '⚡';
    } else if (streak < 30) {
      els.streakSubtitle.textContent = 'Unstoppable! You\'re a focus master.';
      els.streakBadge.textContent = '💎';
    } else {
      els.streakSubtitle.textContent = 'Legendary streak! Nothing can stop you.';
      els.streakBadge.textContent = '👑';
    }
  }

  function incrementStreak() {
    const today = getToday();
    const lastDate = load(STORAGE_KEYS.lastStudyDate, null);

    if (lastDate === today) return;

    let streak = load(STORAGE_KEYS.streak, 0);
    streak += 1;
    store(STORAGE_KEYS.streak, streak);
    store(STORAGE_KEYS.lastStudyDate, today);

    const best = load(STORAGE_KEYS.bestStreak, 0);
    if (streak > best) {
      store(STORAGE_KEYS.bestStreak, streak);
    }

    renderStreak();
    els.streakNumber.classList.add('bump');
    setTimeout(() => els.streakNumber.classList.remove('bump'), 500);
  }

  function resetStreak() {
    store(STORAGE_KEYS.streak, 0);
    store(STORAGE_KEYS.lastStudyDate, null);
    renderStreak();
    els.streakNumber.classList.add('reset');
    setTimeout(() => els.streakNumber.classList.remove('reset'), 600);
    renderStats();
  }

  window.focusFirewall = { resetStreak };

  // ——— Session Logic ———
  function checkActiveSession() {
    const active = load(STORAGE_KEYS.sessionActive, false);
    if (active) {
      const startTime = load(STORAGE_KEYS.sessionStart, Date.now());
      sessionSeconds = Math.floor((Date.now() - startTime) / 1000);
      startTimer();
      setActiveUI(true);
    } else {
      // Make sure UI reflects stopped state
      if (timerInterval) stopTimer();
      setActiveUI(false);
    }
  }

  function startSession() {
    store(STORAGE_KEYS.sessionActive, true);
    store(STORAGE_KEYS.sessionStart, Date.now());
    sessionSeconds = 0;
    incrementStreak();
    startTimer();
    setActiveUI(true);

    const sessions = load(STORAGE_KEYS.totalSessions, 0);
    store(STORAGE_KEYS.totalSessions, sessions + 1);
    renderStats();
  }

  function endSession() {
    stopTimer();
    store(STORAGE_KEYS.sessionActive, false);
    setActiveUI(false);

    const mins = Math.floor(sessionSeconds / 60);
    saveTodayMinutes(mins);
    saveWeekData(mins);
    renderSessionInfo();
    renderWeekChart();
    renderStats();
    sessionSeconds = 0;
    updateTimerDisplay();
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      sessionSeconds++;
      updateTimerDisplay();
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function updateTimerDisplay() {
    const m = Math.floor(sessionSeconds / 60);
    const s = sessionSeconds % 60;
    els.timerMinutes.textContent = pad(m);
    els.timerSeconds.textContent = pad(s);
  }

  function setActiveUI(active) {
    if (active) {
      els.btnStart.style.display = 'none';
      els.btnEnd.style.display = 'inline-flex';
      els.statusDot.classList.add('active');
      els.statusText.textContent = 'Studying';
      els.sessionCard.classList.add('active');
    } else {
      els.btnStart.style.display = 'inline-flex';
      els.btnEnd.style.display = 'none';
      els.statusDot.classList.remove('active');
      els.statusText.textContent = 'Idle';
      els.sessionCard.classList.remove('active');
    }
  }

  function saveTodayMinutes(mins) {
    const today = getToday();
    const savedDate = load(STORAGE_KEYS.todayDate, '');
    let todayMins = 0;
    if (savedDate === today) {
      todayMins = load(STORAGE_KEYS.todayMinutes, 0);
    }
    todayMins += mins;
    store(STORAGE_KEYS.todayMinutes, todayMins);
    store(STORAGE_KEYS.todayDate, today);

    const totalMins = load(STORAGE_KEYS.totalMinutes, 0) + mins;
    store(STORAGE_KEYS.totalMinutes, totalMins);
  }

  function renderSessionInfo() {
    const today = getToday();
    const savedDate = load(STORAGE_KEYS.todayDate, '');
    const todayMins = savedDate === today ? load(STORAGE_KEYS.todayMinutes, 0) : 0;
    const totalMins = load(STORAGE_KEYS.totalMinutes, 0);

    els.todayMinutes.textContent = todayMins + ' min';
    els.totalMinutes.textContent = totalMins + ' min';
  }

  // ——— Week Data ———
  function saveWeekData(mins) {
    const dayIndex = getDayOfWeek();
    const weekData = load(STORAGE_KEYS.weekData, [0, 0, 0, 0, 0, 0, 0]);
    weekData[dayIndex] = (weekData[dayIndex] || 0) + mins;
    store(STORAGE_KEYS.weekData, weekData);
  }

  function renderWeekChart() {
    const weekData = load(STORAGE_KEYS.weekData, [0, 0, 0, 0, 0, 0, 0]);
    const maxMins = Math.max(...weekData, 1);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayIdx = getDayOfWeek();

    els.weekChart.innerHTML = '';

    days.forEach((day, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'chart-bar-wrapper';

      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      if (i === todayIdx) bar.classList.add('today');
      if (weekData[i] === 0) bar.classList.add('empty');

      const height = weekData[i] > 0 ? Math.max((weekData[i] / maxMins) * 80, 8) : 4;
      bar.style.height = height + 'px';
      bar.title = weekData[i] + ' min';

      const label = document.createElement('span');
      label.className = 'chart-day' + (i === todayIdx ? ' today' : '');
      label.textContent = day;

      wrapper.appendChild(bar);
      wrapper.appendChild(label);
      els.weekChart.appendChild(wrapper);
    });
  }

  // ——— Stats ———
  function renderStats() {
    els.statBestStreak.textContent = load(STORAGE_KEYS.bestStreak, 0);
    els.statSessions.textContent = load(STORAGE_KEYS.totalSessions, 0);
    const totalMins = load(STORAGE_KEYS.totalMinutes, 0);
    const hours = (totalMins / 60).toFixed(1);
    els.statHours.textContent = hours + 'h';
  }

  // ——— Insight ———
  function renderInsight() {
    const idx = Math.floor(Math.random() * MOTIVATIONAL_INSIGHTS.length);
    const insight = MOTIVATIONAL_INSIGHTS[idx];
    els.insightText.textContent = insight.text;
    els.insightTag.textContent = insight.tag;
  }

  // ——— Storage Change Listeners ———

  // chrome.storage changes (from popup or content script)
  function onChromeStorageChange(changes, area) {
    if (area !== 'local') return;

    // Sync changed values into localStorage cache
    for (const key of Object.keys(changes)) {
      if (changes[key].newValue !== undefined) {
        localStorage.setItem(key, JSON.stringify(changes[key].newValue));
      }
    }

    // Re-render affected UI
    if (changes[STORAGE_KEYS.streak] || changes[STORAGE_KEYS.lastStudyDate]) {
      renderStreak();
      renderStats();
    }
    if (changes[STORAGE_KEYS.sessionActive]) {
      checkActiveSession();
    }
    if (changes[STORAGE_KEYS.tasks]) {
      renderTasks();
    }
  }

  // localStorage changes (cross-tab, standalone mode)
  function onLocalStorageChange(e) {
    if (e.key === STORAGE_KEYS.streak) {
      renderStreak();
      renderStats();
    }
    if (e.key === STORAGE_KEYS.sessionActive) {
      checkActiveSession();
    }
    if (e.key === STORAGE_KEYS.tasks) {
      renderTasks();
    }
  }

  // ——— Tasks Logic ———
  function getTasks() {
    return load(STORAGE_KEYS.tasks, []);
  }

  function saveTasks(tasks) {
    store(STORAGE_KEYS.tasks, tasks);
  }

  function addTask() {
    const text = els.taskInput.value.trim();
    if (!text) {
      els.taskInput.focus();
      return;
    }

    const tasks = getTasks();
    tasks.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      text: text,
      priority: els.taskPriority.value,
      deadline: els.taskDeadline.value || null,
      done: false,
      createdAt: Date.now(),
    });

    saveTasks(tasks);
    els.taskInput.value = '';
    els.taskDeadline.value = '';
    renderTasks();
  }

  function toggleTask(id) {
    const tasks = getTasks();
    const task = tasks.find(t => t.id === id);
    if (task) {
      task.done = !task.done;
      saveTasks(tasks);
      renderTasks();
    }
  }

  function deleteTask(id) {
    let tasks = getTasks();
    tasks = tasks.filter(t => t.id !== id);
    saveTasks(tasks);
    renderTasks();
  }

  function renderTasks() {
    const tasks = getTasks();
    const filtered = tasks.filter(t => {
      if (currentFilter === 'pending') return !t.done;
      if (currentFilter === 'done') return t.done;
      return true;
    });

    const pending = tasks.filter(t => !t.done).length;
    const done = tasks.filter(t => t.done).length;

    els.taskPendingCount.textContent = pending + ' pending';
    els.taskDoneCount.textContent = done + ' done';

    if (filtered.length === 0) {
      els.taskList.innerHTML = '';
      const emptyMsg = currentFilter === 'done'
        ? 'No completed tasks yet.'
        : currentFilter === 'pending'
          ? 'All done! 🎉'
          : 'No tasks yet. Add your first assignment above!';
      els.taskList.innerHTML = '<p class="task-empty">' + emptyMsg + '</p>';
      return;
    }

    const today = getToday();
    els.taskList.innerHTML = filtered.map(task => {
      const isOverdue = task.deadline && !task.done && task.deadline < today;
      return `
        <div class="task-item ${task.done ? 'done' : ''}" data-id="${task.id}">
          <button class="task-check ${task.done ? 'checked' : ''}" data-action="toggle" data-id="${task.id}">
            ${task.done ? '✓' : ''}
          </button>
          <span class="task-priority-dot ${task.priority}"></span>
          <span class="task-text">${escapeHtml(task.text)}</span>
          ${task.deadline ? '<span class="task-deadline ' + (isOverdue ? 'overdue' : '') + '">📅 ' + task.deadline + '</span>' : ''}
          <button class="task-delete" data-action="delete" data-id="${task.id}" title="Delete task">✕</button>
        </div>
      `;
    }).join('');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ——— Events ———
  function bindEvents() {
    els.btnStart.addEventListener('click', startSession);
    els.btnEnd.addEventListener('click', endSession);
    els.btnRefresh.addEventListener('click', () => {
      els.btnRefresh.style.transform = 'rotate(360deg)';
      setTimeout(() => (els.btnRefresh.style.transform = ''), 400);
      renderInsight();
    });

    // Tasks
    els.btnAddTask.addEventListener('click', addTask);
    els.taskInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTask();
    });

    // Task list delegation (toggle + delete)
    els.taskList.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'toggle') toggleTask(id);
      if (action === 'delete') deleteTask(id);
    });

    // Filter tabs
    els.taskFilters.addEventListener('click', (e) => {
      const filterBtn = e.target.closest('.task-filter');
      if (!filterBtn) return;
      els.taskFilters.querySelectorAll('.task-filter').forEach(b => b.classList.remove('active'));
      filterBtn.classList.add('active');
      currentFilter = filterBtn.dataset.filter;
      renderTasks();
    });
  }

  // ——— Boot ———
  document.addEventListener('DOMContentLoaded', init);
})();
