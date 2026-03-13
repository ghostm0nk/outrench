// background.js
console.log("Ghost Driver: Hub Active.");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Data coming from Twitter content script
  if (request.type === "TWITTER_PROFILE_FETCHED") {
    console.log("Stashing profile data...", request.data);
    chrome.storage.local.set({ twitter_profile: request.data });
  }

  // 2. Dashboard asking if session is ready
  if (request.type === "CHECK_TWITTER_SESSION") {
    chrome.storage.local.get(['twitter_profile'], (result) => {
      if (result.twitter_profile) {
        // Find the dashboard tab and send it back
        chrome.tabs.query({ url: ["http://localhost:5173/*", "https://outrench.vercel.app/*"] }, (tabs) => {
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, { type: "PROFILE_DATA_READY", data: result.twitter_profile });
          });
        });
      } else {
        console.warn("No stashed profile found. Please open Twitter tab first.");
      }
    });
  }
});
