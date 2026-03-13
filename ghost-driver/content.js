// content.js - Running on Twitter / Outrench Dashboard
console.log("Ghost Driver script active.");

const IS_TWITTER = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');
const IS_DASHBOARD = window.location.host.includes('localhost') || window.location.host.includes('outrench.vercel.app');

if (IS_DASHBOARD) {
  // Tell the dashboard we are here
  console.log("Informing dashboard that Ghost Driver is active...");
  
  // Create a small bridge script to inject variables into the page context
  const script = document.createElement('script');
  script.textContent = 'window.__GHOST_DRIVER__ = true;';
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  // Listen for sync requests from the dashboard
  window.addEventListener("message", (event) => {
    if (event.data.type === "SYNC_PROFILE_REQUEST") {
      console.log("Dashboard requested profile sync. Seeking active Twitter tab...");
      chrome.runtime.sendMessage({ type: "CHECK_TWITTER_SESSION" });
    }
  });
}

if (IS_TWITTER) {
  function scrapeProfile() {
    setTimeout(() => {
      try {
        const handleEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] span:last-child') || 
                         document.querySelector('[data-testid="UserName"] span:last-child');
        
        const nameEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] div:first-child span') ||
                       document.querySelector('[data-testid="UserName"] div:first-child span');

        const avatarEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] img') ||
                         document.querySelector('a[href$="/photo"] img');

        if (handleEl && nameEl) {
          const data = {
            handle: handleEl.innerText,
            name: nameEl.innerText,
            avatar_url: avatarEl ? avatarEl.src : null,
            platform: 'twitter'
          };
          console.log("Ghost Driver: Profile Scraped", data);
          chrome.runtime.sendMessage({ type: "TWITTER_PROFILE_FETCHED", data });
        }
      } catch (e) {
        console.error("Ghost Driver: Scrape failed", e);
      }
    }, 2000);
  }

  scrapeProfile();
}
