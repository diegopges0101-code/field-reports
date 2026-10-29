// =====================================================================
//  PDF corporativo 16:9 generado en el navegador con pdf-lib (sin servidor)
//  Portada · Detalles · Contenido a 2 columnas · Fotos · "Page X of Y"
// =====================================================================
import { dataUrlToBytes } from './ui.js';

const W = 960, H = 540;
const COL_W = 415, COL_X = [40, 505], TOP = 128, BOTTOM = 470; // zona útil de contenido
const LH = 13.5, FS = 10;

const hex = (c) => { const n = parseInt(c.replace('#', ''), 16); return PDFLib.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const C = { blue: hex('#1c4f86'), light: hex('#d5e6f4'), p1: hex('#dceaf6'), p2: hex('#bcd8ee'), p3: hex('#99c4e3'), band: hex('#eef3f8'), gray: hex('#5f6368'), dark: hex('#1f1f1f'), mid: hex('#4a4a4a'), white: hex('#ffffff'), line: hex('#333333') };

// Helvetica estándar solo admite WinAnsi: se sustituyen los símbolos no compatibles
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function safe(s) {
  return String(s ?? '').normalize('NFC').replace(/→|➜|⟶/g, '->').replace(/←/g, '<-').replace(/[✓✔]/g, 'OK').replace(/\t/g, ' ')
    .replace(/[^\n\x20-\x7e\xa0-\xff]/g, (ch) => (WINANSI_EXTRA.includes(ch) ? ch : ch === '≈' ? '~' : ch === '≥' ? '>=' : ch === '≤' ? '<=' : '?'));
}

/** Corta texto (con tramos en negrita) en líneas que caben en "width". */
function wrapRuns(runs, width, fonts, size) {
  const words = [];
  runs.forEach((r) => {
    safe(r.text).split(/(\n)/).forEach((part) => {
      if (part === '\n') { words.push({ br: true }); return; }
      part.split(/(\s+)/).filter((w) => w !== '').forEach((w) => words.push({ text: w, bold: !!r.bold }));
    });
  });
  const lines = []; let cur = []; let curW = 0;
  const widthOf = (w) => (w.bold ? fonts.bold : fonts.reg).widthOfTextAtSize(w.text, size);
  const push = () => { while (cur.length && /^\s+$/.test(cur[cur.length - 1].text)) cur.pop(); lines.push(cur); cur = []; curW = 0; };
  for (const w of words) {
    if (w.br) { push(); continue; }
    if (!cur.length && /^\s+$/.test(w.text)) continue;
    let ww = widthOf(w);
    if (curW + ww > width && cur.length) { push(); if (/^\s+$/.test(w.text)) continue; }
    // palabra más larga que la línea (números de serie largos): se parte
    while (ww > width) {
      let i = w.text.length;
      while (i > 1 && (w.bold ? fonts.bold : fonts.reg).widthOfTextAtSize(w.text.slice(0, i), size) > width - curW) i--;
      cur.push({ text: w.text.slice(0, i), bold: w.bold }); push();
      w.text = w.text.slice(i); ww = widthOf(w);
    }
    cur.push(w); curW += ww;
  }
  if (cur.length) push();
  return lines.length ? lines : [[]];
}

function drawRunsLine(page, line, x, yTop, fonts, size, color) {
  let cx = x;
  for (const w of line) {
    const f = w.bold ? fonts.bold : fonts.reg;
    page.drawText(w.text, { x: cx, y: H - yTop - size, size, font: f, color: w.bold ? C.mid : color });
    cx += f.widthOfTextAtSize(w.text, size);
  }
}

// Formas con esquinas redondeadas (coordenadas desde arriba a la izquierda)
function roundRect(page, x, y, w, h, r, color) {
  const tl = r.tl || 0, tr = r.tr || 0, br = r.br || 0, bl = r.bl || 0;
  const path = `M ${tl} 0 L ${w - tr} 0 ${tr ? `A ${tr} ${tr} 0 0 1 ${w} ${tr}` : ''} L ${w} ${h - br} ${br ? `A ${br} ${br} 0 0 1 ${w - br} ${h}` : ''} L ${bl} ${h} ${bl ? `A ${bl} ${bl} 0 0 1 0 ${h - bl}` : ''} L 0 ${tl} ${tl ? `A ${tl} ${tl} 0 0 1 ${tl} 0` : ''} Z`;
  page.drawSvgPath(path, { x, y: H - y, color, borderWidth: 0 });
}
const rect = (page, x, y, w, h, color) => page.drawRectangle({ x, y: H - y - h, width: w, height: h, color });
function text(page, s, x, yTop, size, font, color, opts = {}) {
  const str = safe(s);
  let tx = x;
  if (opts.align === 'right') tx = x - font.widthOfTextAtSize(str, size);
  if (opts.align === 'center') tx = x - font.widthOfTextAtSize(str, size) / 2;
  page.drawText(str, { x: tx, y: H - yTop - size, size, font, color });
}
function fitText(s, font, size, maxW) {
  let str = safe(s);
  while (str.length > 3 && font.widthOfTextAtSize(str, size) > maxW) str = str.slice(0, -2);
  return str;
}
async function embedImage(doc, dataUrl) {
  if (!dataUrl) return null;
  try {
    const bytes = dataUrlToBytes(dataUrl);
    return /^data:image\/png/.test(dataUrl) ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch { return null; }
}
function drawContain(page, img, x, yTop, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  const dw = img.width * s, dh = img.height * s;
  page.drawImage(img, { x: x + (w - dw) / 2, y: H - yTop - (h - dh) / 2 - dh, width: dw, height: dh });
  return { dw, dh, dx: x + (w - dw) / 2, dy: yTop + (h - dh) / 2 };
}

// ---------------------------------------------------------------------
export async function buildPdf(model, opts) {
  const { PDFDocument, StandardFonts } = PDFLib;
  const doc = await PDFDocument.create();
  doc.setTitle(model.fileName.replace(/\.pdf$/, ''));
  doc.setAuthor(opts.companyName || '');
  doc.setCreator('Orbius Field Reports');
  const fonts = { reg: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const logo = await embedImage(doc, opts.logo);
  const footer = opts.footer || '';
  const pages = [];
  const newPage = () => { const p = doc.addPage([W, H]); pages.push(p); return p; };

  const chrome = (page, title, big) => {
    text(page, title, 35, 32, 13, fonts.reg, C.gray);
    if (logo) drawContain(page, logo, W - 35 - 110, 12, 110, 40);
    else text(page, opts.companyName || '', W - 35, 22, 16, fonts.bold, C.blue, { align: 'right' });
    if (big) text(page, big, 35, 64, 30, fonts.reg, C.dark);
    rect(page, 0, H - 34, W, 34, C.band);
    roundRect(page, 0, H - 34 - 40, 40, 40, { bl: 40 }, C.white);
  };

  // ---------- 1. Portada ----------
  {
    const p = newPage();
    rect(p, 0, 0, W, 100, C.blue);
    rect(p, W - 140, 0, 140, 505, C.blue);
    roundRect(p, 0, 99, 821, 300, { tr: 75 }, C.white);
    roundRect(p, 0, 396, 821, 109, { bl: 50 }, C.light);
    rect(p, 0, H - 35, W, 35, C.band);
    text(p, model.title, 214, 40, 15, fonts.reg, C.white);
    if (opts.contactLine) text(p, fitText(opts.contactLine, fonts.bold, 8, 600), W - 35, 38, 8, fonts.bold, C.white, { align: 'right' });
    if (logo) drawContain(p, logo, 214, 118, 190, 70);
    else text(p, opts.companyName || '', 214, 130, 30, fonts.bold, C.blue);
    text(p, 'SITE LOCATION:', 214, 222, 32, fonts.bold, C.dark);
    const big = model.siteLine.length > 34 ? 24 : 32;
    wrapRuns([{ text: model.siteLine.toUpperCase() }], 580, fonts, big).slice(0, 3)
      .forEach((ln, i) => drawRunsLine(p, ln, 214, 262 + i * big * 1.12, fonts, big, C.dark));
    if (model.contract) text(p, `Contract: ${model.contract}`, 216, 442, 15, fonts.reg, C.dark);
    text(p, `Ref. ${model.number || ''}`, 800, 446, 9, fonts.reg, C.gray, { align: 'right' });
  }

  // ---------- 2. Detalles ----------
  {
    const p = newPage();
    chrome(p, `${model.title} Details`);
    roundRect(p, 560, 174, 376, 330, { tr: 80 }, C.p3);
    roundRect(p, 260, 174, 376, 330, { tr: 80 }, C.p2);
    roundRect(p, 0, 174, 330, 330, { tr: 80 }, C.p1);
    const col = (x, w, heading, rows) => {
      let y = 230;
      text(p, heading, x, y, 15, fonts.bold, C.dark); y += 30;
      for (const r of rows) {
        const lines = wrapRuns(r, w, fonts, 10.5);
        for (const ln of lines) { if (y > 490) return; drawRunsLine(p, ln, x, y, fonts, 10.5, C.dark); y += 14; }
        y += 8;
      }
    };
    col(35, 270, 'Technician Details:', [
      [{ text: 'Technicians: ', bold: true }, { text: model.technicians || '-' }],
      model.supervisor ? [{ text: 'Supervisor: ', bold: true }, { text: model.supervisor }] : null,
      [{ text: 'Date: ', bold: true }, { text: model.dateText + (model.timeText ? ` (${model.timeText})` : '') }],
      model.gps ? [{ text: 'Location: ', bold: true }, { text: model.gps }] : null,
    ].filter(Boolean));
    if (model.kind === 'survey') col(365, 240, 'Purpose:', model.objective.slice(0, 6).map((o) => [{ text: o, bold: true }]));
    else col(365, 240, 'Project Details:', model.equipment.slice(0, 7).map((e) => [{ text: 'Equipment: ', bold: true }, { text: e.label }, ...(e.value ? [{ text: '\n' }, { text: 'Model Numbers: ', bold: true }, { text: e.value }] : [])]));
    if (model.kind === 'installation' && model.network.length) col(665, 240, 'Network Configuration:', model.network.map(([k, v]) => [{ text: `${k}: `, bold: true }, { text: v }]));
    else if (model.result) col(665, 240, 'Result:', [[{ text: model.result, bold: true }]]);
  }

  // ---------- 3. Contenido en dos columnas ----------
  const items = [];
  for (const s of model.sections) {
    items.push({ kind: 'title', lines: wrapRuns([{ text: s.title, bold: true }], COL_W, fonts, 10.5) });
    for (const b of s.blocks) {
      if (b.type === 'p') items.push({ kind: 'p', lines: wrapRuns([{ text: b.text, bold: !!b.bold }], COL_W, fonts, FS) });
      if (b.type === 'bullets') b.items.forEach((t) => items.push({ kind: 'bullet', lines: wrapRuns([{ text: t }], COL_W - 12, fonts, FS) }));
      if (b.type === 'kv') b.rows.forEach(([k, v]) => items.push({ kind: 'kv', lines: wrapRuns([{ text: `${k}: `, bold: true }, { text: v }], COL_W, fonts, FS) }));
    }
    items.push({ kind: 'gap' });
  }
  if (model.summary.length) {
    items.push({ kind: 'title', lines: wrapRuns([{ text: `${model.kind === 'survey' ? model.sections.length + 1 + '. ' : ''}Technical summary`, bold: true }], COL_W, fonts, 10.5) });
    items.push({ kind: 'thead' });
    model.summary.forEach(([k, v]) => items.push({ kind: 'trow', k: wrapRuns([{ text: k }], 140, fonts, 9), v: wrapRuns([{ text: v }], COL_W - 165, fonts, 9) }));
  }
  const heightOf = (it) => {
    switch (it.kind) {
      case 'title': return it.lines.length * 14 + 4;
      case 'p': return it.lines.length * LH + 6;
      case 'bullet': return it.lines.length * LH + 3;
      case 'kv': return it.lines.length * LH + 2;
      case 'gap': return 8;
      case 'thead': return 20;
      case 'trow': return Math.max(it.k.length, it.v.length) * 11.5 + 8;
    }
    return 0;
  };
  // Paginación exacta
  const contentPages = [];
  let cols = [[]], used = 0;
  const nextCol = () => { if (cols.length === 2) { contentPages.push(cols); cols = [[]]; } else cols.push([]); used = 0; };
  items.forEach((it, i) => {
    let hgt = heightOf(it);
    // un párrafo que no cabe se reparte: primero el hueco que queda, luego columnas nuevas
    if (it.kind === 'p' && used + hgt > BOTTOM - TOP && it.lines.length > 3) {
      let lines = it.lines;
      while (lines.length) {
        let fit = Math.floor((BOTTOM - TOP - used - 6) / LH);
        if (fit < 3) { nextCol(); fit = Math.floor((BOTTOM - TOP - 6) / LH); }
        const part = { kind: 'p', lines: lines.slice(0, fit) };
        cols[cols.length - 1].push(part); used += heightOf(part);
        lines = lines.slice(fit);
      }
      return;
    }
    let need = hgt;
    // un título nunca se queda solo al final de una columna (va con al menos 3 líneas de lo siguiente)
    if (it.kind === 'title' || it.kind === 'thead') need += Math.min(heightOf(items[i + 1] || { kind: 'gap' }), 3 * LH + 6) + (it.kind === 'title' && items[i + 1]?.kind === 'thead' ? heightOf(items[i + 2] || {}) : 0);
    // la tabla resumen se mantiene entera si cabe en una columna
    if (it.kind === 'title' && items[i + 1]?.kind === 'thead') {
      let tot = hgt;
      for (let k = i + 1; k < items.length && (items[k].kind === 'thead' || items[k].kind === 'trow'); k++) tot += heightOf(items[k]);
      if (tot <= BOTTOM - TOP) need = tot;
    }
    if (it.kind === 'gap' && used === 0) return;
    if (used > 0 && used + need > BOTTOM - TOP) {
      nextCol();
      if (it.kind === 'trow') cols[cols.length - 1].push({ kind: 'thead' }), used += 20; // repite cabecera de tabla
    }
    cols[cols.length - 1].push(it); used += hgt;
  });
  if (cols.some((c) => c.length)) contentPages.push(cols);

  const bigTitle = model.kind === 'survey' ? 'SURVEY DETAILS' : 'INSTALLATION DETAILS';
  for (const pc of contentPages) {
    const p = newPage();
    chrome(p, model.title, bigTitle);
    pc.forEach((col, ci) => {
      let y = TOP; const x = COL_X[ci];
      for (const it of col) {
        if (it.kind === 'title') { it.lines.forEach((ln) => { drawRunsLine(p, ln, x, y, fonts, 10.5, C.mid); y += 14; }); y += 4; }
        else if (it.kind === 'p' || it.kind === 'kv') { it.lines.forEach((ln) => { drawRunsLine(p, ln, x, y, fonts, FS, C.gray); y += LH; }); y += it.kind === 'p' ? 6 : 2; }
        else if (it.kind === 'bullet') { text(p, '•', x + 1, y, FS, fonts.reg, C.gray); it.lines.forEach((ln) => { drawRunsLine(p, ln, x + 12, y, fonts, FS, C.gray); y += LH; }); y += 3; }
        else if (it.kind === 'gap') y += 8;
        else if (it.kind === 'thead') {
          p.drawRectangle({ x, y: H - y - 20, width: COL_W, height: 20, borderColor: C.line, borderWidth: 0.7, color: hex('#f3f6f9') });
          p.drawLine({ start: { x: x + 150, y: H - y }, end: { x: x + 150, y: H - y - 20 }, color: C.line, thickness: 0.7 });
          text(p, 'Item', x + 75, y + 6, 9, fonts.bold, C.dark, { align: 'center' });
          text(p, 'Selected solution', x + 150 + (COL_W - 150) / 2, y + 6, 9, fonts.bold, C.dark, { align: 'center' });
          y += 20;
        } else if (it.kind === 'trow') {
          const rh = heightOf(it);
          p.drawRectangle({ x, y: H - y - rh, width: COL_W, height: rh, borderColor: C.line, borderWidth: 0.7 });
          p.drawLine({ start: { x: x + 150, y: H - y }, end: { x: x + 150, y: H - y - rh }, color: C.line, thickness: 0.7 });
          it.k.forEach((ln, i) => drawRunsLine(p, ln, x + 5, y + 4 + i * 11.5, fonts, 9, C.dark));
          it.v.forEach((ln, i) => drawRunsLine(p, ln, x + 155, y + 4 + i * 11.5, fonts, 9, C.dark));
          y += rh;
        }
      }
    });
  }

  // ---------- 4. Fotos (2 por página, con pie) ----------
  for (const g of model.photoGroups) {
    const ph = g.photos.filter((x) => opts.photoData[x.id]);
    for (let i = 0; i < ph.length; i += 2) {
      const pair = ph.slice(i, i + 2);
      const p = newPage();
      chrome(p, model.title);
      const isSpeed = g.category === 'SPEED TESTS';
      const lightWord = isSpeed ? '' : `${g.category} `;
      const boldWord = isSpeed ? 'SPEED TESTS' : g.category === 'SKY VIEW' ? 'CHECK' : 'INSTALLATION IMAGES';
      text(p, lightWord, 35, 62, 28, fonts.reg, C.dark);
      text(p, boldWord, 35 + fonts.reg.widthOfTextAtSize(safe(lightWord), 28), 62, 28, fonts.bold, C.dark);
      const boxW = pair.length === 1 ? 780 : 420, gap = 20;
      const x0 = (W - (boxW * pair.length + gap * (pair.length - 1))) / 2;
      for (const [k, item] of pair.entries()) {
        const img = await embedImage(doc, opts.photoData[item.id]);
        if (!img) continue;
        const x = x0 + k * (boxW + gap);
        const capLines = item.caption ? wrapRuns([{ text: item.caption }], boxW, fonts, 9.5).slice(0, 3) : [];
        const boxH = 345 - capLines.length * 12;
        const d = drawContain(p, img, x, 110, boxW, boxH);
        capLines.forEach((ln, j) => {
          const lw = ln.reduce((a, w) => a + fonts.reg.widthOfTextAtSize(w.text, 9.5), 0);
          drawRunsLine(p, ln, x + (boxW - lw) / 2, d.dy + d.dh + 8 + j * 12, fonts, 9.5, C.gray);
        });
      }
    }
  }

  // ---------- Pie y "Page X of Y" en todas las páginas ----------
  pages.forEach((p, i) => {
    if (footer) text(p, fitText(footer, fonts.reg, 8, 640), W / 2, H - 22, 8, fonts.reg, C.gray, { align: 'center' });
    text(p, `Page ${i + 1} of ${pages.length}`, W - 35, H - 22, 8, fonts.reg, C.gray, { align: 'right' });
  });
  return doc.save();
}
