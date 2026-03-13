// content.js
const IS_TWITTER = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');
const IS_DASHBOARD = window.location.host.includes('localhost') || 
                     window.location.host.includes('127.0.0.1') || 
                     window.location.host.includes('outrench') ||
                     window.location.host.includes('onrender');

// --- SPIRIT'S PHYSICAL HANDS (Utilities) ---

async function simulateTyping(element, text) {
  element.focus();
  element.click();
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const opts = { key: char, keyCode: char.charCodeAt(0), bubbles: true };
    element.dispatchEvent(new KeyboardEvent('keydown', opts));
    element.dispatchEvent(new KeyboardEvent('keypress', opts));
    
    // For React/Modern apps, we often need to set value and trigger 'input'
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const val = element.value;
    element.value = val.slice(0, start) + char + val.slice(end);
    element.selectionStart = element.selectionEnd = start + 1;
    
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', opts));
    
    // Random delay between 50ms and 150ms to look human
    await new Promise(r => setTimeout(r, Math.random() * 100 + 50));
  }
}

async function autoScroll(times = 3) {
  for (let i = 0; i < times; i++) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 2000)); // wait for load
  }
}

// --- LOGIC ---

if (IS_DASHBOARD) {
  document.documentElement.setAttribute('data-ghost-driver', 'active');
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type === "SYNC_PROFILE_REQUEST") {
      chrome.runtime.sendMessage({ 
        type: "SYNC_ACTION_REQUEST",
        clerk_id: event.data.clerk_id,
        platform: event.data.platform,
        account_type: event.data.account_type
      });
    }
    if (event.data.type === "START_MARKET_SCOUT") {
      chrome.runtime.sendMessage({ 
        type: "START_MARKET_SCOUT",
        clerk_id: event.data.clerk_id
      });
    }
    // New: Auto-Reply Request
    if (event.data.type === "SEND_AUTO_REPLY") {
        chrome.runtime.sendMessage({ 
          type: "PERFORM_AUTO_REPLY",
          handle: event.data.handle,
          text: event.data.text
        });
      }
  });
  chrome.runtime.onMessage.addListener((msg) => {
    window.postMessage(msg, "*");
  });
}

if (IS_TWITTER) {
  // Listen for specific commands from Background
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "GHOST_TYPE_REPLY") {
        // 1. Find the reply box (this is a simplified selector for Twitter's complex layout)
        const replyBox = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (replyBox) {
            await simulateTyping(replyBox, msg.text);
            // Optionally: document.querySelector('[data-testid="tweetButtonInline"]').click();
        }
    }
  });

  function scrapeProfile() {
    const interval = setInterval(() => {
      const handleSelectors = ['[data-testid="SideNav_AccountSwitcher_Badge"] span:last-child', '[data-testid="UserName"] span:last-child'];
      let handle = null;
      for (const sel of handleSelectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = el.innerText || "";
          if (text.includes('@')) { handle = text.trim(); break; }
        }
      }
      if (handle) {
        const nameEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] div:first-child span') || document.querySelector('[data-testid="UserName"] div:first-child span');
        const avatarEl = document.querySelector('[data-testid="SideNav_AccountSwitcher_Badge"] img') || document.querySelector('a[href$="/photo"] img');
        clearInterval(interval);
        chrome.runtime.sendMessage({ type: "TWITTER_PROFILE_FETCHED", data: { handle, name: nameEl ? nameEl.innerText.trim() : handle.replace('@', ''), avatar_url: avatarEl ? avatarEl.src : null, platform: 'twitter' }});
      }
    }, 2000);
    setTimeout(() => clearInterval(interval), 15000);
  }

  async function scrapeSearchResults() {
    if (!window.location.href.includes('/search')) return;
    
    console.log("Ghost Driver: Starting deep scout with Auto-Scroll...");
    await autoScroll(2); // Scroll twice to get more leads

    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const leads = [];

    tweets.forEach(tweet => {
      try {
        const userEl = tweet.querySelector('[data-testid="User-Names"]');
        const handleEl = userEl.querySelector('span:last-child');
        const nameEl = userEl.querySelector('span:first-child');
        const contentEl = tweet.querySelector('[data-testid="tweetText"]');
        const avatarEl = tweet.querySelector('img[src*="profile_images"]');

        if (handleEl && contentEl && !leads.find(l => l.handle === handleEl.innerText.trim())) {
          leads.push({
            handle: handleEl.innerText.trim(),
            name: nameEl ? nameEl.innerText.trim() : handleEl.innerText.trim(),
            avatar_url: avatarEl ? avatarEl.src : null,
            content: contentEl.innerText.trim(),
            reason: "Spirit found a matching pain point."
          });
        }
      } catch (e) {}
    });

    if (leads.length > 0) {
      chrome.runtime.sendMessage({ type: "LEADS_SCRAPED", leads });
    }
  }

  // Monitor URL changes for SPA navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (location.href.includes('/search')) scrapeSearchResults();
      else scrapeProfile();
    }
  }).observe(document, { subtree: true, childList: true });

  if (document.readyState === 'complete') {
    if (window.location.href.includes('/search')) scrapeSearchResults();
    else scrapeProfile();
  }
}
