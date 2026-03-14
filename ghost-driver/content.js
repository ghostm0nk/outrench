// content.js
const IS_X = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');
const IS_DASHBOARD = window.location.host.includes('localhost') || 
                     window.location.host.includes('outrench') ||
                     window.location.host.includes('onrender');

function logToSpirit(text) {
  console.log(`Spirit: ${text}`);
  chrome.runtime.sendMessage({ type: "UPDATE_SPIRIT_LOG", text });
}

// --- SPIRIT'S HUD ---
function showSpiritHUD(text, isError = false) {
  let hud = document.getElementById('spirit-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'spirit-hud';
    Object.assign(hud.style, {
      position: 'fixed', top: '20px', right: '20px',
      background: 'rgba(15, 12, 8, 0.95)',
      color: '#f59e0b', padding: '12px 18px',
      borderRadius: '12px', fontSize: '12px',
      fontWeight: '700', zIndex: '999999',
      border: '1px solid rgba(245,158,11,0.5)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: '10px',
      fontFamily: 'system-ui, sans-serif'
    });
    hud.innerHTML = `<span id="spirit-spinner">✨</span> <span id="spirit-text"></span>`;
    document.body.appendChild(hud);
  }
  document.getElementById('spirit-text').innerText = text;
  if (isError) hud.style.borderColor = '#ef4444';
}

// --- PHYSICAL INTERACTION ENGINE ---

async function simulateTyping(element, text) {
  element.focus();
  element.click();
  
  // Clear existing
  element.value = "";
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const opts = { key: char, keyCode: char.charCodeAt(0), bubbles: true };
    element.dispatchEvent(new KeyboardEvent('keydown', opts));
    element.value += char;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', opts));
    await new Promise(r => setTimeout(r, Math.random() * 50 + 20));
  }
}

async function autoScroll(times = 3) {
  for (let i = 0; i < times; i++) {
    logToSpirit(`Scrolling list (Layer ${i+1}/${times})...`);
    window.scrollTo({ top: window.scrollY + 1000, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 3000)); 
  }
}

// --- LOGIC ---

if (IS_DASHBOARD) {
  document.documentElement.setAttribute('data-ghost-driver', 'active');
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data.type === "SYNC_PROFILE_REQUEST") {
      chrome.runtime.sendMessage({ type: "SYNC_ACTION_REQUEST", clerk_id: event.data.clerk_id, platform: event.data.platform, account_type: event.data.account_type });
    }
    if (event.data.type === "START_MARKET_SCOUT") {
      chrome.runtime.sendMessage({ type: "START_MARKET_SCOUT", clerk_id: event.data.clerk_id });
    }
    if (event.data.type === "SEND_AUTO_REPLY") {
      chrome.runtime.sendMessage({ type: "PERFORM_AUTO_REPLY", handle: event.data.handle, text: event.data.text });
    }
  });
  chrome.runtime.onMessage.addListener((msg) => { window.postMessage(msg, "*"); });
}

if (IS_X) {
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "BEGIN_TYPED_SEARCH") {
      logToSpirit("Mission Received: Investigating pain points.");
      showSpiritHUD(`Objective: Find "${msg.query}"`);
      let searchInput = document.querySelector('[data-testid="SearchBox_Search_Input"]');
      if (searchInput) {
        await simulateTyping(searchInput, msg.query);
        setTimeout(() => {
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        }, 500);
      } else {
        window.location.href = `https://x.com/search?q=${encodeURIComponent(msg.query)}&f=live`;
      }
    }

    if (msg.type === "GHOST_TYPE_REPLY") {
        logToSpirit(`Mission: Responding to ${msg.handle}`);
        showSpiritHUD(`Interacting with ${msg.handle}...`);
        
        // 1. Find the tweet by this handle on the current page
        const tweets = document.querySelectorAll('[data-testid="tweet"]');
        let targetTweet = null;
        tweets.forEach(t => {
            if (t.innerText.includes(msg.handle)) targetTweet = t;
        });

        if (targetTweet) {
            // 2. Click Reply button
            const replyBtn = targetTweet.querySelector('[data-testid="reply"]');
            if (replyBtn) {
                replyBtn.click();
                logToSpirit("Opening reply box...");
                
                // 3. Wait for modal and type
                setTimeout(async () => {
                    const editor = document.querySelector('[data-testid="tweetTextarea_0"]');
                    if (editor) {
                        await simulateTyping(editor, msg.text);
                        logToSpirit("Spirit Reply Drafted. Awaiting final user approval or auto-send...");
                        // For safety, we'll let the user hit 'Reply' themselves for now, 
                        // or we can uncomment below to full auto:
                        // document.querySelector('[data-testid="tweetButtonInline"]').click();
                    }
                }, 1500);
            }
        } else {
            logToSpirit(`Could not find ${msg.handle} on page. Try scrolling.`);
            showSpiritHUD(`Target ${msg.handle} lost.`, true);
        }
    }
  });

  async function scrapeSearchResults() {
    if (!window.location.href.includes('/search')) return;
    showSpiritHUD("Spirit: Extracting Leads...");
    await autoScroll(2); 
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const leads = [];
    tweets.forEach(tweet => {
      try {
        const userEl = tweet.querySelector('[data-testid="User-Names"]');
        const handleEl = userEl.querySelector('span:last-child');
        const contentEl = tweet.querySelector('[data-testid="tweetText"]');
        if (handleEl && contentEl && !leads.find(l => l.handle === handleEl.innerText.trim())) {
          leads.push({
            handle: handleEl.innerText.trim(),
            name: userEl.querySelector('span:first-child')?.innerText.trim() || handleEl.innerText.trim(),
            avatar_url: tweet.querySelector('img[src*="profile_images"]')?.src || null,
            content: contentEl.innerText.trim(),
            reason: "Identified via AI strategy."
          });
        }
      } catch (e) {}
    });
    if (leads.length > 0) {
      chrome.runtime.sendMessage({ type: "LEADS_SCRAPED", leads });
      showSpiritHUD(`${leads.length} Leads Sent!`);
    }
  }

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (lastUrl.includes('/search')) scrapeSearchResults();
    }
  }).observe(document, { subtree: true, childList: true });
}
