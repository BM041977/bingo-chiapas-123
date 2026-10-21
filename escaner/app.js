/* Escáner Bingo — app instalable (PWA)
   Los datos van al Padrón de cada municipio a través de la API de Apps Script (config.js → API_URL).
   Sin señal: lee con el OCR del teléfono y deja las capturas en cola; se envían solas al volver la señal. */
'use strict';
const $ = (id) => document.getElementById(id);
const S = { mun: '', cod: '', op: '', secs: [], img: null, rot: 0, worker: null, enviando: false };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};

// ---------- API
async function api(accion, datos) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // sin preflight CORS
    body: JSON.stringify(Object.assign({ accion, mun: S.mun, codigo: S.cod }, datos || {}))
  });
  let j;
  try { j = await r.json(); }
  catch (_) { const e = new Error('El servidor no respondió bien. Avisa al coordinador.'); e.caido = true; throw e; }
  if (!j.ok) { const e = new Error(j.error || 'Error'); e.servidor = true; throw e; }
  return j.data;
}
const enLinea = () => navigator.onLine !== false;

// ---------- utilidades de pantalla
function msg(el, txt, cls) { $(el).innerHTML = ''; if (!txt) return; const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = txt; $(el).appendChild(d); return d; }
function show(v) { ['v-acceso', 'v-foto', 'v-form'].forEach(x => $(x).classList.toggle('hide', x !== v)); window.scrollTo(0, 0); }
function flash(t, cls) { const d = msg('m-flash', t, cls || 'ok'); setTimeout(() => { if (d && d.parentNode) d.remove(); }, 5000); }
function red() { const on = enLinea(); $('red').textContent = on ? 'En línea' : 'Sin señal'; $('red').classList.toggle('off', !on); }
window.addEventListener('online', () => { red(); enviarCola(); });
window.addEventListener('offline', red);

// ---------- 1. Acceso
const q = new URLSearchParams(location.search);
if (q.get('m')) LS.set('mun', q.get('m'));
S.mun = LS.get('mun', '');
$('sel-mun').innerHTML += MUNICIPIOS.map(m => '<option value="' + m + '">' + m.replace(/_/g, ' ') + '</option>').join('');
$('sel-mun').value = MUNICIPIOS.includes(S.mun) ? S.mun : '';
$('sel-mun').onchange = () => { S.mun = $('sel-mun').value; $('cod').value = LS.get('cod_' + S.mun, ''); msg('m-acceso', ''); };
$('cod').value = LS.get('cod_' + S.mun, '');
$('op').value = LS.get('op', '');

