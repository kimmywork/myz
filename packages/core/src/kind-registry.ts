/**
 * Tiny registry shared by the source-kind and locator-kind models. Both are
 * "kind string → definition" maps with the same register/get/list surface.
 */
export interface KindRegistry<Def extends { kind: string }> {
  register(def: Def): void;
  get(kind: string): Def | undefined;
  list(): Def[];
}

/** Creates a kind registry, optionally seeded with definitions. */
export function createKindRegistry<Def extends { kind: string }>(
  initial: readonly Def[] = [],
): KindRegistry<Def> {
  const byKind = new Map<string, Def>(initial.map((def) => [def.kind, def]));
  return {
    register(def) {
      byKind.set(def.kind, def);
    },
    get(kind) {
      return byKind.get(kind);
    },
    list() {
      return [...byKind.values()];
    },
  };
}
