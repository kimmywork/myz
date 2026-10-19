/**
 * @myz/core — environment-agnostic domain layer.
 *
 * Domain model registries (identity / source kind / locator / payload codec /
 * lifecycle / relations) plus pure read models. No chrome, no DOM, no I/O; the
 * host supplies storage and transport through ports. See
 * `docs/plan/core-refactor.md`.
 */
export * from "./identity";
export * from "./source-kind";
export * from "./source";
export * from "./locator";
export * from "./payload-codec";
export * from "./lifecycle";
export * from "./relations";
export * from "./inbox";
export * from "./ports";
export * from "./staged-asset";
export * from "./import";
export * from "./import-merge";
export * from "./markdown-export";
export * from "./record-codecs";
export * from "./changes";
export * from "./services/records";
export * from "./services/inbox";
