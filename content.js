// Reddit Search Enhancer
// Loads full-resolution, unblurred images inline on Reddit search results
// pages, instead of the small blurred thumbnails Reddit normally shows.
//
// Settings live in chrome.storage, editable via the extension's popup
// (click the toolbar icon) — no code editing required. DEFAULT_CONFIG
// below is only used the first time the extension runs, before any
// setting has been saved.

const DEFAULT_CONFIG = {
  UPGRADE_IMAGES: true,
  REMOVE_IMAGE_BLUR: true,
  REVEAL_SPOILER_TEXT: true,
  SHOW_GALLERY_CAROUSEL: true,
  REWORK_LAYOUT: true,
  TARGET_WIDTH: 720,
};

let CONFIG = { ...DEFAULT_CONFIG };
let configReady = false;

function injectStyle(id, cssText) {
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
}

function removeStyle(id) {
  document.getElementById(id)?.remove();
}

function applyStyleConfig() {
  if (CONFIG.REMOVE_IMAGE_BLUR) {
    injectStyle(
      "rsi-blur-removal",
      `
      faceplate-blur,
      faceplate-img.thumbnail-blur,
      [blur],
      .blur-md,
      .thumbnail-blur {
        filter: none !important;
        backdrop-filter: none !important;
      }
      `
    );
  } else {
    removeStyle("rsi-blur-removal");
  }

  if (CONFIG.REVEAL_SPOILER_TEXT) {
    injectStyle(
      "rsi-spoiler-text",
      `
      shreddit-spoiler-text,
      [data-text-spoiler] {
        background-color: transparent !important;
        color: inherit !important;
        cursor: text !important;
      }
      `
    );
  } else {
    removeStyle("rsi-spoiler-text");
  }
}

const LOG_PREFIX = "[RedditSearchEnhancer]";
const processed = new WeakSet();
const inFlight = new Set();

function isSearchPage() {
  const path = location.pathname;
  const hasQ = new URLSearchParams(location.search).has("q");
  return /\/search(\/|$)/.test(path) || hasQ;
}

// Walk light DOM + any open shadow roots looking for candidate thumbnail imgs.
// Also registers a MutationObserver on every shadow root we discover, since
// new search results attach their own shadow DOM asynchronously and the
// top-level document observer can't see inside those on its own.
const observedRoots = new WeakSet();

function findThumbImages(root, out = []) {
  const walker = (node) => {
    if (!node) return;
    if (node.tagName === "IMG" || node.tagName === "FACEPLATE-IMG") {
      const testId = node.getAttribute("data-testid") || "";
      const src = node.getAttribute("src") || "";
      const isThumb =
        testId === "search_post_thumbnail" ||
        src.includes("thumbs.redditmedia.com") ||
        src.includes("styles.redditmedia.com") ||
        (node.closest && node.closest('[data-testid="search_post_thumbnail"], [data-testid="post-thumbnail"], a[data-testid="post-thumbnail"]'));
      if (isThumb) out.push(node);
    }
    if (node.shadowRoot) {
      if (!observedRoots.has(node.shadowRoot)) {
        observedRoots.add(node.shadowRoot);
        shadowObserver.observe(node.shadowRoot, { childList: true, subtree: true });
      }
      walker(node.shadowRoot);
    }
    const children = node.children || (node.childNodes ? node.childNodes : []);
    for (const child of children) {
      if (child.nodeType === 1) walker(child);
    }
  };
  walker(root);
  return out;
}


function pickResolution(resolutions, sourceUrl) {
  if (resolutions && resolutions.length) {
    const sorted = [...resolutions].sort(
      (a, b) => (a.width || a.x || 0) - (b.width || b.x || 0)
    );
    const candidate =
      sorted.find((r) => (r.width || r.x || 0) >= CONFIG.TARGET_WIDTH) ||
      sorted[sorted.length - 1];
    const url = candidate?.url || candidate?.u;
    if (url) return url.replace(/&amp;/g, "&");
  }
  return sourceUrl ? sourceUrl.replace(/&amp;/g, "&") : null;
}

async function fetchPostImages(permalink) {
  const url = `${location.origin}${permalink}.json?raw_json=1`;
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();
  const post = data?.[0]?.data?.children?.[0]?.data;
  if (!post) throw new Error("unexpected json shape");

  // Gallery/album posts: collect every image, in order.
  if (post?.is_gallery || post?.gallery_data || post?.media_metadata) {
    const items = post?.gallery_data?.items;
    const metadata = post?.media_metadata;

    if (items && items.length && metadata) {
      const urls = items
        .map((item) => {
          const meta = metadata[item.media_id];
          if (!meta) return null;
          return pickResolution(meta.p, meta.s?.u || meta.s?.gif || meta.s?.mp4);
        })
        .filter(Boolean);
      if (urls.length) return urls;
    }

    if (metadata) {
      const urls = Object.values(metadata)
        .map((meta) => pickResolution(meta.p, meta.s?.u || meta.s?.gif || meta.s?.mp4))
        .filter(Boolean);
      if (urls.length) return urls;
    }
  }

  // Single image post.
  const previewImg = post?.preview?.images?.[0];
  if (previewImg) {
    const url = pickResolution(previewImg.resolutions, previewImg.source?.url);
    if (url) return [url];
  }

  // Direct image link posts (i.redd.it etc).
  if (post?.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) {
    return [post.url];
  }

  console.log(LOG_PREFIX, "no known image field on post", {
    is_gallery: post?.is_gallery,
    has_gallery_data: !!post?.gallery_data,
    has_media_metadata: !!post?.media_metadata,
    has_preview: !!post?.preview,
    post_hint: post?.post_hint,
  });
  return [];
}

