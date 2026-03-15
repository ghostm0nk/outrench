import json
import os
import requests
import asyncio
import traceback
import threading
import time
from typing import List, Dict

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# Where we save the browser session so the user only logs in once
SESSION_DIR = os.path.join(os.path.dirname(__file__), "browser_session")

# In-memory credentials store: {clerk_id: {"username": ..., "password": ...}}
# Ephemeral — cleared on server restart. User must run "setup login" again after redeploy.
_stored_credentials: dict = {}


async def get_ai_response(prompt: str, system_prompt: str = "You are a helpful AI assistant.") -> str:
    if not GROQ_API_KEY:
        return "Error: GROQ_API_KEY missing."
    try:
        loop = asyncio.get_event_loop()
        def make_request():
            model = os.getenv("GROQ_MODEL", GROQ_MODEL)
            return requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.3,
                    "max_tokens": 500
                },
                timeout=20.0
            )
        response = await loop.run_in_executor(None, make_request)
        response.raise_for_status()
        return str(response.json()["choices"][0]["message"]["content"]).strip()
    except Exception as e:
        return f"Error connecting to Groq: {str(e)}"


def _evaluate_post(post_text: str, goal: str) -> dict:
    """
    Synchronous LLM call to evaluate a post and decide how to interact.
    Returns: {"action": "like" | "follow" | "skip", "reason": str}
    """
    if not GROQ_API_KEY:
        return {"action": "skip", "reason": "No API key"}

    system = """You are an autonomous growth analyst browsing X/Twitter.
Your job is to evaluate posts and decide how to interact, exactly like a senior market analyst building a personal brand.

For each post, return a JSON object with:
- "action": one of "like", "follow", "like_and_follow", or "skip"
- "reason": one short sentence explaining your decision

Guidelines:
- "like" posts that are relevant, insightful, or align with the goal
- "follow" accounts posting consistently good content worth tracking
- "like_and_follow" for highly relevant accounts
- "skip" for spam, irrelevant content, or ads

Return ONLY the JSON object. No markdown, no explanation outside it."""

    prompt = f"Goal: {goal}\n\nPost text:\n{post_text[:400]}"

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("GROQ_MODEL", GROQ_MODEL),
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 120
            },
            timeout=15.0
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        return json.loads(text[start:end])
    except Exception as ex:
        return {"action": "skip", "reason": f"Eval error: {str(ex)[:40]}"}

async def setup_login_interactive(websocket, clerk_id: str = None, supabase=None) -> dict:
    """
    Asks the user for X/Twitter credentials interactively through the browser terminal.
    Sends 'prompt' messages and awaits 'prompt_response' replies over the WebSocket.
    Stores credentials in memory AND persists to Supabase so they survive server restarts.
    Returns {"username": ..., "password": ...} or {} if the user cancels.
    """
    async def ask(field: str, label: str, masked: bool) -> str:
        await websocket.send_json({"type": "prompt", "field": field, "text": label, "masked": masked})
        raw = await websocket.receive_text()
        payload = json.loads(raw)
        if payload.get("type") == "prompt_response" and payload.get("field") == field:
            return payload.get("value", "").strip()
        return ""

    await websocket.send_json({"type": "info", "text": "Spirit needs your X credentials to operate."})

    username = await ask("username", "Enter your X/Twitter username (without @):", False)
    if not username:
        await websocket.send_json({"type": "error", "text": "Login cancelled — no username provided."})
        return {}

    password = await ask("password", "Enter your X/Twitter password:", True)
    if not password:
        await websocket.send_json({"type": "error", "text": "Login cancelled — no password provided."})
        return {}

    creds = {"username": username, "password": password}

    # Store in memory for this session
    store_key = clerk_id or "default"
    _stored_credentials[store_key] = creds

    # Persist to Supabase so credentials survive server restarts
    if supabase and clerk_id:
        try:
            supabase.table("channel_credentials").upsert({
                "clerk_id": clerk_id,
                "platform": "twitter",
                "account_type": "playwright_session",
                "auth_token": json.dumps({"username": username, "password": password}),
                "handle": username,
                "name": username,
                "avatar_url": ""
            }, on_conflict="clerk_id,platform,account_type").execute()
        except Exception as db_err:
            await websocket.send_json({"type": "warn", "text": f"Saved in memory only — DB save failed: {str(db_err)[:60]}"})

    await websocket.send_json({"type": "success", "text": f"Credentials saved for @{username}. Now give Spirit a scouting task to begin."})
    return creds



