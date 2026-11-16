const $ = (s) => document.querySelector(s);
// server/apiKey = desarrollo; prodServer/prodKey = producción; env elige cuál se usa
let cfg = { env: 'dev', server: 'http://localhost:3000', apiKey: '', prodServer: '', prodKey: '', user: '', method: 'auto', delay: 800 };
let capturedButtons = [];
let tab = null;
let captured = []; // [{field, row}]

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props);
  kids.forEach((k) => e.append(k));
  return e;
}

function status(msg, ok = true) {
  const s = $('#status');
  s.textContent = msg;
  s.className = ok ? 'ok' : 'err';
}

async function api(path, opts = {}) {
  const prod = cfg.env === 'prod';
  const base = prod ? cfg.prodServer : cfg.server;
  if (!base) throw new Error('Falta la URL del servidor de ' + (prod ? 'producción' : 'desarrollo') + ' en Configuración');
  const r = await fetch(base.replace(/\/$/, '') + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'x-api-key': prod ? cfg.prodKey : cfg.apiKey },
  });
  if (!r.ok) throw new Error((await r.text()) || 'HTTP ' + r.status);
  return r.json();
}

// Inyecta lib.js en todos los frames y ejecuta window.__autofill[fn](arg)
async function inFrames(fn, ...args) {
  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['lib.js'] });
  const res = await chrome.scripting.executeScript({
    target,
    func: (f, a) => window.__autofill[f](...a),
    args: [fn, args],
  });
  return res.map((r) => r.result).filter(Boolean);
}

async function loadList() {
  const box = $('#list');
  if (!cfg.user) {
    box.textContent = 'Indica tu usuario en Configuración.';
    $('#cfg').open = true;
    return;
  }
  try {
    const forms = await api('/api/forms?user=' + encodeURIComponent(cfg.user));
    const here = new URL(tab.url).pathname;
    forms.sort((a, b) => (b.page === here) - (a.page === here) || a.name.localeCompare(b.name));
    box.replaceChildren();
    if (!forms.length) box.append(h('span', { className: 'muted', textContent: 'Aún no hay formularios guardados.' }));
    for (const f of forms) {
      const fill = h('button', { className: 'primary', textContent: 'Rellenar' });
      fill.onclick = () => doFill(f);
      const del = h('button', { className: 'danger', textContent: '✕', title: 'Eliminar' });
      del.onclick = () => doDelete(f);
      const title = h('div', {}, h('strong', { textContent: f.name + ' ' }));
      if (f.page === here) title.append(h('span', { className: 'badge', textContent: 'esta página' }));
      const extras = (f.records || []).length;
      const add = h('button', { textContent: '+reg', title: 'Agregar como nuevo registro lo que hay ahora en la página' });
      add.onclick = () => addRecord(f);
      const kids = [fill, add];
      if (extras) {
        const rem = h('button', { textContent: '−reg', title: 'Quitar el último registro' });
        rem.onclick = () => removeRecord(f);
        kids.push(rem);
      }
      kids.push(del);
      box.append(
        h(
          'div',
          { className: 'form-item row' },
          h(
            'div',
            { style: 'flex:1' },
            title,
            h('small', {
              textContent: f.fields.length + ' campos · ' + (extras + 1) + ' registro(s)' + (f.button ? ' · con botón' : ''),
            })
          ),
          ...kids
        )
      );
    }
  } catch (e) {
    box.textContent = '';
    status('No se pudo conectar al servidor: ' + e.message, false);
  }
}

const saveForm = (f) =>
  api('/api/forms', {
    method: 'POST',
    body: JSON.stringify({ user: cfg.user, name: f.name, page: f.page, fields: f.fields, button: f.button || null, records: f.records || [] }),
  });

