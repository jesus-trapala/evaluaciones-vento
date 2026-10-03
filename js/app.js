/* Evaluaciones Vento Chalco — lógica de la app.
   Todo vive en localStorage de este dispositivo. La evaluación en curso se guarda
   sola como borrador ('vento_borrador'), así que sobrevive a cambios de pestaña,
   recargas de Android y cierres del navegador. */

/* ============================================================
   1) ESTADO / ALMACENAMIENTO LOCAL
   ============================================================ */
// Pesos v2 (recalculados 2026-10-01): ventas y resultados 39%, procesos 27%,
// actitud 14%, piso y presentación 20%. Los ids c0..c13 no cambian (los usa el borrador).
const DEFAULT_CRITERIOS = [
  ["c0","Registro de clientes en bitácora / Pilot","Realizar de forma diaria en tiempo y forma. Registros correctos.",9],
  ["c1","Orden y limpieza del lugar de trabajo","Escritorio limpio, no comer en piso de venta, expedientes resguardados.",4],
  ["c2","Cumplir con código de vestimenta","Uniforme completo y presentación todos los días.",4],
  ["c3","Toma de inventarios","Apoyar inventarios cíclicos de la agencia con el gerente.",4],
  ["c4","Entrega de expedientes de venta","Expedientes completos, con firmas cotejadas y entregados a tiempo.",7],
  ["c5","Actualización de preciadores y promociones","Preciadores actualizados en exhibición de motocicletas.",4],
  ["c6","Actitud y trabajo en equipo","Disposición, colaboración con compañeros, manejo de conflictos.",8],
  ["c7","Disposición para salir a volantear","Actitud y disponibilidad para salir a volantear y prospectar fuera de la agencia.",5],
  ["c8","Cumplimiento de reseñas","Gestión y cumplimiento de reseñas de clientes.",6],
  ["c9","Expedientes sin observaciones (correos de faltantes)","No haber recibido correos en la semana por faltantes en expedientes.",5],
  ["c10","Puntualidad y asistencia","Cumplimiento de horario y asistencia en la semana.",6],
  ["c11","Cumplimiento de meta de ventas","Avance vs meta de ventas asignada en la semana.",12],
  ["cnum","Conocimiento de sus números","Conoce su meta, avance, motos vendidas, top 3 de modelos, mezcla crédito/contado y ticket promedio.",6],
  ["ccot","Cumplimiento de cotizaciones","Cotización a cada prospecto atendido y seguimiento en tiempo hasta cierre o descarte.",9],
  ["c12","Resultado de VentoCredit","Resultados obtenidos en VentoCredit en la semana.",7],
  ["c13","Mystery shopper / atención en piso","Resultado o desempeño observado en atención a clientes en piso de venta.",4],
].map(c => ({ id: c[0], nombre: c[1], descripcion: c[2], peso: c[3], activo: true, ...(c[0] === 'cnum' ? { resultados: true } : {}) }));

const DEFAULT_ASESORES = ["OSVALDO MORA TORRES","KEVIN ESTEBAN SALAS SALDIVAR"];

function loadJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch(e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e) { return false; }
}

let state = {
  criterios: loadJSON('vento_criterios', DEFAULT_CRITERIOS),
  asesores: loadJSON('vento_asesores', DEFAULT_ASESORES),
  historial: loadJSON('vento_historial', []),
};

// Migración a v2 de los criterios que el dispositivo ya tenía guardados (v1):
// - c12 "Uso correcto de Pilot y VentoCredit" pasa a "Resultado de VentoCredit"
// - se agregan "Conocimiento de sus números" y "Cumplimiento de cotizaciones" después de la meta
// - si los pesos seguían como venían en v1 (sin editar), se cambian por los de v2;
//   si el usuario ya los había editado, se respetan y los nuevos entran con 0%.
(() => {
  const PESOS_V1 = { c0:10, c1:8, c2:5, c3:7, c4:8, c5:5, c6:15, c7:5, c8:8, c9:6, c10:6, c11:8, c12:5, c13:4 };
  const crit = state.criterios;
  let cambio = false;
  const c12 = crit.find(x => x.id === 'c12' && x.nombre === 'Uso correcto de Pilot y VentoCredit');
  if (c12) {
    c12.nombre = 'Resultado de VentoCredit';
    if (c12.descripcion === 'Captura y seguimiento correcto en ambos sistemas.') c12.descripcion = 'Resultados obtenidos en VentoCredit en la semana.';
    cambio = true;
  }
  const faltaNuevo = !crit.some(x => x.id === 'cnum') || !crit.some(x => x.id === 'ccot');
  const pesosSinEditar = faltaNuevo && Object.entries(PESOS_V1).every(([id, p]) => {
    const x = crit.find(y => y.id === id);
    return x && Number(x.peso) === p;
  });
  let tras = crit.findIndex(x => x.id === 'c11');
  ['cnum', 'ccot'].forEach(id => {
    if (crit.some(x => x.id === id)) { tras = crit.findIndex(x => x.id === id); return; }
    const nuevo = { ...DEFAULT_CRITERIOS.find(x => x.id === id) };
    if (!pesosSinEditar) nuevo.peso = 0;
    tras = tras >= 0 ? tras + 1 : crit.length;
    crit.splice(tras, 0, nuevo);
    cambio = true;
  });
  if (pesosSinEditar) {
    DEFAULT_CRITERIOS.forEach(d => { const x = crit.find(y => y.id === d.id); if (x) x.peso = d.peso; });
  }
  if (cambio) saveJSON('vento_criterios', crit);
})();

