// background.js
console.log("Ghost Driver: Bridge Online.");

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
            broadcastToDashboards({ 
              type: "SYNC_COMPLETE", 
              platform, 
              account_type, 
              profile: data.profile 
            });
          } else {
            const err = await response.json();
            broadcastToDashboards({ type: "SYNC_ERROR", error: err.detail || "Database Rejected the Spirit." });
          }
        } catch (e) {
          console.error("Ghost Sync Error:", e);
          broadcastToDashboards({ type: "SYNC_ERROR", error: "Ghost Driver blocked by Network/CORS." });
        }
      } else {
        broadcastToDashboards({ type: "SESSION_NOT_FOUND", error: "Ghost Driver has no Twitter data yet." });
      }
    });
  }

  // 3. Initiate Market Scout
  if (request.type === "START_MARKET_SCOUT") {
    const { clerk_id } = request;
    console.log("Ghost Driver: Starting Market Scout for", clerk_id);
    
    initiateScout(clerk_id);
  }

  // 4. Receving scraped leads from content script
  if (request.type === "LEADS_SCRAPED") {
    saveLeadsToBackend(request.clerk_id, request.leads);
  }
});

async function initiateScout(clerk_id) {
  try {
    // Get strategy from backend
    const resp = await fetch(`${API_URL}/api/market/strategy/${clerk_id}`);
    const { queries } = await resp.json();
    
    if (!queries || queries.length === 0) return;

    // Pick a random query to start with
    const query = queries[Math.floor(Math.random() * queries.length)];
    const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(query)}&f=live`;

    // Find if we already have a twitter tab, otherwise open new
    chrome.tabs.query({ url: "*://*.twitter.com/*" }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url: searchUrl, active: true });
        // Content script will pick it up
      } else {
        chrome.tabs.create({ url: searchUrl, active: true });
      }
    });
  } catch (e) {
    console.error("Failed to start scout:", e);
  }
}

async function saveLeadsToBackend(clerk_id, leads) {
  for (const lead of leads) {
    try {
      await fetch(`${API_URL}/api/market/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerk_id,
          platform: 'twitter',
          handle: lead.handle,
          name: lead.name,
          avatar_url: lead.avatar_url,
          content: lead.content,
          reason: lead.reason
        })
      });
    } catch (e) {
      console.error("Failed to save lead:", lead.handle, e);
    }
  }
  broadcastToDashboards({ type: "SCOUT_STATUS", status: "finished", found: leads.length });
}

function broadcastToDashboards(msg) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && (tab.url.includes("localhost") || tab.url.includes("outrench") || tab.url.includes("onrender"))) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      }
    });
  });
}