async function entrar(auto) {
  S.mun = $('sel-mun').value;
  if (!S.mun) return msg('m-acceso', 'Elige tu municipio.', 'bad');
  LS.set('mun', S.mun);
  const cod = $('cod').value.trim(), op = $('op').value.trim();
  if (!cod || !op) return auto ? null : msg('m-acceso', 'Escribe el código y tu nombre.', 'bad');
  S.cod = cod; S.op = op;
  $('b-entrar').disabled = true; msg('m-acceso', 'Entrando…', 'warn');
  try {
    const r = await api('iniciar');
    LS.set('cod_' + S.mun, cod); LS.set('op', op);
    LS.set('ini_' + S.mun, { municipio: r.municipio, secciones: r.secciones, capturados: r.capturados, promotores: r.promotores || [] });
    abrirMunicipio(r);
  } catch (e) {
    const guardado = LS.get('ini_' + S.mun, null);
    if (!e.servidor && guardado && LS.get('cod_' + S.mun, '') === cod) {   // sin señal: entra con lo guardado
      abrirMunicipio(guardado); flash('Sin señal: trabajando sin conexión.', 'warn');
    } else msg('m-acceso', (e.servidor || e.caido) ? e.message : 'Sin conexión. La primera vez necesitas internet.', 'bad');
  }
  $('b-entrar').disabled = false;
}
function abrirMunicipio(r) {
  S.secs = r.secciones || [];
  $('m-mun').textContent = r.municipio; $('m-cap').textContent = r.capturados || 0;
  $('secs').innerHTML = S.secs.map(s => '<option value="' + s + '">').join('');
  $('proms').innerHTML = (r.promotores || []).map(p => '<option value="' + p.replace(/"/g, '&quot;') + '">').join('');
  msg('m-acceso', ''); show('v-foto'); pintarCola(); enviarCola();
}
$('b-entrar').onclick = () => entrar(false);
$('b-salir').onclick = () => { $('cod').value = ''; $('op').value = ''; S.cod = ''; show('v-acceso'); msg('m-acceso', 'Sesión cerrada.', 'ok'); };

// ---------- 2. Foto + lectura
$('b-cam').onclick = () => $('foto').click();
$('b-gal').onclick = () => $('foto2').click();
$('b-manual').onclick = () => llenar({}, '');
$('foto').onchange = $('foto2').onchange = (ev) => {
  const f = ev.target.files[0]; ev.target.value = '';
  if (!f) return;
  const img = new Image();
  img.onload = () => { S.img = img; S.rot = 0; leer(); };
  img.src = URL.createObjectURL(f);
};
$('b-girar').onclick = () => { S.rot = (S.rot + 90) % 360; leer(); };
$('b-releer').onclick = () => leer();

function lienzo(img, rot, max) {
  const w0 = img.naturalWidth, h0 = img.naturalHeight, k = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k), c = document.createElement('canvas');
  const sw = rot % 180 ? h : w, sh = rot % 180 ? w : h;
  c.width = sw; c.height = sh;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, sw, sh);
  x.translate(sw / 2, sh / 2); x.rotate(rot * Math.PI / 180); x.drawImage(img, -w / 2, -h / 2, w, h);
  return c;
}
function contraste(c0) {   // grises + contraste para el OCR del teléfono
  const c = document.createElement('canvas'); c.width = c0.width; c.height = c0.height;
  const x = c.getContext('2d'); x.drawImage(c0, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data, hist = new Array(256).fill(0);
  for (let i = 0; i < p.length; i += 4) { const g = (p[i] * .3 + p[i + 1] * .59 + p[i + 2] * .11) | 0; p[i] = g; hist[g]++; }
  let lo = 0, hi = 255, acc = 0; const n = p.length / 4;
  for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * .02) break; }
  acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * .02) break; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, (p[i] - lo) * 255 / span)); p[i] = p[i + 1] = p[i + 2] = v; }
  x.putImageData(d, 0, 0); return c;
}
async function ocrTelefono(c) {
  if (!window.Tesseract) return '';
  if (!S.worker) {
    try { S.worker = await Tesseract.createWorker('spa', 1, { logger: m => { if (m.status === 'recognizing text') $('pg').style.width = (40 + Math.round(m.progress * 60)) + '%'; } }); }
    catch (e) { S.worker = null; return ''; }
  }
  try { return (await S.worker.recognize(contraste(c))).data.text || ''; } catch (e) { return ''; }
}
async function leer() {
  $('lectura').classList.remove('hide');
  const c = lienzo(S.img, S.rot, 2000);
  $('prev').src = c.toDataURL('image/jpeg', .7);
  $('pg').style.width = '20%'; $('m-ocr').textContent = 'Leyendo la credencial…';
  let texto = '';
  if (enLinea()) {
    try { texto = (await api('leer', { b64: c.toDataURL('image/jpeg', .9).split(',')[1] })).texto || ''; } catch (e) { texto = ''; }
  }
  if (texto.replace(/\s/g, '').length < 30) {
    $('m-ocr').textContent = enLinea() ? 'Leyendo con el lector del teléfono…' : 'Sin señal: leyendo con el lector del teléfono…';
    texto = await ocrTelefono(c);
  }
  $('pg').style.width = '100%';
  if (!texto) { $('m-ocr').textContent = 'No se pudo leer. Toma otra foto o captura a mano.'; return llenar({}, ''); }
  $('m-ocr').textContent = '';
  llenar(analizar(texto), texto);
}

