// This cache holds only the pure normalization of exact DDL text. Every schema
// audit still reads current DDL, checks its fingerprint, ledger and integrity.
const normalizedDdl = new Map<string, string>();

/** Preserve quoted bytes, strip comments, normalize only SQL's lexical surface. */
export function normalizeSchemaSql(sql: string): string {
  const cached = normalizedDdl.get(sql);
  if (cached !== undefined) return cached;
  const output: string[] = [], unquoted: string[] = [];
  const flush = () => {
    output.push(unquoted.join('').toLowerCase()
      .replace(/\bif\s+not\s+exists\b/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([(),=<>])\s*/g, '$1'));
    unquoted.length = 0;
  };
  // Jump between lexical boundaries instead of allocating a string per byte.
  const boundary = /['"`[\-/]/g;
  let cursor = 0;
  for (let match = boundary.exec(sql); match; match = boundary.exec(sql)) {
    const start = match.index, character = match[0];
    if (character === '-' || character === '/') {
      const next = sql[start + 1];
      if (character === '-' && next === '-') {
        unquoted.push(sql.slice(cursor, start));
        const end = sql.indexOf('\n', start + 2);
        if (end !== -1) unquoted.push('\n');
        cursor = end === -1 ? sql.length : end + 1;
      } else if (character === '/' && next === '*') {
        unquoted.push(sql.slice(cursor, start), ' ');
        const end = sql.indexOf('*/', start + 2);
        cursor = end === -1 ? sql.length : end + 2;
      } else continue;
    } else {
      unquoted.push(sql.slice(cursor, start));
      flush();
      const closing = character === '[' ? ']' : character;
      let end = sql.indexOf(closing, start + 1);
      while (end !== -1 && sql[end + 1] === closing) end = sql.indexOf(closing, end + 2);
      cursor = end === -1 ? sql.length : end + 1;
      output.push(sql.slice(start, cursor));
    }
    boundary.lastIndex = cursor;
  }
  unquoted.push(sql.slice(cursor));
  flush();
  const result = output.join('').trim();
  if (sql.length <= 16_384) {
    if (normalizedDdl.size >= 128) normalizedDdl.delete(normalizedDdl.keys().next().value!);
    normalizedDdl.set(sql, result);
  }
  return result;
}
