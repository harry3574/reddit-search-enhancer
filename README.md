# Reddit Search Enhancer

A small browser extension that fixes how modern Reddit's search results page
handles images: tiny, low-res, and forcibly blurred — even when your account
preferences say otherwise, and even for content you're already subscribed to
and clearly opted into seeing.

This replaces those thumbnails with the actual full-size image, inline,
right in the search results. Multi-image (gallery) posts get a small
prev/next carousel instead of showing only the first image.

## Why this exists

New Reddit's search results deliberately serve a separate, low-resolution
thumbnail file for every post, regardless of your blur/NSFW settings, and
regardless of the layout you use everywhere else on the site. There's no
account setting or official toggle for this — the small blurred image is
all the search page ever loads client-side.

This extension works around that by fetching each post's public,
unauthenticated `.json` data (the same data Reddit's own frontend uses
internally, not the OAuth API that requires developer approval) and pulling
the real, full-resolution image URL out of it.

## Install (any Chromium-based browser: Chrome, Opera, Opera GX, Edge, Brave)

1. Download/clone this repository.
2. Go to your browser's extensions page (e.g. `chrome://extensions` or
   `opera://extensions`).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this folder.

Firefox is not currently supported (would need porting to Manifest V2/V3
differences and `browser.*` APIs).

## Configuration

Click the extension's toolbar icon for a small popup with checkboxes and an
image-width dropdown. Changes save instantly and apply to any open Reddit
tab immediately — no reload of the extension needed, though reloading the
Reddit tab itself picks the new settings up cleanly.

| Option | Default | Effect |
|---|---|---|
| Enable extension | on | Master switch for the whole extension |
| Remove blur | on | Strip Reddit's NSFW/spoiler blur |
| Reveal spoiler text | on | Keep spoiler-tagged text readable |
| Gallery carousel | on | Prev/next browsing for multi-image posts |
| Rework layout | on | Widen the result row to fit a full-size image |
| Image width | 720px | Preferred image width (lower = faster/smaller) |

Settings are stored via `chrome.storage.local` (per-browser-profile, not
synced anywhere). `DEFAULT_CONFIG` near the top of `content.js` is only
used the very first time the extension runs, before anything's been saved.

## How it works

For each post on a search results page, the script:

1. Finds the post's permalink from the page's own markup.
2. Fetches `<permalink>.json` (public, no auth needed beyond your normal
   session cookie).
3. Pulls the real image URL(s) out of the response — for galleries, all of
   them, using one of Reddit's pre-signed smaller resolutions rather than
   the full original file.
4. Swaps the result into the thumbnail in place, and (for galleries)
   attaches simple prev/next controls.

Nothing is cached or stored by the extension itself — no `localStorage`, no
`chrome.storage`. Only the browser's normal HTTP cache is involved, same as
any other page you visit.

## Known limitations

- Only targets Reddit's search results page — front page, subreddit
  listings, etc. use different (already reasonably-sized) thumbnails and
  aren't affected.
- Reddit's internal markup changes periodically; if thumbnails stop
  upgrading after a Reddit update, the CSS selectors/JSON field names in
  `content.js` likely need adjusting. Issues and PRs welcome.

## License

MIT — see [LICENSE](./LICENSE).
