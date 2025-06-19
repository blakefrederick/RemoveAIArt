// background.js
const IMAGE_MENU_ID = "removeaiart-hide-image";
const SHELL_MENU_ID = "removeaiart-show-image";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ hiddenImages: [], displayMode: 'indication' });

  chrome.contextMenus.create({
    id: IMAGE_MENU_ID,
    title: "Mark as AI Generated",
    contexts: ["image"]
  });
  chrome.contextMenus.create({
    id: SHELL_MENU_ID,
    title: "Show Image",
    contexts: ["all"],
    documentUrlPatterns: ["<all_urls>"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === IMAGE_MENU_ID && info.srcUrl) {
    chrome.storage.local.get(['hiddenImages'], ({ hiddenImages = [] }) => {
      if (!hiddenImages.includes(info.srcUrl)) {
        hiddenImages.push(info.srcUrl);
        chrome.storage.local.set({ hiddenImages });
      }
      chrome.tabs.sendMessage(tab.id, { action: 'hideImage', src: info.srcUrl });
    });
  }
  if (info.menuItemId === SHELL_MENU_ID && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: "showImage",
      src: info.selectionText
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "updateContextMenu") {
    chrome.contextMenus.update(SHELL_MENU_ID, {
      visible: msg.showShellMenu || false
    });
  }
});