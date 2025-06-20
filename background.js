const IMAGE_MENU_ID = "removeaiart-hide-image";
const SHELL_MENU_ID = "removeaiart-show-image";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    hiddenSrc: [],
    hiddenHashes: [],
    displayMode: 'indicate'
  });

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

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

chrome.contextMenus.onClicked.addListener(({ menuItemId, srcUrl, selectionText }, tab) => {
  if (menuItemId === IMAGE_MENU_ID && srcUrl) {
    chrome.storage.local.get(['hiddenSrc', 'hiddenHashes'], ({ hiddenSrc = [], hiddenHashes = [] }) => {
      if (!hiddenSrc.includes(srcUrl)) {
        hiddenSrc.push(srcUrl);
        hiddenHashes.push(hashString(srcUrl));
        chrome.storage.local.set({ hiddenSrc, hiddenHashes });
      }
      chrome.tabs.sendMessage(tab.id, { action: 'hideImage', src: srcUrl });
    });
  }
  if (menuItemId === SHELL_MENU_ID && selectionText) {
    chrome.tabs.sendMessage(tab.id, { action: 'showImage', src: selectionText });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "updateContextMenu") {
    chrome.contextMenus.update(SHELL_MENU_ID, {
      visible: !!msg.showShellMenu
    });
  }
});
