const DEFAULT_CONFIG = {
  EXTENSION_ENABLED: true,
  UPGRADE_IMAGES: true,
  REMOVE_IMAGE_BLUR: true,
  REVEAL_SPOILER_TEXT: true,
  SHOW_GALLERY_CAROUSEL: true,
  REWORK_LAYOUT: true,
  TARGET_WIDTH: 720,
};

// Everything except the master switch itself.
const checkboxIds = [
  "UPGRADE_IMAGES",
  "REMOVE_IMAGE_BLUR",
  "REVEAL_SPOILER_TEXT",
  "SHOW_GALLERY_CAROUSEL",
  "REWORK_LAYOUT",
];

// These only do anything when image fetching is also on.
const dependsOnUpgrade = ["SHOW_GALLERY_CAROUSEL", "REWORK_LAYOUT"];

const statusEl = document.getElementById("status");
let statusTimer = null;

function showSaved() {
  statusEl.textContent = "Saved";
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = "";
  }, 1200);
}

// masterEnabled: EXTENSION_ENABLED. upgradeEnabled: UPGRADE_IMAGES.
// config: full stored config, used to restore checked state on re-enable
// without overwriting what's actually saved.
function applyEnabledState(masterEnabled, upgradeEnabled, config) {
  checkboxIds.forEach((id) => {
    const el = document.getElementById(id);
    const needsUpgrade = dependsOnUpgrade.includes(id);
    const active = masterEnabled && (!needsUpgrade || upgradeEnabled);
    el.disabled = !active;
    el.checked = masterEnabled ? !!config[id] : false;
  });
  const widthEl = document.getElementById("TARGET_WIDTH");
  widthEl.disabled = !(masterEnabled && upgradeEnabled);
}

chrome.storage.local.get(DEFAULT_CONFIG, (config) => {
  document.getElementById("EXTENSION_ENABLED").checked = !!config.EXTENSION_ENABLED;
  checkboxIds.forEach((id) => {
    document.getElementById(id).checked = !!config[id];
  });
  document.getElementById("TARGET_WIDTH").value = String(config.TARGET_WIDTH);
  applyEnabledState(config.EXTENSION_ENABLED, config.UPGRADE_IMAGES, config);
});

document.getElementById("EXTENSION_ENABLED").addEventListener("change", (e) => {
  chrome.storage.local.set({ EXTENSION_ENABLED: e.target.checked }, showSaved);
  chrome.storage.local.get(DEFAULT_CONFIG, (config) => {
    applyEnabledState(e.target.checked, config.UPGRADE_IMAGES, config);
  });
});

checkboxIds.forEach((id) => {
  document.getElementById(id).addEventListener("change", (e) => {
    chrome.storage.local.set({ [id]: e.target.checked }, showSaved);
    if (id === "UPGRADE_IMAGES") {
      chrome.storage.local.get(DEFAULT_CONFIG, (config) => {
        applyEnabledState(config.EXTENSION_ENABLED, e.target.checked, config);
      });
    }
  });
});

document.getElementById("TARGET_WIDTH").addEventListener("change", (e) => {
  chrome.storage.local.set({ TARGET_WIDTH: Number(e.target.value) }, showSaved);
});
