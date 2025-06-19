// content_script.js
const HIDDEN_KEY = "hiddenImages";
const DISPLAY_KEY = "displayMode";
const SHELL_CLASS = "image-shell";

function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get([HIDDEN_KEY, DISPLAY_KEY], (data) => {
      resolve({
        hidden: Array.isArray(data[HIDDEN_KEY]) ? data[HIDDEN_KEY] : [],
        display: data[DISPLAY_KEY] || "indicate"
      });
    });
  });
}

function saveHiddenImages(list) {
  // Just the simplest local storage implentation for now
  return new Promise(resolve => {
    chrome.storage.local.set({ [HIDDEN_KEY]: list }, resolve);
  });
}

// Process all images on the page, comparing against the hidden list
async function processImages() {
  const { hidden, display } = await getSettings();
  
  // Handle all img tags
  document.querySelectorAll("img").forEach(img => {
    // Skip already processed images with same hidden state
    if (img.dataset.processed === "true" && 
        ((hidden.includes(img.src) && img.dataset.hidden === "true") || 
         (!hidden.includes(img.src) && img.dataset.hidden !== "true"))) {
      return;
    }
    
    if (hidden.includes(img.src)) {
      if (display === "indicate") {
        // Check if shell already exists
        const existingShell = Array.from(document.querySelectorAll(`.${SHELL_CLASS}`))
          .find(shell => shell.dataset.originalSrc === img.src);
        
        if (!existingShell) {
          const shell = createImageShell(img);
          img.parentNode.insertBefore(shell, img);
        }
        
        img.style.display = "none";
        img.dataset.hidden = "true";
      } else {
        img.style.display = "none";
        img.dataset.hidden = "true";
      }
    } else {
      img.style.display = "";
      img.dataset.hidden = "false";
    }
    
    img.dataset.processed = "true";
  });
  
  // check for any existing that should be removed (no longer hidden)
  document.querySelectorAll(`.${SHELL_CLASS}`).forEach(shell => {
    const src = shell.dataset.originalSrc;
    if (src && !hidden.includes(src)) {
      shell.remove();
    }
  });
}

function createImageShell(img) {
  const shell = document.createElement("div");
  shell.className = SHELL_CLASS;
  shell.dataset.originalSrc = img.src;
  
  // Try to preserve dimensions of the original image for Shell Image
  const computedStyle = window.getComputedStyle(img);
  const width = img.width || parseInt(computedStyle.width) || 50;
  const height = img.height || parseInt(computedStyle.height) || 50;
  
  shell.style.width = `${width}px`;
  shell.style.height = `${height}px`;
  shell.style.display = computedStyle.display;
  shell.style.margin = computedStyle.margin;
  shell.style.border = "1px solid black";
  shell.textContent = "AI Image Removed";
  shell.tabIndex = 0;
  
  return shell;
}

document.addEventListener("contextmenu", (e) => {
  const target = e.target;
  
  if (target.tagName === "IMG") {
    // Right-clicked on an image
    chrome.runtime.sendMessage({ 
      action: "updateContextMenu", 
      showShellMenu: false 
    });
  } else if (target.classList.contains(SHELL_CLASS)) {
    // Right-clicked on a shell
    const src = target.dataset.originalSrc;
    if (src) {
      // Use selection to pass the src URL
      const textNode = document.createTextNode(src);
      target.appendChild(textNode);
      
      const range = document.createRange();
      range.selectNodeContents(target);
      
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      
      // After selection is made, tell background to show shell menu
      chrome.runtime.sendMessage({ 
        action: "updateContextMenu", 
        showShellMenu: true 
      });
      
      // Clean up the text node after selection
      setTimeout(() => {
        target.removeChild(textNode);
        selection.removeAllRanges();
      }, 100);
    }
  } else {
    // Right-clicked elsewhere - don't show this ext's menu
    chrome.runtime.sendMessage({ 
      action: "updateContextMenu", 
      showShellMenu: false 
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "hideImage" && msg.src) {
    getSettings().then(async ({ hidden, display }) => {
      if (!hidden.includes(msg.src)) {
        hidden.push(msg.src);
        await saveHiddenImages(hidden);
        
        // Extra extra - Hide ALL instances of this image on the page (by src)
        document.querySelectorAll(`img[src="${msg.src}"]`).forEach(img => {
          if (display === "indicate") {
            const shell = createImageShell(img);
            img.parentNode.insertBefore(shell, img);
            img.style.display = "none";
            img.dataset.hidden = "true";
          } else {
            img.style.display = "none";
            img.dataset.hidden = "true";
          }
          img.dataset.processed = "true";
        });
        
      }
    });
    return true;
  }
  
  if (msg.action === "showImage" && msg.src) {
    getSettings().then(async ({ hidden }) => {
      const newHiddenList = hidden.filter(src => src !== msg.src);
      await saveHiddenImages(newHiddenList);
      
      // Find all shells for this image and restore original images
      document.querySelectorAll(`.${SHELL_CLASS}[data-original-src="${msg.src}"]`).forEach(shell => {
        shell.remove();
      });
      
      // Show all instances of this image
      document.querySelectorAll(`img[src="${msg.src}"]`).forEach(img => {
        img.style.display = "";
        img.dataset.hidden = "false";
      });
      
    });
    return true;
  }
});

// Listen for storage changes to update the UI
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes[HIDDEN_KEY] || changes[DISPLAY_KEY])) {
    processImages();
  }
});

// Listen for DOM changes to catch dynamically loaded images
const observer = new MutationObserver((mutations) => {
  let hasNewImages = false;
  
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      const addedNodes = Array.from(mutation.addedNodes);
      const hasImages = addedNodes.some(node => {
        if (node.tagName === 'IMG') return true;
        if (node.nodeType === Node.ELEMENT_NODE) {
          return node.querySelectorAll('img').length > 0;
        }
        return false;
      });
      
      if (hasImages) {
        hasNewImages = true;
        break;
      }
    }
  }
  
  if (hasNewImages) {
    processImages();
  }
});

// Start observing
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Initial processing on page load
processImages();

// But run again when the page is fully loaded (for images that load after DOMContentLoaded)
window.addEventListener('load', processImages);