export type ScopeLevel = {params: string[]};
export type Scope = ScopeLevel[]; // index 0 = innermost (most recently bound)

// A `lam{n}` node is exactly equivalent to n nested single binders, and the nearest
// enclosing binder is $0 — so within one level the *last* parameter is $0 and the first
// is $(n-1). Reversing here, at the single point where a level is created, keeps `lookup`
// a plain count-outward walk that never needs to know the level's size. `define` pushes
// one name, so reversing leaves it untouched by construction.
//
// Two orderings, both meaning "nearest binder first": the new level goes at the FRONT
// (levels nearest-first, per Scope's contract above) and its params are REVERSED (params
// nearest-first within the level). Flattened, the stack is then exactly "every enclosing
// binder, nearest first" — which is what a de Bruijn index counts. Appending instead would
// make `lookup`'s front-to-back offset walk count inward from the outermost binder, so
// `x => x` would encode as (lam1 $0) standalone but (lam1 $1) nested one deep — absolute
// rather than relative indices, which defeats cross-corpus anti-unification.
export function pushParams(params: string[], scope: Scope): Scope {
  return [{params: [...params].reverse()}, ...scope];
}

export function lookup(name: string, scope: Scope): string {
  let offset = 0;
  for (const level of scope) {
    const idx = level.params.indexOf(name);
    if (idx !== -1) return `$${offset + idx}`;
    offset += level.params.length;
  }
  return name;
}
