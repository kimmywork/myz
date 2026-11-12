# Snapshot size measurement

The I8 snapshot quota (80 MB) is a **budget derived from a measured sample**, not
a measured ceiling. This folder holds the script that produced the sample so the
number can be re-derived instead of taken on trust.

## What it measures

It runs the planned capture algorithm on a page:

1. pick the largest text block (`article` / `main` / `section` / `div`);
2. strip `script`, `style`, `link`, `img`, `video`, `audio`, `iframe`, `svg`,
   `canvas`, form controls, and the page chrome (`nav`, `aside`, `footer`,
   `header`);
3. drop `class` / `id` / `data-*` / `aria-*`;
4. keep the resulting structure as HTML plus one fixed stylesheet.

What remains is the byte size a snapshot of that page would occupy.

## How to run it

The script loads pages from local files (`file://`), because the headless
browser in the sandbox has no network. Fetch the pages with `curl` first — that
is also what makes the sample reproducible:

```bash
cd /tmp
curl -sSL -A "Mozilla/5.0" -o wiki.html "https://en.wikipedia.org/wiki/Web_browser"
curl -sSL -A "Mozilla/5.0" -o s-wiki-color.html "https://en.wikipedia.org/wiki/Color"
curl -sSL -A "Mozilla/5.0" -o s-ruanyifeng-287.html \
  "https://www.ruanyifeng.com/blog/2024/01/weekly-issue-287.html"
curl -sSL -A "Mozilla/5.0" -o s-ruanyifeng-283.html \
  "https://www.ruanyifeng.com/blog/2023/12/weekly-issue-283.html"

cd <repo>
node scripts/measure/snapshot-size.mjs
```

The sample list lives in the script itself (`SAMPLES`, one `[label, path]` per
line); the fixture pages are resolved relative to the script, so only the four
`/tmp` downloads need to exist. Add more entries there for other pages.

JS-rendered sites (机核, 少数派) can be downloaded the same way but measure near
zero in this script: their body only exists after JavaScript runs, and here the
file is loaded without it. They are kept in the list as evidence of that
limitation rather than as size samples.

## The sample and what it does not cover

| Sample | Snapshot |
| --- | --- |
| Wikipedia "Web browser" | 160 KB |
| Wikipedia "Color" | 211 KB |
| 阮一峰周刊 287 | 85 KB |
| 阮一峰周刊 283 | 72 KB |
| Test-site long article | 0.5 KB |
| Test-site complex structure | 3.4 KB |

The two JS-rendered downloads come out at 2.3 KB and 12.9 KB — far too small to
be real articles, which is the limitation below showing up in the numbers.

Of the four real articles the median is about **122 KB**.

**Limitation that matters:** only statically rendered pages could be measured.
JS-rendered sites (机核, 少数派) return an empty body to `curl`, so they are
absent from the sample — and a real capture reads the live DOM, where those
pages are usually larger. So 80 MB is a budget from a *low* sample: roughly 660
median pages, or 400 long ones. The actual safety net is LRU eviction, not this
number.
