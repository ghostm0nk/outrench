// content.js
const IS_TWITTER = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');
const IS_DASHBOARD = window.location.host.includes('localhost') || 
                     window.location.host.includes('127.0.0.1') || 
                     window.location.host.includes('outrench');

if (IS_DASHBOARD) {
  // Flag for React
  document.documentElement.setAttribute('data-ghost-driver', 'active');

  // React -> Extension
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type === "SYNC_PROFILE_REQUEST") {
      chrome.runtime.sendMessage({ type: "CHECK_TWITTER_SESSION" });
    }
  });

  // Extension -> React
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "PROFILE_DATA_READY") {
      window.postMessage({ type: "PROFILE_DATA_READY", data: msg.data }, "*");
    }
    if (msg.type === "SESSION_NOT_FOUND") {
      window.postMessage({ type: "SESSION_NOT_FOUND", error: msg.error }, "*");
    }
  });
}

if (IS_TWITTER) {
  function scrapeProfile() {
    const interval = setInterval(() => {
      // Look for handle
      const handleEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] span:last-child') || 
                       document.querySelector('[data-testid="UserName"] span:last-child');
      
      if (handleEl && handleEl.innerText.includes('@')) {
        clearInterval(interval);
        const nameEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] div:first-child span') ||
                       document.querySelector('[data-testid="UserName"] div:first-child span');
        const avatarEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] img') ||
                         document.querySelector('a[href$="/photo"] img');

        const data = {
          handle: handleEl.innerText,
          name: nameEl ? nameEl.innerText : "User",
          avatar_url: avatarEl ? avatarEl.src : null,
          platform: 'twitter'
        };
        chrome.runtime.sendMessage({ type: "TWITTER_PROFILE_FETCHED", data });
      }
    }, 1500);
    setTimeout(() => clearInterval(interval), 20000);
  }

  if (document.readyState === 'complete') scrapeProfile();
  else window.addEventListener('load', scrapeProfile);
}
