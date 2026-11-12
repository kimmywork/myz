/**
 * The one stylesheet every snapshot shares (§I8).
 *
 * Deliberately small and fixed: reusing the site's CSS would drag in fonts,
 * images and megabytes of rules the snapshot does not need, and a per-page copy
 * would make sizes unpredictable. This keeps the text readable and the byte
 * cost bounded, which is what the quota was sized against.
 */
export const SNAPSHOT_CSS = `
:root { color-scheme: light dark; }
body {
  margin: 0;
  padding: 24px;
  font-family: ui-serif, Georgia, "Songti SC", serif;
  font-size: 16px;
  line-height: 1.7;
  color: #1a1a1a;
  background: #fff;
  word-wrap: break-word;
}
h1, h2, h3, h4, h5, h6 {
  font-family: ui-sans-serif, system-ui, "PingFang SC", sans-serif;
  line-height: 1.3;
  margin: 1.4em 0 0.6em;
}
h1 { font-size: 1.7em; }
h2 { font-size: 1.4em; }
h3 { font-size: 1.2em; }
p { margin: 0 0 1em; }
a { color: #0b5fff; }
blockquote {
  margin: 1em 0;
  padding: 0.2em 0 0.2em 1em;
  border-left: 3px solid #d0d0d0;
  color: #444;
}
pre, code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.9em;
  background: #f5f5f5;
}
pre { padding: 12px; overflow-x: auto; }
img, video, audio, iframe, svg, canvas { display: none; }
ul, ol { padding-left: 1.6em; margin: 0 0 1em; }
li { margin: 0.25em 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
figure { margin: 1em 0; }
hr { border: 0; border-top: 1px solid #ddd; margin: 2em 0; }
`.trim();
