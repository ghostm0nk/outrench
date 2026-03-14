// popup.js
function updateUI() {
  chrome.storage.local.get(['twitter_profile'], (result) => {
    const statusEl = document.getElementById('twitter-status');
    const profileBox = document.getElementById('profile-display');
    const nameEl = document.getElementById('profile-name');
    const handleEl = document.getElementById('profile-handle');
    const avatarEl = document.getElementById('profile-avatar');

    if (result.twitter_profile) {
      statusEl.innerHTML = '<span class="status-dot active"></span>Synced';
      statusEl.style.color = '#10b981';
      
      profileBox.style.display = 'flex';
      nameEl.innerText = result.twitter_profile.name;
      handleEl.innerText = result.twitter_profile.handle;
      if (result.twitter_profile.avatar_url) {
        avatarEl.src = result.twitter_profile.avatar_url;
      }
    } else {
      statusEl.innerHTML = '<span class="status-dot inactive"></span>Not Found';
      statusEl.style.color = '#ef4444';
      profileBox.style.display = 'none';
    }
  });
}

// Update immediately on open
updateUI();

// Listen for storage changes while open
chrome.storage.onChanged.addListener((changes) => {
  if (changes.twitter_profile) {
    updateUI();
  }
});