function persist() {
  saveJSON('vento_criterios', state.criterios);
  saveJSON('vento_asesores', state.asesores);
  saveJSON('vento_historial', state.historial);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(()=>t.classList.remove('show'), Math.max(2200, msg.length * 60));
}
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ============================================================
   2) FECHAS (siempre en hora local, no UTC)
   ============================================================ */
function hoyISO() {
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function sugerirPeriodo(fechaISO) {
  // 'YYYY-MM-DD' -> "Semana N (lun - dom)"
  const d = new Date(fechaISO + 'T00:00:00');
  if (isNaN(d)) return '';
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  const lunes = new Date(d); lunes.setDate(d.getDate() - dow);
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  const tmp = new Date(d);
  tmp.setDate(tmp.getDate() + 3 - dow);
  const week1 = new Date(tmp.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((tmp - week1) / 86400000 - 3 + ((week1.getDay()+6)%7)) / 7);
  const fmt = (x) => `${x.getDate()} ${MESES[x.getMonth()]}`;
  return `Semana ${weekNum} (${fmt(lunes)} - ${fmt(domingo)})`;
}

/* ============================================================
   2b) RESULTADOS DEL MES (informativos: no cambian la calificación)
   Se capturan acumulados del mes al día de la evaluación; el ritmo esperado
   se calcula con el día del mes de la fecha de la evaluación.
   ============================================================ */
const MESES_LARGOS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function resultadosVacios() {
  return { meta: '', vendidas: '', credito: '', contado: '', ticket: '', top: [{modelo:'',unidades:''},{modelo:'',unidades:''},{modelo:'',unidades:''}] };
}
function hayResultados(r) {
  if (!r) return false;
  return ['meta','vendidas','credito','contado','ticket'].some(k => String(r[k]).trim() !== '') ||
    r.top.some(t => t.modelo.trim() || String(t.unidades).trim());
}
const num = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
const pct = x => Math.round(x * 100) + '%';
const uno = x => String(Math.round(x * 10) / 10);
const dinero = x => '$' + Math.round(x).toLocaleString('es-MX');

// Devuelve el corte del mes y las líneas de resumen (las mismas para pantalla y PDF).
function analizarResultados(r, fechaISO) {
  const d = new Date(fechaISO + 'T00:00:00');
  const valida = !isNaN(d);
  const dia = valida ? d.getDate() : 0;
  const diasMes = valida ? new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() : 0;
  const out = {
    corte: valida ? `corte al día ${dia} de ${diasMes} de ${MESES_LARGOS[d.getMonth()]}` : '',
    lineas: [], avisos: [], estado: null, top: [],
  };
  const meta = num(r.meta), vend = num(r.vendidas), cred = num(r.credito), cont = num(r.contado), ticket = num(r.ticket);

  if (meta && vend != null && valida) {
    const esperadoPct = dia / diasMes;
    const deberia = meta * esperadoPct;
    const proy = vend / dia * diasMes;
    out.lineas.push(`Avance: ${vend} de ${meta} motos (${pct(vend / meta)})`);
    out.lineas.push(`Ritmo esperado al día ${dia}: ${uno(deberia)} motos (${pct(esperadoPct)} del mes)`);
    // Los primeros días del mes la proyección no dice nada (1 venta el día 1 = 31 en el mes).
    if (dia >= 5) out.lineas.push(`Proyección al cierre: ${uno(proy)} motos (${pct(proy / meta)} de la meta)`);
    const atraso = deberia - vend;
    out.estado = atraso <= 0.05
      ? { ok: true, texto: vend >= meta ? 'Meta cumplida' : 'Va en línea con la meta' }
      : { ok: false, texto: `Va atrasado ${uno(atraso)} motos vs el ritmo esperado` };
  } else if (vend != null) {
    out.lineas.push(`Motos vendidas en el mes: ${vend}`);
  }
  if (cred != null || cont != null) {
    const tot = (cred || 0) + (cont || 0);
    if (tot > 0) out.lineas.push(`Mezcla: crédito ${cred || 0} (${pct((cred || 0) / tot)}) · contado ${cont || 0} (${pct((cont || 0) / tot)})`);
    if (vend != null && tot !== vend) out.avisos.push(`Crédito + contado (${tot}) no coincide con motos vendidas (${vend})`);
  }
  if (ticket != null) out.lineas.push(`Ticket promedio: ${dinero(ticket)}`);
  out.top = r.top.filter(t => t.modelo.trim()).map(t => t.modelo.trim() + (num(t.unidades) != null ? ` (${num(t.unidades)})` : ''));
  return out;
}

/* ============================================================
   3) BORRADOR (autoguardado de la evaluación en curso)
   ============================================================ */
function nuevoBorrador() {
  const fecha = hoyISO();
  return {
    asesor: state.asesores[0] || '',
    fecha, periodo: sugerirPeriodo(fecha), periodoAuto: true,
    gerente: loadJSON('vento_gerente', ''),
    resultados: resultadosVacios(),
    califs: {}, comentarios: {}, obs: '',
    firmaG: null, firmaA: null,          // dataURL PNG del trazo
    generado: null,                       // {texto, calificacionGeneral} cuando ya se generó el PDF
    actualizado: null,
  };
}
let borrador = loadJSON('vento_borrador', null) || nuevoBorrador();
if (!borrador.resultados) borrador.resultados = resultadosVacios();   // borradores de antes de v2

let _timerBorrador = null;
function guardarBorrador(inmediato) {
  clearTimeout(_timerBorrador);
  const escribir = () => {
    borrador.actualizado = Date.now();
    if (!saveJSON('vento_borrador', borrador)) toast('No se pudo guardar el borrador (memoria llena)');
  };
  if (inmediato) escribir(); else _timerBorrador = setTimeout(escribir, 400);
}
// Si Android manda la app a segundo plano o la cierra, escribir ya lo pendiente.
document.addEventListener('visibilitychange', () => { if (document.hidden && _timerBorrador) guardarBorrador(true); });
window.addEventListener('pagehide', () => { if (_timerBorrador) guardarBorrador(true); });

function borradorTieneDatos(b) {
  return Object.keys(b.califs).length > 0 || !!b.obs.trim() || !!b.firmaG || !!b.firmaA || hayResultados(b.resultados) ||
    Object.values(b.comentarios).some(c => c && c.trim());
}
function descartarBorrador() {
  borrador = nuevoBorrador();
  guardarBorrador(true);
  renderNueva();
  window.scrollTo(0, 0);
}

/* ============================================================
   4) FIRMA (canvas; el trazo se guarda en el borrador al soltar)
   ============================================================ */
class SignaturePad {
  constructor(canvas, dataUrl, onChange) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dataUrl = dataUrl || null;
    this.hasInk = !!dataUrl;
    this.onChange = onChange;
    this.drawing = false;
    this.cssW = 0;
    this.ajustar();
    canvas.addEventListener('pointerdown', (e) => this._start(e));
    canvas.addEventListener('pointermove', (e) => this._move(e));
    canvas.addEventListener('pointerup', () => this._end());
    canvas.addEventListener('pointercancel', () => this._end());
  }
  // Ajusta la resolución al tamaño en pantalla. Solo si cambió el ANCHO
  // (abrir el teclado en el celular cambia la altura de la ventana y no debe borrar nada).
  ajustar() {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || rect.width === this.cssW) return;
    this.cssW = rect.width;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.ctx.setTransform(ratio,0,0,ratio,0,0);
    this.ctx.lineWidth = 2.2;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.strokeStyle = '#111827';
    if (this.dataUrl) {
      const img = new Image();
      img.onload = () => this.ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = this.dataUrl;
    }
  }
  _pos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  _start(e) {
    e.preventDefault();
    this.drawing = true;
    const p = this._pos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
  }
  _move(e) {
    if (!this.drawing) return;
    e.preventDefault();
    const p = this._pos(e);
    this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.hasInk = true;
  }
  _end() {
    if (!this.drawing) return;
    this.drawing = false;
    if (this.hasInk) {
      this.dataUrl = this.canvas.toDataURL('image/png');
      this.onChange(this.dataUrl);
    }
  }
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasInk = false;
    this.dataUrl = null;
    this.onChange(null);
  }
  isEmpty() { return !this.hasInk; }
}
let pads = [];
window.addEventListener('resize', () => pads.forEach(p => p.ajustar()));