async function addRecord(f) {
  try {
    const cur = (await inFrames('capture')).flatMap((r) => r.fields);
    const rec = f.fields
      .map((b) => cur.find((c) => c.frame === b.frame && c.index === b.index))
      .filter(Boolean)
      .map((c) => ({ frame: c.frame, index: c.index, value: c.value, text: c.text }));
    if (!rec.length) return status('No se encontraron los campos de este formulario en la página.', false);
    await saveForm({ ...f, records: [...(f.records || []), rec] });
    status('Registro agregado a "' + f.name + '".');
    loadList();
  } catch (e) {
    status(e.message, false);
  }
}

async function removeRecord(f) {
  try {
    await saveForm({ ...f, records: (f.records || []).slice(0, -1) });
    loadList();
  } catch (e) {
    status(e.message, false);
  }
}

async function doFill(f) {
  try {
    const results = await inFrames('fillAll', f.fields, f.records || [], f.button || null, cfg.method, Number(cfg.delay) || 800);
    const filled = results.flatMap((r) => r.filled);
    const missing = results.flatMap((r) => r.missing);
    let msg = 'Rellenados: ' + filled.length + ' campos';
    if (missing.length) msg += '\nNo se pudieron rellenar:\n- ' + missing.join('\n- ');
    status(msg, !missing.length);
  } catch (e) {
    status('Error al rellenar: ' + e.message, false);
  }
}

async function doDelete(f) {
  if (!confirm('¿Eliminar "' + f.name + '"?')) return;
  try {
    await api('/api/forms/' + f._id + '?user=' + encodeURIComponent(cfg.user), { method: 'DELETE' });
    loadList();
  } catch (e) {
    status(e.message, false);
  }
}

$('#capture').onclick = async () => {
  try {
    const frames = await inFrames('capture');
    const fields = frames.flatMap((r) => r.fields);
    capturedButtons = frames.flatMap((r) => r.buttons);
    const sel = $('#btnSel');
    sel.replaceChildren(h('option', { value: '', textContent: '(ninguno)' }));
    capturedButtons.forEach((b, i) => sel.append(h('option', { value: String(i), textContent: b.label || b.id || 'botón ' + (i + 1) })));
    captured = [];
    const box = $('#fields');
    box.replaceChildren();
    if (!fields.length) return status('No se encontraron campos en esta página.', false);
    for (const f of fields) {
      const chk = h('input', { type: 'checkbox', checked: f.kind === 'radio' ? f.value : f.value !== '' && f.value !== false });
      const lbl = h('label', { className: 'lbl' }, chk, ' ' + (f.label || f.name || f.id || '(sin nombre)'));
      let editor;
      if (f.kind === 'checkbox' || f.kind === 'radio') {
        editor = h('span', { className: 'muted', textContent: ' ' + (f.value ? 'marcado' : 'sin marcar') + (f.val ? ' [' + f.val + ']' : '') });
      } else if (f.kind === 'textarea') {
        editor = h('textarea', { rows: 3, value: f.value });
      } else {
        editor = h('input', { type: 'text', value: f.kind === 'select' ? f.text || f.value : f.value });
        if (f.kind === 'select') editor.disabled = true;
      }
      const entry = { field: f, chk, editor };
      const div = h('div', { className: 'field' }, lbl, editor);
      if (f.kind === 'textarea') {
        entry.dragChk = h('input', { type: 'checkbox' });
        div.append(h('label', { className: 'muted' }, entry.dragChk, ' Simular arrastrar y soltar en este campo'));
      }
      captured.push(entry);
      box.append(div);
    }
    $('#captured').style.display = 'block';
    status(fields.length + ' campos detectados. Marca los que quieres guardar.');
  } catch (e) {
    status('No se puede leer esta página: ' + e.message, false);
  }
};

