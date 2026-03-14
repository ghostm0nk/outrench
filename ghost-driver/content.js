// content.js
const IS_TWITTER = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');
const IS_DASHBOARD = window.location.host.includes('localhost') || 
                     window.location.host.includes('127.0.0.1') || 
                     window.location.host.includes('outrench') ||
                     window.location.host.includes('onrender');

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
      fontFamily: 'system-ui, sans-serif', transition: 'all 0.3s cubic-bezier(0.19, 1, 0.22, 1)'
    });
    hud.innerHTML = `<span id="spirit-spinner">✨</span> <span id="spirit-text"></span>`;
    document.body.appendChild(hud);
    
    // Add pulse animation
    const style = document.createElement('style');
    style.innerText = `@keyframes spiritPulse { 0% { opacity: 0.8; } 50% { opacity: 1; transform: scale(1.02); } 100% { opacity: 0.8; } } #spirit-spinner { animation: spiritPulse 1.5s infinite; }`;
    document.head.appendChild(style);
  }
  document.getElementById('spirit-text').innerText = text;
  if (isError) hud.style.borderColor = '#ef4444';
}

// --- SPIRIT'S PHYSICAL HANDS ---

async function simulateTyping(element, text) {
  element.focus();
  element.click();
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const opts = { key: char, keyCode: char.charCodeAt(0), bubbles: true };
    element.dispatchEvent(new KeyboardEvent('keydown', opts));
    
    // Modern input value setting
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const val = element.value || "";
    element.value = val.slice(0, start) + char + val.slice(end);
    element.selectionStart = element.selectionEnd = start + 1;
    
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new KeyboardEvent('keyup', opts));
    await new Promise(r => setTimeout(r, Math.random() * 80 + 40));
  }
  // Hit Enter
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
}

async function autoScroll(times = 2) {
  for (let i = 0; i < times; i++) {
    showSpiritHUD(`Scanning depths... (Layer ${i+1}/${times})`);
    window.scrollTo({ top: window.scrollY + 800, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 2500));
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
  });
  chrome.runtime.onMessage.addListener((msg) => { window.postMessage(msg, "*"); });
}

if (IS_TWITTER) {
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "BEGIN_TYPED_SEARCH") {
      showSpiritHUD(`Manifesting: "${msg.query}"`);
      // 1. Find the search input
      const searchInput = document.querySelector('[data-testid="SearchBox_Search_Input"]');
      if (searchInput) {
        await simulateTyping(searchInput, msg.query);
        // Scraper will be triggered by URL change observer
      } else {
        showSpiritHUD("Search bar hidden. Retrying...", true);
      }
    }
  });

  async function scrapeSearchResults() {
    if (!window.location.href.includes('/search')) return;
    
    showSpiritHUD("Spirit Active: Scouting Market Signals...");
    await new Promise(r => setTimeout(r, 2000)); // Wait for initial results
    
    await autoScroll(3); 

    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const leads = [];

    showSpiritHUD(`Analyzing ${tweets.length} potential signals...`);

    tweets.forEach(tweet => {
      try {
        const userEl = tweet.querySelector('[data-testid="User-Names"]');
        const handleEl = userEl.querySelector('span:last-child');
        const contentEl = tweet.querySelector('[data-testid="tweetText"]');
        const avatarEl = tweet.querySelector('img[src*="profile_images"]');

        if (handleEl && contentEl && !leads.find(l => l.handle === handleEl.innerText.trim())) {
          leads.push({
            handle: handleEl.innerText.trim(),
            name: userEl.querySelector('span:first-child')?.innerText.trim() || handleEl.innerText.trim(),
            avatar_url: avatarEl ? avatarEl.src : null,
            content: contentEl.innerText.trim(),
            reason: "Target identified via AI Strategy."
          });
        }
      } catch (e) {}
    });

    if (leads.length > 0) {
      chrome.runtime.sendMessage({ type: "LEADS_SCRAPED", leads });
      showSpiritHUD(`Success: ${leads.length} Leads captured!`);
      setTimeout(() => document.getElementById('spirit-hud')?.remove(), 3000);
    }
  }

  // SPA Observer
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      const oldUrl = lastUrl;
      lastUrl = location.href;
      if (lastUrl.includes('/search')) {
          scrapeSearchResults();
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // Initial load
  if (location.href.includes('/search')) scrapeSearchResults();
}
