import { defineComponent } from "vue";

function normalizeSize(value) {
  if (value === null || value === undefined) {
    return "20";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  const text = String(value).trim();
  if (!text) {
    return "20";
  }
  return text;
}

function makeIcon(
  name,
  renderPaths,
  { strokeWidth = 1.5, filled = false } = {},
) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      size: {
        type: [Number, String],
        default: 20,
      },
    },
    setup(props, { attrs }) {
      return () => {
        const size = normalizeSize(props.size);
        const hasLabel =
          typeof attrs["aria-label"] === "string" && attrs["aria-label"].trim();
        const baseAttrs = filled
          ? {
              xmlns: "http://www.w3.org/2000/svg",
              width: size,
              height: size,
              viewBox: "0 0 24 24",
              role: "img",
              focusable: "false",
              fill: "currentColor",
            }
          : {
              xmlns: "http://www.w3.org/2000/svg",
              width: size,
              height: size,
              viewBox: "0 0 24 24",
              role: "img",
              focusable: "false",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": strokeWidth,
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
            };

        return (
          <svg {...baseAttrs} {...attrs} aria-hidden={hasLabel ? null : "true"}>
            {renderPaths()}
          </svg>
        );
      };
    },
  });
}

export const IconPencil = makeIcon(
  "IconPencil",
  () => (
    <g>
      <path
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"
        fill="currentColor"
        stroke="none"
      />
      <path
        d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
        fill="currentColor"
        stroke="none"
      />
    </g>
  ),
  { filled: true },
);

export const IconNotebook = makeIcon("IconNotebook", () => (
  <g>
    <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M14 3v5h5" />
    <path d="M9 12h6" />
    <path d="M9 16h4" />
  </g>
));

export const IconCamera = makeIcon("IconCamera", () => (
  <g>
    <rect x="3" y="7" width="18" height="12" rx="2" ry="2" />
    <circle cx="12" cy="13" r="3.5" />
    <path d="M10.2 7l1.2-2h3.2L15.8 7" />
  </g>
));

export const IconSlider = makeIcon("IconSlider", () => (
  <g>
    <path d="M5 7.5h14" />
    <path d="M5 12h14" />
    <path d="M5 16.5h14" />
    <circle cx="15.5" cy="7.5" r="1.75" />
    <circle cx="9" cy="12" r="1.75" />
    <circle cx="17" cy="16.5" r="1.75" />
  </g>
));

export const IconCalendar = makeIcon("IconCalendar", () => (
  <g>
    <rect x="4" y="5" width="16" height="15" rx="2" ry="2" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <path d="M4 10h16" />
  </g>
));

export const IconWarning = makeIcon("IconWarning", () => (
  <g>
    <path d="M12 4l8 14H4l8-14z" fill="none" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.5" r="0.9" fill="currentColor" stroke="none" />
  </g>
));

export const IconSun = makeIcon("IconSun", () => (
  <g>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="M4.93 4.93l1.41 1.41" />
    <path d="M17.66 17.66l1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="M4.93 19.07l1.41-1.41" />
    <path d="M17.66 6.34l1.41-1.41" />
  </g>
));

export const IconMoon = makeIcon("IconMoon", () => (
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
));

export const IconHighlightPaint = makeIcon("IconHighlightPaint", () => (
  <g>
    <path d="M6 7h12" />
    <path d="M6 11h12" />
    <rect
      x="6"
      y="15"
      width="12"
      height="3"
      rx="1.5"
      fill="currentColor"
      stroke="none"
    />
  </g>
));

export const IconHighlightUnderline = makeIcon(
  "IconHighlightUnderline",
  () => (
    <g>
      <path d="M6 4v6a6 6 0 0 0 12 0V4" />
      <path d="M4 20h16" />
    </g>
  ),
  { strokeWidth: 1.8 },
);

export const IconHighlightWavy = makeIcon("IconHighlightWavy", () => (
  <g>
    <path d="M6 7h12" />
    <path d="M6 11h12" />
    <path d="M6 16.5c1.2-1.6 2.4-1.6 3.6 0 1.2 1.6 2.4 1.6 3.6 0 1.2-1.6 2.4-1.6 3.6 0" />
  </g>
));

export const highlightStyleIconMap = {
  paint: IconHighlightPaint,
  underline: IconHighlightUnderline,
  wavy: IconHighlightWavy,
};