$('#save').onclick = async () => {
  const name = $('#formName').value.trim();
  if (!cfg.user) return status('Configura tu usuario primero.', false);
  if (!name) return status('Ponle un nombre al formulario.', false);
  const fields = captured
    .filter((c) => c.chk.checked)
    .map((c) => {
      const f = { ...c.field };
      if (f.kind === 'textarea' || (f.kind !== 'select' && f.kind !== 'checkbox' && f.kind !== 'radio')) f.value = c.editor.value;
      if (c.dragChk && c.dragChk.checked) f.drag = true;
      return f;
    });
  if (!fields.length) return status('No hay campos marcados.', false);
  try {
    await api('/api/forms', {
      method: 'POST',
      body: JSON.stringify({
        user: cfg.user,
        name,
        page: new URL(tab.url).pathname,
        fields,
        button: $('#btnSel').value === '' ? null : capturedButtons[Number($('#btnSel').value)],
        records: [],
      }),
    });
    status('Guardado "' + name + '" (' + fields.length + ' campos).');
    $('#captured').style.display = 'none';
    loadList();
  } catch (e) {
    status('Error al guardar: ' + e.message, false);
  }
};

$('#saveCfg').onclick = async () => {
  cfg = {
    user: $('#user').value.trim(),
    env: $('#env').value,
    server: $('#server').value.trim() || 'http://localhost:3000',
    apiKey: $('#apiKey').value,
    prodServer: $('#prodServer').value.trim(),
    prodKey: $('#prodKey').value,
    method: $('#method').value,
    delay: Number($('#delay').value) || 800,
  };
  await chrome.storage.local.set(cfg);
  $('#who').textContent = cfg.user + ' · ' + (cfg.env === 'prod' ? 'PROD' : 'DEV');
  status('Configuración guardada.');
  loadList();
};
$('#reload').onclick = loadList;

// ---------- Flujos grabados ----------
const stepText = (s) =>
  s.k === 'click' ? 'Clic: ' + (s.b.label || s.b.id || s.b.path) : 'Campo: ' + (s.f.label || s.f.name || s.f.id || s.f.path);

async function loadFlows() {
  const box = $('#flows');
  box.replaceChildren();
  if (!cfg.user) return;
  try {
    const flows = await api('/api/flows?user=' + encodeURIComponent(cfg.user));
    if (!flows.length) box.append(h('span', { className: 'muted', textContent: 'Aún no hay flujos grabados.' }));
    for (const fl of flows) {
      const play = h('button', { className: 'primary', textContent: '▶ Reproducir' });
      play.onclick = () => doPlay(fl);
      const del = h('button', { className: 'danger', textContent: '✕', title: 'Eliminar' });
      del.onclick = async () => {
        if (!confirm('¿Eliminar el flujo "' + fl.name + '"?')) return;
        try {
          await api('/api/flows/' + fl._id + '?user=' + encodeURIComponent(cfg.user), { method: 'DELETE' });
          loadFlows();
        } catch (e) {
          status(e.message, false);
        }
      };
      box.append(
        h(
          'div',
          { className: 'form-item row' },
          h('div', { style: 'flex:1' }, h('strong', { textContent: fl.name }), h('br'), h('small', { textContent: fl.steps.length + ' pasos' })),
          play,
          del
        )
      );
    }
  } catch (e) {
    status('Flujos: ' + e.message, false);
  }
}

async function doPlay(fl) {
  try {
    status('Reproduciendo "' + fl.name + '"…');
    const results = await inFrames('play', fl.steps, cfg.method, Number(cfg.delay) || 800);
    const ok = results.flatMap((r) => r.filled);
    const bad = results.flatMap((r) => r.missing);
    let msg = 'Pasos ejecutados: ' + ok.length + ' de ' + fl.steps.length;
    if (bad.length) msg += '\nProblemas:\n- ' + bad.join('\n- ');
    status(msg, !bad.length);
  } catch (e) {
    status('Error al reproducir: ' + e.message, false);
  }
}

