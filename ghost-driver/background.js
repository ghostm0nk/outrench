// background.js
console.log("Ghost Driver: Bridge Online.");

const API_URL = "http://localhost:8000"; 

chrome.action.setBadgeText({ text: "OK" });
chrome.action.setBadgeBackgroundColor({ color: "#10b981" });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TWITTER_PROFILE_FETCHED") {
    chrome.storage.local.set({ twitter_profile: request.data }, () => {
      broadcastToDashboards({ type: "PROFILE_DATA_READY", data: request.data });
    });
  }

  if (request.type === "SYNC_ACTION_REQUEST") {
    const { clerk_id, platform, account_type } = request;
    chrome.storage.local.get(['twitter_profile'], async (result) => {
      if (result.twitter_profile) {
        try {
          const response = await fetch(`${API_URL}/api/channels/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clerk_id, platform, account_type,
              auth_token: "GHOST_DRIVER_SESSION",
              handle: result.twitter_profile.handle,
              name: result.twitter_profile.name,
              avatar_url: result.twitter_profile.avatar_url
            })
          });
          if (response.ok) {
            const data = await response.json();
            broadcastToDashboards({ type: "SYNC_COMPLETE", platform, account_type, profile: data.profile });
          } else {
            broadcastToDashboards({ type: "SYNC_ERROR", error: "Database Rejected the Spirit." });
          }
        } catch (e) {
          broadcastToDashboards({ type: "SYNC_ERROR", error: "Ghost Driver blocked by Network." });
        }
      } else {
        broadcastToDashboards({ type: "SESSION_NOT_FOUND", error: "Open an X tab first." });
      }
    });
  }

  if (request.type === "START_MARKET_SCOUT") {
    initiateScout(request.clerk_id);
  }

  if (request.type === "LEADS_SCRAPED") {
    // We already have the clerk_id in the message or closure
    saveLeadsToBackend(request.leads);
  }
});

async function initiateScout(clerk_id) {
  try {
    const resp = await fetch(`${API_URL}/api/market/strategy/${clerk_id}`);
    const { queries } = await resp.json();
    if (!queries || queries.length === 0) return;

    const query = queries[Math.floor(Math.random() * queries.length)];
    
    // Mission: Go to Home page (Avoid /explore which often triggers login gates for guests)
    const homeUrl = `https://x.com/home`;

    chrome.tabs.query({ url: ["*://*.twitter.com/*", "*://*.x.com/*"] }, (tabs) => {
      if (tabs.length > 0) {
        // If we found a tab, use it. We'll navigate to home once to ensure we have the search bar.
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { url: homeUrl, active: true }, () => {
            // Wait for SPA to settle
            setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { type: "BEGIN_TYPED_SEARCH", query });
            }, 3000);
        });
      } else {
        // No tab? Create one.
        chrome.tabs.create({ url: homeUrl, active: true }, (tab) => {
            setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { type: "BEGIN_TYPED_SEARCH", query });
            }, 6000);
        });
      }
    });
  } catch (e) { console.error("Scout failed:", e); }
}

async function saveLeadsToBackend(leads) {
  // Hardcoded for current dev user, ideally we'd store this in chrome.storage
  let currentClerkId = "user_3AtApzHMYUEDxqNg59aVJzCvmrj"; 

  for (const lead of leads) {
    try {
      await fetch(`${API_URL}/api/market/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerk_id: currentClerkId,
          platform: 'twitter',
          handle: lead.handle,
          name: lead.name,
          avatar_url: lead.avatar_url,
          content: lead.content,
          reason: lead.reason
        })
      });
    } catch (e) {}
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
