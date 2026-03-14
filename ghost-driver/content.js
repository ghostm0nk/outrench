// content.js
const IS_X = window.location.host.includes('twitter.com') || window.location.host.includes('x.com');

function logToSpirit(text) {
  chrome.runtime.sendMessage({ type: "UPDATE_SPIRIT_LOG", text });
}

// --- PHYSICAL INTERACTION ENGINE ---

async function simulateClick(element) {
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 500));
    element.click();
    return true;
}

async function simulateTyping(element, text) {
  element.focus();
  element.click();
  element.value = "";
  for (const char of text) {
    input.value += char;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 40 + Math.random() * 30));
  }
}

// --- ACTIVE MARKET SCOUT (Clicking & Interacting) ---

async function performActiveScout() {
    if (!window.location.href.includes('/search')) return;
    
    logToSpirit("Spirit: Starting Active Engagement...");
    const tweets = document.querySelectorAll('[data-testid="tweet"]');
    const leads = [];

    // Limit to interacting with the top 3 most relevant ones per scroll
    let interactions = 0;

    for (const tweet of tweets) {
        if (interactions >= 3) break;

        try {
            const handleEl = tweet.querySelector('[data-testid="User-Names"] span:last-child');
            const contentEl = tweet.querySelector('[data-testid="tweetText"]');
            
            if (handleEl && contentEl) {
                const handle = handleEl.innerText.trim();
                const content = contentEl.innerText.trim();

                // 1. Like the tweet (Physical UI Click)
                const likeBtn = tweet.querySelector('[data-testid="like"]');
                if (likeBtn && !tweet.querySelector('[data-testid="unlike"]')) {
                    logToSpirit(`Interacting with ${handle}...`);
                    await simulateClick(likeBtn);
                    interactions++;
                    await new Promise(r => setTimeout(r, 1500));
                }

                leads.push({
                    handle: handle,
                    name: tweet.querySelector('[data-testid="User-Names"] span:first-child')?.innerText.trim() || handle,
                    content: content,
                    avatar_url: tweet.querySelector('img[src*="profile_images"]')?.src || null,
                    reason: "Signal identified and 'Liked' by Spirit."
                });
            }
        } catch (e) {}
    }

    if (leads.length > 0) {
        logToSpirit(`Mission complete: ${leads.length} targets engaged.`);
        chrome.runtime.sendMessage({ type: "LEADS_SCRAPED", leads });
    }
}

// --- MESSAGE RELAY ---

chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "BEGIN_TYPED_SEARCH") {
        logToSpirit(`Objective: Hunt "${msg.query}"`);
        const input = document.querySelector('[data-testid="SearchBox_Search_Input"]');
        if (input) {
            input.focus();
            input.value = "";
            for (const char of msg.query) {
                input.value += char;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                await new Promise(r => setTimeout(r, 50));
            }
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
        } else {
            window.location.href = `https://x.com/search?q=${encodeURIComponent(msg.query)}&f=live`;
        }
    }
});

// Run detection & interaction loop
if (IS_X) {
    setInterval(() => {
        // Only scout if we are in search and haven't in 15s
        if (window.location.href.includes('/search')) {
            if (!window._lastScrape || Date.now() - window._lastScrape > 15000) {
                performActiveScout();
                window._lastScrape = Date.now();
            }
        }
    }, 5000);
}
