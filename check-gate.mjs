// A local, non-official check of the seven gate rows published in RULES.txt ("The gate"). The kit
// ships no program/v1 scorer, so nothing here is the house's grade: it is the entry's own reading of
// the published contract, run against the /output this repository writes.
//
//   node check-gate.mjs out
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { buildDossier } from './vendor/makefun-board.ts';

const out = process.argv[2] ?? 'out';
const snapshot = JSON.parse(readFileSync(process.env.SNAPSHOT ?? '/input/snapshot.json', 'utf8'));
const slugs = new Set(snapshot.protocols.map((p) => p.slug));
const rowsOut = [];
const fail = (row, detail) => rowsOut.push({ row, ok: false, detail });
const pass = (row, detail) => rowsOut.push({ row, ok: true, detail });

const NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const IMG = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const NET = /https?:\/\//i;

// dashboard_files
const dash = join(out, 'dashboard');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (name.startsWith('.')) fail('dashboard_files', `dot directory ${p}`); else walk(p); }
    else files.push({ name, path: p, size: st.size, rel: p.slice(dash.length + 1) });
  }
})(dash);
let dashBytes = 0;
let dashIssue = null;
for (const f of files) {
  dashBytes += f.size;
  if (!NAME.test(f.rel.split('/').pop())) dashIssue = `bad file name ${f.rel}`;
  if (!f.rel.includes('/') && (f.rel.startsWith('.') || f.rel.startsWith('-'))) dashIssue = `bad file name ${f.rel}`;
}
const hasHtml = files.some((f) => f.rel === 'index.html');
const hasCss = files.some((f) => extname(f.name) === '.css');
const hasJs = files.some((f) => extname(f.name) === '.js');
if (!hasHtml || !hasCss || !hasJs) dashIssue = `index.html ${hasHtml}, css ${hasCss}, js ${hasJs}`;
if (files.length > 400) dashIssue = `${files.length} files`;
if (dashBytes > 4_194_304) dashIssue = `${dashBytes} bytes`;
// no network address in an HTML attribute value, a <style> body, an inline script import, a CSS file,
// or a JS import / export-from / require / dynamic-import specifier
if (dashIssue === null) {
  for (const f of files) {
    const ext = extname(f.name);
    const text = readFileSync(f.path, 'utf8');
    if (ext === '.css') {
      const m = text.match(NET);
      if (m) { dashIssue = `${f.rel} names ${m[0]}`; break; }
    } else if (ext === '.html') {
      for (const m of text.matchAll(/<[^>]*?\s[a-zA-Z-:]+="([^"]*)"/g)) if (NET.test(m[1])) { dashIssue = `${f.rel} attribute ${m[1]}`; break; }
      for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) if (NET.test(m[1])) { dashIssue = `${f.rel} style body`; break; }
      for (const m of text.matchAll(/\bimport\s*\(?\s*["']([^"']+)["']/g)) if (NET.test(m[1])) { dashIssue = `${f.rel} import ${m[1]}`; break; }
    } else if (ext === '.js' || ext === '.mjs') {
      const specs = [
        ...text.matchAll(/\bimport\s*(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']/g),
        ...text.matchAll(/\bexport\s*(?:\*|\{[\s\S]*?\})\s*from\s*["']([^"']+)["']/g),
        ...text.matchAll(/\brequire\s*\(\s*["']([^"']+)["']/g),
        ...text.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g),
      ];
      const bad = specs.map((m) => m[1]).find((s) => NET.test(s));
      if (bad) { dashIssue = `${f.rel} import ${bad}`; break; }
    }
  }
}
dashIssue === null ? pass('dashboard_files', `${files.length} files, ${dashBytes} bytes, no network address`) : fail('dashboard_files', dashIssue);

// board_file, sorted_by_value, coverage, farm_steps
const rawBoard = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const boardBytes = statSync(join(out, 'board.json')).size;
const rows = Array.isArray(rawBoard) ? rawBoard : rawBoard.rows;
let boardIssue = null;
if (!Array.isArray(rows)) boardIssue = 'rows is not an array';
else if (rows.length < 100 || rows.length > 4000) boardIssue = `${rows.length} rows`;
else if (boardBytes > 8 * 1024 * 1024) boardIssue = `${boardBytes} bytes`;
else {
  const seen = new Set();
  for (const [i, r] of rows.entries()) {
    if (typeof r.slug !== 'string' || r.slug.length < 1 || r.slug.length > 128 || /\s/.test(r.slug)) { boardIssue = `row ${i} slug`; break; }
    if (!slugs.has(r.slug)) { boardIssue = `row ${i} slug ${r.slug} is not in the snapshot`; break; }
    if (seen.has(r.slug)) { boardIssue = `row ${i} repeats ${r.slug}`; break; }
    seen.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) { boardIssue = `row ${i} name`; break; }
    if (!Number.isInteger(r.rank) || r.rank <= 0) { boardIssue = `row ${i} rank`; break; }
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) { boardIssue = `row ${i} implied ${r.implied_value_usd}`; break; }
  }
}
boardIssue === null ? pass('board_file', `${rows.length} rows, ${boardBytes} bytes`) : fail('board_file', boardIssue);

