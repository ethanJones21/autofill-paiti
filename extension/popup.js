const $ = (s) => document.querySelector(s);
// URL del servidor. Cámbiala por la de producción antes de repartir la carpeta.
const SERVER_URL = "http://localhost:3000";

// Valores fijos: textarea en automático (prueba varios métodos) y espera tras cada clic
const cfg = { serverUrl: SERVER_URL, method: "auto", delay: 800 };
let auth = null; // { token, username } o null sin sesión
let tab = null;
let allFlows = [];
let view = "public"; // 'mine' | 'public'
let editing = false;
let recExists = false;

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  kids.forEach((k) => e.append(k));
  return e;
}

function status(msg, ok = true) {
  const s = $("#status");
  s.textContent = msg;
  s.className = ok ? "ok" : "err";
}

// Mensajes de sesión/ajustes: salen debajo del formulario de inicio de sesión
function cfgStatus(msg, ok = true) {
  const s = $("#cfgStatus");
  s.textContent = String(msg).slice(0, 300);
  s.className = ok ? "ok" : "err";
  if (!ok && !auth) $("#loginBox").open = true;
}

async function setAuth(a) {
  auth = a;
  if (a) await chrome.storage.local.set({ auth: a });
  else await chrome.storage.local.remove("auth");
  showSession();
}

// Sin sesión: formulario desplegable. Con sesión: usuario + Salir.
function showSession() {
  $("#loginBox").style.display = auth ? "none" : "";
  $("#userBar").style.display = auth ? "" : "none";
  $("#userName").textContent = auth ? auth.username : "";
  $("#tabs").style.display = auth ? "" : "none";
  if (!auth) view = "public";
}

async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = "Bearer " + auth.token;
  const r = await fetch(cfg.serverUrl.replace(/\/$/, "") + path, {
    ...opts,
    headers,
  });
  if (r.status === 401 && auth) {
    // Sesión vencida: se cierra y se vuelve a ver solo lo público
    await setAuth(null);
    loadFlows();
  }
  if (!r.ok) throw new Error((await r.text()) || "HTTP " + r.status);
  return r.json();
}

// Inyecta lib.js en todos los frames y ejecuta window.__autofill[fn](arg)
async function inFrames(fn, ...args) {
  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ["lib.js"] });
  const res = await chrome.scripting.executeScript({
    target,
    func: (f, a) => window.__autofill[f](...a),
    args: [fn, args],
  });
  return res.map((r) => r.result).filter(Boolean);
}

// ---------- Sesión y ajustes ----------
async function doLogin() {
  try {
    const r = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#user").value,
        password: $("#pass").value,
      }),
    });
    $("#pass").value = "";
    $("#loginBox").open = false;
    cfgStatus("", true);
    $("#cfgStatus").className = "";
    view = "mine";
    await setAuth({ token: r.token, username: r.username });
    loadFlows();
    recState();
  } catch (e) {
    cfgStatus(e.message, false);
  }
}
$("#login").onclick = doLogin;
// Ojo: un onkeydown que devuelve false cancela la tecla, por eso va con llaves
$("#pass").onkeydown = (e) => {
  if (e.key === "Enter") doLogin();
};

// Ojo para ver u ocultar la contraseña mientras se escribe
$("#eye").onclick = () => {
  const p = $("#pass");
  const show = p.type === "password";
  p.type = show ? "text" : "password";
  $("#eye").textContent = show ? "🙈" : "👁";
  $("#eye").title = show ? "Ocultar contraseña" : "Mostrar contraseña";
  p.focus();
};

$("#logout").onclick = async () => {
  await setAuth(null);
  loadFlows();
  recState();
};

// ---------- Lista de flujos ----------
const stepText = (s) =>
  s.k === "click"
    ? "Clic: " + (s.b.label || s.b.id || s.b.path)
    : "Campo: " + (s.f.label || s.f.name || s.f.id || s.f.path);

async function loadFlows() {
  try {
    allFlows = await api("/api/flows");
    renderFlows();
  } catch (e) {
    allFlows = [];
    renderFlows();
    cfgStatus("No se pudo conectar al servidor: " + e.message, false);
  }
}

function setView(v) {
  view = v;
  renderFlows();
}
$("#tabMine").onclick = () => setView("mine");
$("#tabPublic").onclick = () => setView("public");

function renderFlows() {
  const mine = allFlows.filter((f) => f.mine);
  const pub = allFlows.filter((f) => f.visibility === "public");
  if (!auth) view = "public";
  $("#tabMine").textContent = "Mis flujos (" + mine.length + ")";
  $("#tabPublic").textContent = "Públicos (" + pub.length + ")";
  $("#tabMine").classList.toggle("active", view === "mine");
  $("#tabPublic").classList.toggle("active", view === "public");
  $("#rec").style.display =
    auth && view === "mine" && !editing && !recExists ? "" : "none";

  const here = tab ? new URL(tab.url).pathname : "";
  const list = (view === "mine" ? mine : pub).slice();
  // Primero los de esta página, luego por nombre
  list.sort(
    (a, b) =>
      (b.page === here) - (a.page === here) || a.name.localeCompare(b.name),
  );
  const box = $("#flows");
  box.replaceChildren();
  if (!list.length)
    box.append(
      h("span", {
        className: "muted",
        textContent:
          view === "mine"
            ? "Aún no tienes flujos. Graba uno o copia uno público."
            : "Aún no hay flujos públicos.",
      }),
    );
  for (const fl of list) box.append(flowItem(fl, here));
}

