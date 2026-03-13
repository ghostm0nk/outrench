// content.js
const IS_TWITTER = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');
const IS_DASHBOARD = window.location.host.includes('localhost') || 
                     window.location.host.includes('127.0.0.1') || 
                     window.location.host.includes('outrench') ||
                     window.location.host.includes('onrender');

if (IS_DASHBOARD) {
  document.documentElement.setAttribute('data-ghost-driver', 'active');

  // React -> Extension
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    
    // Direct Sync Request from Dashboard
    if (event.data.type === "SYNC_PROFILE_REQUEST") {
      chrome.runtime.sendMessage({ 
        type: "SYNC_ACTION_REQUEST",
        clerk_id: event.data.clerk_id,
        platform: event.data.platform,
        account_type: event.data.account_type
      });
    }
  });

  // Extension -> React
  chrome.runtime.onMessage.addListener((msg) => {
    // Forward everything from background to the dashboard
    window.postMessage(msg, "*");
  });
}

if (IS_TWITTER) {
  function scrapeProfile() {
    const interval = setInterval(() => {
      const handleSelectors = [
        '[data-testid="SideNav_AccountSwitcher_Badge"] span:last-child',
        '[data-testid="UserName"] span:last-child',
        'a[data-testid="AppTabBar_Profile_Link"]'
      ];

      let handle = null;
      for (const sel of handleSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText || "";
          if (text.includes('@')) { handle = text.trim(); break; }
          if (el.tagName === 'A' && el.getAttribute('href')) {
            handle = '@' + el.getAttribute('href').replace('/', '');
            break;
          }
        }
      }

      if (handle) {
        const nameEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] div:first-child span') ||
                       document.querySelector('[data-testid="UserName"] div:first-child span');
        const avatarEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] img') ||
                         document.querySelector('a[href$="/photo"] img');

        clearInterval(interval);
        const data = {
          handle,
          name: nameEl ? nameEl.innerText.trim() : handle.replace('@', ''),
          avatar_url: avatarEl ? avatarEl.src : null,
          platform: 'twitter'
        };
        chrome.runtime.sendMessage({ type: "TWITTER_PROFILE_FETCHED", data });
      }
    }, 2000);
    setTimeout(() => clearInterval(interval), 30000);
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scrapeProfile();
    }
  }).observe(document, { subtree: true, childList: true });

  if (document.readyState === 'complete') scrapeProfile();
  else window.addEventListener('load', scrapeProfile);
}
