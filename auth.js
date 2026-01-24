const USERS_KEY = "global_sante_users_v1";
const SESSION_KEY = "global_sante_session_v1";

function qs(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

function loadUsers() {
  const raw = localStorage.getItem(USERS_KEY);
  const data = raw ? safeParse(raw, []) : [];
  return Array.isArray(data) ? data : [];
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(`${salt}:${password}`));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function uid() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function showAlert(msg) {
  const el = qs("#authAlert");
  el.hidden = false;
  el.textContent = msg;
  window.clearTimeout(showAlert._t);
  showAlert._t = window.setTimeout(() => {
    el.hidden = true;
    el.textContent = "";
  }, 2600);
}

function dailyQuote(dateIso) {
  const quotes = [
    { text: "This is a fresh start — take it gently.", author: "Global Santé" },
    { text: "You deserve care, especially from yourself.", author: "Global Santé" },
    { text: "A calm mind begins with one slow breath.", author: "Global Santé" },
    { text: "Consistency beats perfection.", author: "Global Santé" },
    { text: "Your wellbeing matters.", author: "Global Santé" },
    { text: "Show up for yourself in small ways.", author: "Global Santé" },
    { text: "You can do hard things — softly.", author: "Global Santé" },
  ];
  const seed = Number(String(dateIso).replaceAll("-", ""));
  return quotes[seed % quotes.length];
}

function isoDate(d) {
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function setSession(userId) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      userId,
      createdAt: Date.now(),
    })
  );
}

function loadSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  const data = raw ? safeParse(raw, null) : null;
  if (!data || typeof data !== "object") return null;
  if (!data.userId) return null;
  return { userId: String(data.userId) };
}

function getRedirect() {
  const url = new URL(window.location.href);
  return url.searchParams.get("redirect") || "index.html";
}

function setMode(mode) {
  const isRegister = mode === "register";
  qs("#usernameField").hidden = !isRegister;
  qs("#title").textContent = isRegister ? "Create an account" : "Sign in";
  qs("#subtitle").textContent = isRegister
    ? "Register to save your check-ins under your account"
    : "Use your account to access your check-ins";
  qs("#submitBtn").textContent = isRegister ? "Register" : "Login";

  if (isRegister) {
    qs("#username").setAttribute("required", "required");
  } else {
    qs("#username").removeAttribute("required");
  }
}

async function setup() {
  const existingSession = loadSession();
  if (existingSession) {
    const users = loadUsers();
    const me = users.find((u) => u && String(u.id) === existingSession.userId);
    if (me) {
      window.location.replace(getRedirect());
      return;
    }
    localStorage.removeItem(SESSION_KEY);
  }

  const todayIso = isoDate(new Date());
  const q = dailyQuote(todayIso);
  qs("#quoteText").textContent = q.text;
  qs("#quoteAuthor").textContent = q.author;

  const modeLogin = qs("#modeLogin");
  const modeRegister = qs("#modeRegister");

  modeLogin.addEventListener("change", () => setMode("login"));
  modeRegister.addEventListener("change", () => setMode("register"));
  setMode("login");

  qs("#authForm").addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const mode = modeRegister.checked ? "register" : "login";

    const email = normalizeEmail(qs("#email").value);
    const username = String(qs("#username").value || "").trim();
    const password = String(qs("#password").value || "");

    if (!email) return showAlert("Please enter an email.");
    if (mode === "register" && !username) return showAlert("Please enter a username.");
    if (!password || password.length < 6) return showAlert("Password must be at least 6 characters.");

    const users = loadUsers();

    if (mode === "register") {
      const exists = users.some((u) => normalizeEmail(u.email) === email);
      if (exists) return showAlert("That email is already registered. Try logging in.");

      const id = uid();
      const salt = uid();
      const passwordHash = await hashPassword(password, salt);

      const user = {
        id,
        email,
        username,
        salt,
        passwordHash,
        createdAt: Date.now(),
      };

      saveUsers([user, ...users]);
      setSession(id);
      window.location.href = getRedirect();
      return;
    }

    const user = users.find((u) => normalizeEmail(u.email) === email);
    if (!user) return showAlert("No account found for that email. Register instead.");

    const passwordHash = await hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) return showAlert("Incorrect password.");

    setSession(user.id);
    window.location.href = getRedirect();
  });
}

window.addEventListener("DOMContentLoaded", () => {
  setup().catch((err) => {
    showAlert(err instanceof Error ? err.message : String(err));
  });
});