function flowItem(fl, here) {
  const play = h("button", {
    className: "primary",
    textContent: "▶",
    title: "Reproducir",
  });
  play.onclick = () => doPlay(fl);
  const kids = [play];
  if (auth) {
    const clone = h("button", {
      textContent: "⧉",
      title: fl.mine
        ? "Clonar (copia privada para editar)"
        : "Copiar a mis flujos",
    });
    clone.onclick = () => doClone(fl);
    kids.push(clone);
  }
  if (fl.mine) {
    const edit = h("button", { textContent: "✎", title: "Editar" });
    edit.onclick = () => openEditor(fl);
    const del = h("button", {
      className: "danger",
      textContent: "✕",
      title: "Eliminar",
    });
    del.onclick = () => doDelete(fl);
    kids.push(edit, del);
  }
  const title = h("div", {}, h("strong", { textContent: fl.name + " " }));
  // En "Mis flujos" importa si es público o privado; en "Públicos", quién lo hizo
  if (view === "mine")
    title.append(
      h("span", {
        className: "badge " + fl.visibility,
        textContent: fl.visibility === "public" ? "público" : "privado",
      }),
    );
  if (fl.page === here)
    title.append(
      " ",
      h("span", { className: "badge here", textContent: "esta página" }),
    );
  const info =
    fl.steps.length +
    " pasos" +
    (view === "public" ? " · por " + fl.owner : "");
  return h(
    "div",
    { className: "form-item row" },
    h("div", { style: "flex:1" }, title, h("small", { textContent: info })),
    ...kids,
  );
}

async function doPlay(fl) {
  try {
    status('Reproduciendo "' + fl.name + '"…');
    const results = await inFrames(
      "play",
      fl.steps,
      cfg.method,
      Number(cfg.delay) || 800,
    );
    const ok = results.flatMap((r) => r.filled);
    const bad = results.flatMap((r) => r.missing);
    let msg = "Pasos ejecutados: " + ok.length + " de " + fl.steps.length;
    if (bad.length) msg += "\nProblemas:\n- " + bad.join("\n- ");
    status(msg, !bad.length);
  } catch (e) {
    status("Error al reproducir: " + e.message, false);
  }
}

async function doClone(fl) {
  try {
    const r = await api("/api/flows/" + fl._id + "/clone", { method: "POST" });
    status('Copia creada: "' + r.name + '" (privada).');
    loadFlows();
  } catch (e) {
    status(e.message, false);
  }
}

async function doDelete(fl) {
  if (!confirm('¿Eliminar el flujo "' + fl.name + '"?')) return;
  try {
    await api("/api/flows/" + fl._id, { method: "DELETE" });
    loadFlows();
  } catch (e) {
    status(e.message, false);
  }
}

// ---------- Editor de flujo (sirve para uno nuevo grabado y para uno existente) ----------
// init = { name, visibility, steps }. onSave({name, visibility, steps}) devuelve una promesa.
function renderEditor(box, init, onSave, onCancel, saveLabel) {
  const draft = JSON.parse(JSON.stringify(init.steps));
  const name = h("input", {
    type: "text",
    value: init.name || "",
    placeholder: "Nombre del flujo",
  });
  const vis = h(
    "select",
    {},
    h("option", { value: "private", textContent: "Privado (solo yo)" }),
    h("option", { value: "public", textContent: "Público (lo ve cualquiera)" }),
  );
  vis.value = init.visibility || "private";
  const warn = h("small", {
    className: "muted",
    textContent: "Los valores escritos en los pasos serán visibles para todos.",
  });
  const syncWarn = () =>
    (warn.style.display = vis.value === "public" ? "" : "none");
  vis.onchange = syncWarn;
  syncWarn();

  const list = h("div");
  const renderSteps = () => {
    list.replaceChildren();
    draft.forEach((s, i) => {
      const row = h(
        "div",
        { className: "field" },
        h("div", { textContent: i + 1 + ". " + stepText(s) }),
      );
      if (s.k === "fill") {
        const k = s.f.kind;
        if (k === "checkbox") {
          const c = h("input", { type: "checkbox", checked: !!s.f.value });
          c.onchange = () => (s.f.value = c.checked);
          row.append(h("label", { className: "muted" }, c, " marcado"));
        } else if (k === "radio")
          row.append(
            h("small", {
              className: "muted",
              textContent: s.f.value ? "marcado" : "sin marcar",
            }),
          );
        else if (k === "select")
          row.append(
            h("small", {
              className: "muted",
              textContent: s.f.text || s.f.value,
            }),
          );
        else {
          const inp =
            k === "textarea"
              ? h("textarea", { rows: 2, value: s.f.value })
              : h("input", { type: "text", value: s.f.value });
          inp.oninput = () => (s.f.value = inp.value);
          row.append(inp);
        }
      }
      const move = (d) => {
        const j = i + d;
        if (j < 0 || j >= draft.length) return;
        [draft[i], draft[j]] = [draft[j], draft[i]];
        renderSteps();
      };
      const up = h("button", { textContent: "↑", title: "Subir" });
      up.onclick = () => move(-1);
      const down = h("button", { textContent: "↓", title: "Bajar" });
      down.onclick = () => move(1);
      const x = h("button", { className: "danger", textContent: "✕ quitar" });
      x.onclick = () => {
        draft.splice(i, 1);
        renderSteps();
      };
      row.append(h("div", { className: "row" }, up, down, x));
      list.append(row);
    });
  };
  renderSteps();

  const save = h("button", { className: "primary", textContent: saveLabel });
  save.onclick = async () => {
    if (!name.value.trim()) return status("Ponle un nombre al flujo.", false);
    if (!draft.length) return status("El flujo no tiene pasos.", false);
    try {
      await onSave({
        name: name.value.trim(),
        visibility: vis.value,
        steps: draft,
      });
    } catch (e) {
      status("Error al guardar: " + e.message, false);
    }
  };
  const cancel = h("button", {
    textContent: onCancel.label,
    className: onCancel.danger ? "danger" : "",
  });
  cancel.onclick = onCancel.run;
  box.replaceChildren(
    list,
    h("div", { className: "row" }, name),
    h("div", { className: "row" }, vis),
    warn,
    h("div", { className: "row" }, save, cancel),
  );
}

