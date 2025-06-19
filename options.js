// options.js
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get("displayMode", function(result) {
    const displayMode = result.displayMode || "indicate";
    document.querySelector(`input[name="displayMode"][value="${displayMode}"]`).checked = true;
  });

  document.getElementById('displayForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const displayMode = document.querySelector('input[name="displayMode"]:checked').value;
    chrome.storage.local.set({ displayMode }, () => {
      const button = document.querySelector('.save-btn');
      button.textContent = 'Saved!';
      setTimeout(() => {
        button.textContent = 'Save Settings';
      }, 1500);
    });
  });
});