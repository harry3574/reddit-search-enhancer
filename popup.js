const DEFAULT_CONFIG = {
  UPGRADE_IMAGES: true,
  REMOVE_IMAGE_BLUR: true,
  REVEAL_SPOILER_TEXT: true,
  SHOW_GALLERY_CAROUSEL: true,
  REWORK_LAYOUT: true,
  TARGET_WIDTH: 720,
};

const checkboxIds = [
  "UPGRADE_IMAGES",
  "REMOVE_IMAGE_BLUR",
  "REVEAL_SPOILER_TEXT",
  "SHOW_GALLERY_CAROUSEL",
  "REWORK_LAYOUT",
];

const statusEl = document.getElementById("status");
let statusTimer = null;

function showSaved() {
  statusEl.textContent = "Saved";
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    statusEl.textContent = "";
  }, 1200);
}

function applyEnabledState(enabled) {
  checkboxIds
    .filter((id) => id !== "UPGRADE_IMAGES")
    .forEach((id) => {
      document.getElementById(id).disabled = !enabled;
    });
  document.getElementById("TARGET_WIDTH").disabled = !enabled;
}

chrome.storage.local.get(DEFAULT_CONFIG, (config) => {
  checkboxIds.forEach((id) => {
    document.getElementById(id).checked = !!config[id];
  });
  document.getElementById("TARGET_WIDTH").value = String(config.TARGET_WIDTH);
  applyEnabledState(config.UPGRADE_IMAGES);
});

checkboxIds.forEach((id) => {
  document.getElementById(id).addEventListener("change", (e) => {
    chrome.storage.local.set({ [id]: e.target.checked }, showSaved);
    if (id === "UPGRADE_IMAGES") applyEnabledState(e.target.checked);
  });
});

document.getElementById("TARGET_WIDTH").addEventListener("change", (e) => {
  chrome.storage.local.set({ TARGET_WIDTH: Number(e.target.value) }, showSaved);
});
