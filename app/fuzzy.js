// Close spellings for a food that was not found: typing mistakes (a letter missing, extra, wrong, or two swapped) against every word of
// each food's names, without accents or case.
export const plain = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();

function distance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; b.length >= j; j++) rows[0][j] = j;
  for (let i = 1; a.length >= i; i++) {
    for (let j = 1; b.length >= j; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
    }
  }
  return rows[a.length][b.length];
}

const allowed = (length) => (3 >= length ? 1 : 6 >= length ? 2 : 3);

// entries: [{ value, names: [...] }]; gives back up to `limit` values, the closest first.
export function closest(query, entries, limit = 3) {
  const wanted = plain(query);
  if (3 > wanted.length) return [];
  return entries
    .map((entry) => {
      const names = entry.names.map(plain).filter(Boolean);
      const candidates = [...names, ...names.flatMap((name) => name.split(/\s+/))];
      return { value: entry.value, score: Math.min(...candidates.map((candidate) => distance(wanted, candidate))) };
    })
    .filter((entry) => allowed(wanted.length) >= entry.score)
    .sort((left, right) => left.score - right.score || String(left.value).localeCompare(String(right.value)))
    .filter((entry, index, list) => list.findIndex((other) => other.value === entry.value) === index)
    .slice(0, limit)
    .map((entry) => entry.value);
}
