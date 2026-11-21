// A fast CSV reader with csv-reader 1.0.0's exact broken-row semantics: run(input)
// returns {columns, rows, errors} for {text, header}, identical to the reference
// for every input. The reference walks the text one character at a time; this
// reader jumps between delimiters with indexOf and slices fields out whole.
//
// The policy (the kit's RULES.txt): a U+FEFF at the very start is dropped; a
// record ends at LF or CRLF and a line left with no characters is no record;
// outside quotes a CR not followed by LF is dropped (stray_cr); a field that
// opens with a quote runs to the next quote that is not doubled ("" inside it
// one quote, each CRLF or lone CR inside it read as LF), what follows its
// closing quote up to the next comma or line break is appended as it stands
// (quote_junk, when the field ends), and a quote that never closes is a literal
// character with the text after it read again as unquoted (unterminated_quote);
// a quote inside an unquoted field is literal; fields stay strings, never
// trimmed. columns is the first record when header is true, else null; rows are
// padded (short_row, with fields: its field count) or cut (long_row, with extra:
// the cut fields) to the first record's width. Each error is {code, line, row}
// in the order met: line the 1-based line its record starts on (every LF, CRLF
// and lone CR inside quotes counted), row its record's index in rows (null for
// the header).
//
// How it stays fast:
//   - A record with no quote before its line end and no stray CR is sliced out
//     whole and split(',') in one native call.
//   - Otherwise each field is found with indexOf jumps: an unquoted field ends
//     at the nearer of the next comma or LF (a CR before either is a stray CR,
//     found by scanning the sliced field, which is the value anyway); a quoted
//     field ends at the next quote that is not doubled. Newlines inside quotes
//     are counted with indexOf, and CRs inside quotes are converted only on
//     the rare fields that hold them.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/**
 * Resolve the doubled quotes of a quoted field. `start` is just past the
 * opening quote and `firstClose` the first quote at or after it, which is
 * followed by another quote. Returns [content, closingQuoteIndex], the content
 * with each "" resolved to one quote, or null when no closing quote exists.
 */
function resolveDoubled(text, start, firstClose) {
  let raw = '';
  let close = firstClose;
  let s = start;
  for (;;) {
    raw += text.slice(s, close);
    if (text.charCodeAt(close + 1) !== 34) return [raw, close];
    raw += '"';
    s = close + 2;
    close = text.indexOf('"', s);
    if (close === -1) return null;
  }
}

/**
 * Convert a quoted field's content: each CRLF or lone CR becomes one LF.
 * Returns [converted, lineBreaks], lineBreaks counting every LF, CRLF and
 * lone CR in the content.
 */
function convertCRs(raw) {
  let out = '';
  let breaks = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 13) {
      out += raw.slice(start, i) + '\n';
      breaks++;
      if (raw.charCodeAt(i + 1) === 10) i++;
      start = i + 1;
    } else if (c === 10) {
      breaks++;
    }
  }
  out += raw.slice(start);
  return [out, breaks];
}

/** csv-reader 1.0.0's answer for one case's input, read faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of the record carries these.
  let recordLine = 1;
  let recordRow = null;

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    let fields;
    // Fast path: this record holds no quote before its line end. Slice it out
    // whole (dropping a CRLF ending) and split it in one native call, unless
    // it holds a stray CR, which the slower path below reports.
    const nl = text.indexOf('\n', pos);
    const end = nl === -1 ? len : nl;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= end) {
      let recEnd = end;
      if (nl !== -1 && end > pos && text.charCodeAt(end - 1) === 13) recEnd = end - 1;
      const recText = text.slice(pos, recEnd);
      if (recText.indexOf('\r') === -1) {
        fields = recText.split(',');
        if (nl !== -1) {
          pos = nl + 1;
          line++;
        } else {
          pos = len;
        }
      }
    }

    if (fields === undefined) {
      // Slow path: read the record field by field.
      fields = [];
      let lastQuoted = false;
      let fieldEnded = COMMA;
      do {
        let value = '';
        let doUnquoted = false;
        let isJunk = false;
        if (text.charCodeAt(pos) === 34) {
          lastQuoted = true;
          const open = pos;
          const openLine = line;
          const close = text.indexOf('"', pos + 1);
          let raw = null;
          let closePos = -1;
          if (close !== -1) {
            if (text.charCodeAt(close + 1) === 34) {
              const d = resolveDoubled(text, pos + 1, close);
              if (d !== null) {
                raw = d[0];
                closePos = d[1];
              }
            } else {
              raw = text.slice(pos + 1, close);
              closePos = close;
            }
          }
          if (raw === null) {
            // The quote never closes: it is a literal character, and the text
            // after it is read again as unquoted, lines counted from the open.
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            pos = open + 1;
            line = openLine;
            value = '"';
            doUnquoted = true;
          } else {
            // Newlines inside quotes count lines; each CRLF or lone CR in
            // there is read as one LF.
            if (raw.indexOf('\r') !== -1) {
              const cv = convertCRs(raw);
              value = cv[0];
              line += cv[1];
            } else {
              let n = 0;
              let i = raw.indexOf('\n');
              while (i !== -1) {
                n++;
                i = raw.indexOf('\n', i + 1);
              }
              line += n;
              value = raw;
            }
            pos = closePos + 1;
            if (pos >= len) {
              fieldEnded = END;
            } else {
              const c = text.charCodeAt(pos);
              if (c === 44) {
                pos++;
                fieldEnded = COMMA;
              } else if (c === 10) {
                pos++;
                line++;
                fieldEnded = LINE_BREAK;
              } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
                pos += 2;
                line++;
                fieldEnded = LINE_BREAK;
              } else {
                // What follows the closing quote is appended as it stands.
                doUnquoted = true;
                isJunk = true;
              }
            }
          }
        } else {
          lastQuoted = false;
          doUnquoted = true;
        }

        if (doUnquoted) {
          // Read unquoted characters up to the next comma or line break; a CR
          // not followed by LF is dropped (stray_cr).
          const comma = text.indexOf(',', pos);
          const nl2 = text.indexOf('\n', pos);
          let fend;
          let fended;
          if (comma !== -1 && (nl2 === -1 || comma < nl2)) {
            fend = comma;
            fended = COMMA;
          } else if (nl2 !== -1) {
            fend = nl2;
            fended = LINE_BREAK;
          } else {
            fend = len;
            fended = END;
          }
          if (fended === LINE_BREAK && fend > pos && text.charCodeAt(fend - 1) === 13) fend--;
          let seg = text.slice(pos, fend);
          if (seg.indexOf('\r') !== -1) {
            const clean = seg.replace(/\r/g, '');
            const n = seg.length - clean.length;
            seg = clean;
            for (let i = 0; i < n; i++) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
          }
          const added = seg.length;
          value += seg;
          if (fended === COMMA) {
            pos = fend + 1;
          } else if (fended === LINE_BREAK) {
            pos = nl2 + 1;
            line++;
          } else {
            pos = len;
          }
          fieldEnded = fended;
          if (isJunk && added > 0) {
            errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
          }
        }

        fields.push(value);
      } while (fieldEnded === COMMA);

      // A line that held only stray CRs is left with no characters: no record
      // (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
