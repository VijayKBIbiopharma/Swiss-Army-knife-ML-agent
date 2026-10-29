/* Reading .xlsx, offline, with nothing installed.

   An .xlsx file is a ZIP of XML. Both halves of that are already in the browser: the ZIP
   entries are raw DEFLATE, which `DecompressionStream('deflate-raw')` inflates natively,
   and the XML is regular enough - it is machine-written, never hand-edited - to scan with
   expressions rather than a parser. So this adds no dependency, makes no network call, and
   runs from file:// with the WiFi off, which is the whole point of the product.

   XML is scanned rather than handed to DOMParser deliberately: DOMParser exists in a
   browser and not in Node, and a reader that cannot be exercised by the test suite is a
   reader nobody can trust. The same code runs in both.

   Three things here are easy to get quietly wrong, so each is handled explicitly and
   tested:

   - A row may skip cells. `<c r="A1">` then `<c r="D1">` means B and C are empty, and a
     reader that just pushes values in order silently shifts every column left of the gap.
     Cells are placed by their column letter, never by their position in the file.
   - A date is a number with a format. Excel stores 2025-03-14 as 45730, so a reader that
     ignores styles hands back 45730 where somebody expects a date. Cells whose style is a
     date format are converted; the rest stay numbers.
   - Excel's calendar contains a day that never existed: 1900-02-29, kept for compatibility
     with a forty-year-old bug. Serial numbers below 61 need a different epoch, so both
     branches are implemented rather than one and a shrug. */
