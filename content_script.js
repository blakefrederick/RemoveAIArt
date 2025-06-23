// storage keys
const SRC_KEY    = "hiddenSrc";
const HASH_KEY   = "hiddenHashes";
const DISPLAY_KEY= "displayMode";
const SHELL_CLASS= "image-shell";

// Debug flag - set to false to disable logging
const DEBUG = true;
function debugLog(...args) {
  if (DEBUG) console.log('[RemoveAIArt]', ...args);
}

// Track the last right-clicked image
let lastClickedImage = null;

// Add event listener to track right-clicks on images
document.addEventListener('contextmenu', (event) => {
  if (event.target.tagName === 'IMG') {
    lastClickedImage = event.target;
    debugLog('Right-clicked on image:', event.target.src.substring(0, 100));
  }
});

// Simple string hash function
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

// wrapper for storage
function getSettings() {
  return new Promise(r => {
    chrome.storage.local.get([SRC_KEY, HASH_KEY, DISPLAY_KEY], data => {
      r({
        srcs:    Array.isArray(data[SRC_KEY]) ? data[SRC_KEY] : [],
        hashes:  Array.isArray(data[HASH_KEY])? data[HASH_KEY]: [],
        display: data[DISPLAY_KEY] || 'indicate'
      });
    });
  });
}
function saveSettings(updates) {
  return new Promise(r => {
    chrome.storage.local.set(updates, r);
  });
}

// Simple perceptual hashing function
function computeImageHash(img) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 8; // Downscale to 8x8
      canvas.height = 8;
      const ctx = canvas.getContext('2d');

      // Set crossOrigin attribute to avoid tainting
      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      tempImg.onload = () => {
        try {
          ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const pixels = imageData.data;

          // Convert to grayscale and calculate average brightness
          const grayscale = [];
          let totalBrightness = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            const brightness = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
            grayscale.push(brightness);
            totalBrightness += brightness;
          }
          const avgBrightness = totalBrightness / grayscale.length;

          // Generate hash based on brightness compared to average
          const hash = grayscale.map(b => (b > avgBrightness ? 1 : 0)).join('');
          resolve(hash);
        } catch (error) {
          console.warn('Image processing failed due to CORS restrictions:', img.src);
          resolve(null); // Fallback: return null for tainted images
        }
      };
      tempImg.onerror = () => {
        console.error('Failed to load image:', img.src);
        resolve(null); // Fallback: return null for failed loads
      };
      tempImg.src = img.src;
    } catch (error) {
      reject(error);
    }
  });
}

// decorate page images
async function processImages() {
  debugLog('processImages() called');
  const { srcs, hashes, display } = await getSettings();
  debugLog('Current settings:', { srcs, hashes, display });

  const images = document.querySelectorAll('img');
  debugLog(`Found ${images.length} images to process`);

  images.forEach(async img => {
    if (img.dataset.processed === 'true') return;
    
    debugLog('Processing image:', img.src.substring(0, 100));
    
    // Wait for image to load if it hasn't yet
    if (!img.complete && img.src) {
      debugLog('Waiting for image to load...');
      await new Promise((resolve) => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = resolve;
          img.onerror = resolve;
          // Timeout after 5 seconds
          setTimeout(resolve, 5000);
        }
      });
    }
    
    img.dataset.processed = 'true';

    // compute or reuse hash
    let ph = img.dataset.phash;
    if (!ph && img.complete && img.naturalWidth > 0) {
      try {
        debugLog('Computing perceptual hash...');
        ph = await computeImageHash(img);
        img.dataset.phash = ph;
        debugLog('Computed hash:', ph);
      } catch (error) {
        debugLog('Failed to compute hash:', error);
        ph = null;
      }
    }

    // Check for direct URL match or data URL hash match
    let urlMatch = srcs.includes(img.src);
    if (!urlMatch && img.src.startsWith('data:')) {
      // Check if there's a hash for this data URL
      const dataHash = 'data-hash:' + hashString(img.src);
      urlMatch = srcs.includes(dataHash);
      debugLog('Checking data URL hash:', dataHash, 'Match:', urlMatch);
    }

    const isHidden = urlMatch || (ph && hashes.includes(ph));
    debugLog('Image hidden status:', isHidden, 'URL match:', urlMatch, 'Hash match:', ph && hashes.includes(ph));
    
    if (isHidden) {
      if (display === 'indicate') {
        if (!document.querySelector(`.${SHELL_CLASS}[data-original-src="${img.src}"]`)) {
          const shell = createShell(img);
          img.parentNode.insertBefore(shell, img);
        }
      }
      img.style.display = 'none';
      img.dataset.hidden = 'true';
    } else {
      img.style.display = '';
      img.dataset.hidden = 'false';
    }
  });


  document.querySelectorAll(`.${SHELL_CLASS}`).forEach(shell => {
    const src = shell.dataset.originalSrc;
    const ph  = shell.dataset.phash;
    if (!(srcs.includes(src) || (ph && hashes.includes(ph)))) {
      shell.remove();
    }
  });
}

