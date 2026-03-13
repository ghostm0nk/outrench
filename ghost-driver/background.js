// background.js
console.log("Ghost Driver: Bridge Online.");

// We'll try to determine the API URL, defaulting to local dev
const API_URL = "http://localhost:8000"; 

// Set initial badge
chrome.action.setBadgeText({ text: "SYNC" });
chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Twitter Scraper pushing data to storage
  if (request.type === "TWITTER_PROFILE_FETCHED") {
    chrome.storage.local.set({ twitter_profile: request.data }, () => {
      chrome.action.setBadgeText({ text: "OK" });
      chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
      broadcastToDashboards({ type: "PROFILE_DATA_READY", data: request.data });
    });
  }

  // 2. Dashboard requesting a direct database sync
  if (request.type === "SYNC_ACTION_REQUEST") {
    const { clerk_id, platform, account_type } = request;
    
    chrome.storage.local.get(['twitter_profile'], async (result) => {
      if (result.twitter_profile) {
        try {
          console.log(`Ghost Driver: Syncing @${result.twitter_profile.handle} for Clerk User ${clerk_id}`);
          
          const response = await fetch(`${API_URL}/api/channels/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clerk_id: clerk_id,
              platform: platform,
              account_type: account_type,
              auth_token: "GHOST_DRIVER_SESSION",
              handle: result.twitter_profile.handle,
              name: result.twitter_profile.name,
              avatar_url: result.twitter_profile.avatar_url
            })
          });

          if (response.ok) {
            const data = await response.json();
            console.log("Ghost Driver: Sync Successful!");
            broadcastToDashboards({ 
              type: "SYNC_COMPLETE", 
              platform, 
              account_type, 
              profile: data.profile 
            });
          } else {
            const err = await response.json();
            console.error("Ghost Driver: Sync Failed at Backend:", err);
            broadcastToDashboards({ type: "SYNC_ERROR", error: err.detail || "Database Rejected the Spirit." });
          }
        } catch (e) {
          console.error("Ghost Driver: Network Error during sync:", e);
          broadcastToDashboards({ type: "SYNC_ERROR", error: "Ghost Driver blocked by Network/CORS. Check if Backend is on port 8000." });
        }
      } else {
        broadcastToDashboards({ type: "SESSION_NOT_FOUND", error: "Ghost Driver has no Twitter data yet. Please open a Twitter tab." });
      }
    });
  }
});

function broadcastToDashboards(msg) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && (tab.url.includes("localhost") || tab.url.includes("outrench") || tab.url.includes("onrender"))) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  });
}