(function (root) {
  'use strict';

  const dec = new TextDecoder('utf-8');
  const u16 = (b, i) => b[i] | (b[i + 1] << 8);
  const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

  async function inflateRaw(bytes) {
    const ds = new DecompressionStream('deflate-raw');
    const w = ds.writable.getWriter();
    w.write(bytes); w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  /* The ZIP central directory, walked from the end-of-central-directory record. Reading the
     central directory rather than scanning for local headers is what makes the entry list
     trustworthy: a local header's sizes can be zero with the real values in a trailing
     descriptor, and guessing there is how a reader ends up truncating a sheet. */
  async function unzip(buffer) {
    const b = new Uint8Array(buffer);
    let eocd = -1;
    const lowest = Math.max(0, b.length - 65557 - 22);
    for (let i = b.length - 22; i >= lowest; i--) {
      if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This does not look like an .xlsx file (no ZIP directory found).');
    const count = u16(b, eocd + 10);
    let p = u32(b, eocd + 16);
    if (p === 0xffffffff || count === 0xffff) {
      throw new Error('This workbook uses ZIP64, which this reader does not handle. Save it as .csv and load that instead.');
    }
    const files = new Map();
    for (let n = 0; n < count; n++) {
      if (u32(b, p) !== 0x02014b50) break;
      const method = u16(b, p + 10);
      const compSize = u32(b, p + 20);
      const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), cmtLen = u16(b, p + 32);
      const local = u32(b, p + 42);
      const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
      if (u32(b, local) === 0x04034b50) {
        const lNameLen = u16(b, local + 26), lExtraLen = u16(b, local + 28);
        const start = local + 30 + lNameLen + lExtraLen;
        const raw = b.subarray(start, start + compSize);
        if (method === 0) files.set(name, raw);
        else if (method === 8) files.set(name, await inflateRaw(raw));
        else throw new Error('Unsupported compression in the workbook (method ' + method + ').');
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
    return files;
  }

  // ---- the small amount of XML this needs ----
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unesc = s => String(s).replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, g) => {
    if (g[0] !== '#') return ENT[g] === undefined ? m : ENT[g];
    const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
    return isFinite(n) ? String.fromCodePoint(n) : m;
  });
  const text = x => dec.decode(x || new Uint8Array(0));
  const attr = (tag, name) => {
    const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"'));
    return m ? unesc(m[1]) : null;
  };

  /* sharedStrings.xml. A string may be split into runs - Excel does that whenever part of a
     cell is styled differently - so the runs are joined. Taking only the first <t> loses
     the rest of the words, which looks like a typo in the data rather than a bug here. */
  function sharedStrings(xml) {
    const out = [];
    const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
    let m;
    while ((m = re.exec(xml))) {
      if (m[1] === undefined) { out.push(''); continue; }
      let s = '';
      const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
      let t;
      while ((t = tre.exec(m[1]))) s += unesc(t[1]);
      out.push(s);
    }
    return out;
  }

  // Which cell styles are dates: the built-in date formats, plus any custom code with a
  // day, month or year in it that is not just a time.
  const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
  function dateStyles(stylesXml) {
    const custom = new Set();
    const nf = /<numFmt\b[^>]*\/>|<numFmt\b[^>]*>/g;
    let m;
    while ((m = nf.exec(stylesXml))) {
      const id = Number(attr(m[0], 'numFmtId'));
      const code = attr(m[0], 'formatCode') || '';
      // Strip quoted literals and colour codes before looking for date letters.
      const bare = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
      if (isFinite(id) && /[dy]/i.test(bare)) custom.add(id);
      else if (isFinite(id) && /m/i.test(bare) && !/[hs]/i.test(bare)) custom.add(id);
    }
    const isDateFmt = id => BUILTIN_DATE.has(id) || custom.has(id);
    const xfs = [];
    const block = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (block) {
      const xre = /<xf\b[^>]*\/?>/g;
      let x;
      while ((x = xre.exec(block[1]))) xfs.push(isDateFmt(Number(attr(x[0], 'numFmtId'))));
    }
    return xfs;
  }

  /* Excel's serial dates. Serial 60 is 1900-02-29, a day that never existed - Excel keeps it
     to stay bug-compatible with Lotus 1-2-3 - so anything at or below 60 sits on a
     different epoch from everything above it. Both branches, because a reader that handles
     only the common one is wrong for exactly the dates nobody checks. */
  function serialToDate(serial) {
    const whole = Math.floor(serial);
    const epoch = whole > 60 ? Date.UTC(1899, 11, 30) : Date.UTC(1899, 11, 31);
    const ms = epoch + whole * 86400000;
    const frac = serial - whole;
    const d = new Date(ms + Math.round(frac * 86400000));
    const iso = d.toISOString();
    return frac > 1e-9 ? iso.slice(0, 19).replace('T', ' ') : iso.slice(0, 10);
  }

  /* Excel writes a double's long decimal expansion, not what was typed: a cell holding 99.1
     arrives as <v>99.09999999999999</v>, and printing that back into a run sheet looks like
     a defect in the data. Number() of it is the identical double, and String() of a double
     gives the shortest form that round-trips to the same bits, so this changes how the
     value reads and not what it is. Applied only when it is both shorter and provably the
     same double, so an unusual literal is left exactly as the workbook had it. */
  function shortestNumber(raw) {
    if (raw === '' || !isFinite(Number(raw))) return raw;
    const short = String(Number(raw));
    return (short.length < raw.length && Number(short) === Number(raw)) ? short : raw;
  }

  const colOf = ref => {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
      else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
      else break;
    }
    return n - 1;
  };

  /* One worksheet into a grid. Cells are placed by their column letter, so a row that skips
     B and C keeps D in D rather than sliding it left. */
  function sheetGrid(xml, strings, xfs) {
    const grid = [];
    const rre = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
    let r;
    while ((r = rre.exec(xml))) {
      const inner = r[1];
      const row = [];
      if (inner) {
        const cre = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
        let c;
        while ((c = cre.exec(inner))) {
          const tag = '<c' + c[1] + '>', body = c[2] || '';
          const ref = attr(tag, 'r') || '';
          const idx = ref ? colOf(ref) : row.length;
          const t = attr(tag, 't');
          let val = '';
          if (t === 'inlineStr') {
            let s = '';
            const tre = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
            let m2;
            while ((m2 = tre.exec(body))) s += unesc(m2[1]);
            val = s;
          } else {
            const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
            const raw = v ? unesc(v[1]) : '';
            if (t === 's') val = strings[Number(raw)] === undefined ? '' : strings[Number(raw)];
            else if (t === 'e') val = '';                       // an error cell is not data
            else if (t === 'b') val = raw === '1' ? 'TRUE' : 'FALSE';
            else if (t === 'str') val = raw;
            else {
              const sIdx = Number(attr(tag, 's'));
              val = (isFinite(sIdx) && xfs[sIdx] && raw !== '' && isFinite(Number(raw)))
                ? serialToDate(Number(raw)) : shortestNumber(raw);
            }
          }
          while (row.length < idx) row.push('');
          row[idx] = val;
        }
      }
      grid.push(row);
    }
    return grid;
  }

  // Header row and body, named the way parseCSV names them so the rest of the tool cannot
  // tell the difference between a workbook and a pasted CSV.
  function toTable(grid) {
    const clean = grid.filter(r => r.some(c => String(c).trim() !== ''));
    if (!clean.length) return { columns: [], rows: [] };
    const width = clean.reduce((w, r) => Math.max(w, r.length), 0);
    const seen = {};
    const columns = [];
    for (let i = 0; i < width; i++) {
      let name = String(clean[0][i] === undefined ? '' : clean[0][i]).trim() || 'Column ' + (i + 1);
      if (seen[name]) name = name + ' (' + (++seen[name]) + ')'; else seen[name] = 1;
      columns.push(name);
    }
    const rows = clean.slice(1).map(r => {
      const out = [];
      for (let i = 0; i < width; i++) out.push(String(r[i] === undefined ? '' : r[i]).trim());
      return out;
    });
    return { columns, rows: rows.filter(r => r.some(c => c !== '')) };
  }

  /* Every sheet in the workbook, in the order the workbook lists them, with its name - so a
     file holding historical runs on one tab and the factor catalogue on another can be
     loaded once and the right tab chosen, which is how these files actually arrive. */
  async function read(buffer) {
    const files = await unzip(buffer);
    const get = n => files.get(n);
    const wbXml = text(get('xl/workbook.xml'));
    if (!wbXml) throw new Error('No workbook found inside the file. Is it really an .xlsx?');
    const relsXml = text(get('xl/_rels/workbook.xml.rels'));
    const rels = {};
    const rre = /<Relationship\b[^>]*\/?>/g;
    let m;
    while ((m = rre.exec(relsXml))) {
      const id = attr(m[0], 'Id'), target = attr(m[0], 'Target');
      if (id && target) rels[id] = target.replace(/^\/?xl\//, '').replace(/^\//, '');
    }
    const strings = sharedStrings(text(get('xl/sharedStrings.xml')));
    const xfs = dateStyles(text(get('xl/styles.xml')));
    const sheets = [];
    const sre = /<sheet\b[^>]*\/?>/g;
    let s;
    while ((s = sre.exec(wbXml))) {
      const name = attr(s[0], 'name') || ('Sheet ' + (sheets.length + 1));
      const rid = attr(s[0], 'r:id') || attr(s[0], 'id');
      let part = rid && rels[rid] ? 'xl/' + rels[rid] : null;
      if (!part || !get(part)) {
        const guess = 'xl/worksheets/sheet' + (sheets.length + 1) + '.xml';
        part = get(guess) ? guess : null;
      }
      if (!part) continue;
      const table = toTable(sheetGrid(text(get(part)), strings, xfs));
      sheets.push({ name, columns: table.columns, rows: table.rows });
    }
    if (!sheets.length) throw new Error('That workbook has no readable sheets.');
    return { sheets };
  }

  // The first sheet that actually holds a table, which is what a one-sheet file wants.
  async function readFirst(buffer) {
    const { sheets } = await read(buffer);
    return sheets.find(s => s.columns.length && s.rows.length) || sheets[0];
  }

  /* sheetGrid and toTable are exported for the tests. The cases that matter here - a row
   that skips cells, a date-formatted number, a shared string split into runs - are awkward
   to provoke through a whole workbook and trivial to assert on directly. */
  root.MLXlsx = { read, readFirst, unzip, serialToDate, sharedStrings, dateStyles, colOf, shortestNumber, sheetGrid, toTable };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MLXlsx;
})(typeof globalThis !== 'undefined' ? globalThis : this);
