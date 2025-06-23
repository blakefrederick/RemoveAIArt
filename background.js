const IMAGE_MENU_ID = "removeaiart-hide-image";
const SHELL_MENU_ID = "removeaiart-show-image";

console.log('[RemoveAIArt Background] Script starting...');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RemoveAIArt Background] Extension installed/reloaded');
  chrome.storage.local.set({
    hiddenSrc: [],
    hiddenHashes: [],
    displayMode: 'indicate'
  });

  chrome.contextMenus.create({
    id: IMAGE_MENU_ID,
    title: "Mark as AI Generated",
    contexts: ["image"]
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('[RemoveAIArt Background] Error creating image context menu:', chrome.runtime.lastError);
    } else {
      console.log('[RemoveAIArt Background] Image context menu created successfully');
    }
  });
  
  chrome.contextMenus.create({
    id: SHELL_MENU_ID,
    title: "Show Image",
    contexts: ["all"],
    documentUrlPatterns: ["<all_urls>"]
  }, () => {
    if (chrome.runtime.lastError) {
      console.error('[RemoveAIArt Background] Error creating shell context menu:', chrome.runtime.lastError);
    } else {
      console.log('[RemoveAIArt Background] Shell context menu created successfully');
    }
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
  console.log('[RemoveAIArt Background] Context menu clicked:', { menuItemId, srcUrl: srcUrl?.substring(0, 100), selectionText });
  
  if (menuItemId === IMAGE_MENU_ID) {
    if (!srcUrl) {
      console.log('[RemoveAIArt Background] srcUrl is undefined, requesting image URL from content script');
      // If srcUrl is undefined, ask the content script to find the clicked image
      chrome.tabs.sendMessage(tab.id, { action: 'getClickedImageUrl' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[RemoveAIArt Background] Error getting image URL:', chrome.runtime.lastError);
        } else if (response && response.imageUrl) {
          console.log('[RemoveAIArt Background] Got image URL from content script:', response.imageUrl.substring(0, 100));
          processHideImage(response.imageUrl, tab);
        } else {
          console.log('[RemoveAIArt Background] No image URL received from content script');
        }
      });
    } else {
      console.log('[RemoveAIArt Background] Processing hide image request for:', srcUrl.substring(0, 100));
      processHideImage(srcUrl, tab);
    }
  }
  if (menuItemId === SHELL_MENU_ID && selectionText) {
    console.log('[RemoveAIArt Background] Processing show image request for:', selectionText);
    chrome.tabs.sendMessage(tab.id, { action: 'showImage', src: selectionText });
  }
});

function processHideImage(srcUrl, tab) {
  chrome.storage.local.get(['hiddenSrc'], ({ hiddenSrc = [] }) => {
    // For data URLs, store a hash instead of the full URL
    let urlToStore = srcUrl;
    if (srcUrl.startsWith('data:')) {
      urlToStore = 'data-hash:' + hashString(srcUrl);
      console.log('[RemoveAIArt Background] Data URL detected, storing hash:', urlToStore);
    }
    
    if (!hiddenSrc.includes(urlToStore)) {
      hiddenSrc.push(urlToStore);
      console.log('[RemoveAIArt Background] Updated hiddenSrc:', hiddenSrc);
      chrome.storage.local.set({ hiddenSrc }, () => {
        console.log('[RemoveAIArt Background] Storage updated, sending message to content script');
        chrome.tabs.sendMessage(tab.id, { action: 'hideImage', src: srcUrl }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[RemoveAIArt Background] Error sending message:', chrome.runtime.lastError);
          } else {
            console.log('[RemoveAIArt Background] Message sent successfully');
          }
        });
      });
    } else {
      console.log('[RemoveAIArt Background] URL already hidden');
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[RemoveAIArt Background] Received runtime message:', msg);
  if (msg.action === "updateContextMenu") {
    chrome.contextMenus.update(SHELL_MENU_ID, {
      visible: !!msg.showShellMenu
    });
  }
});

console.log('[RemoveAIArt Background] Script loaded and listeners registered');
