export type ScopeLevel = { params: string[] };
export type Scope = ScopeLevel[]; // index 0 = innermost (most recently bound)

export function lookup(name: string, scope: Scope): string {
  let offset = 0;
  for (const level of scope) {
    const idx = level.params.indexOf(name);
    if (idx !== -1) return `$${offset + idx}`;
    offset += level.params.length;
  }
  return name;
}