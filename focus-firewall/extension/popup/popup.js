/* =============================================
   Focus Firewall — Popup Script
   chrome.storage.local as single source of truth
   Now includes quick-add tasks
   ============================================= */

(function () {
  'use strict';

  const els = {
    streak: document.getElementById('popupStreak'),
    streakBar: document.getElementById('popupStreakBar'),
    statusDot: document.getElementById('popupStatusDot'),
    statusText: document.getElementById('popupStatusText'),
    startBtn: document.getElementById('popupStartBtn'),
    stopBtn: document.getElementById('popupStopBtn'),
    dashboardBtn: document.getElementById('popupDashboardBtn'),
    taskInput: document.getElementById('popupTaskInput'),
    addTaskBtn: document.getElementById('popupAddTaskBtn'),
    taskCount: document.getElementById('popupTaskCount'),
  };

  // ——— Load state from chrome.storage ———
  function loadState() {
    chrome.storage.local.get(
      ['ff_streak', 'ff_session_active', 'ff_session_start', 'ff_tasks'],
      (result) => {
        const streak = result.ff_streak || 0;
        const active = result.ff_session_active || false;
        const tasks = result.ff_tasks || [];

        // Streak display
        els.streak.textContent = streak;
        const pct = Math.min((streak / 7) * 100, 100);
        els.streakBar.style.width = pct + '%';

        // Session status
        if (active) {
          els.statusDot.classList.add('active');
          els.statusText.textContent = 'Studying';
          els.startBtn.style.display = 'none';
          els.stopBtn.style.display = 'flex';
        } else {
          els.statusDot.classList.remove('active');
          els.statusText.textContent = 'Not studying';
          els.startBtn.style.display = 'flex';
          els.stopBtn.style.display = 'none';
        }

        // Task count
        const pending = tasks.filter(t => !t.done).length;
        els.taskCount.textContent = pending + ' pending task' + (pending !== 1 ? 's' : '');
      }
    );
  }

  function getToday() {
    return new Date().toISOString().slice(0, 10);
  }

  // ——— Start session ———
  els.startBtn.addEventListener('click', () => {
    const today = getToday();

    chrome.storage.local.get(['ff_streak', 'ff_last_study_date', 'ff_best_streak', 'ff_total_sessions'], (result) => {
      let streak = result.ff_streak || 0;
      const lastDate = result.ff_last_study_date || null;
      let bestStreak = result.ff_best_streak || 0;
      let totalSessions = result.ff_total_sessions || 0;

      if (lastDate !== today) {
        streak += 1;
      }

      if (streak > bestStreak) {
        bestStreak = streak;
      }

      totalSessions += 1;

      chrome.storage.local.set({
        ff_session_active: true,
        ff_session_start: Date.now(),
        ff_streak: streak,
        ff_last_study_date: today,
        ff_best_streak: bestStreak,
        ff_total_sessions: totalSessions,
      }, () => {
        loadState();
      });
    });
  });

  // ——— Stop session ———
  els.stopBtn.addEventListener('click', () => {
    chrome.storage.local.set({ ff_session_active: false }, () => {
      loadState();
    });
  });

  // ——— Quick Add Task ———
  function quickAddTask() {
    const text = els.taskInput.value.trim();
    if (!text) return;

    chrome.storage.local.get(['ff_tasks'], (result) => {
      const tasks = result.ff_tasks || [];

      tasks.unshift({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        text: text,
        priority: 'medium',
        deadline: null,
        done: false,
        createdAt: Date.now(),
      });

      chrome.storage.local.set({ ff_tasks: tasks }, () => {
        els.taskInput.value = '';
        loadState();
      });
    });
  }

  els.addTaskBtn.addEventListener('click', quickAddTask);
  els.taskInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') quickAddTask();
  });

  // ——— Open dashboard ———
  els.dashboardBtn.addEventListener('click', () => {
    const dashboardUrl = chrome.runtime.getURL('dashboard/index.html');
    chrome.tabs.create({ url: dashboardUrl });
  });

  // ——— Live sync ———
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') loadState();
  });

  // ——— Init ———
  loadState();
})();
