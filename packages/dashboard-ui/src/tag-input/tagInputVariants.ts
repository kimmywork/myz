export type TagInputVariant = "dashboard" | "content" | "well"

const CHIP_CLASS =
  "inline-flex h-[22px] items-center gap-2 rounded-tag bg-tag-bg px-2 text-tag font-semibold text-tag-fg"

const WELL_CONTAINER =
  "relative flex w-full flex-wrap items-center gap-2 rounded-control border px-3 py-2 text-compact transition"
const DASH_CONTAINER = WELL_CONTAINER

const WELL_REMOVE =
  "tag-input__remove appearance-none rounded-tag border-0 bg-transparent p-0 leading-none text-well-muted hover:text-well-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-well-chrome"
const DASH_REMOVE =
  "tag-input__remove rounded-tag text-muted hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg dark:text-text dark:hover:text-error"

const WELL_INPUT =
  "min-w-20 flex-1 appearance-none border-0 bg-transparent p-0 text-compact text-well-text placeholder:text-well-muted focus:outline-none"
const DASH_INPUT =
  "min-w-20 flex-1 bg-transparent text-compact text-text placeholder:text-muted focus:outline-none dark:text-text dark:placeholder:text-muted"

const WELL_LIST =
  "absolute left-0 top-full z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-panel border border-well-control-border bg-well-chrome p-1 shadow-float"
const DASH_LIST =
  "absolute left-0 top-full z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-panel border border-control-border bg-surface p-1 shadow-float"

export function isContentVariant(variant: TagInputVariant): boolean {
  return variant === "content"
}

export function chipClassFor(variant: TagInputVariant): string {
  return isContentVariant(variant) ? "myz-tag-input__chip" : CHIP_CLASS
}

export function containerClassFor(
  variant: TagInputVariant,
  focused: boolean,
  disabled: boolean,
): string {
  if (isContentVariant(variant)) {
    return [
      "myz-tag-input",
      focused ? "is-focused" : "",
      disabled ? "is-disabled" : "",
    ]
      .filter(Boolean)
      .join(" ")
  }
  if (variant === "well") {
    return [
      WELL_CONTAINER,
      disabled ? "cursor-not-allowed opacity-45" : "cursor-text",
      focused
        ? "border-accent ring-[3px] ring-accent/20"
        : "border-well-border bg-well-control-bg",
    ].join(" ")
  }
  return [
    DASH_CONTAINER,
    disabled ? "cursor-not-allowed opacity-45" : "cursor-text",
    focused
      ? "border-accent bg-surface ring-[3px] ring-accent/20 dark:bg-surface-2"
      : "border-line bg-surface dark:border-line dark:bg-surface-2",
  ].join(" ")
}

export function removeClassFor(variant: TagInputVariant): string {
  if (isContentVariant(variant)) return "myz-tag-input__remove"
  return variant === "well" ? WELL_REMOVE : DASH_REMOVE
}

export function inputClassFor(variant: TagInputVariant): string {
  if (isContentVariant(variant)) return "myz-tag-input__input"
  return variant === "well" ? WELL_INPUT : DASH_INPUT
}

export function listClassFor(variant: TagInputVariant): string {
  if (isContentVariant(variant)) return "myz-tag-input__list"
  return variant === "well" ? WELL_LIST : DASH_LIST
}

export function optionClassFor(
  variant: TagInputVariant,
  active: boolean,
): string {
  if (isContentVariant(variant)) {
    return ["myz-tag-input__option", active ? "is-active" : ""]
      .filter(Boolean)
      .join(" ")
  }
  const base =
    variant === "well"
      ? "flex h-8 cursor-pointer items-center rounded-tag px-2.5 text-label text-well-text transition hover:bg-well-control-bg"
      : "flex h-8 cursor-pointer items-center rounded-tag px-2.5 text-label text-text transition hover:bg-surface-2"
  const activeClass =
    variant === "well"
      ? "bg-well-control-bg text-accent-text"
      : "bg-surface-2 text-accent-text"
  return [base, active ? activeClass : ""].join(" ")
}
