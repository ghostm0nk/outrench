// popup.js
function updateUI() {
  chrome.storage.local.get(['twitter_profile', 'spirit_log'], (result) => {
    const dot = document.getElementById('session-dot');
    const text = document.getElementById('session-text');
    const profileArea = document.getElementById('profile-area');
    const logArea = document.getElementById('spirit-log');

    if (result.twitter_profile) {
      dot.classList.add('active');
      text.innerText = "Found Session";
      profileArea.style.display = 'flex';
      document.getElementById('profile-img').src = result.twitter_profile.avatar_url || "";
      document.getElementById('profile-name').innerText = result.twitter_profile.name;
      document.getElementById('profile-handle').innerText = result.twitter_profile.handle;
    } else {
      dot.classList.remove('active');
      text.innerText = "Not Found";
      profileArea.style.display = 'none';
    }

    if (result.spirit_log) {
      logArea.innerText = `Spirit: ${result.spirit_log}`;
    }
  });
}

document.getElementById('btn-scout').addEventListener('click', () => {
  const logArea = document.getElementById('spirit-log');
  logArea.innerText = "Spirit: Summoning mission strategy...";
  
  // We send a message to background to start searching
  // We'll use a hardcoded dev id or the background will find it from storage
  chrome.runtime.sendMessage({ type: "START_MARKET_SCOUT" });
  
  // Close popup after a delay so they can see the start
  setTimeout(() => window.close(), 1500);
});

// Refresh every second
setInterval(updateUI, 1000);
updateUI();
