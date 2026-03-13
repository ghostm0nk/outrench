// background.js
console.log("Ghost Driver: Bridge Online.");

const API_URL = "http://localhost:8000"; // Should ideally be dynamic, but hardcoded for local dev

// Set initial badge
chrome.action.setBadgeText({ text: "SYNC" });
chrome.action.setBadgeBackgroundColor({ color: "#f59e0b" });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Twitter Scraper pushing data
  if (request.type === "TWITTER_PROFILE_FETCHED") {
    console.log("Stashing Twitter session for:", request.data.handle);
    chrome.storage.local.set({ twitter_profile: request.data }, () => {
      chrome.action.setBadgeText({ text: "OK" });
      chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
      broadcastToDashboards({ type: "PROFILE_DATA_READY", data: request.data });
    });
  }

  // 2. Dashboard requesting a direct sync
  if (request.type === "SYNC_ACTION_REQUEST") {
    const { clerk_id, platform, account_type } = request;
    
    chrome.storage.local.get(['twitter_profile'], async (result) => {
      if (result.twitter_profile) {
        try {
          console.log("Ghost Driver: Initiating Direct Sync for", clerk_id);
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
            broadcastToDashboards({ type: "SYNC_COMPLETE", success: true, profile: data.profile });
          } else {
            const err = await response.json();
            broadcastToDashboards({ type: "SYNC_ERROR", error: err.detail || "Database Sync Failed" });
          }
        } catch (e) {
          console.error("Ghost Sync Error:", e);
          broadcastToDashboards({ type: "SYNC_ERROR", error: "Ghost Driver could not reach the backend." });
        }
      } else {
        broadcastToDashboards({ type: "SESSION_NOT_FOUND", error: "Please open a Twitter tab first to initialize the Ghost Driver." });
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
