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

/* ev.firmaGerente / ev.firmaAsesor = { jpeg: dataURL, w, h } ya recortadas */
function buildEvaluacionPDF(ev) {
  const doc = new PdfDoc();
  const F1 = doc.addFont('Helvetica');
  const F2 = doc.addFont('Helvetica-Bold');
  const PW = 612, PH = 792, MARGIN = 46;
  let y, ops, imageRefsThisPage;

  function newPage() { ops = ''; y = PH - MARGIN; imageRefsThisPage = {}; }
  function flushPage() {
    doc.addPage({ width: PW, height: PH, content: ops, fontRefs: { F1, F2 }, imageRefs: imageRefsThisPage });
  }
  function ensureSpace(h) { if (y - h < MARGIN + 20) { flushPage(); newPage(); } }
  function text(str, x, size, bold) {
    ops += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${escapePdfText(str)}) Tj ET\n`;
  }
  function line(str, size, bold, gap) {
    ensureSpace(size + (gap || 6));
    text(str, MARGIN, size, bold);
    y -= (size + (gap || 6));
  }
  function paragraph(str, size, maxChars, lh) {
    for (const l of wrapText(str, maxChars)) line(l, size, false, lh || (size + 4));
  }
  function hr() {
    ensureSpace(10);
    ops += `${MARGIN} ${y} m ${PW - MARGIN} ${y} l S\n`;
    y -= 10;
  }

  newPage();
  line('Evaluación Semanal - Agencia Vento Chalco', 16, true, 22);
  line(`Asesor: ${ev.asesor}     Fecha: ${ev.fecha}     Periodo: ${ev.periodo}`, 11, false, 18);
  hr();

  line('Criterios evaluados', 12, true, 16);
  for (const row of ev.detalle) {
    const nombreLineas = wrapText(`${row.nombre}  (peso ${row.peso}%)`, 78);
    ensureSpace(16 + nombreLineas.length * 14);
    text(`${row.calificacion}/10`, PW - MARGIN - 40, 10.5, true);
    for (const l of nombreLineas) { text(l, MARGIN, 10.5, true); y -= 14; }
    if (row.comentario) {
      for (const l of wrapText(row.comentario, 100)) { ensureSpace(12); text('   ' + l, MARGIN, 9.5, false); y -= 12; }
    }
    y -= 4;
  }
  hr();
  ensureSpace(30);
  text('Calificación general ponderada:', MARGIN, 12, true);
  text(String(ev.calificacionGeneral), PW - MARGIN - 40, 14, true);
  y -= 26;

  line('Observaciones / compromisos de la semana', 12, true, 16);
  paragraph(ev.observaciones || '(sin observaciones)', 10.5, 100, 14);
  y -= 10;

  // Firmas: si no caben, saltar de página. Cada firma se ajusta a su caja SIN deformarse.
  ensureSpace(150);
  const boxW = (PW - MARGIN * 2 - 20) / 2, boxH = 70;
  const sigTop = y;
  const lineaY = sigTop - boxH - 4;
  [[ev.firmaGerente, 'ImG', MARGIN], [ev.firmaAsesor, 'ImA', MARGIN + boxW + 20]].forEach(([f, nombre, x0]) => {
    imageRefsThisPage[nombre] = doc.addImage(dataUrlToBytes(f.jpeg), f.w, f.h);
    const esc = Math.min(boxW / f.w, boxH / f.h);
    const w = f.w * esc, h = f.h * esc;
    const x = x0 + (boxW - w) / 2;
    ops += `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(lineaY + 2).toFixed(2)} cm /${nombre} Do Q\n`;
    ops += `${x0} ${lineaY} m ${x0 + boxW} ${lineaY} l S\n`;
  });
  y = lineaY - 14;
  text('Firma Gerente', MARGIN, 10, true);
  text('Firma Asesor', MARGIN + boxW + 20, 10, true);
  y -= 14;
  text(ev.gerenteNombre || 'Gerente', MARGIN, 9.5, false);
  text(ev.asesor, MARGIN + boxW + 20, 9.5, false);
  y -= 24;

  ensureSpace(14);
  text(`Generado el ${ev.generadoTexto}`, MARGIN, 8.5, false);

  flushPage();
  return doc.build();
}
