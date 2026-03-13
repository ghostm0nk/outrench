// content.js
const IS_TWITTER = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');
const IS_DASHBOARD = window.location.host.includes('localhost') || 
                     window.location.host.includes('127.0.0.1') || 
                     window.location.host.includes('outrench');

console.log(`Ghost Driver Injected: ${window.location.host} (IsTwitter: ${IS_TWITTER}, IsDashboard: ${IS_DASHBOARD})`);

if (IS_DASHBOARD) {
  document.documentElement.setAttribute('data-ghost-driver', 'active');
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type === "SYNC_PROFILE_REQUEST") {
      chrome.runtime.sendMessage({ type: "CHECK_TWITTER_SESSION" });
    }
  });

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
    console.log("Ghost Driver: Searching for Twitter essence...");
    const interval = setInterval(() => {
      // 1. Try to find the handle (@username)
      // Popular selectors for the handle:
      const handleSelectors = [
        '[data-testid="SideNav_AccountSwitcher_Badge"] span:last-child',
        '[data-testid="UserName"] span:last-child',
        'nav[aria-label="Primary"] [data-testid="AppTabBar_Profile_Link"]', // Hover text sometimes contains it
        'a[data-testid="AppTabBar_Profile_Link"]' // Profile link often has @handle in href
      ];

      let handle = null;
      let name = null;
      let avatar_url = null;

      // Check URL first - if we are on a profile page, we can grab it from there
      if (window.location.pathname.length > 1 && !['home', 'explore', 'notifications', 'messages'].some(path => window.location.pathname.includes(path))) {
        const pathParts = window.location.pathname.split('/');
        if (pathParts[1]) {
           // This might be a handle
        }
      }

      for (const sel of handleSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText || "";
          if (text.includes('@')) {
            handle = text.trim();
            break;
          }
          // Fallback: check href for a[data-testid="AppTabBar_Profile_Link"]
          if (el.tagName === 'A' && el.getAttribute('href')) {
            handle = '@' + el.getAttribute('href').replace('/', '');
            break;
          }
        }
      }

      if (handle) {
        console.log("Ghost Driver: Found handle:", handle);
        
        // 2. Try to find the Display Name
        const nameSelectors = [
          '[data-testid="SideNav_AccountSwitcher_Badge"] div:first-child span',
          '[data-testid="UserName"] div:first-child span',
          'div[data-testid="primaryColumn"] [data-testid="UserName"] span'
        ];
        for (const sel of nameSelectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText) {
            name = el.innerText.trim();
            break;
          }
        }

        // 3. Try to find the Avatar
        const avatarSelectors = [
          '[data-testid="SideNav_AccountSwitcher_Badge"] img',
          'a[href$="/photo"] img',
          'div[data-testid="primaryColumn"] img[src*="profile_images"]',
          '[data-testid="UserAvatar-Container"] img'
        ];
        for (const sel of avatarSelectors) {
          const el = document.querySelector(sel);
          if (el && el.src) {
            avatar_url = el.src;
            break;
          }
        }

        clearInterval(interval);
        const data = {
          handle,
          name: name || handle.replace('@', ''),
          avatar_url,
          platform: 'twitter'
        };
        console.log("Ghost Driver: Profiling complete.", data);
        chrome.runtime.sendMessage({ type: "TWITTER_PROFILE_FETCHED", data });
      }
    }, 2000);

    // Stop looking after 30 seconds to save battery/perf
    setTimeout(() => {
      clearInterval(interval);
      console.log("Ghost Driver: Search timed out.");
    }, 30000);
  }

  // Run on start and also on URL changes (Twitter is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      scrapeProfile();
    }
  }).observe(document, { subtree: true, childList: true });

  if (document.readyState === 'complete') scrapeProfile();
  else window.addEventListener('load', scrapeProfile);
}
