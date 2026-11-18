// Se inyecta en la página (y en todos sus iframes) desde el popup.
(() => {
  if (window.__autofill && window.__autofill.v === 6) return;

  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'password']);

  const clean = (t) =>
    (t || '').replace(/\s+/g, ' ').replace(/[:*]/g, '').trim().toLowerCase();

  // Un id con 4+ dígitos seguidos suele ser autogenerado -> no es confiable.
  const stableId = (id) => !!id && !/\d{4,}/.test(id) && !/^(ext-|j_id|ui-id)/i.test(id);

  function fieldsOf() {
    return [...document.querySelectorAll('input,select,textarea')].filter((el) => {
      const t = (el.type || '').toLowerCase();
      return !SKIP_TYPES.has(t) && !el.disabled && !el.readOnly;
    });
  }

  function labelOf(el) {
    let node = null;
    if (el.id) node = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    if (!node) node = el.closest('label');
    if (!node) {
      const g = el.closest('.form-group, .input-group, .checkbox, .radio');
      if (g) node = g.querySelector('label, .control-label');
    }
    if (!node) {
      const td = el.closest('td,th');
      if (td && td.previousElementSibling) node = td.previousElementSibling;
    }
    if (!node && el.previousElementSibling && /^(LABEL|SPAN|B|STRONG)$/.test(el.previousElementSibling.tagName))
      node = el.previousElementSibling;
    return node ? clean(node.textContent) : '';
  }

  function cssPath(el) {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && n !== document.documentElement) {
      if (stableId(n.id)) {
        parts.unshift('#' + CSS.escape(n.id));
        break;
      }
      let i = 1;
      let s = n;
      while ((s = s.previousElementSibling)) if (s.tagName === n.tagName) i++;
      parts.unshift(n.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  const kindOf = (el) =>
    el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : (el.type || 'text').toLowerCase();

  function describe(el, index) {
    const kind = kindOf(el);
    const d = {
      frame: location.pathname,
      kind,
      id: stableId(el.id) ? el.id : '',
      name: el.name || '',
      label: labelOf(el),
      path: cssPath(el),
      index,
    };
    if (kind === 'radio' || kind === 'checkbox') {
      d.val = el.value;
      d.value = el.checked;
    } else if (kind === 'select') {
      d.value = el.value;
      d.text = el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '';
    } else {
      d.value = el.value;
    }
    return d;
  }

  // Solo botones con type="button" explícito. Nunca submit/reset ni <button> sin type.
  function buttonsOf() {
    return [...document.querySelectorAll('button[type="button"],input[type="button"]')].filter((el) => !el.disabled);
  }
  const btnLabel = (el) => clean(el.value || el.textContent || el.title || '');

  function describeButton(el, index) {
    return {
      frame: location.pathname,
      id: stableId(el.id) ? el.id : '',
      label: btnLabel(el),
      path: cssPath(el),
      index,
    };
  }

  function findButton(b) {
    let best = null;
    let bestScore = 0;
    buttonsOf().forEach((el, i) => {
      let s = 0;
      if (b.id && el.id === b.id) s += 8;
      if (b.path && cssPath(el) === b.path) s += 5;
      if (b.label && btnLabel(el) === b.label) s += 3;
      if (b.index === i) s += 1;
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    });
    return bestScore >= 3 ? best : null;
  }

  // ---- Localizar el elemento por puntaje (no depende de un solo atributo) ----
  function find(f, candidates) {
    let best = null;
    let bestScore = 0;
    candidates.forEach((el, i) => {
      if (kindOf(el) !== f.kind) return;
      if ((f.kind === 'radio' || f.kind === 'checkbox') && f.name && el.name === f.name && el.value !== f.val) return;
      let s = 0;
      if (f.id && el.id === f.id) s += 8;
      if (f.path && cssPath(el) === f.path) s += 5;
      if (f.name && el.name === f.name) s += 4;
      if (f.label && labelOf(el) === f.label) s += 3;
      if (f.index === i) s += 1;
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    });
    return bestScore >= 3 ? best : null;
  }

  // ---- Escribir valores ----
  function nativeSet(el, v) {
    const proto =
      el.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  }
  const fire = (el, ...types) =>
    types.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true, cancelable: true })));
  const norm = (s) => String(s).replace(/\r\n/g, '\n');
  const same = (el, v) => norm(el.value) === norm(v);

  const strategies = {
    // 1) asignación directa + eventos (no dispara 'paste')
    value(el, v) {
      el.focus();
      nativeSet(el, v);
      fire(el, 'input', 'change');
    },
    // 2) como si el usuario insertara texto (genera beforeinput/input, sin evento paste)
    insert(el, v) {
      el.focus();
      nativeSet(el, '');
      el.select();
      document.execCommand('insertText', false, v);
      fire(el, 'change');
    },
    // 3) simula arrastrar y soltar texto sobre el campo (el "truco del mouse")
    drop(el, v) {
      el.focus();
      let dt = null;
      try {
        dt = new DataTransfer();
        dt.setData('text/plain', v);
        dt.setData('text', v);
      } catch (e) {}
      ['dragenter', 'dragover', 'drop'].forEach((t) => {
        try {
          el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
        } catch (e) {}
      });
      // un drop sintético no inserta texto por sí solo: lo dejamos puesto
      if (!same(el, v)) strategies.value(el, v);
    },
    // 4) tecla por tecla
    type(el, v) {
      el.focus();
      nativeSet(el, '');
      for (const ch of v) {
        const key = ch === '\n' ? 'Enter' : ch;
        el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keypress', { key, bubbles: true }));
        nativeSet(el, el.value + ch);
        el.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      }
      fire(el, 'change');
    },
  };

  function writeText(el, v, method) {
    const order = method && method !== 'auto' ? [method] : ['value', 'insert', 'drop', 'type'];
    for (const m of order) {
      try {
        strategies[m](el, v);
      } catch (e) {}
      if (same(el, v)) return m;
    }
    return null;
  }

  function mark(el) {
    const old = el.style.outline;
    el.style.outline = '2px solid #5cb85c';
    setTimeout(() => (el.style.outline = old), 1500);
  }

  function fill(fields, method) {
    const mine = fields.filter((f) => f.frame === location.pathname);
    const candidates = fieldsOf();
    const filled = [];
    const missing = [];
    for (const f of mine) {
      const name = f.label || f.name || f.id || f.path;
      const el = find(f, candidates);
      if (!el) {
        missing.push(name);
        continue;
      }
      let ok = true;
      if (f.kind === 'radio' || f.kind === 'checkbox') {
        if (el.checked !== !!f.value) el.click();
        ok = el.checked === !!f.value;
      } else if (f.kind === 'select') {
        nativeSet(el, f.value);
        if (el.value !== f.value && f.text) {
          const opt = [...el.options].find((o) => o.textContent.trim() === f.text);
          if (opt) nativeSet(el, opt.value);
        }
        fire(el, 'input', 'change');
        ok = el.value === f.value || (f.text && el.selectedOptions[0] && el.selectedOptions[0].textContent.trim() === f.text);
      } else if (f.kind === 'textarea') {
        ok = !!writeText(el, f.value, f.drag ? 'drop' : method);
      } else {
        strategies.value(el, f.value);
        ok = same(el, f.value) || !!writeText(el, f.value, method);
      }
      if (ok) {
        filled.push(name);
        mark(el);
      } else missing.push(name);
    }
    return { filled, missing };
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // =================== GRABADOR DE FLUJOS ===================
  // Estado en chrome.storage.local.rec = { active, page, steps:[{k:'fill',f}|{k:'click',b}], ignored:[] }
  let recActive = false;
  let attached = false;
  let queue = Promise.resolve();
  const sameField = (a, b) => a.frame === b.frame && a.path === b.path && a.val === b.val;

  function push(step) {
    queue = queue
      .then(async () => {
        const { rec } = await chrome.storage.local.get('rec');
        if (!rec || !rec.active) return;
        if (step.k === 'ignored') rec.ignored.push(step.label);
        else {
          const last = rec.steps[rec.steps.length - 1];
          // varios cambios seguidos del mismo campo: queda solo el último valor
          if (step.k === 'fill' && last && last.k === 'fill' && sameField(last.f, step.f)) last.f = step.f;
          else rec.steps.push(step);
        }
        await chrome.storage.local.set({ rec });
      })
      .catch(() => {});
  }

  function onChange(e) {
    if (!recActive || !e.isTrusted) return;
    const el = e.target;
    if (!el.matches || !el.matches('input,select,textarea')) return;
    const i = fieldsOf().indexOf(el);
    if (i >= 0) push({ k: 'fill', f: describe(el, i) });
  }

  function onClick(e) {
    if (!recActive || !e.isTrusted || !e.target.closest) return;
    if (e.target.closest('#__af_panel,#__af_toast')) return;
    // Botones reales: solo type="button". Submit / <button> sin type se ignoran por seguridad.
    const hard = e.target.closest('button,input[type="button"],input[type="submit"],input[type="image"]');
    if (hard) {
      const i = buttonsOf().indexOf(hard);
      if (i >= 0) push({ k: 'click', b: describeButton(hard, i) });
      else push({ k: 'ignored', label: btnLabel(hard) || hard.id || hard.tagName.toLowerCase() });
      return;
    }
    // Clic genérico: filas, íconos, enlaces "#"/javascript: y cualquier cosa clicable (cursor mano)
    const el = e.target;
    if (el.closest('input,select,textarea,label,option')) return;
    const a = el.closest('a');
    if (a) {
      const href = a.getAttribute('href');
      if (href && href !== '#' && !/^javascript:/i.test(href)) return; // enlace que navega: no
    }
    if (getComputedStyle(el).cursor !== 'pointer') return;
    push({ k: 'click', b: describeGeneric(el) });
  }

  // Texto del elemento o del contenedor cercano (para reconocer íconos sin texto)
  function ctxLabel(el) {
    for (let n = el, d = 0; n && n.nodeType === 1 && d < 4; n = n.parentElement, d++) {
      const t = clean(n.textContent);
      if (t && t.length <= 80) return t;
    }
    return '';
  }

  function describeGeneric(el) {
    return {
      frame: location.pathname,
      g: true,
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className.trim() : '',
      id: stableId(el.id) ? el.id : '',
      label: ctxLabel(el),
      path: cssPath(el),
    };
  }

  function findClickable(b) {
    if (b.id) {
      const byId = document.getElementById(b.id);
      if (byId) return byId;
    }
    let el = null;
    try {
      el = b.path ? document.querySelector(b.path) : null;
    } catch (e) {}
    if (el && (!b.label || ctxLabel(el) === b.label)) return el;
    if (b.label) {
      const c = [...document.getElementsByTagName(b.tag || '*')].filter(
        (x) => (!b.cls || x.className === b.cls) && ctxLabel(x) === b.label
      );
      const v = c.find(isVisible) || c[0];
      if (v) return v;
    }
    return el;
  }

  // Secuencia de eventos de ratón completa, más cercana a un clic real
  function simulateClick(el) {
    ['mousedown', 'mouseup'].forEach((t) =>
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
    );
    el.click();
  }

  // Espera a que la página deje de cambiar (modal abriendo, opción habilitándose, AJAX pintando)
  function waitQuiet(quiet = 300, max = 5000) {
    return new Promise((res) => {
      let t;
      const mo = new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(done, quiet);
      });
      const to = setTimeout(done, max);
      function done() {
        mo.disconnect();
        clearTimeout(t);
        clearTimeout(to);
        res();
      }
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      t = setTimeout(done, quiet);
    });
  }

  function renderPanel(rec) {
    if (window !== window.top) return;
    let p = document.getElementById('__af_panel');
    if (!rec) {
      if (p) p.remove();
      return;
    }
    if (!p) {
      p = document.createElement('div');
      p.id = '__af_panel';
      p.style.cssText =
        'position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#c0392b;color:#fff;padding:8px 12px;border-radius:4px;font:13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4)';
      document.body.appendChild(p);
    }
    p.replaceChildren();
    if (rec.active) {
      p.style.background = '#c0392b';
      p.append('● Grabando · ' + rec.steps.length + ' pasos · ');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = 'Parar';
      b.onclick = async () => {
        const { rec: r } = await chrome.storage.local.get('rec');
        if (r) {
          r.active = false;
          await chrome.storage.local.set({ rec: r });
        }
      };
      p.append(b);
    } else {
      p.style.background = '#27ae60';
      p.textContent = 'Grabación lista (' + rec.steps.length + ' pasos). Abre el popup de la extensión para guardarla.';
      setTimeout(() => p.remove(), 8000);
    }
  }

  async function startRec() {
    recActive = true;
    if (!attached) {
      attached = true;
      document.addEventListener('change', onChange, true);
      document.addEventListener('click', onClick, true);
      chrome.storage.onChanged.addListener((c) => {
        if (!c.rec) return;
        recActive = !!(c.rec.newValue && c.rec.newValue.active);
        renderPanel(c.rec.newValue);
      });
    }
    const { rec } = await chrome.storage.local.get('rec');
    renderPanel(rec);
    return true;
  }

  // =================== REPRODUCTOR ===================
  const isVisible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));

  // Espera a que el elemento exista y sea visible; si solo existe oculto, lo devuelve al agotar el tiempo.
  async function waitFor(getter, timeout = 6000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const el = getter();
      if (el && isVisible(el)) return el;
      await sleep(100);
    }
    return getter();
  }

  // Cada marco escribe su avance en chrome.storage (clave AFP<run>:<marco>); el marco superior
  // junta todo y lo muestra como toast. Así funciona aunque el popup ya se haya cerrado.
  const AFP = 'afp:';
  const cancelKey = (run) => 'afpcancel:' + run;

  function playToast(run, name, total) {
    const old = document.getElementById('__af_toast');
    if (old) old.remove();
    const host = document.createElement('div');
    host.id = '__af_toast';
    host.style.cssText = 'all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      '.t{width:300px;box-sizing:border-box;background:#fff;color:#222;border-radius:14px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.28);border-left:5px solid #4169e1}' +
      '.t.ok{border-left-color:#2e9e5b}.t.err{border-left-color:#c0392b}' +
      '.h{font-weight:600;word-break:break-word}.m{color:#777;margin-top:2px}' +
      '.bar{height:6px;background:#e6ebfb;border-radius:3px;margin:8px 0;overflow:hidden}.bar i{display:block;height:100%;background:#4169e1;transition:width .2s}' +
      'ul{margin:8px 0 0;padding-left:18px;max-height:140px;overflow:auto;color:#962d22}li{margin:2px 0;word-break:break-word}' +
      'button{margin-top:8px;font:inherit;padding:5px 12px;border:1px solid #c8c8c8;border-radius:9px;background:#fff;cursor:pointer}button:hover{background:#f4f4f4}' +
      '</style><div class="t"></div>';
    document.documentElement.appendChild(host);
    const box = root.querySelector('.t');

    let finished = false;
    let last = Date.now();
    const add = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      box.append(e);
      return e;
    };
    const closeBtn = (label) => {
      const b = add('button', '', label);
      b.onclick = () => host.remove();
    };

    function view(state, done, problems) {
      box.replaceChildren();
      box.className = 't' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : '');
      if (state === 'run') {
        add('div', 'h', '▶ Reproduciendo «' + name + '»');
        const bar = add('div', 'bar');
        const fillEl = document.createElement('i');
        fillEl.style.width = Math.min(100, Math.round((done / total) * 100)) + '%';
        bar.append(fillEl);
        add('div', 'm', 'Paso ' + Math.min(done + 1, total) + ' de ' + total + (problems.length ? ' · ' + problems.length + ' problema(s)' : ''));
        const stop = add('button', '', 'Detener');
        stop.onclick = () => chrome.storage.local.set({ [cancelKey(run)]: true });
        return;
      }
      if (state === 'ok') add('div', 'h', '✔ «' + name + '» listo · ' + total + ' pasos');
      else if (state === 'stopped') add('div', 'h', '■ Reproducción detenida');
      else add('div', 'h', '⚠ «' + name + '» terminó con ' + problems.length + ' problema(s)');
      if (problems.length) {
        const ul = add('ul');
        problems.forEach((p) => {
          const li = document.createElement('li');
          li.textContent = p;
          ul.append(li);
        });
      }
      if (state === 'err' || problems.length) closeBtn('Cerrar');
      else setTimeout(() => host.remove(), state === 'ok' ? 4000 : 2500);
    }

    async function refresh() {
      if (finished) return;
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter((k) => k.startsWith(AFP + run + ':'));
      const frames = keys.map((k) => all[k]);
      const done = frames.reduce((n, f) => n + f.done, 0);
      const problems = frames.flatMap((f) => f.bad);
      const crashed = frames.some((f) => f.stopped);
      const cancelled = !!all[cancelKey(run)];
      if (done + problems.length >= total || crashed || cancelled) {
        finish(crashed ? 'err' : cancelled ? 'stopped' : problems.length ? 'err' : 'ok', done, problems, keys);
      } else view('run', done, problems);
    }

    function finish(state, done, problems, keys) {
      finished = true;
      clearInterval(watch);
      chrome.storage.onChanged.removeListener(onChg);
      chrome.storage.local.remove([...keys, cancelKey(run)]);
      view(state, done, problems);
    }

    const onChg = (c) => {
      if (Object.keys(c).some((k) => k.startsWith(AFP + run + ':') || k === cancelKey(run))) {
        last = Date.now();
        refresh();
      }
    };
    chrome.storage.onChanged.addListener(onChg);
    // Si algún paso pertenece a un marco que ya no existe, nunca llegaría al total: se cierra por inactividad
    const watch = setInterval(() => {
      if (finished || Date.now() - last < 30000) return;
      finish('err', 0, ['No se ejecutaron todos los pasos (no se encontró su pantalla o marco).'], []);
    }, 2000);
    view('run', 0, []);
  }

  async function runSteps(run, steps, method, delay) {
    const frameKey = AFP + run + ':' + Math.random().toString(36).slice(2);
    const st = { done: 0, bad: [], stopped: false };
    let cancelled = false;
    const onCancel = (c) => {
      if (c[cancelKey(run)]) cancelled = true;
    };
    chrome.storage.onChanged.addListener(onCancel);
    const save = () => chrome.storage.local.set({ [frameKey]: { ...st } });
    const ok = () => {
      st.done++;
      save();
    };
    const bad = (m) => {
      st.bad.push(m);
      save();
    };
    try {
      for (let i = 0; i < steps.length && !cancelled; i++) {
        const s = steps[i];
        const item = s.k === 'click' ? s.b : s.f;
        if (item.frame !== location.pathname) continue;
        const tag = 'Paso ' + (i + 1) + ': ';
        if (s.k === 'fill') {
          const name = s.f.label || s.f.name || s.f.id || s.f.path;
          const el = await waitFor(() => find(s.f, fieldsOf()));
          if (!el) {
            bad(tag + name + ' (no apareció)');
            continue;
          }
          if (fill([s.f], method).filled.length) ok();
          else bad(tag + 'no se pudo rellenar ' + name);
          await sleep(50);
        } else {
          const name = s.b.label || s.b.id || s.b.path;
          const b = await waitFor(() => (s.b.g ? findClickable(s.b) : findButton(s.b)));
          if (!b) {
            bad(tag + 'no se encontró "' + name + '" (se detuvo)');
            // Detiene también a los demás marcos
            st.stopped = true;
            chrome.storage.local.set({ [cancelKey(run)]: true });
            break;
          }
          simulateClick(b);
          ok();
          await sleep(delay || 800);
          await waitQuiet();
        }
      }
    } catch (e) {
      st.stopped = true;
      bad('Error inesperado: ' + e.message);
    } finally {
      chrome.storage.onChanged.removeListener(onCancel);
    }
  }

  // Devuelve enseguida: la reproducción sigue en la página aunque el popup se cierre
  function play(run, name, total, steps, method, delay) {
    if (window === window.top) playToast(run, name, total);
    runSteps(run, steps, method, delay);
    return true;
  }

  window.__autofill = { v: 6, fill, startRec, play };
})();
