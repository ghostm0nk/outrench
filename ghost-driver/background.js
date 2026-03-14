// background.js
console.log("Ghost Driver: Bridge Online.");

const API_URL = "http://localhost:8000"; 

chrome.action.setBadgeText({ text: "OK" });
chrome.action.setBadgeBackgroundColor({ color: "#10b981" });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "UPDATE_SPIRIT_LOG") {
    chrome.storage.local.set({ spirit_log: request.text });
  }

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
          }
        } catch (e) {}
      }
    });
  }

  if (request.type === "START_MARKET_SCOUT") {
    initiateScout(request.clerk_id);
  }

  if (request.type === "LEADS_SCRAPED") {
    saveLeadsToBackend(request.leads);
  }

  if (request.type === "PERFORM_AUTO_REPLY") {
      const { handle, text } = request;
      performReply(handle, text);
  }
});

async function initiateScout(clerk_id) {
  const targetId = clerk_id || "user_3AtApzHMYUEDxqNg59aVJzCvmrj"; 
  try {
    const resp = await fetch(`${API_URL}/api/market/strategy/${targetId}`);
    const { queries } = await resp.json();
    if (!queries) return;

    const query = queries[Math.floor(Math.random() * queries.length)];
    const homeUrl = `https://x.com/home`;

    chrome.tabs.query({ url: ["*://*.twitter.com/*", "*://*.x.com/*"] }, (tabs) => {
      if (tabs.length > 0) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { url: homeUrl, active: true }, () => {
            setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { type: "BEGIN_TYPED_SEARCH", query });
            }, 3000);
        });
      } else {
        chrome.tabs.create({ url: homeUrl, active: true }, (tab) => {
            setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, { type: "BEGIN_TYPED_SEARCH", query });
            }, 6000);
        });
      }
    });
  } catch (e) {}
}

async function performReply(handle, text) {
    chrome.tabs.query({ url: ["*://*.twitter.com/*", "*://*.x.com/*"] }, (tabs) => {
        if (tabs.length > 0) {
            const tab = tabs[0];
            chrome.tabs.update(tab.id, { active: true }, () => {
                chrome.tabs.sendMessage(tab.id, { type: "GHOST_TYPE_REPLY", handle, text });
            });
        }
    });
}

async function saveLeadsToBackend(leads) {
  let clerkId = "user_3AtApzHMYUEDxqNg59aVJzCvmrj"; 
  for (const lead of leads) {
    try {
      await fetch(`${API_URL}/api/market/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerk_id: clerkId,
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
