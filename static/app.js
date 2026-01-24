function fmtMood(m) {
  if (m <= 1) return "Very low";
  if (m === 2) return "Low";
  if (m === 3) return "Okay";
  if (m === 4) return "Good";
  return "Great";
}

function initRanges() {
  document.querySelectorAll("[data-range]").forEach((wrap) => {
    const input = wrap.querySelector("input[type=range]");
    const out = wrap.querySelector("[data-range-out]");
    if (!input || !out) return;

    const sync = () => {
      out.textContent = input.value;
    };
    input.addEventListener("input", sync);
    sync();
  });
}

function initChart() {
  const el = document.getElementById("trendChart");
  if (!el || !window.Chart || !window.GS_SERIES) return;

  const s = window.GS_SERIES;
  const ctx = el.getContext("2d");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: s.labels,
      datasets: [
        {
          label: "Mood (1–5)",
          data: s.mood,
          borderColor: "rgba(255, 95, 162, 0.95)",
          backgroundColor: "rgba(255, 95, 162, 0.18)",
          tension: 0.35,
          spanGaps: true,
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: "yMood",
        },
        {
          label: "Stress (0–10)",
          data: s.stress,
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
          data: s.sleep,
          borderColor: "rgba(202, 167, 255, 0.85)",
          backgroundColor: "rgba(202, 167, 255, 0.08)",
          tension: 0.35,
          spanGaps: true,
          borderWidth: 2,
          pointRadius: 2,
          yAxisID: "yScale10",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "rgba(255, 255, 255, 0.8)",
            usePointStyle: true,
            pointStyle: "circle",
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx2) => {
              const v = ctx2.parsed.y;
              if (v == null) return `${ctx2.dataset.label}: —`;
              if (ctx2.dataset.label.startsWith("Mood")) return `${ctx2.dataset.label}: ${v} (${fmtMood(v)})`;
              return `${ctx2.dataset.label}: ${v}`;
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
        },
        yScale10: {
          position: "right",
          min: 0,
          max: 10,
          grid: { drawOnChartArea: false },
          ticks: { color: "rgba(255, 255, 255, 0.65)", stepSize: 2 },
        },
      },
    },
  });
}

window.addEventListener("DOMContentLoaded", () => {
  initRanges();
  initChart();
});