// PNG del trazo -> JPEG con fondo blanco, recortado al área firmada (para que en el PDF se vea grande).
function firmaParaPDF(dataUrl) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      const px = cx.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (px[(y * c.width + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) { x0 = 0; y0 = 0; x1 = c.width - 1; y1 = c.height - 1; }
      const pad = 8;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
      x1 = Math.min(c.width - 1, x1 + pad); y1 = Math.min(c.height - 1, y1 + pad);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const out = document.createElement('canvas');
      out.width = w; out.height = h;
      const ox = out.getContext('2d');
      ox.fillStyle = '#ffffff';
      ox.fillRect(0, 0, w, h);
      ox.drawImage(c, x0, y0, w, h, 0, 0, w, h);
      ok({ jpeg: out.toDataURL('image/jpeg', 0.9), w, h });
    };
    img.onerror = () => mal(new Error('No se pudo leer la firma'));
    img.src = dataUrl;
  });
}

/* ============================================================
   5) UI — pestañas (solo se muestran/ocultan; no se borra nada)
   ============================================================ */
let nuevaDesactualizada = false;   // true si cambiaron criterios/asesores mientras estaba oculta
const tabs = document.querySelectorAll('#tabs button');
tabs.forEach(btn => btn.addEventListener('click', () => {
  tabs.forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('main > section').forEach(s => s.style.display = 'none');
  document.getElementById('tab-' + btn.dataset.tab).style.display = 'block';
  if (btn.dataset.tab === 'criterios') renderCriterios();
  if (btn.dataset.tab === 'asesores') renderAsesores();
  if (btn.dataset.tab === 'historial') renderHistorial();
  if (btn.dataset.tab === 'nueva') {
    if (nuevaDesactualizada) { nuevaDesactualizada = false; renderNueva(); }
    else pads.forEach(p => p.ajustar());
  }
}));
function marcarNuevaDesactualizada() { nuevaDesactualizada = true; }

