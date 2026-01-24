import os
import sqlite3
from datetime import datetime, timedelta

from flask import (
    Flask,
    flash,
    g,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
INSTANCE_DIR = os.path.join(BASE_DIR, "instance")
DB_PATH = os.path.join(INSTANCE_DIR, "app.db")


def create_app() -> Flask:
    os.makedirs(INSTANCE_DIR, exist_ok=True)

    app = Flask(__name__, instance_relative_config=True)
    app.config.update(
        SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", "dev-secret-change-me"),
        DATABASE=DB_PATH,
    )

    @app.before_request
    def _open_db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], detect_types=sqlite3.PARSE_DECLTYPES)
            g.db.row_factory = sqlite3.Row

    @app.teardown_request
    def _close_db(_exc):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    def init_db():
        db = g.db
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              email TEXT NOT NULL UNIQUE,
              username TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              is_admin INTEGER NOT NULL DEFAULT 0,
              is_premium INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS checkins (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER NOT NULL,
              date TEXT NOT NULL,
              mood INTEGER NOT NULL,
              stress INTEGER NOT NULL,
              sleep INTEGER NOT NULL,
              journal TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(user_id, date),
              FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )
        db.commit()

    def current_user():
        uid = session.get("user_id")
        if not uid:
            return None
        return g.db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()

    def login_required():
        if not current_user():
            return redirect(url_for("login", next=request.path))
        return None

    def admin_required():
        u = current_user()
        if not u:
            return redirect(url_for("login", next=request.path))
        if int(u["is_admin"]) != 1:
            flash("Admin access required.", "danger")
            return redirect(url_for("dashboard"))
        return None

    @app.get("/")
    def home():
        if current_user():
            return redirect(url_for("dashboard"))
        return redirect(url_for("login"))

    @app.get("/register")
    def register():
        return render_template("register.html", user=current_user())

    @app.post("/register")
    def register_post():
        init_db()
        email = (request.form.get("email") or "").strip().lower()
        username = (request.form.get("username") or "").strip()
        password = request.form.get("password") or ""

        if not email or not username or not password:
            flash("Please fill all fields.", "danger")
            return redirect(url_for("register"))
        if len(password) < 6:
            flash("Password must be at least 6 characters.", "danger")
            return redirect(url_for("register"))

        db = g.db
        existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            flash("Email already registered. Please log in.", "warning")
            return redirect(url_for("login"))

        is_first_user = db.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"] == 0
        is_admin = 1 if is_first_user else 0

        now = datetime.utcnow().isoformat()
        db.execute(
            "INSERT INTO users(email, username, password_hash, is_admin, is_premium, created_at) VALUES(?,?,?,?,?,?)",
            (email, username, generate_password_hash(password), is_admin, 0, now),
        )
        db.commit()

        user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        session["user_id"] = user["id"]
        flash("Account created.", "success")
        return redirect(url_for("dashboard"))

    @app.get("/login")
    def login():
        if current_user():
            return redirect(url_for("dashboard"))
        next_path = request.args.get("next")
        return render_template("login.html", next_path=next_path, user=None)

    @app.post("/login")
    def login_post():
        init_db()
        email = (request.form.get("email") or "").strip().lower()
        password = request.form.get("password") or ""
        next_path = request.form.get("next_path") or ""

        user = g.db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        if not user or not check_password_hash(user["password_hash"], password):
            flash("Invalid email or password.", "danger")
            return redirect(url_for("login"))

        session["user_id"] = user["id"]
        flash("Welcome back.", "success")
        if next_path.startswith("/"):
            return redirect(next_path)
        return redirect(url_for("dashboard"))

    @app.post("/logout")
    def logout():
        session.clear()
        flash("Logged out.", "info")
        return redirect(url_for("login"))

    @app.get("/dashboard")
    def dashboard():
        init_db()
        gate = login_required()
        if gate:
            return gate

        u = current_user()

        today = datetime.utcnow().date()
        start = today - timedelta(days=6)
        days = [(start + timedelta(days=i)).isoformat() for i in range(7)]

        rows = g.db.execute(
            "SELECT * FROM checkins WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date ASC",
            (u["id"], days[0], days[-1]),
        ).fetchall()
        by_date = {r["date"]: r for r in rows}

        series = {
            "labels": [datetime.fromisoformat(d).strftime("%a") for d in days],
            "mood": [by_date[d]["mood"] if d in by_date else None for d in days],
            "stress": [by_date[d]["stress"] if d in by_date else None for d in days],
            "sleep": [by_date[d]["sleep"] if d in by_date else None for d in days],
        }

        history = g.db.execute(
            "SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 60",
            (u["id"],),
        ).fetchall()

        existing_today = g.db.execute(
            "SELECT * FROM checkins WHERE user_id = ? AND date = ?",
            (u["id"], today.isoformat()),
        ).fetchone()

        return render_template(
            "dashboard.html",
            user=u,
            series=series,
            history=history,
            existing_today=existing_today,
            today=today.isoformat(),
        )

    @app.post("/checkin")
    def checkin_post():
        init_db()
        gate = login_required()
        if gate:
            return gate

        u = current_user()
        date = request.form.get("date") or ""
        mood = request.form.get("mood") or ""
        stress = request.form.get("stress") or ""
        sleep = request.form.get("sleep") or ""
        journal = (request.form.get("journal") or "").strip()

        try:
            mood_n = int(mood)
            stress_n = int(stress)
            sleep_n = int(sleep)
            if mood_n < 1 or mood_n > 5:
                raise ValueError
            if stress_n < 0 or stress_n > 10:
                raise ValueError
            if sleep_n < 0 or sleep_n > 10:
                raise ValueError
            datetime.fromisoformat(date)
        except Exception:
            flash("Invalid check-in values.", "danger")
            return redirect(url_for("dashboard"))

        now = datetime.utcnow().isoformat()
        g.db.execute(
            """
            INSERT INTO checkins(user_id, date, mood, stress, sleep, journal, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id, date) DO UPDATE SET
              mood=excluded.mood,
              stress=excluded.stress,
              sleep=excluded.sleep,
              journal=excluded.journal,
              updated_at=excluded.updated_at;
            """,
            (u["id"], date, mood_n, stress_n, sleep_n, journal, now, now),
        )
        g.db.commit()
        flash("Check-in saved.", "success")
        return redirect(url_for("dashboard"))

    @app.get("/premium")
    def premium():
        init_db()
        gate = login_required()
        if gate:
            return gate
        return render_template("premium.html", user=current_user())

    @app.post("/premium/upgrade")
    def premium_upgrade():
        init_db()
        gate = login_required()
        if gate:
            return gate

        flash("Premium upgrade (M-Pesa) will be integrated later.", "info")
        return redirect(url_for("premium"))

    @app.get("/admin")
    def admin():
        init_db()
        gate = admin_required()
        if gate:
            return gate

        users = g.db.execute(
            "SELECT id, email, username, is_admin, is_premium, created_at FROM users ORDER BY created_at DESC"
        ).fetchall()

        stats = g.db.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM users) AS user_count,
              (SELECT COUNT(*) FROM checkins) AS checkin_count,
              (SELECT COUNT(*) FROM users WHERE is_premium=1) AS premium_count
            """
        ).fetchone()

        return render_template("admin.html", user=current_user(), users=users, stats=stats)

    @app.get("/admin/user/<int:user_id>")
    def admin_user(user_id: int):
        init_db()
        gate = admin_required()
        if gate:
            return gate

        u = g.db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not u:
            flash("User not found.", "danger")
            return redirect(url_for("admin"))

        checkins = g.db.execute(
            "SELECT * FROM checkins WHERE user_id = ? ORDER BY date DESC LIMIT 200",
            (user_id,),
        ).fetchall()
        return render_template("admin_user.html", user=current_user(), target=u, checkins=checkins)

    @app.post("/admin/user/<int:user_id>/toggle-premium")
    def admin_toggle_premium(user_id: int):
        init_db()
        gate = admin_required()
        if gate:
            return gate

        target = g.db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            flash("User not found.", "danger")
            return redirect(url_for("admin"))

        new_val = 0 if int(target["is_premium"]) == 1 else 1
        g.db.execute("UPDATE users SET is_premium = ? WHERE id = ?", (new_val, user_id))
        g.db.commit()

        flash("Premium status updated.", "success")
        return redirect(url_for("admin_user", user_id=user_id))

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True)
