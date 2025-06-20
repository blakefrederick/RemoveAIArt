// storage keys
const SRC_KEY    = "hiddenSrc";
const HASH_KEY   = "hiddenHashes";
const DISPLAY_KEY= "displayMode";
const SHELL_CLASS= "image-shell";

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
  const { srcs, hashes, display } = await getSettings();

  document.querySelectorAll('img').forEach(async img => {
    if (img.dataset.processed === 'true') return;
    img.dataset.processed = 'true';

    // compute or reuse hash
    let ph = img.dataset.phash;
    if (!ph) {
      try {
        ph = await computeImageHash(img);
        img.dataset.phash = ph;
      } catch {
        // if cannot compute, skip perceptual match
        ph = null;
      }
    }

    const isHidden = srcs.includes(img.src) || (ph && hashes.includes(ph));
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
    background: '#eee',
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
  if (msg.action === 'hideImage') {
    (async () => {
      const img = Array.from(document.images).find(i => i.src === msg.src);
      if (!img) return;
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
    })();
  }

  if (msg.action === 'showImage') {
    (async () => {
      const { srcs, hashes } = await getSettings();
      // remove URL match
      const newSrcs   = srcs.filter(s => s !== msg.src);
      // also remove any hash match tied to that src
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
new MutationObserver(processImages)
  .observe(document.body,{ childList:true, subtree:true });
window.addEventListener('load', processImages);
processImages();
