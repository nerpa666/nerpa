import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "./supabase";

// ─────────────────────────────────────────────────────────────
// Логістичні заявки та місії — онлайн-версія (Supabase)
// Ролі: заявник / виконавець / адмін.
// ТІЛЬКИ ДЛЯ ТЕСТУ З ВИГАДАНИМИ ДАНИМИ.
// ─────────────────────────────────────────────────────────────

const MISSION_TYPES = ["Логістика", "Зворотня логістика", "Евакуація"];
const CARGO_TYPES = ["Дрони", "БК", "Провізія / мед"];
const SIZES = ["M", "L", "XL"];
const PRIORITIES = ["Звичайний", "Підвищений", "Терміновий"];
const VEHICLES = ["сімба", "ралик", "ARX", "воля", "поні", "гієна"];

const REQ_STATUS = {
  new: { label: "Нова", color: "#6366f1", bg: "#eef2ff" },
  planned: { label: "У місії", color: "#0891b2", bg: "#cffafe" },
  done: { label: "Виконана", color: "#16a34a", bg: "#dcfce7" },
  cancelled: { label: "Відмінена", color: "#6b7280", bg: "#f3f4f6" },
};
const MIS_STATUS = {
  planned: { label: "Запланована", color: "#6366f1", bg: "#eef2ff" },
  in_progress: { label: "В роботі", color: "#d97706", bg: "#fef3c7" },
  success: { label: "Успішно", color: "#16a34a", bg: "#dcfce7" },
  partial: { label: "Частково", color: "#ca8a04", bg: "#fef9c3" },
  fail: { label: "Неуспішно", color: "#dc2626", bg: "#fee2e2" },
};
const RESULT_STATUS = ["success", "partial", "fail"];

const card = { background: "#ffffff", border: "1px solid #ececec", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };
const ROLE_LABEL = { admin: "адмін", requester: "заявник", executor: "виконавець" };

const dayKey = (ts) => { if (!ts) return ""; const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLabel = (key) => { if (!key) return "—"; const [y, m, d] = key.split("-"); return `${d}.${m}.${y}`; };
const fmtTime = (ts) => ts ? new Date(ts).toLocaleString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDateTime = (ts) => ts ? new Date(ts).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const parseWeight = (w) => { if (!w) return 0; const m = String(w).replace(",", ".").match(/[\d.]+/); return m ? parseFloat(m[0]) : 0; };
const fmtDur = (min) => { const h = (min || 0) / 60; return Number.isInteger(h) ? `${h} год` : `${h.toFixed(1)} год`; };

// ─── мапінг рядків БД (snake_case) ↔ обʼєкти застосунку ───
const reqFromDb = (r) => ({
  id: r.id, author: r.author, mission: r.mission_type, priority: r.priority,
  cargoTypes: r.cargo_types || [], weight: r.weight || "", size: r.size || "",
  position: r.position || "", description: r.description || "", datetime: r.want_date || "",
  status: r.status, missionId: r.mission_id, editedAt: r.edited_at, createdAt: new Date(r.created_at).getTime(),
});
const reqToDb = (r) => ({
  author: r.author, mission_type: r.mission, priority: r.priority, cargo_types: r.cargoTypes,
  weight: r.weight, size: r.size, position: r.position, description: r.description,
  want_date: r.datetime || null, status: r.status, mission_id: r.missionId ?? null,
});
const misFromDb = (m) => ({
  id: m.id, title: m.title || "", requestIds: m.request_ids || [], vehicles: m.vehicles || [],
  plannedStart: new Date(m.planned_start).getTime(), durationMin: m.duration_min, status: m.status,
  executor: m.executor, day: m.day, report: m.report || "", createdBy: m.created_by,
  takenAt: m.taken_at, finishedAt: m.finished_at, createdAt: new Date(m.created_at).getTime(),
});

export default function App() {
  const [user, setUser] = useState(null);
  const [requests, setRequests] = useState([]);
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("");
  const [editingReq, setEditingReq] = useState(null);
  const [err, setErr] = useState("");
  const [dailyLimit, setDailyLimit] = useState(5);
  const [presetDate, setPresetDate] = useState("");

  // відновлення сесії з localStorage (лише ідентифікація користувача, не дані)
  useEffect(() => {
    const saved = localStorage.getItem("session");
    if (saved) { const u = JSON.parse(saved); setUser(u); setTab(startTab(u.role)); }
  }, []);

  const loadData = useCallback(async () => {
    const { data: rq } = await supabase.from("requests").select("*").order("created_at", { ascending: false });
    const { data: ms } = await supabase.from("missions").select("*").order("planned_start", { ascending: false });
    const { data: st } = await supabase.from("settings").select("*").eq("key", "daily_limit").maybeSingle();
    if (rq) setRequests(rq.map(reqFromDb));
    if (ms) setMissions(ms.map(misFromDb));
    if (st) setDailyLimit(parseInt(st.value) || 5);
    setLoading(false);
  }, []);

  // первинне завантаження + автооновлення кожні 5с (щоб бачити зміни інших)
  useEffect(() => {
    if (!user) return;
    loadData();
    const t = setInterval(loadData, 5000);
    return () => clearInterval(t);
  }, [user, loadData]);

  const startTab = (role) => role === "admin" ? "overview" : role === "executor" ? "create" : "board";

  const login = async (name, code) => {
    setErr("");
    const { data, error } = await supabase.from("app_users").select("*").eq("name", name).eq("code", code).maybeSingle();
    if (error) { setErr("Помилка зʼєднання з базою"); return; }
    if (!data) { setErr("Невірне імʼя або код доступу"); return; }
    const u = { name: data.name, role: data.role };
    setUser(u); setTab(startTab(u.role));
    localStorage.setItem("session", JSON.stringify(u));
  };
  const logout = () => { setUser(null); localStorage.removeItem("session"); };

  if (!user) return <Login onLogin={login} err={err} />;
  if (loading) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui", color: "#888" }}>Завантаження…</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f8", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1a1a1a" }}>
      <Header user={user} onLogout={logout} tab={tab} setTab={(k) => { if (k === "new") setEditingReq(null); setTab(k); }} />
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 24px 60px" }}>
        {user.role === "requester" && (
          tab === "new"
            ? <NewRequest user={user} editing={editingReq} requests={requests} dailyLimit={dailyLimit} presetDate={presetDate} reload={loadData} onDone={() => { setTab("board"); setEditingReq(null); setPresetDate(""); }} />
            : tab === "calendar"
            ? <div><SectionTitle>Календар заявок</SectionTitle><WeekCalendar requests={requests} dailyLimit={dailyLimit} mode="requester" currentUser={user.name} onAddForDay={(d) => { setEditingReq(null); setPresetDate(d); setTab("new"); }} /></div>
            : <RequesterBoard user={user} requests={requests} reload={loadData} onEdit={(r) => { setEditingReq(r); setTab("new"); }} />
        )}
        {user.role === "executor" && (
          tab === "calendar"
            ? <div><SectionTitle>Календар заявок (огляд)</SectionTitle><WeekCalendar requests={requests} dailyLimit={dailyLimit} mode="view" /></div>
            : <ExecutorView user={user} missions={missions} requests={requests} reload={loadData} tab={tab} />
        )}
        {user.role === "admin" && <AdminView tab={tab} requests={requests} missions={missions} dailyLimit={dailyLimit} reload={loadData} />}
      </div>
    </div>
  );
}

