/* global Chart */

const STORAGE_KEY_PREFIX = "global_sante_checkins_v1";
const USERS_KEY = "global_sante_users_v1";
const SESSION_KEY = "global_sante_session_v1";

function qs(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function isoDate(d) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function storageKeyForUser(userId) {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

function loadUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  const data = raw ? safeParse(raw, []) : [];
  return Array.isArray(data) ? data : [];
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  const data = raw ? safeParse(raw, null) : null;
  if (!data || typeof data !== "object") return null;
  if (!data.userId) return null;
  return { userId: String(data.userId) };
}

function requireSession() {
  const session = loadSession();
  if (!session) {
    const redirect = encodeURIComponent("index.html");
    window.location.replace(`auth.html?redirect=${redirect}`);
    return null;
  }
  return session;
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function loadEntries(userId) {
  const raw = localStorage.getItem(storageKeyForUser(userId));
  const data = raw ? safeParse(raw, []) : [];
  if (!Array.isArray(data)) return [];

  // Normalize
  return data
    .filter((e) => e && typeof e === "object")
    .map((e) => ({
      id: String(e.id ?? uid()),
      date: String(e.date ?? isoDate(new Date())),
      mood: clamp(Number(e.mood ?? 3), 1, 5),
      stress: clamp(Number(e.stress ?? 5), 0, 10),
      sleep: clamp(Number(e.sleep ?? 5), 0, 10),
      journal: String(e.journal ?? ""),
      createdAt: Number(e.createdAt ?? Date.now()),
      updatedAt: Number(e.updatedAt ?? Date.now()),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

function saveEntries(userId, entries) {
  localStorage.setItem(storageKeyForUser(userId), JSON.stringify(entries));
}

function upsertEntry(entries, entry) {
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    const updated = { ...entries[idx], ...entry, updatedAt: Date.now() };
    const next = [...entries];
    next[idx] = updated;
    return next;
  }
  return [{ ...entry, createdAt: Date.now(), updatedAt: Date.now() }, ...entries];
}

function deleteEntry(entries, id) {
  return entries.filter((e) => e.id !== id);
}

function dailyQuote(dateIso) {
  const quotes = [
    { text: "Small steps count. Show up gently.", author: "Global Santé" },
    { text: "You don’t have to feel okay to care for yourself.", author: "Global Santé" },
    { text: "Breathe in. Breathe out. Start again.", author: "Global Santé" },
    { text: "Your feelings are information, not instructions.", author: "Global Santé" },
    { text: "Rest is productive when it helps you return to yourself.", author: "Global Santé" },
    { text: "Notice one thing you did right today.", author: "Global Santé" },
    { text: "It’s okay to take life one hour at a time.", author: "Global Santé" },
  ];

  // Deterministic pick by date
  const seed = Number(dateIso.replaceAll("-", ""));
  const idx = seed % quotes.length;
  return quotes[idx];
}

function lastNDays(n, fromIso) {
  const from = new Date(`${fromIso}T00:00:00`);
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(from);
    d.setDate(d.getDate() - i);
    days.push(isoDate(d));
  }
  return days;
}

function avg(nums) {
  const a = nums.filter((x) => Number.isFinite(x));
  if (a.length === 0) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function moodLabel(m) {
  if (m <= 1) return "Very low";
  if (m === 2) return "Low";
  if (m === 3) return "Okay";
  if (m === 4) return "Good";
  return "Great";
}

function download(filename, text) {
  const el = document.createElement("a");
  el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
  el.setAttribute("download", filename);
  el.style.display = "none";
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

function setup() {
  const session = requireSession();
  if (!session) return;

  const users = loadUsers();
  const me = users.find((u) => u && String(u.id) === session.userId);
  if (!me) {
    clearSession();
    const redirect = encodeURIComponent("index.html");
    window.location.replace(`auth.html?redirect=${redirect}`);
    return;
  }

  const userBadge = qs("#userBadge");
  userBadge.textContent = me.username ? `@${me.username}` : me.email;

  qs("#logoutBtn").addEventListener("click", () => {
    clearSession();
    const redirect = encodeURIComponent("index.html");
    window.location.replace(`auth.html?redirect=${redirect}`);
  });

  const todayIso = isoDate(new Date());

  const todayLine = qs("#todayLine");
  todayLine.textContent = `Today: ${fmtDate(todayIso)}`;

  const { text, author } = dailyQuote(todayIso);
  qs("#quoteText").textContent = text;
  qs("#quoteAuthor").textContent = author;

  const dateInput = qs("#date");
  dateInput.value = todayIso;

  const stress = qs("#stress");
  const sleep = qs("#sleep");
  const stressVal = qs("#stressVal");
  const sleepVal = qs("#sleepVal");

  const syncRanges = () => {
    stressVal.textContent = String(stress.value);
    sleepVal.textContent = String(sleep.value);
  };
  stress.addEventListener("input", syncRanges);
  sleep.addEventListener("input", syncRanges);
  syncRanges();

  let entries = loadEntries(session.userId);

  const chartCtx = qs("#trendChart").getContext("2d");
  let chart = null;

  const alertEl = qs("#formAlert");
  function showAlert(msg) {
    alertEl.hidden = false;
    alertEl.textContent = msg;
    window.clearTimeout(showAlert._t);
    showAlert._t = window.setTimeout(() => {
      alertEl.hidden = true;
      alertEl.textContent = "";
    }, 2500);
  }

  const confirmDialog = qs("#confirmDialog");
  const confirmTitle = qs("#confirmTitle");
  const confirmText = qs("#confirmText");

  async function confirmAction({ title, text }) {
    confirmTitle.textContent = title;
    confirmText.textContent = text;
    confirmDialog.showModal();
    const res = await new Promise((resolve) => {
      confirmDialog.addEventListener(
        "close",
        () => {
          resolve(confirmDialog.returnValue);
        },
        { once: true }
      );
    });
    return res === "ok";
  }

  function getFormData() {
    const form = qs("#checkinForm");
    const fd = new FormData(form);

    const date = String(fd.get("date") || "");
    const mood = Number(fd.get("mood"));
    const stressN = Number(fd.get("stress"));
    const sleepN = Number(fd.get("sleep"));
    const journal = String(fd.get("journal") || "").trim();

    if (!date) throw new Error("Please choose a date.");
    if (!Number.isFinite(mood) || mood < 1 || mood > 5) throw new Error("Please select a mood (1–5).");

    return {
      date,
      mood: clamp(mood, 1, 5),
      stress: clamp(stressN, 0, 10),
      sleep: clamp(sleepN, 0, 10),
      journal,
    };
  }

  function setEditing(entry) {
    qs("#editingId").value = entry ? entry.id : "";
    qs("#cancelEditBtn").hidden = !entry;
    qs("#saveBtn").textContent = entry ? "Update check-in" : "Save check-in";

    if (!entry) {
      dateInput.value = todayIso;
      stress.value = "5";
      sleep.value = "5";
      qs("#journal").value = "";
      const mood3 = qs("#mood3");
      mood3.checked = true;
      syncRanges();
      return;
    }

    dateInput.value = entry.date;
    stress.value = String(entry.stress);
    sleep.value = String(entry.sleep);
    qs("#journal").value = entry.journal || "";

    const moodEl = qs(`#mood${entry.mood}`);
    moodEl.checked = true;
    syncRanges();
  }

  function getWeeklySeries() {
    const days = lastNDays(7, todayIso);

    const byDate = new Map();
    for (const e of entries) {
      // Keep latest by date
      const prev = byDate.get(e.date);
      if (!prev || e.updatedAt > prev.updatedAt) byDate.set(e.date, e);
    }

    const mood = days.map((d) => (byDate.get(d) ? byDate.get(d).mood : null));
    const stressS = days.map((d) => (byDate.get(d) ? byDate.get(d).stress : null));
    const sleepS = days.map((d) => (byDate.get(d) ? byDate.get(d).sleep : null));

    return { days, mood, stress: stressS, sleep: sleepS };
  }

  function renderStats() {
    const { mood, stress, sleep } = getWeeklySeries();
    const moodAvg = avg(mood);
    const stressAvg = avg(stress);
    const sleepAvg = avg(sleep);

    const el = qs("#stats");
    el.innerHTML = "";

    const mk = (k, v) => {
      const d = document.createElement("div");
      d.className = "stat";
      d.innerHTML = `<div class="k">${k}</div><div class="v">${v}</div>`;
      return d;
    };

    el.appendChild(mk("Avg mood", moodAvg == null ? "—" : `${moodAvg.toFixed(1)} / 5`));
    el.appendChild(mk("Avg stress", stressAvg == null ? "—" : `${stressAvg.toFixed(1)} / 10`));
    el.appendChild(mk("Avg sleep", sleepAvg == null ? "—" : `${sleepAvg.toFixed(1)} / 10`));
  }

  function renderChart() {
    const { days, mood, stress, sleep } = getWeeklySeries();

    const labels = days.map((d) => {
      const dt = new Date(`${d}T00:00:00`);
      return dt.toLocaleDateString(undefined, { weekday: "short" });
    });

    const data = {
      labels,
      datasets: [
        {
          label: "Mood (1–5)",
          data: mood,
          borderColor: "rgba(74, 214, 200, 0.95)",
          backgroundColor: "rgba(74, 214, 200, 0.20)",
          tension: 0.35,
          spanGaps: true,
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: "yMood",
        },
        {
          label: "Stress (0–10)",
          data: stress,
          borderColor: "rgba(255, 255, 255, 0.65)",
          backgroundColor: "rgba(255, 255, 255, 0.06)",
          tension: 0.35,
          spanGaps: true,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: "yScale10",
        },
        {
          label: "Sleep (0–10)",
          data: sleep,
          borderColor: "rgba(141, 232, 221, 0.75)",
          backgroundColor: "rgba(141, 232, 221, 0.06)",
          tension: 0.35,
          spanGaps: true,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: "yScale10",
        },
      ],
    };

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "rgba(255, 255, 255, 0.78)",
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (v == null) return `${ctx.dataset.label}: —`;
              if (ctx.dataset.label.startsWith("Mood")) return `${ctx.dataset.label}: ${v} (${moodLabel(v)})`;
              return `${ctx.dataset.label}: ${v}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.06)" },
          ticks: { color: "rgba(255, 255, 255, 0.65)" },
        },
        yMood: {
          position: "left",
          min: 1,
          max: 5,
          grid: { color: "rgba(255, 255, 255, 0.06)" },
          ticks: { color: "rgba(255, 255, 255, 0.65)", stepSize: 1 },
          title: { display: true, text: "Mood", color: "rgba(255, 255, 255, 0.55)", font: { weight: "600" } },
        },
        yScale10: {
          position: "right",
          min: 0,
          max: 10,
          grid: { drawOnChartArea: false },
          ticks: { color: "rgba(255, 255, 255, 0.65)", stepSize: 2 },
          title: { display: true, text: "Stress / Sleep", color: "rgba(255, 255, 255, 0.55)", font: { weight: "600" } },
        },
      },
    };

    if (!chart) {
      chart = new Chart(chartCtx, { type: "line", data, options });
      return;
    }

    chart.data = data;
    chart.options = options;
    chart.update();
  }

  function renderHistory() {
    const list = qs("#historyList");
    const empty = qs("#historyEmpty");
    const search = qs("#search").value.trim().toLowerCase();

    const filtered = entries.filter((e) => {
      if (!search) return true;
      return (e.journal || "").toLowerCase().includes(search) || e.date.includes(search);
    });

    list.innerHTML = "";
    empty.hidden = filtered.length !== 0;

    for (const e of filtered) {
      const el = document.createElement("div");
      el.className = "entry";

      const noteHtml = e.journal ? `<div class="entry-note">${escapeHtml(e.journal)}</div>` : "";

      el.innerHTML = `
        <div class="entry-top">
          <div>
            <div class="entry-date">${fmtDate(e.date)}</div>
            <div class="entry-meta">
              <span class="badge">Mood: <b>${e.mood}</b> (${moodLabel(e.mood)})</span>
              <span class="badge">Stress: <b>${e.stress}</b>/10</span>
              <span class="badge">Sleep: <b>${e.sleep}</b>/10</span>
            </div>
          </div>
          <div class="entry-actions">
            <button class="btn btn-ghost" type="button" data-action="edit" data-id="${e.id}">Edit</button>
            <button class="btn btn-ghost" type="button" data-action="delete" data-id="${e.id}">Delete</button>
          </div>
        </div>
        ${noteHtml}
      `;

      list.appendChild(el);
    }

    list.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const action = btn.getAttribute("data-action");
        const id = btn.getAttribute("data-id");
        const entry = entries.find((x) => x.id === id);
        if (!id || !entry) return;

        if (action === "edit") {
          setEditing(entry);
          showAlert("Editing entry — update and save.");
        }

        if (action === "delete") {
          const ok = await confirmAction({
            title: "Delete entry",
            text: "This will permanently remove this check-in from this device.",
          });
          if (!ok) return;
          entries = deleteEntry(entries, id);
          saveEntries(session.userId, entries);
          setEditing(null);
          renderAll();
          showAlert("Entry deleted.");
        }
      });
    });
  }

  function renderAll() {
    renderChart();
    renderStats();
    renderHistory();
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  qs("#checkinForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    try {
      const data = getFormData();
      const editingId = qs("#editingId").value;
      const entry = {
        id: editingId || uid(),
        ...data,
      };

      entries = upsertEntry(entries, entry).sort((a, b) => (a.date < b.date ? 1 : -1));
      saveEntries(session.userId, entries);
      setEditing(null);
      renderAll();
      showAlert(editingId ? "Check-in updated." : "Check-in saved.");
    } catch (err) {
      showAlert(err instanceof Error ? err.message : "Could not save.");
    }
  });

  qs("#cancelEditBtn").addEventListener("click", () => {
    setEditing(null);
    showAlert("Edit canceled.");
  });

  qs("#search").addEventListener("input", () => {
    renderHistory();
  });

  qs("#exportBtn").addEventListener("click", () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      user: {
        id: me.id,
        email: me.email,
        username: me.username,
      },
      entries,
    };
    download(`global-sante-export-${todayIso}.json`, JSON.stringify(payload, null, 2));
    showAlert("Export downloaded.");
  });

  qs("#clearAllBtn").addEventListener("click", async () => {
    const ok = await confirmAction({
      title: "Clear all data",
      text: "This will delete all saved check-ins from this device.",
    });
    if (!ok) return;

    entries = [];
    saveEntries(session.userId, entries);
    setEditing(null);
    renderAll();
    showAlert("All entries cleared.");
  });

  // Default mood selection
  qs("#mood3").checked = true;

  renderAll();
}

window.addEventListener("DOMContentLoaded", () => {
  try {
    setup();
  } catch (err) {
    // Fail visibly
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.padding = "16px";
    pre.textContent = err instanceof Error ? err.stack || err.message : String(err);
    document.body.prepend(pre);
  }
});
