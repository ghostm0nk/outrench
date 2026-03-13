// background.js
console.log("Ghost Driver: Bridge Online.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Twitter Scraper pushing data
  if (request.type === "TWITTER_PROFILE_FETCHED") {
    console.log("Stashing Twitter session for:", request.data.handle);
    chrome.storage.local.set({ twitter_profile: request.data }, () => {
      // Notify any open dashboard tabs that data is fresh
      broadcastToDashboards({ type: "PROFILE_DATA_READY", data: request.data });
    });
  }

  // 2. Dashboard requesting current stashed session
  if (request.type === "CHECK_TWITTER_SESSION") {
    chrome.storage.local.get(['twitter_profile'], (result) => {
      if (result.twitter_profile) {
        console.log("Session found. Sending to dashboard...");
        chrome.tabs.sendMessage(sender.tab.id, { type: "PROFILE_DATA_READY", data: result.twitter_profile });
      } else {
        console.warn("No stashed Twitter session found.");
        chrome.tabs.sendMessage(sender.tab.id, { type: "SESSION_NOT_FOUND", error: "Please open a Twitter tab first to initialize the Ghost Driver." });
      }
    });
  }
});

function broadcastToDashboards(msg) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && (tab.url.includes("localhost") || tab.url.includes("outrench"))) {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {}); // ignore inactive tabs
      }
    });
  });
}