// ---------- Interpretar el texto de la credencial
function analizar(txt) {
  const lineas = txt.split(/\n+/).map(l => l.replace(/[|_~«»"“”{}\[\]>]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const U = lineas.map(l => l.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const conector = /^(DE|LA|DEL|LAS|LOS|Y|MC|VDA|VON|SAN)$/;
  const palabras = (l) => l.toUpperCase().replace(/[^A-ZÑÁÉÍÓÚÜ ]/g, ' ').split(/\s+/)
    .filter(w => w && (w.length > 2 || conector.test(w)) && !/^SEXO/.test(w) && !/^NOMBRE/.test(w));

  // Nombre: primero el renglón de lectura mecánica del reverso (MAZA<LEON<<BALDEMAR<<<)
  let nombre = '';
  const mrz = U.map(l => l.replace(/\s/g, '')).find(l => /^[A-Z]+(<[A-Z]+)*<<[A-Z]+(<[A-Z]+)*<*$/.test(l));
  if (mrz) {
    const frente = new Set(U.filter(l => !l.includes('<')).join(' ').replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(w => w.length > 1));
    const partir = (t) => (t.includes('K') && t.split('K').every(p => p.length > 1 && frente.has(p))) ? t.split('K') : [t];   // "<" leído como "K"
    const [ap, nom] = mrz.split('<<');
    // relleno "<<<" mal leído (p. ej. "LEL"): un nombre de pila extra solo se acepta si también aparece en el frente
    const hayFrente = U.some(l => /\bNOMBRE\b/.test(l));
    const pila = nom.split('<').filter(Boolean).flatMap(partir).filter((t, i) => i === 0 || !hayFrente || frente.has(t));
    nombre = ap.split('<').filter(Boolean).flatMap(partir).concat(pila).join(' ');
  }
  const iNom = U.findIndex(l => /\bNOMBRE\b/.test(l));
  const iDom = U.findIndex(l => /DOMICI|D0MICI/.test(l));
  if (!nombre && iNom >= 0) {
    const hasta = iDom > iNom ? iDom : Math.min(lineas.length, iNom + 4);
    nombre = lineas.slice(iNom, hasta).map(l => palabras(l).join(' ')).filter(Boolean).join(' ');
  }
  // Domicilio: entre DOMICILIO y CLAVE DE ELECTOR
  let domicilio = '';
  if (iDom >= 0) {
    const iFin = U.findIndex((l, i) => i > iDom && /CLAVE|ELECTOR|CURP|REGISTRO|NACIMIENTO|SECCI|VIGENCIA/.test(l));
    const hasta = iFin > iDom ? iFin : Math.min(lineas.length, iDom + 4);
    domicilio = lineas.slice(iDom, hasta)
      .map(l => l.replace(/.*DOMICI\w*/i, '').replace(/[^0-9A-Za-zÑñÁÉÍÓÚáéíóúÜü#.,\- ]/g, ' ')
        .split(/\s+/).filter(w => w.length > 1 || /\d/.test(w)).join(' '))
      .filter(Boolean).join(' ')
      .replace(/(CHIS|CHIAPAS)\.?.*/i, '$1.').trim();
  }
  // Sección: el número que pertenezca al municipio
  const todo = U.join(' ');
  let seccion = (todo.match(/SECCI[O0]N\s*[:.]?\s*(\d{4})/) || [])[1] || '';
  if (!seccion || !S.secs.includes(String(+seccion))) {
    const cand = [...new Set((todo.match(/\b\d{3,4}\b/g) || []).map(n => String(+n)))].filter(n => S.secs.includes(n));
    seccion = cand.length === 1 ? cand[0] : (seccion ? String(+seccion) : '');
  } else seccion = String(+seccion);
  return { nombre: nombre.toUpperCase(), domicilio: domicilio.toUpperCase(), seccion };
}

// ---------- 3. Revisión
function llenar(r, raw) {
  $('f-sec').value = r.seccion || ''; $('f-nom').value = r.nombre || ''; $('f-dom').value = r.domicilio || '';
  $('f-tel').value = ''; $('f-op').value = S.op; $('f-prom').value = LS.get('prom_' + S.mun, ''); $('raw').textContent = raw || '(sin foto)';
  revisar(); msg('m-form', ''); show('v-form');
  setTimeout(() => (r.seccion ? $('f-tel') : $('f-sec')).focus(), 200);
}
function revisar() {
  const s = $('f-sec').value.replace(/\D/g, '');
  $('w-sec').textContent = !s ? 'Escribe la sección.' : (S.secs.includes(String(+s)) ? '' : 'Esta sección no es de este municipio.');
  $('w-nom').textContent = $('f-nom').value.trim().split(/\s+/).length < 3 ? 'Escribe primero los apellidos y luego el nombre.' : '';
}
['f-sec', 'f-nom'].forEach(id => $(id).addEventListener('input', revisar));
$('b-cancelar').onclick = () => show('v-foto');

function registro(forzar) {
  return { seccion: String(+$('f-sec').value.replace(/\D/g, '') || ''), nombre: $('f-nom').value.trim(),
           domicilio: $('f-dom').value.trim(), telefono: $('f-tel').value.replace(/\D/g, ''),
           operador: $('f-op').value.trim(), promotor: $('f-prom').value.trim(), forzar: !!forzar, capturado: Date.now() };
}
function validar(r) {
  if (!r.seccion || !S.secs.includes(r.seccion)) return 'Revisa la sección: no es de este municipio.';
  if (r.nombre.length < 5) return 'Falta el nombre completo.';
  if (r.telefono.length !== 10) return 'El teléfono debe tener 10 dígitos.';
  if (!r.operador) return 'Falta el nombre del capturista.';
  return '';
}
async function guardarAhora(forzar) {
  const r = registro(forzar), err = validar(r);
  if (err) return msg('m-form', err, 'bad');
  $('b-guardar').disabled = true; msg('m-form', 'Guardando…', 'warn');
  S.op = r.operador; LS.set('op', S.op); LS.set('prom_' + S.mun, r.promotor || '');
  try {
    if (!enLinea()) throw new Error('sin red');
    const res = await api('guardar', { registro: r });
    if (res.duplicado) {
      const d = msg('m-form', 'Ya existe una persona con ese nombre en la sección ' + r.seccion + ' (fila ' + res.fila + ').', 'warn');
      const b = document.createElement('button'); b.className = 'btn ghost small'; b.textContent = 'Es otra persona: guardar de todos modos';
      b.onclick = () => guardarAhora(true); d.appendChild(b);
    } else {
      $('m-cap').textContent = res.capturados; terminar('✔ Guardado en la fila ' + res.fila, 'ok');
    }
  } catch (e) {
    if (e.servidor) msg('m-form', e.message, 'bad');
    else { encolar(r); terminar('Sin señal: guardado en el teléfono. Se enviará solo al volver la señal.', 'warn'); }
  }
  $('b-guardar').disabled = false;
}
$('b-guardar').onclick = () => guardarAhora(false);
function terminar(t, cls) { $('lectura').classList.add('hide'); show('v-foto'); flash(t, cls); }

// ---------- Cola sin señal
const claveCola = () => 'cola_' + S.mun;
function encolar(r) { const c = LS.get(claveCola(), []); c.push({ r, t: Date.now() }); LS.set(claveCola(), c); pintarCola(); }
function pintarCola() {
  const c = LS.get(claveCola(), []), x = LS.get('conf_' + S.mun, []);
  const el = $('pend'); el.innerHTML = '';
  if (!c.length && !x.length) return el.classList.add('hide');
  el.classList.remove('hide');
  if (c.length) { const p = document.createElement('div'); p.textContent = c.length + ' captura(s) guardadas en el teléfono, pendientes de enviar.'; el.appendChild(p); }
  x.forEach((it, i) => {
    const d = document.createElement('div'); d.className = 'conf';
    d.textContent = 'Posible repetido: ' + it.r.nombre + ' (sección ' + it.r.seccion + ', ya está en la fila ' + it.fila + '). ';
    const a = document.createElement('button'); a.className = 'btn ghost small'; a.textContent = 'Es otra persona: guardar';
    a.onclick = () => { const l = LS.get('conf_' + S.mun, []); const [q] = l.splice(i, 1); LS.set('conf_' + S.mun, l); q.r.forzar = true; encolar(q.r); enviarCola(); };
    const b = document.createElement('button'); b.className = 'btn ghost small'; b.textContent = 'Es la misma: descartar';
    b.onclick = () => { const l = LS.get('conf_' + S.mun, []); l.splice(i, 1); LS.set('conf_' + S.mun, l); pintarCola(); };
    d.appendChild(a); d.appendChild(b); el.appendChild(d);
  });
}
async function enviarCola() {
  if (S.enviando || !S.cod || !enLinea()) return;
  S.enviando = true;
  try {
    let c = LS.get(claveCola(), []);
    while (c.length) {
      const it = c[0];
      try {
        const res = await api('guardar', { registro: it.r });
        if (res.duplicado) { const x = LS.get('conf_' + S.mun, []); x.push({ r: it.r, fila: res.fila }); LS.set('conf_' + S.mun, x); }
        else $('m-cap').textContent = res.capturados;
      } catch (e) {
        if (!e.servidor) break;                       // otra vez sin señal: se reintenta después
        flash('No se pudo enviar ' + it.r.nombre + ': ' + e.message, 'bad');
      }
      c.shift(); LS.set(claveCola(), c);
    }
  } finally { S.enviando = false; pintarCola(); }
}
setInterval(enviarCola, 60000);

// ---------- Arranque
red();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
if (S.mun && $('cod').value && $('op').value) entrar(true);