// ───────── Логін ─────────
function Login({ onLogin, err }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const submit = () => onLogin(name.trim(), code.trim());
  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f8", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", padding: 20 }}>
      <div style={{ ...card, width: 370, padding: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a" }} />
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Логістика та місії</h1>
        </div>
        <p style={{ color: "#888", fontSize: 13, marginTop: 4, marginBottom: 24 }}>Верифікація доступу</p>
        <Field label="Позивний / імʼя"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inp} placeholder="Напр., Slava" /></Field>
        <Field label="Код доступу"><input type="password" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={inp} placeholder="••••" /></Field>
        {err && <div style={{ color: "#dc2626", fontSize: 12.5, marginBottom: 12 }}>{err}</div>}
        <button onClick={submit} style={{ ...btnPrimary, width: "100%", marginTop: 4 }}>Увійти</button>
      </div>
    </div>
  );
}

// ───────── Хедер ─────────
function Header({ user, onLogout, tab, setTab }) {
  const tabs = user.role === "admin"
    ? [["overview", "Огляд"], ["calendar", "Календар"], ["timeline", "Таймлайн"], ["metrics", "Метрики"], ["requests", "Заявки"], ["missions", "Місії"], ["settings", "Налаштування"]]
    : user.role === "executor"
    ? [["create", "+ Сформувати місію"], ["calendar", "Календар"], ["mine", "Мої місії"]]
    : [["board", "Мої заявки"], ["calendar", "Календар"], ["new", "+ Нова заявка"]];
  return (
    <div style={{ background: "#fff", borderBottom: "1px solid #ececec" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#16a34a" }} />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Логістика та місії</span>
        </div>
        <div style={{ display: "flex", gap: 4, background: "#f3f4f6", padding: 3, borderRadius: 10, flexWrap: "wrap" }}>
          {tabs.map(([k, label]) => <Tab key={k} active={tab === k} onClick={() => setTab(k)}>{label}</Tab>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#555" }}>{user.name} <span style={{ color: "#aaa" }}>· {ROLE_LABEL[user.role]}</span></span>
          <button onClick={onLogout} style={btnGhost}>Вийти</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════ ЗАЯВНИК ═══════════
function RequesterBoard({ user, requests, onEdit, reload }) {
  const mine = requests.filter((r) => r.author === user.name);
  const del = async (id) => { await supabase.from("requests").delete().eq("id", id); reload(); };
  return (
    <div>
      <SectionTitle>Мої заявки</SectionTitle>
      {mine.length === 0 ? <Empty>Заявок ще немає. Створи першу через «+ Нова заявка».</Empty> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mine.map((r) => <RequestCard key={r.id} req={r} onEdit={onEdit} onDelete={del} />)}
        </div>
      )}
    </div>
  );
}

function RequestCard({ req, onEdit, onDelete }) {
  const s = REQ_STATUS[req.status] || REQ_STATUS.new;
  const editable = req.status === "new" && (onEdit || onDelete);
  return (
    <div style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: 14.5 }}>{req.mission}</span>
            {req.priority === "Терміновий" && <span style={{ ...pill, background: "#fee2e2", color: "#dc2626" }}>● Терміновий</span>}
            {req.priority === "Підвищений" && <span style={{ ...pill, background: "#fef3c7", color: "#d97706" }}>Підвищений</span>}
            <span style={{ color: "#aaa", fontSize: 12 }}>#{String(req.id).slice(-4)}</span>
          </div>
          <div style={{ fontSize: 13.5, color: "#444", marginBottom: 6 }}>
            {(req.cargoTypes || []).join(" + ")}{req.size ? ` · ${req.size}` : ""}{req.weight ? ` · ${req.weight}` : ""}
          </div>
          {req.position && <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>📍 {req.position}</div>}
          {req.description && <div style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>{req.description}</div>}
          <div style={{ fontSize: 11.5, color: "#aaa" }}>
            {req.author} · створено {fmtDateTime(req.createdAt)}{req.datetime && ` · бажано на ${dayLabel(req.datetime)}`}{req.editedAt && " · ред."}
          </div>
        </div>
        <span style={{ ...pill, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>
      </div>
      {editable && (
        <div style={{ marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12, display: "flex", gap: 8 }}>
          {onEdit && <button onClick={() => onEdit(req)} style={btnGhost}>Редагувати</button>}
          {onDelete && <button onClick={() => { if (confirm("Видалити цю заявку?")) onDelete(req.id); }} style={{ ...btnGhost, color: "#dc2626" }}>Видалити</button>}
        </div>
      )}
    </div>
  );
}

function NewRequest({ user, reload, onDone, editing, requests, dailyLimit, presetDate }) {
  const [mission, setMission] = useState(editing?.mission || MISSION_TYPES[0]);
  const [priority, setPriority] = useState(editing?.priority || PRIORITIES[0]);
  const [cargoTypes, setCargoTypes] = useState(editing?.cargoTypes || [CARGO_TYPES[0]]);
  const [weight, setWeight] = useState(editing?.weight || "");
  const [size, setSize] = useState(editing?.size || SIZES[0]);
  const [position, setPosition] = useState(editing?.position || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [datetime, setDatetime] = useState(editing?.datetime || presetDate || "");
  const [saving, setSaving] = useState(false);

  const toggleCargo = (c) => setCargoTypes((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const submit = async () => {
    if (cargoTypes.length === 0 || saving) return;
    // попередження, якщо обраний день уже заповнений (але дозволяємо)
    if (datetime) {
      const taken = (requests || []).filter((r) => r.datetime === datetime && r.status !== "cancelled" && (!editing || r.id !== editing.id)).length;
      if (taken >= dailyLimit && !confirm(`На ${dayLabel(datetime)} вже ${taken} заявок (ліміт ${dailyLimit}). Все одно створити?`)) return;
    }
    setSaving(true);
    const data = { mission, priority, cargoTypes, weight: weight.trim(), size, position: position.trim(), description: description.trim(), datetime };
    if (editing) {
      await supabase.from("requests").update({ ...reqToDb({ ...editing, ...data }), edited_at: new Date().toISOString() }).eq("id", editing.id).eq("status", "new");
    } else {
      await supabase.from("requests").insert(reqToDb({ author: user.name, ...data, status: "new", missionId: null }));
    }
    await reload(); onDone();
  };

  return (
    <div style={{ ...card, padding: 24, maxWidth: 640 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 0, marginBottom: 20 }}>{editing ? "Редагувати заявку" : "Нова заявка"}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Тип місії"><select value={mission} onChange={(e) => setMission(e.target.value)} style={inp}>{MISSION_TYPES.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Пріоритет"><select value={priority} onChange={(e) => setPriority(e.target.value)} style={inp}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
      </div>
      <Field label="Тип вантажу (можна декілька)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CARGO_TYPES.map((c) => { const on = cargoTypes.includes(c); return (
            <button key={c} onClick={() => toggleCargo(c)} style={{ border: on ? "1px solid #16a34a" : "1px solid #e2e2e2", background: on ? "#dcfce7" : "#fff", color: on ? "#15803d" : "#555", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}><span>{on ? "✓" : "+"}</span>{c}</button>
          ); })}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Вага"><input value={weight} onChange={(e) => setWeight(e.target.value)} style={inp} placeholder="напр., 12 кг" /></Field>
        <Field label="Габарит"><select value={size} onChange={(e) => setSize(e.target.value)} style={inp}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <Field label="Позиція доставки"><input value={position} onChange={(e) => setPosition(e.target.value)} style={inp} placeholder="Координати / орієнтир / позивний точки" /></Field>
      <Field label="Бажана дата">
        <input type="date" value={datetime} onChange={(e) => setDatetime(e.target.value)} style={inp} />
        {datetime && (() => {
          // рахуємо вже наявні заявки на цей день (крім поточної редагованої)
          const taken = (requests || []).filter((r) => r.datetime === datetime && r.status !== "cancelled" && (!editing || r.id !== editing.id)).length;
          const full = taken >= dailyLimit;
          return (
            <div style={{ marginTop: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, (taken / dailyLimit) * 100)}%`, height: "100%", background: full ? "#dc2626" : taken / dailyLimit >= 0.7 ? "#d97706" : "#16a34a" }} />
              </div>
              <span style={{ color: full ? "#dc2626" : "#666", fontWeight: 600, whiteSpace: "nowrap" }}>
                зайнято {taken} з {dailyLimit}{full ? " · день повний" : ""}
              </span>
            </div>
          );
        })()}
      </Field>
      <Field label="Опис (необовʼязково)"><textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inp, minHeight: 70, resize: "vertical" }} placeholder="Додаткові деталі завдання…" /></Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={submit} disabled={cargoTypes.length === 0 || saving} style={{ ...btnPrimary, opacity: (cargoTypes.length === 0 || saving) ? 0.5 : 1 }}>{saving ? "Збереження…" : editing ? "Зберегти зміни" : "Створити заявку"}</button>
        <button onClick={onDone} style={btnGhost}>Скасувати</button>
      </div>
    </div>
  );
}

// ═══════════ ВИКОНАВЕЦЬ ═══════════
function ExecutorView({ user, missions, requests, reload, tab }) {
  if (tab === "mine") return <ExecutorMine user={user} missions={missions} requests={requests} reload={reload} />;
  return <ExecutorCreate user={user} missions={missions} requests={requests} reload={reload} />;
}

function ExecutorCreate({ user, requests, reload }) {
  const [dayFilter, setDayFilter] = useState("all");
  const [selected, setSelected] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const freeRequests = requests.filter((r) => r.status === "new");
  const days = useMemo(() => [...new Set(freeRequests.map((r) => r.datetime).filter(Boolean))].sort(), [requests]);
  const visible = freeRequests.filter((r) => dayFilter === "all" || r.datetime === dayFilter).sort((a, b) => (a.datetime || "").localeCompare(b.datetime || ""));
  const toggle = (id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const createMission = async (data) => {
    const { data: ins } = await supabase.from("missions").insert({
      title: data.title, request_ids: selected, vehicles: data.vehicles,
      planned_start: new Date(data.plannedStart).toISOString(), duration_min: data.durationMin,
      status: "in_progress", executor: user.name, day: dayKey(data.plannedStart),
      created_by: user.name, taken_at: new Date().toISOString(),
    }).select().single();
    if (ins) await supabase.from("requests").update({ status: "planned", mission_id: ins.id }).in("id", selected);
    setSelected([]); setShowForm(false); await reload();
  };

  return (
    <div>
      <SectionTitle>Вільні заявки
        <select value={dayFilter} onChange={(e) => setDayFilter(e.target.value)} style={{ ...inp, width: "auto", marginLeft: 12, display: "inline-block" }}>
          <option value="all">усі дні</option>{days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
        </select>
      </SectionTitle>
      {visible.length === 0 ? <Empty>Немає вільних заявок{dayFilter !== "all" ? " на цей день" : ""}.</Empty> : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {visible.map((r) => { const on = selected.includes(r.id); return (
              <div key={r.id} onClick={() => toggle(r.id)} style={{ ...card, padding: 14, cursor: "pointer", border: on ? "1.5px solid #16a34a" : "1px solid #ececec", display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ width: 18, height: 18, borderRadius: 5, border: on ? "none" : "1.5px solid #ccc", background: on ? "#16a34a" : "#fff", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>{on ? "✓" : ""}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.mission} · {(r.cargoTypes || []).join(" + ")}</div>
                  <div style={{ fontSize: 12, color: "#888" }}>{r.author}{r.weight ? ` · ${r.weight}` : ""}{r.size ? ` · ${r.size}` : ""}{r.position ? ` · 📍 ${r.position}` : ""}{r.datetime ? ` · ${dayLabel(r.datetime)}` : ""}</div>
                </div>
                {r.priority === "Терміновий" && <span style={{ ...pill, background: "#fee2e2", color: "#dc2626" }}>Терміновий</span>}
              </div>
            ); })}
          </div>
          {selected.length > 0 && !showForm && <button onClick={() => setShowForm(true)} style={btnPrimary}>Сформувати місію з {selected.length} заявок →</button>}
          {showForm && <MissionForm count={selected.length} day={dayFilter !== "all" ? dayFilter : dayKey(Date.now())} onCreate={createMission} onCancel={() => setShowForm(false)} />}
        </>
      )}
    </div>
  );
}

function ExecutorMine({ user, missions, requests, reload }) {
  const reqById = useMemo(() => Object.fromEntries(requests.map((r) => [r.id, r])), [requests]);
  const mine = missions.filter((m) => m.executor === user.name);
  const report = async (id, result, note) => {
    const m = missions.find((x) => x.id === id);
    await supabase.from("missions").update({ status: result, report: note, finished_at: new Date().toISOString() }).eq("id", id);
    if (m) {
      const st = result === "fail" ? "new" : "done";
      await supabase.from("requests").update({ status: st, mission_id: result === "fail" ? null : id }).in("id", m.requestIds || []);
    }
    await reload();
  };
  const saveEdit = async (id, data) => {
    await supabase.from("missions").update({ title: data.title, vehicles: data.vehicles, planned_start: new Date(data.plannedStart).toISOString(), duration_min: data.durationMin, day: dayKey(data.plannedStart) }).eq("id", id);
    await reload();
  };
  return (
    <div>
      <SectionTitle>Мої місії</SectionTitle>
      {mine.length === 0 ? <Empty>Ти ще не сформував жодної місії. Перейди в «+ Сформувати місію».</Empty> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {mine.map((m) => <MissionCardExec key={m.id} m={m} reqById={reqById} onReport={report} onSaveEdit={saveEdit} />)}
        </div>
      )}
    </div>
  );
}

function MissionCardExec({ m, reqById, onReport, onSaveEdit }) {
  const [reporting, setReporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const s = MIS_STATUS[m.status];
  const reqs = (m.requestIds || []).map((id) => reqById[id]).filter(Boolean);
  const totalWeight = reqs.reduce((sum, r) => sum + parseWeight(r.weight), 0);
  if (editing) return <MissionForm initial={m} onCreate={(data) => { onSaveEdit(m.id, data); setEditing(false); }} onCancel={() => setEditing(false)} />;
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{m.title || `Місія #${String(m.id).slice(-4)}`}</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>🚚 {(m.vehicles || []).join(", ") || "—"}</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 4 }}>🕑 {fmtDateTime(m.plannedStart)} · {fmtDur(m.durationMin)}</div>
          <div style={{ fontSize: 12.5, color: "#888" }}>Заявок: {reqs.length}{totalWeight ? ` · ~${totalWeight} кг` : ""}</div>
        </div>
        <span style={{ ...pill, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>
      </div>
      {reqs.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 12.5, color: "#888", cursor: "pointer" }}>Вантаж / точки ({reqs.length})</summary>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {reqs.map((r) => <div key={r.id} style={{ fontSize: 12.5, color: "#555", padding: "6px 10px", background: "#fafafa", borderRadius: 6 }}><b>{r.author}</b> · {(r.cargoTypes || []).join(" + ")}{r.weight ? ` · ${r.weight}` : ""}{r.position ? ` · 📍 ${r.position}` : ""}</div>)}
          </div>
        </details>
      )}
      {m.status === "in_progress" ? (
        <div style={{ marginTop: 12, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
          {!reporting ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setReporting(true)} style={btnPrimary}>Звіт про результат</button>
              <button onClick={() => setEditing(true)} style={btnGhost}>Редагувати місію</button>
            </div>
          ) : (
            <div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Короткий звіт (необовʼязково)" style={{ ...inp, marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {RESULT_STATUS.map((k) => <button key={k} onClick={() => { onReport(m.id, k, note); setReporting(false); setNote(""); }} style={{ ...statusBtn, color: MIS_STATUS[k].color, borderColor: MIS_STATUS[k].color + "55" }}>{MIS_STATUS[k].label}</button>)}
                <button onClick={() => { setReporting(false); setNote(""); }} style={{ ...statusBtn, color: "#999", borderColor: "#ddd" }}>Скасувати</button>
              </div>
            </div>
          )}
        </div>
      ) : m.report ? <div style={{ marginTop: 10, padding: "8px 10px", background: "#fafafa", borderRadius: 8, fontSize: 12.5, color: "#555" }}>💬 {m.report}</div> : null}
    </div>
  );
}

// ═══════════ АДМІН ═══════════
function AdminView({ tab, requests, missions, dailyLimit, reload }) {
  if (tab === "calendar") return <div><SectionTitle>Календар заявок (огляд)</SectionTitle><WeekCalendar requests={requests} dailyLimit={dailyLimit} mode="view" /></div>;
  if (tab === "timeline") return <AdminTimeline missions={missions} requests={requests} />;
  if (tab === "metrics") return <AdminMetrics missions={missions} requests={requests} />;
  if (tab === "requests") return <AdminRequests requests={requests} />;
  if (tab === "missions") return <AdminMissions missions={missions} requests={requests} />;
  if (tab === "settings") return <AdminSettings dailyLimit={dailyLimit} reload={reload} />;
  return <AdminOverview requests={requests} missions={missions} dailyLimit={dailyLimit} />;
}

// Налаштування (адмін): денний ліміт заявок
function AdminSettings({ dailyLimit, reload }) {
  const [val, setVal] = useState(dailyLimit);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    await supabase.from("settings").upsert({ key: "daily_limit", value: String(val) });
    await reload();
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div>
      <SectionTitle>Налаштування</SectionTitle>
      <div style={{ ...card, padding: 24, maxWidth: 460 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Денний ліміт заявок</div>
        <div style={{ fontSize: 12.5, color: "#888", marginBottom: 16 }}>Скільки заявок підрозділ потягне за один день. Заявники бачитимуть завантаженість дня при створенні.</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setVal(n)} style={{
              width: 44, height: 44, borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: "pointer",
              border: val === n ? "1px solid #16a34a" : "1px solid #e2e2e2",
              background: val === n ? "#16a34a" : "#fff", color: val === n ? "#fff" : "#555",
            }}>{n}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={save} style={btnPrimary}>Зберегти</button>
          {saved && <span style={{ color: "#16a34a", fontSize: 13 }}>✓ Збережено</span>}
        </div>
      </div>
    </div>
  );
}

function AdminOverview({ requests, missions, dailyLimit }) {
  const loadByDay = useMemo(() => {
    const acc = {};
    requests.filter((r) => r.status === "new" || r.status === "planned").forEach((r) => { const k = r.datetime || "Без дати"; if (!acc[k]) acc[k] = { count: 0, weight: 0 }; acc[k].count += 1; acc[k].weight += parseWeight(r.weight); });
    return acc;
  }, [requests]);
  const maxW = Math.max(1, ...Object.values(loadByDay).map((v) => v.weight));
  const inProgress = missions.filter((m) => m.status === "in_progress").length;
  const finished = missions.filter((m) => ["success", "partial", "fail"].includes(m.status)).length;
  const activeReq = requests.filter((r) => r.status === "new").length;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <Metric label="Вільні заявки" value={activeReq} color="#6366f1" />
        <Metric label="Місії в роботі" value={inProgress} color="#d97706" />
        <Metric label="Завершені місії" value={finished} color="#16a34a" />
        <Metric label="Всього місій" value={missions.length} color="#1a1a1a" />
      </div>
      <SectionTitle>Навантаження по днях (вага логістики)</SectionTitle>
      <div style={{ ...card, padding: 18 }}>
        {Object.keys(loadByDay).length === 0 ? <div style={{ color: "#999", fontSize: 13 }}>Немає активних заявок.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(loadByDay).sort((a, b) => (a[0] > b[0] ? 1 : -1)).map(([k, v]) => (
              <div key={k}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ fontWeight: 500, color: v.count > dailyLimit ? "#dc2626" : "#444" }}>{k === "Без дати" ? k : dayLabel(k)} · {v.count}/{dailyLimit} заявок{v.count > dailyLimit ? " · перевищено" : ""}</span>
                  <span style={{ color: "#666", fontWeight: 600 }}>{v.weight ? `${v.weight} кг` : "—"}</span>
                </div>
                <div style={{ height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${(v.weight / maxW) * 100}%`, height: "100%", background: "#86efac", borderRadius: 4 }} /></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MissionForm({ count, day, onCreate, onCancel, initial }) {
  const initDate = initial ? dayKey(initial.plannedStart) : day;
  const initHour = initial ? new Date(initial.plannedStart).getHours() : 8;
  const [title, setTitle] = useState(initial?.title || "");
  const [vehicles, setVehicles] = useState(initial?.vehicles || []);
  const [date, setDate] = useState(initDate);
  const [hour, setHour] = useState(initHour);
  const [hours, setHours] = useState(initial ? Math.max(1, Math.round((initial.durationMin || 60) / 60)) : 2);
  const toggleV = (v) => setVehicles((p) => (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]));
  const create = () => { const start = new Date(`${date}T00:00`); start.setHours(hour, 0, 0, 0); onCreate({ title: title.trim() || `Місія ${dayLabel(date)}`, vehicles, plannedStart: start.getTime(), durationMin: hours * 60 }); };
  return (
    <div style={{ ...card, padding: 20, marginTop: 14, borderColor: "#16a34a" }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>{initial ? "Редагувати місію" : `Нова місія (${count} заявок)`}</h3>
      <Field label="Назва (необовʼязково)"><input value={title} onChange={(e) => setTitle(e.target.value)} style={inp} placeholder="напр., Ранкова логістика північ" /></Field>
      <Field label="Засоби доставки (можна декілька)">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {VEHICLES.map((v) => { const on = vehicles.includes(v); return <button key={v} onClick={() => toggleV(v)} style={{ border: on ? "1px solid #6366f1" : "1px solid #e2e2e2", background: on ? "#eef2ff" : "#fff", color: on ? "#4f46e5" : "#555", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{on ? "✓ " : ""}{v}</button>; })}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Дата"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inp} /></Field>
        <Field label="Година старту"><select value={hour} onChange={(e) => setHour(parseInt(e.target.value))} style={inp}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></Field>
        <Field label="Тривалість (год)"><input type="number" min={1} step={1} value={hours} onChange={(e) => setHours(parseInt(e.target.value) || 1)} style={inp} /></Field>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={create} style={btnPrimary}>{initial ? "Зберегти зміни" : "Створити й взяти в роботу"}</button>
        <button onClick={onCancel} style={btnGhost}>Скасувати</button>
      </div>
    </div>
  );
}

function AdminMetrics({ missions, requests }) {
  const reqById = useMemo(() => Object.fromEntries(requests.map((r) => [r.id, r])), [requests]);
  const finished = missions.filter((m) => ["success", "partial", "fail"].includes(m.status));
  const successCnt = missions.filter((m) => m.status === "success").length;
  const partialCnt = missions.filter((m) => m.status === "partial").length;
  const failCnt = missions.filter((m) => m.status === "fail").length;
  const successRate = finished.length ? Math.round(((successCnt + partialCnt * 0.5) / finished.length) * 100) : 0;
  const deliveredWeight = missions.filter((m) => m.status === "success" || m.status === "partial").reduce((sum, m) => sum + (m.requestIds || []).reduce((s, id) => s + parseWeight(reqById[id]?.weight), 0), 0);
  const vehicleCounts = VEHICLES.map((v) => ({ name: v, value: missions.filter((m) => (m.vehicles || []).includes(v)).length })).sort((a, b) => b.value - a.value);
  const execMap = {}; missions.forEach((m) => { if (m.executor) execMap[m.executor] = (execMap[m.executor] || 0) + 1; });
  const execData = Object.entries(execMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const cargoMap = {}; missions.forEach((m) => (m.requestIds || []).forEach((id) => { (reqById[id]?.cargoTypes || []).forEach((c) => { cargoMap[c] = (cargoMap[c] || 0) + 1; }); }));
  const cargoData = CARGO_TYPES.map((c) => ({ name: c, value: cargoMap[c] || 0 })).sort((a, b) => b.value - a.value);
  const statusData = [{ name: "Успішно", value: successCnt, color: MIS_STATUS.success.color }, { name: "Частково", value: partialCnt, color: MIS_STATUS.partial.color }, { name: "Неуспішно", value: failCnt, color: MIS_STATUS.fail.color }].filter((d) => d.value > 0);
  if (missions.length === 0) return <Empty>Поки немає місій для аналітики.</Empty>;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 22 }}>
        <Metric label="Всього місій" value={missions.length} color="#1a1a1a" />
        <Metric label="Завершено" value={finished.length} color="#6366f1" />
        <Metric label="Успішність" value={`${successRate}%`} color="#16a34a" />
        <Metric label="Доставлено" value={deliveredWeight ? `${deliveredWeight} кг` : "—"} color="#0891b2" />
        <Metric label="Неуспішних" value={failCnt} color="#dc2626" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <BarBlock title="Завантаженість засобів" data={vehicleCounts} color="#6366f1" />
        <DonutBlock title="Результати місій" data={statusData} />
        <BarBlock title="Активність виконавців" data={execData} color="#16a34a" empty="Ще немає виконаних місій" />
        <BarBlock title="Типи вантажу" data={cargoData} color="#0891b2" />
      </div>
    </div>
  );
}

function BarBlock({ title, data, color, empty }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const has = data.some((d) => d.value > 0);
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 14 }}>{title}</div>
      {!has ? <div style={{ fontSize: 12.5, color: "#aaa", padding: "8px 0" }}>{empty || "Немає даних"}</div> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.map((d) => (
            <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 70, fontSize: 12, color: "#666", flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
              <div style={{ flex: 1, height: 16, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}><div style={{ width: `${(d.value / max) * 100}%`, height: "100%", background: color, borderRadius: 4 }} /></div>
              <span style={{ width: 24, fontSize: 12, fontWeight: 700, textAlign: "right" }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DonutBlock({ title, data }) {
  const total = data.reduce((a, b) => a + b.value, 0);
  let acc = 0;
  const segments = data.map((d) => { const start = (acc / total) * 360; acc += d.value; const end = (acc / total) * 360; return `${d.color} ${start}deg ${end}deg`; }).join(", ");
  return (
    <div style={{ ...card, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 14 }}>{title}</div>
      {total === 0 ? <div style={{ fontSize: 12.5, color: "#aaa", padding: "8px 0" }}>Ще немає завершених місій</div> : (
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 110, height: 110, borderRadius: "50%", background: `conic-gradient(${segments})`, flexShrink: 0, position: "relative" }}><div style={{ position: "absolute", inset: 22, background: "#fff", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700 }}>{total}</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {data.map((d) => <span key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: d.color }} />{d.name} — <b>{d.value}</b> ({Math.round((d.value / total) * 100)}%)</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

function AdminTimeline({ missions }) {
  const today = dayKey(Date.now());
  const [startDate, setStartDate] = useState(today);
  const [horizon, setHorizon] = useState(3);
  const [selectedId, setSelectedId] = useState(null);
  const days = useMemo(() => { const arr = []; const base = new Date(`${startDate}T00:00`); for (let i = 0; i < horizon; i++) { const d = new Date(base); d.setDate(base.getDate() + i); arr.push(dayKey(d.getTime())); } return arr; }, [startDate, horizon]);
  const inHorizon = missions.filter((m) => days.includes(m.day));
  return (
    <div>
      <SectionTitle>Таймлайн<input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...inp, width: "auto", marginLeft: 12, display: "inline-block" }} /></SectionTitle>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[1, 3, 5, 7].map((n) => <button key={n} onClick={() => setHorizon(n)} style={{ border: horizon === n ? "1px solid #1a1a1a" : "1px solid #e2e2e2", background: horizon === n ? "#1a1a1a" : "#fff", color: horizon === n ? "#fff" : "#555", padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{n} {n === 1 ? "день" : n < 5 ? "дні" : "днів"}</button>)}
      </div>
      {inHorizon.length === 0 ? <Empty>На обраний період немає запланованих місій.</Empty> : (
        <div style={{ ...card, padding: 20, overflowX: "auto" }}>
          {(() => {
            const horizonStart = new Date(`${days[0]}T00:00`).getTime();
            const totalSpan = horizon * 24 * 3600000;
            const labelW = 150;
            const minChart = Math.max(560, horizon * 220);
            const sorted = [...inHorizon].sort((a, b) => (a.plannedStart || 0) - (b.plannedStart || 0));
            const hourStep = horizon === 1 ? 4 : horizon <= 3 ? 6 : 12;
            return (
              <div style={{ minWidth: labelW + minChart }}>
                <div style={{ display: "flex", marginBottom: 2 }}>
                  <div style={{ width: labelW, flexShrink: 0 }} />
                  <div style={{ position: "relative", flex: 1, height: 20 }}>
                    {days.map((d, i) => <div key={d} style={{ position: "absolute", left: `${(i / horizon) * 100}%`, width: `${(1 / horizon) * 100}%`, textAlign: "center", fontSize: 11.5, fontWeight: 700, color: d === today ? "#16a34a" : "#444" }}>{dayLabel(d)}{d === today ? " ·сьогодні" : ""}</div>)}
                  </div>
                </div>
                <div style={{ display: "flex", marginBottom: 4 }}>
                  <div style={{ width: labelW, flexShrink: 0 }} />
                  <div style={{ position: "relative", flex: 1, height: 16 }}>
                    {days.map((d, di) => Array.from({ length: 24 / hourStep + 1 }, (_, k) => k * hourStep).filter((h) => h < 24 || di === horizon - 1).map((h) => { const pos = ((di * 24 + h) / (horizon * 24)) * 100; return <div key={`${di}-${h}`} style={{ position: "absolute", left: `${pos}%`, fontSize: 9.5, color: "#bbb", transform: "translateX(-50%)" }}>{String(h).padStart(2, "0")}</div>; }))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sorted.map((m) => {
                    const s = MIS_STATUS[m.status];
                    const left = Math.max(0, Math.min(100, ((m.plannedStart - horizonStart) / totalSpan) * 100));
                    const width = Math.max(0.6, Math.min(100 - left, ((m.durationMin * 60000) / totalSpan) * 100));
                    const isSel = selectedId === m.id;
                    return (
                      <div key={m.id} style={{ display: "flex", alignItems: "center" }}>
                        <div onClick={() => setSelectedId(isSel ? null : m.id)} style={{ width: labelW, fontSize: 11.5, color: isSel ? "#16a34a" : "#444", fontWeight: isSel ? 700 : 400, paddingRight: 8, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>{m.title || `#${String(m.id).slice(-4)}`}{m.executor ? ` · ${m.executor}` : ""}</div>
                        <div style={{ position: "relative", flex: 1, height: 28, background: "#f7f7f7", borderRadius: 6 }}>
                          {days.map((d, i) => i > 0 && <div key={i} style={{ position: "absolute", left: `${(i / horizon) * 100}%`, top: 0, bottom: 0, width: 1, background: "#dcdcdc" }} />)}
                          <div onClick={() => setSelectedId(isSel ? null : m.id)} title={`${dayLabel(m.day)} ${fmtTime(m.plannedStart)} · ${fmtDur(m.durationMin)} · ${s.label}`} style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 3, bottom: 3, background: s.color, borderRadius: 4, display: "flex", alignItems: "center", paddingLeft: 5, color: "#fff", fontSize: 10, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", cursor: "pointer", outline: isSel ? "2px solid #1a1a1a" : "none", outlineOffset: 1 }}>{fmtTime(m.plannedStart)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, marginLeft: labelW }}>
                  {Object.values(MIS_STATUS).map((st) => <span key={st.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#777" }}><span style={{ width: 10, height: 10, borderRadius: 2, background: st.color }} />{st.label}</span>)}
                </div>
                {(() => {
                  const m = sorted.find((x) => x.id === selectedId);
                  if (!m) return null;
                  const s = MIS_STATUS[m.status];
                  return (
                    <div style={{ ...card, padding: 16, marginTop: 14, borderColor: s.color + "66", borderWidth: 1.5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{m.title || `Місія #${String(m.id).slice(-4)}`}</span>
                        <button onClick={() => setSelectedId(null)} style={{ ...btnGhost, padding: "2px 8px", fontSize: 16, lineHeight: 1 }}>×</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 12.5, color: "#555" }}>
                        <span><span style={{ ...pill, background: s.bg, color: s.color }}>{s.label}</span></span>
                        <span>🕑 {dayLabel(m.day)} {fmtTime(m.plannedStart)} · {fmtDur(m.durationMin)}</span>
                        <span>🚚 {(m.vehicles || []).join(", ") || "—"}</span>
                        <span>👤 {m.executor || "—"}</span>
                        <span>📦 {(m.requestIds || []).length} заявок</span>
                      </div>
                      {m.report && <div style={{ marginTop: 8, padding: "6px 10px", background: "#fafafa", borderRadius: 6, fontSize: 12, color: "#555" }}>💬 {m.report}</div>}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function AdminRequests({ requests }) {
  const [filter, setFilter] = useState("all");
  const visible = requests.filter((r) => filter === "all" || r.status === filter);
  const counts = Object.keys(REQ_STATUS).reduce((a, s) => { a[s] = requests.filter((r) => r.status === s).length; return a; }, {});
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        <Metric label="Всього" value={requests.length} color="#1a1a1a" />
        {Object.entries(REQ_STATUS).map(([k, s]) => <Metric key={k} label={s.label} value={counts[k]} color={s.color} />)}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>Усі</Chip>
        {Object.entries(REQ_STATUS).map(([k, s]) => <Chip key={k} active={filter === k} onClick={() => setFilter(k)} dot={s.color}>{s.label}</Chip>)}
      </div>
      {visible.length === 0 ? <Empty>Заявок немає.</Empty> : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{visible.map((r) => <RequestCard key={r.id} req={r} />)}</div>}
    </div>
  );
}

function AdminMissions({ missions, requests }) {
  const reqById = useMemo(() => Object.fromEntries(requests.map((r) => [r.id, r])), [requests]);
  const counts = Object.keys(MIS_STATUS).reduce((a, s) => { a[s] = missions.filter((m) => m.status === s).length; return a; }, {});
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 18 }}>
        {Object.entries(MIS_STATUS).map(([k, s]) => <Metric key={k} label={s.label} value={counts[k]} color={s.color} />)}
      </div>
      {missions.length === 0 ? <Empty>Місій ще немає. Їх формують виконавці.</Empty> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {missions.map((m) => {
            const s = MIS_STATUS[m.status];
            const reqs = (m.requestIds || []).map((id) => reqById[id]).filter(Boolean);
            const totalW = reqs.reduce((sum, r) => sum + parseWeight(r.weight), 0);
            return (
              <div key={m.id} style={{ ...card, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{m.title || `Місія #${String(m.id).slice(-4)}`}</div>
                    <div style={{ fontSize: 13, color: "#555", marginBottom: 3 }}>🚚 {(m.vehicles || []).join(", ") || "—"} · 🕑 {fmtDateTime(m.plannedStart)} · {fmtDur(m.durationMin)}</div>
                    <div style={{ fontSize: 12.5, color: "#888" }}>Заявок: {reqs.length}{totalW ? ` · ~${totalW} кг` : ""}{m.executor ? ` · виконавець: ${m.executor}` : ""}</div>
                    {m.report && <div style={{ marginTop: 8, padding: "8px 10px", background: "#fafafa", borderRadius: 8, fontSize: 12.5, color: "#555" }}>💬 {m.report}</div>}
                  </div>
                  <span style={{ ...pill, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────── Тижневий календар (універсальний для ролей) ─────────
// mode: "requester" (можна додавати) | "view" (лише огляд)
function WeekCalendar({ requests, dailyLimit, mode, onAddForDay, currentUser }) {
  const today = new Date();
  const startOfWeek = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); x.setHours(0, 0, 0, 0); return x; };
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [selectedDay, setSelectedDay] = useState(null);
  const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
  const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });
  const active = (r) => r.status !== "cancelled";
  const takenOn = (key) => requests.filter((r) => r.datetime === key && active(r)).length;
  const onDay = (key) => requests.filter((r) => r.datetime === key && active(r));
  const shiftWeek = (n) => { const d = new Date(weekStart); d.setDate(d.getDate() + n * 7); setWeekStart(d); setSelectedDay(null); };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button onClick={() => shiftWeek(-1)} style={btnGhost}>← Тиждень</button>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{days[0].getDate()}.{String(days[0].getMonth() + 1).padStart(2, "0")} – {days[6].getDate()}.{String(days[6].getMonth() + 1).padStart(2, "0")}</span>
        <button onClick={() => shiftWeek(1)} style={btnGhost}>Тиждень →</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
        {days.map((d, i) => {
          const key = dk(d);
          const cnt = takenOn(key);
          const full = cnt >= dailyLimit;
          const isToday = key === dk(today);
          const isSel = key === selectedDay;
          const barColor = cnt === 0 ? "#e8e8e8" : full ? "#dc2626" : cnt / dailyLimit >= 0.7 ? "#d97706" : "#16a34a";
          return (
            <div key={key} onClick={() => setSelectedDay(isSel ? null : key)} style={{
              ...card, padding: "10px 8px", cursor: "pointer", textAlign: "center",
              border: isSel ? "1.5px solid #16a34a" : isToday ? "1.5px solid #c7d2fe" : "1px solid #ececec",
              background: isSel ? "#f0fdf4" : "#fff",
            }}>
              <div style={{ fontSize: 10.5, color: "#999", marginBottom: 2 }}>{WD[i]}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: isToday ? "#4f46e5" : "#1a1a1a" }}>{d.getDate()}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 6, flexWrap: "wrap" }}>
                {Array.from({ length: dailyLimit }, (_, k) => <span key={k} style={{ width: 6, height: 6, borderRadius: "50%", background: k < cnt ? barColor : "#eee" }} />)}
              </div>
              <div style={{ fontSize: 10, color: full ? "#dc2626" : "#aaa", marginTop: 4, fontWeight: full ? 700 : 400 }}>{cnt}/{dailyLimit}</div>
            </div>
          );
        })}
      </div>

      {selectedDay && (
        <div style={{ ...card, padding: 18, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{selectedDay.split("-").reverse().join(".")} · {takenOn(selectedDay)}/{dailyLimit} заявок</span>
            <button onClick={() => setSelectedDay(null)} style={{ ...btnGhost, padding: "2px 8px", fontSize: 16 }}>×</button>
          </div>
          {onDay(selectedDay).length === 0 ? (
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: mode === "requester" ? 12 : 0 }}>На цей день немає заявок.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: mode === "requester" ? 12 : 0 }}>
              {onDay(selectedDay).map((r) => {
                const s = REQ_STATUS[r.status] || REQ_STATUS.new;
                return (
                  <div key={r.id} style={{ padding: "8px 12px", background: "#fafafa", borderRadius: 8, fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span><b>{r.mission}</b> · {(r.cargoTypes || []).join(" + ")}{r.weight ? ` · ${r.weight}` : ""}{r.position ? ` · 📍 ${r.position}` : ""} <span style={{ color: "#aaa" }}>— {r.author}</span></span>
                    <span style={{ ...pill, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {mode === "requester" && (
            <>
              {takenOn(selectedDay) >= dailyLimit && <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 10 }}>⚠ День заповнений (ліміт {dailyLimit}). Додати все одно можна.</div>}
              <button onClick={() => onAddForDay(selectedDay)} style={btnPrimary}>+ Додати заявку на цей день</button>
            </>
          )}
        </div>
      )}
      {!selectedDay && <div style={{ fontSize: 12.5, color: "#aaa", marginTop: 14, textAlign: "center" }}>Клікни на день, щоб {mode === "requester" ? "переглянути заявки та додати нову" : "переглянути заявки дня"}.</div>}
    </div>
  );
}

// ───────── Дрібні компоненти ─────────
const Metric = ({ label, value, color }) => <div style={{ ...card, padding: "14px 16px" }}><div style={{ fontSize: 11.5, color: "#999", marginBottom: 6 }}>{label}</div><div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div></div>;
const Field = ({ label, children }) => <div style={{ marginBottom: 14 }}><label style={{ display: "block", fontSize: 12.5, color: "#666", marginBottom: 6, fontWeight: 500 }}>{label}</label>{children}</div>;
const SectionTitle = ({ children }) => <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 14px", display: "flex", alignItems: "center" }}>{children}</h2>;
const Empty = ({ children }) => <div style={{ ...card, padding: 40, textAlign: "center", color: "#999", fontSize: 13.5 }}>{children}</div>;
const Tab = ({ active, onClick, children }) => <button onClick={onClick} style={{ border: "none", padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: active ? "#fff" : "transparent", color: active ? "#1a1a1a" : "#888", boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>{children}</button>;
const Chip = ({ active, onClick, children, dot }) => <button onClick={onClick} style={{ border: active ? "1px solid #1a1a1a" : "1px solid #e2e2e2", background: active ? "#1a1a1a" : "#fff", color: active ? "#fff" : "#555", padding: "6px 12px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot }} />}{children}</button>;
const inp = { width: "100%", padding: "9px 11px", borderRadius: 8, border: "1px solid #e2e2e2", fontSize: 13.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" };
const btnPrimary = { background: "#16a34a", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer" };
const btnGhost = { background: "#fff", color: "#555", border: "1px solid #e2e2e2", padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 500 };
const statusBtn = { border: "1px solid", padding: "6px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer", fontWeight: 600, background: "#fff" };
const pill = { padding: "3px 9px", borderRadius: 20, fontSize: 11.5, fontWeight: 600 };