async function recState() {
  const { rec } = await chrome.storage.local.get('rec');
  const box = $('#recbox');
  box.replaceChildren();
  $('#rec').style.display = rec ? 'none' : '';
  if (!rec) {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  const discard = h('button', { className: 'danger', textContent: 'Descartar' });
  discard.onclick = async () => {
    await chrome.storage.local.remove('rec');
    recState();
  };
  if (rec.active) {
    const stop = h('button', { textContent: '■ Detener' });
    stop.onclick = async () => {
      rec.active = false;
      await chrome.storage.local.set({ rec });
      recState();
    };
    box.append(h('div', { textContent: '● Grabando (' + rec.steps.length + ' pasos). Trabaja en la página; para parar usa el panel rojo.' }), stop, ' ', discard);
    return;
  }
  const draft = rec.steps;
  if (rec.ignored && rec.ignored.length)
    box.append(h('div', { className: 'muted', textContent: '⚠ Botones NO grabados (submit o sin type, por seguridad): ' + [...new Set(rec.ignored)].join(', ') }));
  const list = h('div');
  const renderSteps = () => {
    list.replaceChildren();
    draft.forEach((s, i) => {
      const row = h('div', { className: 'field' }, h('div', { textContent: i + 1 + '. ' + stepText(s) }));
      if (s.k === 'fill') {
        const k = s.f.kind;
        if (k === 'checkbox' || k === 'radio') row.append(h('small', { className: 'muted', textContent: s.f.value ? 'marcado' : 'sin marcar' }));
        else if (k === 'select') row.append(h('small', { className: 'muted', textContent: s.f.text || s.f.value }));
        else {
          const inp = k === 'textarea' ? h('textarea', { rows: 2, value: s.f.value }) : h('input', { type: 'text', value: s.f.value });
          inp.oninput = () => (s.f.value = inp.value);
          row.append(inp);
        }
      }
      const x = h('button', { className: 'danger', textContent: '✕ quitar paso' });
      x.onclick = () => {
        draft.splice(i, 1);
        renderSteps();
      };
      row.append(x);
      list.append(row);
    });
  };
  renderSteps();
  const name = h('input', { type: 'text', placeholder: 'Nombre del flujo' });
  const save = h('button', { className: 'primary', textContent: 'Guardar flujo' });
  save.onclick = async () => {
    if (!name.value.trim()) return status('Ponle un nombre al flujo.', false);
    if (!draft.length) return status('El flujo no tiene pasos.', false);
    try {
      await api('/api/flows', { method: 'POST', body: JSON.stringify({ user: cfg.user, name: name.value.trim(), page: rec.page, steps: draft }) });
      await chrome.storage.local.remove('rec');
      status('Flujo guardado (' + draft.length + ' pasos).');
      recState();
      loadFlows();
    } catch (e) {
      status('Error al guardar: ' + e.message, false);
    }
  };
  box.append(h('div', { textContent: 'Grabación terminada: ' + draft.length + ' pasos.' }), list, h('div', { className: 'row' }, name), save, ' ', discard);
}

$('#rec').onclick = async () => {
  if (!cfg.user) return status('Configura tu usuario primero.', false);
  try {
    await chrome.storage.local.set({ rec: { active: true, page: new URL(tab.url).pathname, steps: [], ignored: [] } });
    await inFrames('startRec');
    status('Grabando. Haz tu flujo en la página y pulsa "Parar" en el panel rojo; luego reabre este popup.');
    window.close();
  } catch (e) {
    await chrome.storage.local.remove('rec');
    status('No se pudo iniciar la grabación: ' + e.message, false);
  }
};
$('#reloadFlows').onclick = loadFlows;

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  cfg = { ...cfg, ...(await chrome.storage.local.get(Object.keys(cfg))) };
  $('#user').value = cfg.user;
  $('#env').value = cfg.env;
  $('#server').value = cfg.server;
  $('#apiKey').value = cfg.apiKey;
  $('#prodServer').value = cfg.prodServer;
  $('#prodKey').value = cfg.prodKey;
  $('#method').value = cfg.method;
  $('#delay').value = cfg.delay;
  $('#who').textContent = cfg.user + ' · ' + (cfg.env === 'prod' ? 'PROD' : 'DEV');
  loadList();
  loadFlows();
  recState();
})();