/* ---------- Tab: Nueva evaluación ---------- */
function horaCorta(ts) {
  return ts ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
}

function renderNueva() {
  const sec = document.getElementById('tab-nueva');
  pads = [];
  if (borrador.generado) return renderListo(sec);

  const activos = state.criterios.filter(c => c.activo);
  if (!state.asesores.includes(borrador.asesor)) borrador.asesor = state.asesores[0] || '';
  const hayDatos = borradorTieneDatos(borrador);

  sec.innerHTML = `
    ${hayDatos ? `<div class="borrador"><span>Borrador guardado · ${horaCorta(borrador.actualizado)}</span><button class="danger" id="btnDescartar">Descartar</button></div>` : ''}
    <div class="card">
      <h2>Datos de la evaluación</h2>
      <label>Asesor</label>
      <select id="fAsesor">${state.asesores.map(a=>`<option value="${escapeHtml(a)}" ${a===borrador.asesor?'selected':''}>${escapeHtml(a)}</option>`).join('')}</select>
      <div class="row">
        <div>
          <label>Fecha</label>
          <input type="date" id="fFecha" value="${borrador.fecha}">
        </div>
        <div>
          <label>Semana / Periodo</label>
          <input type="text" id="fPeriodo" value="${escapeHtml(borrador.periodo)}" placeholder="Semana 39">
        </div>
      </div>
      <label>Tu nombre (gerente)</label>
      <input type="text" id="fGerente" value="${escapeHtml(borrador.gerente)}" placeholder="Jesús">
    </div>

    <div class="card">
      <h2>Calificación por criterio (1 a 10)</h2>
      ${activos.map(c => `
        <div class="criterio" data-id="${c.id}">
          <div class="nombre">${escapeHtml(c.nombre)}</div>
          <div class="desc">${escapeHtml(c.descripcion || '')} <span class="peso">· peso ${c.peso}%</span></div>
          ${c.resultados ? htmlResultados() : ''}
          <div class="escala" data-for="${c.id}">
            ${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button type="button" data-val="${n}" class="${borrador.califs[c.id]===n?'sel':''}">${n}</button>`).join('')}
          </div>
          <input type="text" placeholder="Comentario (opcional)" class="comentario" data-id="${c.id}" value="${escapeHtml(borrador.comentarios[c.id] || '')}">
        </div>
      `).join('')}
    </div>

    <div class="califgen"><span>Calificación general ponderada</span><span id="califGenNum">—</span></div>

    <div class="card">
      <h2>Observaciones / compromisos de la semana</h2>
      <textarea id="fObs" placeholder="Escribe aquí lo platicado y los compromisos acordados...">${escapeHtml(borrador.obs)}</textarea>
    </div>

    <div class="card">
      <h2>Firmas</h2>
      <div class="siglabel"><b>Firma Gerente</b><button class="secondary" id="clearG">Borrar</button></div>
      <div class="sigwrap"><canvas class="sigpad" id="sigG"></canvas></div>
      <div style="height:14px"></div>
      <div class="siglabel"><b>Firma Asesor</b><button class="secondary" id="clearA">Borrar</button></div>
      <div class="sigwrap"><canvas class="sigpad" id="sigA"></canvas></div>
    </div>

    <button class="primary" id="btnGenerar">Generar PDF y guardar registro</button>
    <p class="muted" style="text-align:center;margin-top:10px">Lo que capturas se guarda solo; si cambias de pestaña o se recarga la página, aquí sigue.</p>
  `;

  sec.querySelectorAll('.escala').forEach(esc => {
    esc.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') return;
      borrador.califs[esc.dataset.for] = parseInt(e.target.dataset.val, 10);
      esc.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b === e.target));
      updateCalifGen();
      guardarBorrador(true);
      mostrarAvisoBorrador();
    });
  });
  sec.querySelectorAll('.comentario').forEach(inp => inp.addEventListener('input', () => {
    borrador.comentarios[inp.dataset.id] = inp.value; guardarBorrador(); mostrarAvisoBorrador();
  }));

  document.getElementById('fAsesor').addEventListener('change', e => { borrador.asesor = e.target.value; guardarBorrador(true); });
  document.getElementById('fGerente').addEventListener('input', e => { borrador.gerente = e.target.value; guardarBorrador(); });
  document.getElementById('fObs').addEventListener('input', e => { borrador.obs = e.target.value; guardarBorrador(); mostrarAvisoBorrador(); });
  document.getElementById('fPeriodo').addEventListener('input', e => {
    borrador.periodo = e.target.value;
    borrador.periodoAuto = e.target.value.trim() === '';
    guardarBorrador();
  });
  sec.querySelectorAll('[data-r]').forEach(inp => inp.addEventListener('input', () => {
    borrador.resultados[inp.dataset.r] = inp.value; guardarBorrador(); actualizarResumen(); mostrarAvisoBorrador();
  }));
  sec.querySelectorAll('[data-top]').forEach(inp => inp.addEventListener('input', () => {
    borrador.resultados.top[inp.dataset.top][inp.dataset.campo] = inp.value; guardarBorrador(); mostrarAvisoBorrador();
  }));
  document.getElementById('fFecha').addEventListener('change', (e) => {
    borrador.fecha = e.target.value;
    actualizarResumen();
    if (borrador.periodoAuto) {
      borrador.periodo = sugerirPeriodo(e.target.value);
      document.getElementById('fPeriodo').value = borrador.periodo;
    }
    guardarBorrador(true);
  });

  const padG = new SignaturePad(document.getElementById('sigG'), borrador.firmaG, d => { borrador.firmaG = d; guardarBorrador(true); mostrarAvisoBorrador(); });
  const padA = new SignaturePad(document.getElementById('sigA'), borrador.firmaA, d => { borrador.firmaA = d; guardarBorrador(true); mostrarAvisoBorrador(); });
  pads = [padG, padA];
  document.getElementById('clearG').addEventListener('click', () => padG.clear());
  document.getElementById('clearA').addEventListener('click', () => padA.clear());

  const btnDesc = document.getElementById('btnDescartar');
  if (btnDesc) btnDesc.addEventListener('click', () => {
    if (confirm('¿Descartar esta evaluación? Se borran calificaciones, comentarios y firmas.')) descartarBorrador();
  });

  document.getElementById('btnGenerar').addEventListener('click', onGenerar);
  updateCalifGen();
  actualizarResumen();
}

// Campos de resultados del mes; van dentro del criterio "Conocimiento de sus números".
function htmlResultados() {
  return `
    <div class="resultados">
      <div class="res-titulo">Resultados del mes</div>
      <p class="muted" id="rCorte"></p>
    <div class="row">
      <div><label>Meta del mes (motos)</label><input type="number" inputmode="numeric" min="0" data-r="meta" value="${escapeHtml(borrador.resultados.meta)}"></div>
      <div><label>Motos vendidas en el mes</label><input type="number" inputmode="numeric" min="0" data-r="vendidas" value="${escapeHtml(borrador.resultados.vendidas)}"></div>
    </div>
    <div class="row">
      <div><label>Ventas a crédito</label><input type="number" inputmode="numeric" min="0" data-r="credito" value="${escapeHtml(borrador.resultados.credito)}"></div>
      <div><label>Ventas de contado</label><input type="number" inputmode="numeric" min="0" data-r="contado" value="${escapeHtml(borrador.resultados.contado)}"></div>
    </div>
    <label>Ticket promedio ($)</label>
    <input type="number" inputmode="decimal" min="0" data-r="ticket" value="${escapeHtml(borrador.resultados.ticket)}" placeholder="Ej. 45000">
    <label>Top 3 modelos más vendidos</label>
    ${borrador.resultados.top.map((t, i) => `
      <div class="toprow">
        <input type="text" data-top="${i}" data-campo="modelo" placeholder="Modelo ${i + 1}" value="${escapeHtml(t.modelo)}">
        <input type="number" inputmode="numeric" min="0" data-top="${i}" data-campo="unidades" placeholder="Uds." value="${escapeHtml(t.unidades)}">
      </div>`).join('')}
    <div id="rResumen"></div>
    </div>`;
}

function actualizarResumen() {
  const caja = document.getElementById('rResumen');
  if (!caja) return;
  const a = analizarResultados(borrador.resultados, borrador.fecha);
  document.getElementById('rCorte').textContent = a.corte ? `Acumulado del mes, ${a.corte}` : '';
  if (!a.lineas.length && !a.avisos.length) { caja.innerHTML = ''; return; }
  caja.innerHTML = `<div class="resumen-res">
    ${a.estado ? `<div class="estado ${a.estado.ok ? 'ok' : 'bad'}">${escapeHtml(a.estado.texto)}</div>` : ''}
    ${a.lineas.map(l => `<div>${escapeHtml(l)}</div>`).join('')}
    ${a.avisos.map(l => `<div class="aviso">⚠ ${escapeHtml(l)}</div>`).join('')}
  </div>`;
}

// La franja "Borrador guardado" aparece en cuanto hay algo capturado.
function mostrarAvisoBorrador() {
  if (document.getElementById('btnDescartar') || !borradorTieneDatos(borrador)) return;
  const div = document.createElement('div');
  div.className = 'borrador';
  div.innerHTML = `<span>Se guarda automáticamente</span><button class="danger" id="btnDescartar">Descartar</button>`;
  div.querySelector('button').addEventListener('click', () => {
    if (confirm('¿Descartar esta evaluación? Se borran calificaciones, comentarios y firmas.')) descartarBorrador();
  });
  document.getElementById('tab-nueva').prepend(div);
}

function calcular() {
  const activos = state.criterios.filter(c => c.activo);
  let sum = 0, faltan = false;
  activos.forEach(c => {
    if (borrador.califs[c.id] != null) sum += borrador.califs[c.id] * Number(c.peso || 0);
    else faltan = true;
  });
  return { activos, faltan, general: (sum/100).toFixed(2) };
}

function updateCalifGen() {
  const el = document.getElementById('califGenNum');
  if (!el) return;
  const { faltan, general } = calcular();
  if (faltan) { el.textContent = 'Faltan criterios por calificar'; el.style.fontSize = '14px'; }
  else { el.textContent = general; el.style.fontSize = '28px'; }
}

async function construirPDF() {
  const { activos, general } = calcular();
  const [firmaGerente, firmaAsesor] = await Promise.all([firmaParaPDF(borrador.firmaG), firmaParaPDF(borrador.firmaA)]);
  const ev = {
    asesor: borrador.asesor,
    fecha: borrador.fecha,
    periodo: borrador.periodo || '(sin especificar)',
    gerenteNombre: borrador.gerente || 'Gerente',
    observaciones: borrador.obs,
    resultados: hayResultados(borrador.resultados) ? analizarResultados(borrador.resultados, borrador.fecha) : null,
    detalle: activos.map(c => ({ nombre: c.nombre, peso: c.peso, calificacion: borrador.califs[c.id], comentario: borrador.comentarios[c.id] || '' })),
    calificacionGeneral: general,
    firmaGerente, firmaAsesor,
    logo: typeof LOGO_VENTO !== 'undefined' ? LOGO_VENTO : null,
    generadoTexto: borrador.generado ? borrador.generado.texto : new Date().toLocaleString('es-MX'),
  };
  return buildEvaluacionPDF(ev);
}
function nombrePDF() {
  return `Evaluacion_${borrador.asesor}_${borrador.fecha}.pdf`.replace(/\s+/g,'_');
}

async function onGenerar() {
  const { activos, faltan } = calcular();
  const totalPeso = activos.reduce((s,c)=>s+Number(c.peso||0),0);
  if (totalPeso !== 100) {
    toast(`Los pesos de los criterios activos suman ${totalPeso}%, deben sumar 100%. Ajústalo en la pestaña Criterios.`);
    return;
  }
  if (!borrador.asesor) { toast('Agrega al menos un asesor en la pestaña Asesores'); return; }
  if (faltan) {
    const f = activos.find(c => borrador.califs[c.id] == null);
    toast('Falta calificar: ' + f.nombre);
    document.querySelector(`.criterio[data-id="${f.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!borrador.firmaG || !borrador.firmaA) { toast('Faltan una o ambas firmas'); return; }

  const btn = document.getElementById('btnGenerar');
  btn.disabled = true; btn.textContent = 'Generando…';
  try {
    borrador.generado = { texto: new Date().toLocaleString('es-MX'), calificacionGeneral: calcular().general };
    const bytes = await construirPDF();
    downloadBytes(bytes, nombrePDF());

    state.historial.unshift({
      fecha: borrador.fecha, asesor: borrador.asesor, periodo: borrador.periodo,
      calificacionGeneral: borrador.generado.calificacionGeneral, gerenteNombre: borrador.gerente,
      resultados: hayResultados(borrador.resultados) ? borrador.resultados : null,
      timestamp: new Date().toISOString(),
    });
    persist();
    saveJSON('vento_gerente', borrador.gerente);
    guardarBorrador(true);
    renderNueva();
    window.scrollTo(0, 0);
    toast('PDF generado y registro guardado en Historial');
  } catch (err) {
    console.error(err);
    borrador.generado = null;
    btn.disabled = false; btn.textContent = 'Generar PDF y guardar registro';
    toast('Error al generar el PDF: ' + err.message);
  }
}

