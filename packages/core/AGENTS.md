# @myz/core (Domain Layer)

Environment-agnostic domain layer for the MyZ suite. **No `chrome`, no DOM, no
I/O** — hosts (extension / desktop / mobile) supply persistence and transport
through ports. Depends on `@myz/shared` and `zod`.

## Layout

- `identity.ts` — record id prefix ↔ kind mapping (`h:<id>`). A new record kind
  adds a prefix here and nowhere else.
- `source-kind.ts` — source kind registry (identity scheme, capability bits,
  synthetic url prefix). Built-ins: web / pdf / epub.
- `locator.ts` — locator kind registry + `normalizeLocator` read-time
  normalization of the legacy flat `range` / `pdfLocator` / `epubLocator`
  fields (records are not rewritten — that would change their sync hash).
- `payload-codec.ts` — `schemaId` → schema/migrate registry used on the sync
  `apply` side; keeps `@myz/sync-core` data-agnostic (`data: unknown`).
- `lifecycle.ts` — lifecycle status model + pure `transitionLifecycle`
  (record-scoped; see plan §10/2). Storage/badge side effects stay in the host.
- `relations.ts` — directed edges reusing the inbox `rel:` record-id scheme +
  `backlinksOf`.
- `inbox.ts` — `buildInboxQueue` read model (pending/snoozed/marked + review
  counters). The host reads storage and hands records + state rows in.
- `ports.ts` — storage port interfaces (`RecordsStore` incl. opaque overflow,
  `InboxStateStore`, `SettingsStore<T>`). The extension implements them over
  IndexedDB in `myz-annotator/src/background/stores.ts`.
- `services/records.ts` — record domain service (`createRecord` / `updateRecord`
  / `updateRecordRange` / bulk remove & patch / projections) over `RecordsStore`.
  Host capabilities (id generation, clock, HTML→Markdown) are injected via
  `RecordServiceContext`, so the service stays pure (plan §5 D3.3).

## Rules

- Keep it free of host APIs; import only `@myz/shared/*` (and `zod`).
- Prefer pure functions and small registries over classes/state.
- Register model kinds/prefixes here so sync keys stay frozen domain vocabulary.
- See `docs/plan/core-refactor.md` for the target architecture and increments.