function buildCarousel(images) {
  const wrap = document.createElement("div");
  wrap.className = "rsi-carousel";

  const img = document.createElement("img");
  img.className = "rsi-carousel-img";
  img.src = images[0];
  wrap.appendChild(img);

  let index = 0;

  if (images.length > 1 && CONFIG.SHOW_GALLERY_CAROUSEL) {
    const counter = document.createElement("span");
    counter.className = "rsi-carousel-counter";
    counter.textContent = `1 / ${images.length}`;
    wrap.appendChild(counter);

    const makeBtn = (label, dir) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `rsi-carousel-btn rsi-carousel-${dir > 0 ? "next" : "prev"}`;
      btn.textContent = label;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        index = (index + dir + images.length) % images.length;
        img.src = images[index];
        counter.textContent = `${index + 1} / ${images.length}`;
      });
      return btn;
    };

    wrap.appendChild(makeBtn("‹", -1));
    wrap.appendChild(makeBtn("›", 1));
  }

  return wrap;
}



function findPermalinkForImage(img) {
  const postEl = img.closest("shreddit-post") || img.getRootNode()?.host?.closest?.("shreddit-post");
  if (postEl) {
    const permalink = postEl.getAttribute("permalink");
    if (permalink) return permalink;
  }
  const link = img.closest("a[href*='/comments/']");
  if (link) {
    try {
      return new URL(link.href).pathname;
    } catch (e) {
      /* ignore */
    }
  }
  return null;
}

async function upgradeThumb(img) {
  if (processed.has(img)) return;
  const permalink = findPermalinkForImage(img);
  if (!permalink) return;
  if (inFlight.has(permalink)) return;
  inFlight.add(permalink);
  processed.add(img);

  try {
    const images = await fetchPostImages(permalink);
    if (images.length) {
      const carousel = buildCarousel(images);
      img.style.display = "none";
      img.insertAdjacentElement("afterend", carousel);
      const postRow = img.closest('[data-testid="search-sdui-post"]');
      if (postRow && CONFIG.REWORK_LAYOUT) postRow.classList.add("rsi-upgraded");
    } else {
      console.log(LOG_PREFIX, "no images found for", permalink);
    }
  } catch (err) {
    console.log(LOG_PREFIX, "failed for", permalink, err);
  } finally {
    inFlight.delete(permalink);
  }
}

function scan() {
  if (!configReady) return;
  if (!CONFIG.UPGRADE_IMAGES) return;
  if (!isSearchPage()) return;
  const imgs = findThumbImages(document.body);
  imgs.forEach(upgradeThumb);
}

function scheduleScan() {
  clearTimeout(scheduleScan._t);
  scheduleScan._t = setTimeout(scan, 200);
}

// Re-scan on DOM changes (infinite scroll / new results loading in),
// both at the top level and inside every shadow root we've found.
const shadowObserver = new MutationObserver(scheduleScan);
const observer = new MutationObserver(scheduleScan);
observer.observe(document.body, { childList: true, subtree: true });

// Reddit is an SPA — watch for URL changes without full reloads.
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(scan, 500);
  }
}, 500);

// Safety net: infinite-scroll content sometimes attaches in ways mutation
// observers miss (e.g. shadow roots created before we could attach to them).
// This is cheap since already-processed images are skipped instantly.
setInterval(scan, 1000);

// Load settings from the popup's storage before doing anything. Falls back
// to DEFAULT_CONFIG values for any key that's never been saved yet.
chrome.storage.local.get(DEFAULT_CONFIG, (stored) => {
  CONFIG = stored;
  configReady = true;
  applyStyleConfig();
  scan();
  console.log(LOG_PREFIX, "loaded, search page:", isSearchPage(), "config:", CONFIG);
});

// React live to popup toggles without needing a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  let styleRelevant = false;
  for (const key in changes) {
    if (key in CONFIG) {
      CONFIG[key] = changes[key].newValue;
      if (key === "REMOVE_IMAGE_BLUR" || key === "REVEAL_SPOILER_TEXT") {
        styleRelevant = true;
      }
    }
  }
  if (styleRelevant) applyStyleConfig();
  scan();
});