// Pantalla después de generar: el borrador se conserva hasta que empieces otra,
// así puedes volver a descargar el PDF aunque se recargue la página.
function renderListo(sec) {
  sec.innerHTML = `
    <div class="card listo">
      <div class="check">✓</div>
      <h2>Evaluación generada</h2>
      <p class="muted">${escapeHtml(borrador.asesor)} · ${escapeHtml(borrador.periodo)}</p>
      <div class="calif">${borrador.generado.calificacionGeneral}</div>
      <button class="secondary" id="btnRedescargar" style="width:100%">⬇ Volver a descargar PDF</button>
      <button class="primary" id="btnNuevaEv">Nueva evaluación</button>
    </div>
  `;
  document.getElementById('btnRedescargar').addEventListener('click', async () => {
    try { downloadBytes(await construirPDF(), nombrePDF()); }
    catch (err) { toast('Error al generar el PDF: ' + err.message); }
  });
  document.getElementById('btnNuevaEv').addEventListener('click', descartarBorrador);
}

function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}

/* ---------- Respaldo: exportar / importar ---------- */
function exportarRespaldo() {
  const payload = {
    tipo: 'respaldo_evaluaciones_vento', version: 1,
    exportado: new Date().toISOString(),
    criterios: state.criterios, asesores: state.asesores, historial: state.historial,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `Respaldo_Evaluaciones_Vento_${hoyISO()}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  toast('Respaldo descargado');
}
function importarRespaldo(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || data.tipo !== 'respaldo_evaluaciones_vento') throw new Error('Archivo no reconocido');
      if (Array.isArray(data.criterios)) state.criterios = data.criterios;
      if (Array.isArray(data.asesores)) state.asesores = data.asesores;
      if (Array.isArray(data.historial)) state.historial = data.historial;
      persist();
      marcarNuevaDesactualizada();
      toast('Respaldo importado correctamente');
      renderCriterios();
    } catch (err) {
      toast('No se pudo importar: ' + err.message);
    }
  };
  reader.readAsText(file);
}

/* ---------- Tab: Criterios ---------- */
function renderCriterios() {
  const sec = document.getElementById('tab-criterios');
  const total = state.criterios.filter(c=>c.activo).reduce((s,c)=>s+Number(c.peso||0),0);
  sec.innerHTML = `
    <div class="card">
      <h2>Criterios de evaluación</h2>
      <p class="muted">Edita nombre, descripción y peso (%). Desmarca los que no uses. El total de los criterios activos debe sumar 100%.</p>
      <div class="totalpeso ${total===100?'ok':'bad'}">Suma de pesos activos: ${total}% ${total===100?'✓':'(ajusta para llegar a 100%)'}</div>
      <div id="critList"></div>
      <button class="secondary" id="addCrit">+ Agregar criterio</button>
    </div>
    <div class="card">
      <h2>Respaldo (entre celular y PC)</h2>
      <p class="muted">Esta app guarda todo en el dispositivo donde la abres. Usa estos botones para mover criterios, asesores e historial de un dispositivo a otro.</p>
      <div class="row">
        <button class="secondary" id="btnExport">⬇ Exportar respaldo</button>
        <button class="secondary" id="btnImportTrigger">⬆ Importar respaldo</button>
      </div>
      <input type="file" id="fileImport" accept="application/json" style="display:none">
    </div>
  `;
  const list = document.getElementById('critList');
  state.criterios.forEach(c => {
    const row = document.createElement('div');
    row.className = 'card';
    row.style.padding = '10px';
    row.innerHTML = `
      <label class="chk"><input type="checkbox" data-f="activo" ${c.activo?'checked':''}> Activo</label>
      <label>Nombre</label>
      <input type="text" data-f="nombre" value="${escapeHtml(c.nombre)}">
      <label>Descripción</label>
      <input type="text" data-f="descripcion" value="${escapeHtml(c.descripcion||'')}">
      <label>Peso (%)</label>
      <input type="number" data-f="peso" value="${c.peso}" min="0" max="100">
      <button class="danger" data-del="1">Eliminar</button>
    `;
    row.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('change', () => {
        const f = inp.dataset.f;
        c[f] = f === 'activo' ? inp.checked : (f === 'peso' ? Number(inp.value) : inp.value);
        persist();
        marcarNuevaDesactualizada();
        renderCriterios();
      });
    });
    row.querySelector('[data-del]').addEventListener('click', () => {
      if (!confirm(`¿Eliminar el criterio "${c.nombre}"?`)) return;
      state.criterios = state.criterios.filter(x => x.id !== c.id);
      persist(); marcarNuevaDesactualizada(); renderCriterios();
    });
    list.appendChild(row);
  });
  document.getElementById('addCrit').addEventListener('click', () => {
    state.criterios.push({ id: 'c'+Date.now(), nombre:'Nuevo criterio', descripcion:'', peso:0, activo:true });
    persist(); marcarNuevaDesactualizada(); renderCriterios();
  });

  document.getElementById('btnExport').addEventListener('click', exportarRespaldo);
  document.getElementById('btnImportTrigger').addEventListener('click', () => document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) importarRespaldo(e.target.files[0]);
  });
}

/* ---------- Tab: Asesores ---------- */
function renderAsesores() {
  const sec = document.getElementById('tab-asesores');
  sec.innerHTML = `
    <div class="card">
      <h2>Asesores</h2>
      <div id="asesorList"></div>
      <div class="row">
        <input type="text" id="newAsesor" placeholder="Nombre del asesor">
        <button class="secondary" id="addAsesor">Agregar</button>
      </div>
    </div>
  `;
  const list = document.getElementById('asesorList');
  state.asesores.forEach((a, idx) => {
    const div = document.createElement('div');
    div.className = 'asesor-item';
    div.innerHTML = `<span>${escapeHtml(a)}</span><button class="danger">Quitar</button>`;
    div.querySelector('button').addEventListener('click', () => {
      if (!confirm(`¿Quitar a ${a} de la lista?`)) return;
      state.asesores.splice(idx,1); persist(); marcarNuevaDesactualizada(); renderAsesores();
    });
    list.appendChild(div);
  });
  document.getElementById('addAsesor').addEventListener('click', () => {
    const v = document.getElementById('newAsesor').value.trim();
    if (!v) return;
    if (state.asesores.includes(v)) { toast('Ese asesor ya está en la lista'); return; }
    state.asesores.push(v); persist(); marcarNuevaDesactualizada(); renderAsesores();
  });
}

/* ---------- Tab: Historial ---------- */
function renderHistorial() {
  const sec = document.getElementById('tab-historial');
  if (!state.historial.length) {
    sec.innerHTML = `<div class="card"><p class="muted">Aún no hay evaluaciones guardadas en este dispositivo. Al generar un PDF, aquí queda un registro rápido (el PDF en sí vive donde lo hayas guardado).</p></div>`;
    return;
  }
  sec.innerHTML = `
    <div class="card">
      <h2>Historial (registro local)</h2>
      <p class="muted">Este listado es solo de referencia rápida en este dispositivo; el PDF archivado vive donde lo hayas guardado tú.</p>
      <table class="hist">
        <tr><th>Fecha</th><th>Asesor</th><th>Periodo</th><th>Calif.</th></tr>
        ${state.historial.map(h => `<tr><td>${h.fecha}</td><td>${escapeHtml(h.asesor)}</td><td>${escapeHtml(h.periodo)}</td><td><span class="pill">${h.calificacionGeneral}</span></td></tr>`).join('')}
      </table>
    </div>
  `;
}

/* init */
renderNueva();
