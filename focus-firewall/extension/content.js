/* =============================================
   Focus Firewall — Content Script
   Injects full-screen overlay on distracting sites
   with 90-second rethink timer and pending tasks
   ============================================= */

(function () {
  'use strict';

  // ——— Storage helpers ———
  function getFromStorage(keys, callback) {
    chrome.storage.local.get(keys, callback);
  }

  function setInStorage(data, callback) {
    chrome.storage.local.set(data, callback || function () { });
  }

  // ——— State ———
  let rethinkInterval = null;
  let rethinkSeconds = 90;

  // ——— Create the main overlay ———
  function createOverlay() {
    if (document.getElementById('ff-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'ff-overlay';

    overlay.innerHTML = `
      <div class="ff-overlay-backdrop"></div>
      <div class="ff-overlay-content" id="ff-main-panel">
        <div class="ff-shield-icon">
          <svg viewBox="0 0 64 64" fill="none" width="90" height="90">
            <path d="M32 4L8 16v16c0 15.46 10.24 29.92 24 32 13.76-2.08 24-16.54 24-32V16L32 4z" 
                  fill="url(#ff-grad)" opacity="0.9"/>
            <path d="M32 12l-16 8v12c0 11.28 6.82 21.76 16 24 9.18-2.24 16-12.72 16-24V20L32 12z" 
                  fill="url(#ff-inner)" opacity="0.5"/>
            <line x1="22" y1="30" x2="42" y2="30" stroke="#FF6584" stroke-width="3" stroke-linecap="round"/>
            <line x1="22" y1="36" x2="42" y2="36" stroke="#FF6584" stroke-width="3" stroke-linecap="round"/>
            <defs>
              <linearGradient id="ff-grad" x1="8" y1="4" x2="56" y2="52">
                <stop stop-color="#6C63FF"/>
                <stop offset="1" stop-color="#FF6584"/>
              </linearGradient>
              <linearGradient id="ff-inner" x1="16" y1="12" x2="48" y2="48">
                <stop stop-color="#6C63FF"/>
                <stop offset="1" stop-color="#4ECDC4"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <h1 class="ff-title">Focus Firewall Activated</h1>
        <p class="ff-message">You planned to study.<br>This site breaks your streak.</p>
        <div class="ff-streak-display">
          <span class="ff-streak-label">Current Streak</span>
          <span class="ff-streak-value" id="ff-streak-val">—</span>
          <span class="ff-streak-unit">days</span>
        </div>
        <div class="ff-actions">
          <button class="ff-btn ff-btn-safe" id="ff-btn-goback" type="button">
            <span class="ff-btn-icon">🛡️</span>
            <span class="ff-btn-label">Go Back — Protect Streak</span>
          </button>
          <button class="ff-btn ff-btn-danger" id="ff-btn-continue" type="button">
            <span class="ff-btn-icon">⚠️</span>
            <span class="ff-btn-label">Continue Anyway — Reset Streak</span>
          </button>
        </div>
        <p class="ff-footer-text">Focus Firewall is keeping you on track.</p>
      </div>

      <!-- Rethink Panel (hidden by default) -->
      <div class="ff-overlay-content ff-rethink-panel" id="ff-rethink-panel" style="display:none;">
        <div class="ff-rethink-header">
          <h2 class="ff-rethink-title">⏳ Take a moment to reconsider</h2>
          <p class="ff-rethink-subtitle">Your streak will reset in:</p>
        </div>
        <div class="ff-countdown-ring" id="ff-countdown-ring">
          <svg viewBox="0 0 120 120" width="140" height="140">
            <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6"/>
            <circle cx="60" cy="60" r="52" fill="none" stroke="url(#ff-timer-grad)" stroke-width="6"
                    stroke-linecap="round" stroke-dasharray="326.73" stroke-dashoffset="0"
                    id="ff-countdown-circle" transform="rotate(-90 60 60)"/>
            <defs>
              <linearGradient id="ff-timer-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop stop-color="#FF6584"/>
                <stop offset="1" stop-color="#6C63FF"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="ff-countdown-number" id="ff-countdown-number">90</span>
          <span class="ff-countdown-label">seconds</span>
        </div>

        <div class="ff-tasks-section" id="ff-tasks-section">
          <h3 class="ff-tasks-title">📋 Your Pending Tasks</h3>
          <div class="ff-tasks-list" id="ff-tasks-list">
            <p class="ff-tasks-empty">Loading your tasks...</p>
          </div>
        </div>

        <div class="ff-rethink-actions">
          <button class="ff-btn ff-btn-safe ff-btn-large" id="ff-btn-changed-mind" type="button">
            <span class="ff-btn-icon">🛡️</span>
            <span class="ff-btn-label">I Changed My Mind — Go Study!</span>
          </button>
          <p class="ff-rethink-note" id="ff-rethink-note">Streak will reset when timer reaches 0...</p>
        </div>
      </div>
    `;

    // Inject into DOM
    function inject() {
      document.body.appendChild(overlay);
      // Small delay to ensure DOM is ready, then bind
      setTimeout(bindAllEvents, 50);
      loadStreakValue();
    }

    if (document.body) {
      inject();
    } else {
      document.addEventListener('DOMContentLoaded', inject);
    }
  }

  // ——— Load streak value ———
  function loadStreakValue() {
    getFromStorage(['ff_streak'], (result) => {
      const el = document.getElementById('ff-streak-val');
      if (el) el.textContent = result.ff_streak || 0;
    });
  }

  // ——— Load tasks from storage ———
  function loadAndRenderTasks() {
    console.log('[Focus Firewall] Loading tasks from chrome.storage.local...');

    getFromStorage(['ff_tasks'], (result) => {
      const tasks = result.ff_tasks || [];
      const listEl = document.getElementById('ff-tasks-list');

      console.log('[Focus Firewall] Tasks found:', tasks.length, 'tasks', tasks);
      console.log('[Focus Firewall] Task list element:', listEl);

      if (!listEl) {
        console.error('[Focus Firewall] Could not find ff-tasks-list element!');
        return;
      }

      const pending = tasks.filter(t => !t.done);
      console.log('[Focus Firewall] Pending tasks:', pending.length);

      if (pending.length === 0) {
        listEl.innerHTML = `
          <p class="ff-tasks-empty">No pending tasks found.</p>
          <p class="ff-tasks-empty" style="font-size: 0.75rem !important; margin-top: 8px !important;">
            Add tasks from the extension popup (+ button) or open Dashboard from the popup menu.
          </p>
        `;
        return;
      }

      listEl.innerHTML = pending.map((task, i) => `
        <div class="ff-task-item">
          <span class="ff-task-priority ff-priority-${task.priority || 'medium'}"></span>
          <span class="ff-task-text">${escapeHtml(task.text)}</span>
          ${task.deadline ? '<span class="ff-task-deadline">📅 ' + escapeHtml(task.deadline) + '</span>' : ''}
        </div>
      `).join('');
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ——— Bind all event handlers ———
  function bindAllEvents() {
    const btnGoBack = document.getElementById('ff-btn-goback');
    const btnContinue = document.getElementById('ff-btn-continue');
    const btnChangedMind = document.getElementById('ff-btn-changed-mind');

    if (btnGoBack) {
      btnGoBack.addEventListener('click', handleGoBack, true);
      btnGoBack.addEventListener('mousedown', stopProp, true);
    }

    if (btnContinue) {
      btnContinue.addEventListener('click', handleContinue, true);
      btnContinue.addEventListener('mousedown', stopProp, true);
    }

    if (btnChangedMind) {
      btnChangedMind.addEventListener('click', handleChangedMind, true);
      btnChangedMind.addEventListener('mousedown', stopProp, true);
    }

    // Block all clicks from reaching the underlying page
    const overlay = document.getElementById('ff-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        // Only stop propagation, don't prevent default for our buttons
        if (!e.target.closest('.ff-btn')) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);
    }
  }

  function stopProp(e) {
    e.stopPropagation();
  }

  // ——— Button Handlers ———
  function handleGoBack(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'https://www.google.com';
    }
  }

  function handleContinue(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Switch to rethink panel
    const mainPanel = document.getElementById('ff-main-panel');
    const rethinkPanel = document.getElementById('ff-rethink-panel');

    if (mainPanel) mainPanel.style.display = 'none';
    if (rethinkPanel) rethinkPanel.style.display = 'flex';

    // Load tasks
    loadAndRenderTasks();

    // Start 90-second countdown
    startRethinkCountdown();
  }

  function handleChangedMind(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    // Stop timer, go back
    if (rethinkInterval) {
      clearInterval(rethinkInterval);
      rethinkInterval = null;
    }

    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'https://www.google.com';
    }
  }

  // ——— Rethink Countdown ———
  function startRethinkCountdown() {
    rethinkSeconds = 90;
    const TOTAL = 90;
    const CIRCUMFERENCE = 2 * Math.PI * 52; // ~326.73

    const numberEl = document.getElementById('ff-countdown-number');
    const circleEl = document.getElementById('ff-countdown-circle');
    const noteEl = document.getElementById('ff-rethink-note');

    updateCountdownDisplay(numberEl, circleEl, CIRCUMFERENCE, TOTAL);

    rethinkInterval = setInterval(() => {
      rethinkSeconds--;
      updateCountdownDisplay(numberEl, circleEl, CIRCUMFERENCE, TOTAL);

      // Warning messages
      if (rethinkSeconds === 60 && noteEl) {
        noteEl.textContent = '⚠️ 60 seconds left... Look at your pending tasks above!';
      } else if (rethinkSeconds === 30 && noteEl) {
        noteEl.textContent = '🚨 30 seconds! Are you really sure about this?';
      } else if (rethinkSeconds === 10 && noteEl) {
        noteEl.textContent = '💔 Last chance to save your streak!';
        noteEl.style.color = '#FF6584';
      }

      if (rethinkSeconds <= 0) {
        clearInterval(rethinkInterval);
        rethinkInterval = null;
        // Reset streak and dismiss
        setInStorage({ ff_streak: 0, ff_last_study_date: null });
        dismissOverlay();
      }
    }, 1000);
  }

  function updateCountdownDisplay(numberEl, circleEl, circumference, total) {
    if (numberEl) numberEl.textContent = rethinkSeconds;
    if (circleEl) {
      const progress = rethinkSeconds / total;
      const offset = circumference * (1 - progress);
      circleEl.setAttribute('stroke-dashoffset', offset);
    }
  }

  function dismissOverlay() {
    const overlay = document.getElementById('ff-overlay');
    if (overlay) {
      overlay.classList.add('ff-dismissing');
      setTimeout(() => overlay.remove(), 400);
    }
  }

  // ——— Boot ———
  createOverlay();

})();