# ─────────────────────────────────────────────────────────────────────────────
# Playwright runs as a pure sync session in a dedicated OS thread.
# Uses sync_playwright — no event loop, no Windows asyncio conflict.
# ─────────────────────────────────────────────────────────────────────────────
def _run_session(goal: str, log_queue: list, num_posts: int = 8, credentials: dict = None):
    from playwright.sync_api import sync_playwright
    import os

    os.makedirs(SESSION_DIR, exist_ok=True)

    # Use headless=True on cloud (Render has no display). Set PLAYWRIGHT_HEADLESS=0 locally to watch.
    headless = os.getenv("PLAYWRIGHT_HEADLESS", "1") != "0"

    try:
        with sync_playwright() as p:
            # Use persistent context — saves login cookies between runs
            context = p.chromium.launch_persistent_context(
                SESSION_DIR,
                headless=headless,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--no-first-run',
                    '--no-default-browser-check',
                ],
                user_agent=(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                    'AppleWebKit/537.36 (KHTML, like Gecko) '
                    'Chrome/120.0.0.0 Safari/537.36'
                ),
                viewport={'width': 1280, 'height': 800}
            )

            page = context.new_page() if len(context.pages) == 0 else context.pages[0]

            log_queue.append(("info", "Navigating to X/Twitter home..."))
            try:
                page.goto("https://x.com/home", wait_until="domcontentloaded", timeout=30000)
            except Exception:
                pass

            time.sleep(3)

            # Detect login state by DOM — NOT by URL.
            # X stays on x.com/home whether logged in or not, so URL check is unreliable.
            # The compose button only appears when logged in.
            try:
                page.wait_for_selector(
                    '[data-testid="SideNav_NewTweet_Button"], input[autocomplete="username"]',
                    timeout=10000
                )
            except Exception:
                pass
            is_logged_in = page.locator('[data-testid="SideNav_NewTweet_Button"]').count() > 0

            if not is_logged_in:
                if credentials and credentials.get("username") and credentials.get("password"):
                    log_queue.append(("info", "Not logged in — auto-logging in with stored credentials..."))
                    try:
                        # Step 1: Enter username
                        page.goto("https://x.com/i/flow/login", wait_until="domcontentloaded", timeout=20000)
                        time.sleep(2)
                        username_input = page.locator('input[autocomplete="username"]').first
                        username_input.wait_for(timeout=8000)
                        username_input.fill(credentials["username"])
                        page.keyboard.press("Enter")
                        time.sleep(2)

                        # Step 2: Enter password (may need to skip "enter phone/email" step)
                        password_input = page.locator('input[type="password"]').first
                        if password_input.count() == 0:
                            # X sometimes asks for email/phone first — skip by re-entering username
                            extra = page.locator('input[data-testid="ocfEnterTextTextInput"]').first
                            if extra.count() > 0:
                                extra.fill(credentials["username"])
                                page.keyboard.press("Enter")
                                time.sleep(2)
                            password_input = page.locator('input[type="password"]').first

                        password_input.wait_for(timeout=8000)
                        password_input.fill(credentials["password"])
                        page.keyboard.press("Enter")
                        time.sleep(4)

                        # Wait for redirect to home
                        deadline = time.time() + 30
                        while time.time() < deadline:
                            if "home" in page.url:
                                break
                            time.sleep(1)
                        else:
                            log_queue.append(("error", "Auto-login failed — wrong credentials or X blocked the login. Try 'setup login' again."))
                            context.close()
                            log_queue.append(("__results__", []))
                            return

                        log_queue.append(("success", "Logged in successfully."))
                        time.sleep(2)

                    except Exception as login_ex:
                        log_queue.append(("error", f"Auto-login error: {str(login_ex)[:100]}"))
                        context.close()
                        log_queue.append(("__results__", []))
                        return
                else:
                    log_queue.append(("error", "Not logged in to X. Type 'setup login' first to connect your account."))
                    context.close()
                    log_queue.append(("__results__", []))
                    return

            log_queue.append(("success", "Logged in. Reading home feed..."))
            
            # Scroll down a bit to load more posts
            page.evaluate("window.scrollBy(0, 300)")
            time.sleep(1.5)

            # Grab posts from the feed
            tweet_locator = page.locator('article[data-testid="tweet"]')
            
            # Wait for feed to have posts
            try:
                page.wait_for_selector('article[data-testid="tweet"]', timeout=10000)
            except Exception:
                log_queue.append(("warn", "Feed took too long to load. Try again."))
                context.close()
                log_queue.append(("__results__", []))
                return

            count = tweet_locator.count()
            log_queue.append(("info", f"Found {count} posts in feed. Analyzing with AI..."))

            results = []

            for idx in range(min(num_posts, count)):
                try:
                    tweet = tweet_locator.nth(idx)

                    # Get post text
                    text_el = tweet.locator('[data-testid="tweetText"]')
                    post_text = text_el.inner_text(timeout=2000) if text_el.count() > 0 else "(no text)"

                    # Get author handle
                    handle_el = tweet.locator('[data-testid="User-Name"] a[href*="/"]').first
                    profile_url = handle_el.get_attribute("href", timeout=2000) if handle_el.count() > 0 else ""
                    handle = f"@{profile_url.strip('/').split('/')[-1]}" if profile_url else f"@user_{idx}"

                    preview = post_text[:70].replace('\n', ' ')
                    log_queue.append(("info", f"Evaluating [{idx+1}/{min(num_posts, count)}] {handle}: \"{preview}...\""))

                    # Ask LLM what to do with this post
                    decision = _evaluate_post(post_text, goal)
                    action = decision.get("action", "skip")
                    reason = decision.get("reason", "")

                    if action == "skip":
                        log_queue.append(("warn", f"  → Skip — {reason}"))
                        time.sleep(0.3)
                        continue

                    log_queue.append(("cmd", f"  → {action.upper()} — {reason}"))

                    # Execute the action
                    if "like" in action:
                        try:
                            like_btn = tweet.locator('[data-testid="like"]')
                            if like_btn.count() > 0:
                                like_btn.first.click()
                                time.sleep(0.8)
                                log_queue.append(("success", f"  ✓ Liked {handle}"))
                        except Exception as ex:
                            log_queue.append(("warn", f"  Like failed: {str(ex)[:40]}"))

                    if "follow" in action:
                        try:
                            # Click through to their profile to follow
                            handle_el.first.click()
                            time.sleep(2)
                            
                            follow_btn = page.locator('[data-testid="placementTracking"] [data-testid*="follow"]').filter(has_text="Follow").first
                            if follow_btn.count() > 0:
                                follow_btn.click()
                                time.sleep(1)
                                log_queue.append(("success", f"  ✓ Followed {handle}"))
                            
                            # Go back to feed
                            page.go_back()
                            time.sleep(2)
                            
                            # Re-anchor tweet locator after navigation
                            tweet_locator = page.locator('article[data-testid="tweet"]')
                        except Exception as ex:
                            log_queue.append(("warn", f"  Follow failed: {str(ex)[:40]}"))
                            try:
                                page.go_back()
                                time.sleep(2)
                                tweet_locator = page.locator('article[data-testid="tweet"]')
                            except Exception:
                                pass

                    results.append({
                        "handle": handle,
                        "content": post_text[:300],
                        "action": action,
                        "reason": reason
                    })

                    time.sleep(1.0)  # Natural pacing

                except Exception as ex:
                    log_queue.append(("warn", f"Skipped post #{idx+1}: {str(ex)[:60]}"))

            log_queue.append(("info", "Closing browser..."))
            context.close()
            log_queue.append(("__results__", results))

    except Exception as ex:
        tb = traceback.format_exc()
        print(f"[PLAYWRIGHT THREAD ERROR]\n{tb}")
        error_name = str(ex) if str(ex) else type(ex).__name__
        log_queue.append(("error", f"Session error: {error_name}"))
        log_queue.append(("__results__", []))


