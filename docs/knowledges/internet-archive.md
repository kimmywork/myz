---
status: draft
date: 2025-11-04
---

# Internet Archive API and Structure

Internet Archive (Wayback Machine) is a service that stores archived web pages. Users can submit pages and visit histories of the page.

## View Archived Page

Given a page, for example `https://myz.kimmy.fun/privacy.html`. It's archived version url should be
`https://web.archive.org/web/20251104075831/https://myz.kimmy.fun/privacy.html`.

Usually composed with following segements:
```
prefix: https://web.archive.org/web/
utctime: 20251104075831/
original_url: https://myz.kimmy.fun/privacy.html
```

## Check existing archives

If you want to know there's an existing archived version of the page, you can query using [CDX Server API](https://archive.org/developers/wayback-cdx-server.html).

Given our url above, you can request the api via:

```
http://web.archive.org/cdx/search/cdx?url=https://myz.kimmy.fun/privacy.html
```

### CDX API Request

i.e. the API request should be `GET https://web.archive.org/cdx/search/cdx?url={the URL}`.

Optional params: 
- `limit=<n>` (fetch first (when positive)/last (when negative) `<n>` records)
- `fastLatest=true`
- `output=json`

After request the API, it will respond you in following `text/plain` format:

### CDX API Response

```
fun,kimmy,myz)/privacy.html 20251104075831 https://myz.kimmy.fun/privacy.html text/html 200 MJWSJQJMYULGHZO3PSMTUS7GLYM7KIW7 5531
```

or `application/json` format:

```json
[["urlkey","timestamp","original","mimetype","statuscode","digest","length"],
["fun,kimmy,myz)/privacy.html","20251104075831","https://myz.kimmy.fun/privacy.html","text/html","200","MJWSJQJMYULGHZO3PSMTUS7GLYM7KIW7","5531"],
["fun,kimmy,myz)/privacy.html","20251104091250","https://myz.kimmy.fun/privacy.html","text/html","200","MJWSJQJMYULGHZO3PSMTUS7GLYM7KIW7","5534"]]
```

| Field           | Example                            | Description            |
|-----------------|------------------------------------|------------------------|
| 1. URL SURT Key | fun,kimmy,myz)/privacy.html        | SURT format URL        |
| 2. Timestamp    | 20251104075831                     | Archived time          |
| 3. Original URL | https://myz.kimmy.fun/privacy.html | Oringial URL           |
| 4. MIME type    | text/html                          | Content Mime Type      |
| 5. HTTP Status  | 200                                | HTTP Status            |
| 6. Digest       | CRLO54XB5T46I2FGSTEWQSAECSOBAL47   | Hash Digest of content |
| 7. Length       | 5531                               | Content length         |

> Here SURT means Sort-friendly URI Reordering Transform.

Based on the response we can easily get the archived page URL: `https://web.archive.org/web/{Timestamp}/{Original URL}`.

## Archived page content

Archived page is almost same as orignal page, with Internet Archive injected some HTML snippets after `<body>` element open tag, including 2 `<script>`s and 2 `<div>`s.

E.g. given the page above, if one of the element on the original page is located at (full xpath) 
`/html/body/div/div/div[2]/div/div/div[2]/div/main/div/div/ul[1]/li[1]`,
after it gets archived, the element on the archived page would be located at
`/html/body/div[3]/div/div[2]/div/div/div[2]/div/main/div/div/ul[1]/li[1]` (since there are 2 more div element inserted into body).

## Save new archived page

If we queried archived page via CDX API but found nothing, we can use save endpoint to create new one.

It works like that (post `application/x-www-form-urlencoded`).

```
POST https://web.archive.org/save
url={Original URL}&capture_all=on
```

There's an optional `Authorization: LOW {credentials}` header, for users who registered. You can get the credentials from <https://archive.org/account/s3.php>.