// Editar un flujo existente: reemplaza la lista mientras se edita
function openEditor(fl) {
  const box = $("#editbox");
  editing = true;
  $("#listView").style.display = "none";
  box.style.display = "block";
  const close = () => {
    editing = false;
    box.style.display = "none";
    box.replaceChildren();
    $("#listView").style.display = "";
    loadFlows();
  };
  renderEditor(
    box,
    fl,
    async (f) => {
      await api("/api/flows/" + fl._id, {
        method: "PUT",
        body: JSON.stringify({ ...f, page: fl.page }),
      });
      status('Flujo "' + f.name + '" actualizado.');
      close();
    },
    { label: "Cancelar", run: close },
    "Guardar cambios",
  );
}

// ---------- Grabación ----------
// Estado en chrome.storage.local.rec = { active, page, steps, ignored }
async function recState() {
  const { rec } = await chrome.storage.local.get("rec");
  const box = $("#recbox");
  box.replaceChildren();
  recExists = !!rec;
  renderFlows();
  if (!rec) {
    box.style.display = "none";
    return;
  }
  box.style.display = "block";
  const discard = async () => {
    await chrome.storage.local.remove("rec");
    recState();
  };
  if (rec.active) {
    const stop = h("button", { textContent: "■ Detener" });
    stop.onclick = async () => {
      rec.active = false;
      await chrome.storage.local.set({ rec });
      recState();
    };
    const d = h("button", { className: "danger", textContent: "Descartar" });
    d.onclick = discard;
    box.append(
      h("div", {
        textContent:
          "● Grabando (" +
          rec.steps.length +
          " pasos). Trabaja en la página; para parar usa el panel rojo.",
      }),
      stop,
      " ",
      d,
    );
    return;
  }
  const head = h("div", {
    textContent: "Grabación terminada: " + rec.steps.length + " pasos.",
  });
  const ignored =
    rec.ignored && rec.ignored.length
      ? h("div", {
          className: "muted",
          textContent:
            "⚠ Botones NO grabados (submit o sin type, por seguridad): " +
            [...new Set(rec.ignored)].join(", "),
        })
      : "";
  const body = h("div");
  box.append(head, ignored, body);
  renderEditor(
    body,
    { name: "", visibility: "private", steps: rec.steps },
    async (f) => {
      await api("/api/flows", {
        method: "POST",
        body: JSON.stringify({ ...f, page: rec.page }),
      });
      await chrome.storage.local.remove("rec");
      status("Flujo guardado (" + f.steps.length + " pasos).");
      view = "mine";
      recState();
      loadFlows();
    },
    { label: "Descartar", danger: true, run: discard },
    "Guardar flujo",
  );
}

$("#rec").onclick = async () => {
  if (!auth) return cfgStatus("Inicia sesión primero.", false);
  try {
    await chrome.storage.local.set({
      rec: {
        active: true,
        page: new URL(tab.url).pathname,
        steps: [],
        ignored: [],
      },
    });
    await inFrames("startRec");
    status(
      'Grabando. Haz tu flujo en la página y pulsa "Parar" en el panel rojo; luego reabre este popup.',
    );
    window.close();
  } catch (e) {
    await chrome.storage.local.remove("rec");
    status("No se pudo iniciar la grabación: " + e.message, false);
  }
};
$("#reloadFlows").onclick = loadFlows;

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  auth = (await chrome.storage.local.get("auth")).auth || null;
  view = auth ? "mine" : "public";
  showSession();
  $("#loginBox").open = !auth;
  loadFlows();
  recState();
})();