async def stream_agent_logic(user_input: str, websocket, clerk_id: str = None, supabase=None):
    """
    Main execution loop.
    Ghost Driver opens the home feed, reads posts, evaluates each with the LLM,
    and interacts (like / follow) based on the user's goal.
    """

    # 1. Acknowledge
    await websocket.send_json({"type": "ai_response", "text": f"Ghost Driver activated. Mission: '{user_input}'"})
    await asyncio.sleep(0.3)
    await websocket.send_json({"type": "info", "text": "Spawning browser session..."})

    log_queue = []

    # Look up stored credentials — memory first, then Supabase (survives restarts)
    store_key = clerk_id or "default"
    credentials = _stored_credentials.get(store_key)
    if not credentials and supabase and clerk_id:
        try:
            res = supabase.table("channel_credentials").select("auth_token").eq("clerk_id", clerk_id).eq("platform", "twitter").eq("account_type", "playwright_session").execute()
            if res.data:
                credentials = json.loads(res.data[0]["auth_token"])
                _stored_credentials[store_key] = credentials  # Cache in memory
        except Exception:
            pass

    thread = threading.Thread(
        target=_run_session,
        args=(user_input, log_queue, 8, credentials),
        daemon=True
    )
    thread.start()

    # 2. Stream logs in real-time while browser runs
    results = []
    while thread.is_alive() or log_queue:
        if log_queue:
            msg_type, msg_text = log_queue.pop(0)
            if msg_type == "__results__":
                results = msg_text
            else:
                await websocket.send_json({"type": msg_type, "text": msg_text})
        else:
            await asyncio.sleep(0.15)

    thread.join(timeout=5)

    # 3. Save results to DB as leads
    saved = 0
    for r in results:
        if supabase and clerk_id:
            try:
                supabase.table("market_leads").insert({
                    "clerk_id": clerk_id,
                    "platform": "twitter",
                    "handle": r["handle"],
                    "name": r["action"],
                    "content": r["content"],
                    "reason": r["reason"],
                    "avatar_url": ""
                }).execute()
                saved += 1
            except Exception as db_err:
                await websocket.send_json({"type": "warn", "text": f"DB: {str(db_err)[:80]}"})

    # 4. Session summary
    likes = sum(1 for r in results if "like" in r.get("action",""))
    follows = sum(1 for r in results if "follow" in r.get("action",""))
    await websocket.send_json({"type": "success", "text": f"Session complete — {likes} likes, {follows} follows, {len(results)} interactions saved."})