let sortIssue = null;
if (boardIssue === null) {
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) { sortIssue = `rank ${i + 1} is ${ranks[i]}`; break; }
  if (sortIssue === null) {
    const byRank = rows.slice().sort((a, b) => a.rank - b.rank);
    for (let i = 1; i < byRank.length; i++) if (byRank[i].implied_value_usd > byRank[i - 1].implied_value_usd) { sortIssue = `rank ${i + 1} has a higher implied value than rank ${i}`; break; }
    if (sortIssue === null && new Set(rows.map((r) => r.implied_value_usd)).size === 1) sortIssue = 'every row shares one implied value';
  }
}
sortIssue === null ? pass('sorted_by_value', `ranks 1..${rows.length}, descending`) : fail('sorted_by_value', sortIssue);

let covIssue = null;
if (boardIssue === null) {
  const have = new Set(rows.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !have.has(s));
  if (missing.length > 0) covIssue = `${missing.length} watchlist slugs missing: ${missing.slice(0, 4).join(', ')}`;
}
covIssue === null ? pass('coverage', `${snapshot.watchlist.length} / ${snapshot.watchlist.length} watchlist slugs`) : fail('coverage', covIssue);

let farmIssue = null;
for (const r of rows) {
  const s = r.farm_steps;
  if (!Array.isArray(s) || s.length < 3 || s.length > 12) { farmIssue = `${r.slug} has ${Array.isArray(s) ? s.length : 'no'} steps`; break; }
  const bad = s.find((t) => typeof t !== 'string' || t.trim().length < 20 || t.trim().length > 600);
  if (bad !== undefined) { farmIssue = `${r.slug} step of ${String(bad).trim().length} chars`; break; }
}
farmIssue === null ? pass('farm_steps', `${rows.length} plans, 3 to 12 steps each`) : fail('farm_steps', farmIssue);

// screenshots
const shotDir = join(out, 'screenshots');
const shots = existsSync(shotDir) ? readdirSync(shotDir).filter((n) => !n.startsWith('.')) : [];
let shotIssue = null;
if (shots.length < 3 || shots.length > 4) shotIssue = `${shots.length} images`;
else {
  for (const n of shots) {
    const p = join(shotDir, n);
    const st = statSync(p);
    if (!st.isFile() || !IMG.test(n)) { shotIssue = `${n} name`; break; }
    if (st.size > 512 * 1024) { shotIssue = `${n} is ${st.size} bytes`; break; }
    const b = readFileSync(p);
    let w = 0, h = 0, whole = false;
    if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') {
      w = b.readUInt32BE(16); h = b.readUInt32BE(20);
      whole = b.includes(Buffer.from('IEND', 'latin1'));
    } else if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length - 9; i++) {
        if (b[i] !== 0xff) continue;
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { h = b.readUInt16BE(i + 5); w = b.readUInt16BE(i + 7); break; }
      }
      whole = b.readUInt16BE(b.length - 2) === 0xffd9;
    }
    const long = Math.max(w, h), short = Math.min(w, h);
    if (!whole) { shotIssue = `${n} is not a whole image`; break; }
    if (long > 1440 || short < 800) { shotIssue = `${n} is ${w}x${h}`; break; }
  }
}
shotIssue === null ? pass('screenshots', shots.join(', ')) : fail('screenshots', shotIssue);

// dossier_matches
const written = readFileSync(join(out, 'dossier.json'));
const rebuilt = Buffer.from(buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
const same = Buffer.compare(written, rebuilt) === 0;
const dossierBytes = written.length;
same && dossierBytes <= 1.5 * 1024 * 1024
  ? pass('dossier_matches', `byte for byte, ${dossierBytes} bytes`)
  : fail('dossier_matches', same ? `${dossierBytes} bytes` : 'rebuild differs from dossier.json');

let valid = true;
for (const r of rowsOut) {
  if (!r.ok) valid = false;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.row.padEnd(17)} ${r.detail}`);
}
const doc = JSON.parse(written);
const textBytes = Buffer.byteLength(doc.text ?? '', 'utf8');
console.log(`\nlocal check (non-official): ${valid ? 'valid' : 'refused'} — dossier text ${textBytes} bytes of 65536, dossier ${dossierBytes} bytes`);
process.exit(valid ? 0 : 1);
