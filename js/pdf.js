/* Generador de PDF sin dependencias externas.
   Texto en Helvetica (WinAnsi) e imágenes JPEG incrustadas tal cual. */

// Caracteres fuera de Latin-1 que sí existen en WinAnsi (comillas curvas, guiones, etc.)
const CP1252 = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C,
  0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
  0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

function latin1Bytes(str) {
  const out = [];
  for (const ch of String(str)) {           // for..of recorre emojis como un solo carácter
    const c = ch.codePointAt(0);
    if (c <= 255) out.push(c);
    else if (CP1252[c]) out.push(CP1252[c]);
    else out.push(63);                       // '?'
  }
  return Uint8Array.from(out);
}
function concatBytes(arrays) {
  let total = 0;
  for (const a of arrays) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}
function escapePdfText(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

class PdfDoc {
  constructor() { this.objects = []; this.pageObjNums = []; }
  _newObj() { this.objects.push(null); return this.objects.length; }
  _setObj(num, dict, stream) { this.objects[num - 1] = { dict, stream: stream || null }; }
  addFont(baseFont) {
    const num = this._newObj();
    this._setObj(num, `<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`);
    return num;
  }
  addImage(jpegBytes, width, height) {
    const num = this._newObj();
    this._setObj(num, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`, jpegBytes);
    return num;
  }
  addPage(page) {
    const contentBytes = latin1Bytes(page.content);
    const contentObjNum = this._newObj();
    this._setObj(contentObjNum, `<< /Length ${contentBytes.length} >>`, contentBytes);
    const pageObjNum = this._newObj();
    let resources = '<< /Font <<';
    for (const [name, ref] of Object.entries(page.fontRefs || {})) resources += ` /${name} ${ref} 0 R`;
    resources += ' >>';
    if (page.imageRefs && Object.keys(page.imageRefs).length) {
      resources += ' /XObject <<';
      for (const [name, ref] of Object.entries(page.imageRefs)) resources += ` /${name} ${ref} 0 R`;
      resources += ' >>';
    }
    resources += ' >>';
    this._setObj(pageObjNum, `PAGE_PLACEHOLDER|${page.width}|${page.height}|${contentObjNum}|${resources}`);
    this.pageObjNums.push(pageObjNum);
    return pageObjNum;
  }
  build() {
    const pagesObjNum = this._newObj();
    const kids = this.pageObjNums.map((n) => `${n} 0 R`).join(' ');
    this._setObj(pagesObjNum, `<< /Type /Pages /Kids [ ${kids} ] /Count ${this.pageObjNums.length} >>`);
    for (const pnum of this.pageObjNums) {
      const obj = this.objects[pnum - 1];
      const [, w, h, contentObjNum, resources] = obj.dict.split('|');
      obj.dict = `<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${w} ${h}] /Resources ${resources} /Contents ${contentObjNum} 0 R >>`;
    }
    const catalogObjNum = this._newObj();
    this._setObj(catalogObjNum, `<< /Type /Catalog /Pages ${pagesObjNum} 0 R >>`);

    const chunks = []; let length = 0;
    const push = (s) => { const b = typeof s === 'string' ? latin1Bytes(s) : s; chunks.push(b); length += b.length; };
    const offsets = new Array(this.objects.length + 1).fill(0);
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    for (let i = 0; i < this.objects.length; i++) {
      const objNum = i + 1;
      offsets[objNum] = length;
      const obj = this.objects[i];
      push(`${objNum} 0 obj\n${obj.dict}\n`);
      if (obj.stream) { push('stream\n'); push(obj.stream); push('\nendstream\n'); }
      push('endobj\n');
    }
    const xrefOffset = length;
    push(`xref\n0 ${this.objects.length + 1}\n`);
    push('0000000000 65535 f \n');
    for (let i = 1; i <= this.objects.length; i++) push(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    push(`trailer\n<< /Size ${this.objects.length + 1} /Root ${catalogObjNum} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return concatBytes(chunks);
  }
}

function dataUrlToBytes(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function wrapText(text, maxCharsPerLine) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxCharsPerLine) { if (cur) lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/* Ancho aproximado de texto en Helvetica (para centrar / alinear a la derecha). */
function anchoTexto(str, size, bold) {
  let w = 0;
  for (const ch of String(str)) {
    if ('0123456789$'.includes(ch)) w += 556;
    else if ('.,:;/ ()'.includes(ch)) w += 278;
    else if (ch === '%') w += 889;
    else if (ch === '-') w += 333;
    else if (ch >= 'A' && ch <= 'Z' || 'ÁÉÍÓÚÑ'.includes(ch)) w += bold ? 722 : 667;
    else w += bold ? 590 : 540;
  }
  return w / 1000 * size;
}

/* Color según calificación (1-10): verde / ámbar / rojo */
function colorCalif(n) {
  n = Number(n);
  if (n >= 8) return [0.09, 0.50, 0.25];
  if (n >= 6) return [0.80, 0.50, 0.02];
  return [0.75, 0.10, 0.12];
}

/* ev.firmaGerente / ev.firmaAsesor = { jpeg: dataURL, w, h } ya recortadas.
   ev.logo = { jpeg, w, h } (opcional) */
function buildEvaluacionPDF(ev) {
  const doc = new PdfDoc();
  const F1 = doc.addFont('Helvetica');
  const F2 = doc.addFont('Helvetica-Bold');
  const F3 = doc.addFont('Helvetica-Oblique');
  const PW = 612, PH = 792, M = 40, W = PW - M * 2;
  const PIE = 52;                      // espacio reservado para el pie de página
  const ROJO = [0.70, 0.07, 0.12], OSCURO = [0.12, 0.16, 0.22], GRIS = [0.42, 0.45, 0.50];
  const logoNum = ev.logo ? doc.addImage(dataUrlToBytes(ev.logo.jpeg), ev.logo.w, ev.logo.h) : null;

  const paginas = [];
  let ops, imgs, y;
  function nuevaPagina(continuacion) {
    ops = ''; imgs = {}; y = PH - M;
    if (logoNum) imgs.Logo = logoNum;
    if (continuacion) {
      // encabezado chico en páginas siguientes
      if (logoNum) { const h = 18, w = h * ev.logo.w / ev.logo.h; ops += `q ${w} 0 0 ${h} ${M} ${y - h} cm /Logo Do Q\n`; }
      txt(`Evaluación semanal · ${ev.asesor} · ${ev.fecha}`, PW - M, y - 13, 9, F1, GRIS, 'der');
      y -= 26;
      linea(M, y, PW - M, y, ROJO, 1.2);
      y -= 14;
    }
  }
  function cerrarPagina() { paginas.push({ ops, imgs }); }
  function espacio(h, alSaltar) {
    if (y - h < PIE) { cerrarPagina(); nuevaPagina(true); if (alSaltar) alSaltar(); return true; }
    return false;
  }
  function color(c, relleno) { return `${c[0]} ${c[1]} ${c[2]} ${relleno ? 'rg' : 'RG'}\n`; }
  function txt(str, x, yy, size, font, c, alin) {
    const fn = font === F2 ? 'F2' : font === F3 ? 'F3' : 'F1';
    if (alin === 'der') x -= anchoTexto(str, size, font === F2);
    if (alin === 'centro') x -= anchoTexto(str, size, font === F2) / 2;
    ops += color(c || [0, 0, 0], true);
    ops += `BT /${fn} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${escapePdfText(str)}) Tj ET\n`;
    ops += '0 0 0 rg\n';
  }
  function rect(x, yy, w, h, relleno, borde) {
    if (relleno) ops += color(relleno, true) + `${x} ${yy} ${w} ${h} re f\n`;
    if (borde) ops += color(borde, false) + `0.6 w ${x} ${yy} ${w} ${h} re S\n0 0 0 RG\n`;
    ops += '0 0 0 rg\n';
  }
  function linea(x1, y1, x2, y2, c, grosor) {
    ops += color(c || [0, 0, 0], false) + `${grosor || 0.6} w ${x1} ${y1} m ${x2} ${y2} l S\n0 0 0 RG 1 w\n`;
  }
  function tituloSeccion(t, extra) {
    espacio(30);
    rect(M, y - 9, 4, 11, ROJO);
    txt(t, M + 10, y - 7.5, 10.5, F2, OSCURO);
    if (extra) txt(extra, M + 10 + anchoTexto(t, 10.5, true) + 8, y - 7.5, 8.5, F1, GRIS);
    y -= 20;
  }

  /* ---------- Encabezado ---------- */
  nuevaPagina(false);
  if (logoNum) {
    const h = 30, w = h * ev.logo.w / ev.logo.h;
    ops += `q ${w} 0 0 ${h} ${M} ${y - h} cm /Logo Do Q\n`;
  }
  txt('EVALUACIÓN SEMANAL DE DESEMPEÑO', PW - M, y - 12, 13, F2, OSCURO, 'der');
  txt('Agencia Vento Chalco', PW - M, y - 26, 9.5, F1, GRIS, 'der');
  y -= 40;
  linea(M, y, PW - M, y, ROJO, 2);
  y -= 12;

  /* ---------- Datos + calificación general ---------- */
  const panelH = 60, cajaW = 118;
  rect(M, y - panelH, W, panelH, [0.95, 0.96, 0.97]);
  const col1 = M + 12, col2 = M + 12 + (W - cajaW) / 2;
  const dato = (etq, val, x, yy) => { txt(etq, x, yy, 7, F2, GRIS); txt(val, x, yy - 12, 10, F2, OSCURO); };
  dato('ASESOR', ev.asesor, col1, y - 14);
  dato('PERIODO', ev.periodo, col1, y - 40);
  dato('FECHA', ev.fecha, col2, y - 14);
  dato('EVALUÓ', ev.gerenteNombre || 'Gerente', col2, y - 40);
  const cc = colorCalif(ev.calificacionGeneral);
  rect(PW - M - cajaW, y - panelH, cajaW, panelH, cc);
  txt('CALIFICACIÓN GENERAL', PW - M - cajaW / 2, y - 15, 7, F2, [1, 1, 1], 'centro');
  txt(String(ev.calificacionGeneral), PW - M - cajaW / 2, y - 42, 24, F2, [1, 1, 1], 'centro');
  txt('de 10', PW - M - cajaW / 2, y - 54, 7, F1, [1, 1, 1], 'centro');
  y -= panelH + 16;

  /* ---------- Resultados del mes ---------- */
  if (ev.resultados) {
    const r = ev.resultados;
    tituloSeccion('RESULTADOS DEL MES', r.corte ? `(${r.corte})` : '');
    const filas = [];
    if (r.estado) filas.push({ t: r.estado.texto, f: F2, c: r.estado.ok ? [0.09, 0.50, 0.25] : [0.75, 0.10, 0.12] });
    r.lineas.forEach(l => filas.push({ t: l, f: F1, c: OSCURO }));
    if (r.top.length) filas.push({ t: 'Top modelos: ' + r.top.map((t, i) => `${i + 1}) ${t}`).join('    '), f: F1, c: OSCURO });
    r.avisos.forEach(l => filas.push({ t: 'Aviso: ' + l, f: F3, c: [0.70, 0.40, 0.02] }));
    const h = filas.length * 14 + 12;
    espacio(h);
    rect(M, y - h, W, h, null, [0.85, 0.87, 0.90]);
    let yy = y - 16;
    filas.forEach(f => { txt(f.t, M + 12, yy, 9.5, f.f, f.c); yy -= 14; });
    y -= h + 16;
  }

  /* ---------- Tabla de criterios ---------- */
  const xPeso = PW - M - 100, xCal = PW - M - 50;
  function encabezadoTabla() {
    rect(M, y - 18, W, 18, OSCURO);
    txt('CRITERIO', M + 8, y - 12.5, 8, F2, [1, 1, 1]);
    txt('PESO', xPeso + 25, y - 12.5, 8, F2, [1, 1, 1], 'centro');
    txt('CALIF.', xCal + 25, y - 12.5, 8, F2, [1, 1, 1], 'centro');
    y -= 18;
  }
  tituloSeccion('CRITERIOS EVALUADOS');
  espacio(40);
  encabezadoTabla();
  ev.detalle.forEach((row, i) => {
    const nom = wrapText(row.nombre, 72);
    const com = row.comentario ? wrapText(row.comentario, 95) : [];
    const h = 5 + nom.length * 11.5 + com.length * 10.5 + 3;
    espacio(h, encabezadoTabla);
    if (i % 2 === 1) rect(M, y - h, W, h, [0.97, 0.97, 0.98]);
    let yy = y - 12;
    nom.forEach(l => { txt(l, M + 8, yy, 9.5, F2, OSCURO); yy -= 11.5; });
    com.forEach(l => { txt(l, M + 14, yy + 1, 8.5, F3, GRIS); yy -= 10.5; });
    txt(`${row.peso}%`, xPeso + 25, y - 12, 9, F1, GRIS, 'centro');
    txt(String(row.calificacion), xCal + 25, y - 12, 11, F2, colorCalif(row.calificacion), 'centro');
    linea(M, y - h, PW - M, y - h, [0.88, 0.89, 0.91], 0.4);
    y -= h;
  });
  espacio(22);
  rect(M, y - 22, W, 22, [0.93, 0.94, 0.96]);
  txt('Calificación general ponderada', M + 8, y - 14.5, 10, F2, OSCURO);
  txt(String(ev.calificacionGeneral), xCal + 25, y - 15, 12, F2, cc, 'centro');
  y -= 22 + 20;

  /* ---------- Observaciones ---------- */
  tituloSeccion('OBSERVACIONES Y COMPROMISOS DE LA SEMANA');
  const obs = wrapText(ev.observaciones || '(sin observaciones)', 100);
  let restantes = obs.slice();
  while (restantes.length) {
    espacio(30);
    const caben = Math.max(1, Math.floor((y - PIE - 12) / 13));
    const tramo = restantes.splice(0, caben);
    const h = tramo.length * 13 + 12;
    rect(M, y - h, W, h, null, [0.85, 0.87, 0.90]);
    let yy = y - 15;
    tramo.forEach(l => { txt(l, M + 10, yy, 9.5, F1, OSCURO); yy -= 13; });
    y -= h + 20;
  }

  /* ---------- Firmas ---------- */
  espacio(125);
  const boxW = (W - 40) / 2, boxH = 64;
  const lineaY = y - boxH - 14;
  [[ev.firmaGerente, 'ImG', M, 'Firma del gerente', ev.gerenteNombre || 'Gerente'],
   [ev.firmaAsesor, 'ImA', M + boxW + 40, 'Firma del asesor', ev.asesor]].forEach(([f, nombre, x0, etq, quien]) => {
    imgs[nombre] = doc.addImage(dataUrlToBytes(f.jpeg), f.w, f.h);
    const esc = Math.min(boxW / f.w, boxH / f.h);
    const w = f.w * esc, h = f.h * esc;
    ops += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(x0 + (boxW - w) / 2).toFixed(2)} ${(lineaY + 2).toFixed(2)} cm /${nombre} Do Q\n`;
    linea(x0, lineaY, x0 + boxW, lineaY, OSCURO, 0.8);
    txt(quien, x0 + boxW / 2, lineaY - 13, 9.5, F2, OSCURO, 'centro');
    txt(etq, x0 + boxW / 2, lineaY - 24, 8, F1, GRIS, 'centro');
  });
  y = lineaY - 30;
  cerrarPagina();

  /* ---------- Pie en cada página ---------- */
  paginas.forEach((p, i) => {
    ops = p.ops;
    linea(M, 38, PW - M, 38, [0.80, 0.82, 0.85], 0.5);
    txt(`Generado el ${ev.generadoTexto} · Herramienta de uso interno · Agencia Vento Chalco`, M, 27, 7, F1, GRIS);
    txt(`Página ${i + 1} de ${paginas.length}`, PW - M, 27, 7, F1, GRIS, 'der');
    doc.addPage({ width: PW, height: PH, content: ops, fontRefs: { F1, F2, F3 }, imageRefs: p.imgs });
  });
  return doc.build();
}