// shell placeholder
function createShell(img) {
  const shell = document.createElement('div');
  const { width, height } = img.getBoundingClientRect();
  shell.className = SHELL_CLASS;
  shell.dataset.originalSrc = img.src;
  if (img.dataset.phash) shell.dataset.phash = img.dataset.phash;

  Object.assign(shell.style, {
    width:      `${width}px`,
    height:     `${height}px`,
    display:    getComputedStyle(img).display,
    margin:     getComputedStyle(img).margin,
    border:     '1px solid #444',
    // background: '#eee',
    cursor:     'pointer',
    textAlign:  'center',
    lineHeight: `${height}px`
  });
  shell.textContent = "AI Image Removed";
  shell.title = "Click to restore";
  shell.onclick = () => {
    chrome.runtime.sendMessage({ action:'showImage', src: img.src });
  };
  return shell;
}

// hide-image handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  debugLog('Received message:', msg);
  
  if (msg.action === 'getClickedImageUrl') {
    debugLog('Getting clicked image URL, lastClickedImage:', lastClickedImage);
    if (lastClickedImage && lastClickedImage.src) {
      sendResponse({ imageUrl: lastClickedImage.src });
    } else {
      sendResponse({ imageUrl: null });
    }
    return true; // Keep the message channel open for async response
  }
  
  if (msg.action === 'hideImage') {
    (async () => {
      const img = Array.from(document.images).find(i => i.src === msg.src);
      if (!img) return;
      debugLog('Found image to hide:', img);
      
      const { srcs, hashes, display } = await getSettings();
      let ph = img.dataset.phash;
      if (!ph) {
        ph = await computeImageHash(img);
      }
      // update storage
      const newSrcs   = srcs.includes(msg.src) ? srcs : [...srcs, msg.src];
      const newHashes = ph && !hashes.includes(ph) ? [...hashes, ph] : hashes;
      await saveSettings({ [SRC_KEY]: newSrcs, [HASH_KEY]: newHashes });

      // Hide the image immediately
      img.replaceWith(createShell(img, display));
      debugLog('Image hidden and replaced with shell');
    })();
  }

  if (msg.action === 'showImage') {
    (async () => {
      const { srcs, hashes } = await getSettings();
      
      // remove URL match (including data URL hash)
      let newSrcs = srcs.filter(s => s !== msg.src);
      if (msg.src.startsWith('data:')) {
        const dataHash = 'data-hash:' + hashString(msg.src);
        newSrcs = newSrcs.filter(s => s !== dataHash);
      }
      
      // also remove any perceptual hash match tied to that src
      const img = Array.from(document.images).find(i => i.src === msg.src);
      let ph;
      if (img) {
        ph = img.dataset.phash || await computeImageHash(img);
      }
      const newHashes = ph ? hashes.filter(h => h !== ph) : hashes;

      await saveSettings({ [SRC_KEY]: newSrcs, [HASH_KEY]: newHashes });
      processImages();
    })();
  }
});

// re-run on storage or DOM changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area==='local' && (changes[SRC_KEY]||changes[HASH_KEY]||changes[DISPLAY_KEY])) {
    processImages();
  }
});

// Debounced processImages to avoid excessive calls
let processTimeout;
function debouncedProcessImages() {
  clearTimeout(processTimeout);
  processTimeout = setTimeout(processImages, 100);
}

new MutationObserver((mutations) => {
  let hasImageChanges = false;
  mutations.forEach(mutation => {
    if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.tagName === 'IMG' || node.querySelector && node.querySelector('img')) {
            hasImageChanges = true;
          }
        }
      });
    }
  });
  
  if (hasImageChanges) {
    debouncedProcessImages();
  }
}).observe(document.body, { childList: true, subtree: true });

window.addEventListener('load', processImages);
processImages();

debugLog('Content script loaded and initialized');
