import json
import os
import requests
import asyncio
import threading
from typing import List, Dict

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# In-memory credentials store: {clerk_id: {"username": ..., "password": ...}}
# Ephemeral — cleared on server restart. User must run "setup login" again after redeploy.
_stored_credentials: dict = {}

# Per-sweep limits by timeframe — controls how aggressive each session is.
# Scheduling (how often sessions repeat) is handled by the frontend timer.
TIMEFRAME_CONFIG = {
    "1hr":  {"posts": 8,  "max_likes": 3, "max_follows": 2, "max_comments": 1},
    "2hr":  {"posts": 10, "max_likes": 4, "max_follows": 2, "max_comments": 1},
    "5hr":  {"posts": 12, "max_likes": 5, "max_follows": 3, "max_comments": 2},
    "24hr": {"posts": 15, "max_likes": 6, "max_follows": 3, "max_comments": 2},
}
DEFAULT_CONFIG = {"posts": 8, "max_likes": 3, "max_follows": 2, "max_comments": 1}


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


def _evaluate_post(post_text: str, goal: str, startup_context: dict = None) -> dict:
    """
    Synchronous LLM call to evaluate a post and decide how to interact.
    Returns: {"action": "like" | "follow" | "skip", "reason": str}
    """
    if not GROQ_API_KEY:
        return {"action": "skip", "reason": "No API key"}

    if startup_context:
        system = f"""You are Spirit, the AI growth agent for {startup_context.get('name', 'a startup')}.

About the startup:
- What they do: {startup_context.get('one_liner', 'N/A')}
- Target audience: {startup_context.get('target_audience', 'N/A')}
- Problem they solve: {startup_context.get('problem_solved', 'N/A')}
- Unique value: {startup_context.get('unique_value', 'N/A')}
- Tone: {startup_context.get('tone', 'casual')}

Your job is to evaluate X/Twitter posts and decide how to engage on behalf of this startup.

For each post, return a JSON object with:
- "action": one of "like", "follow", "like_and_follow", "comment", or "skip"
- "reason": one short sentence explaining your decision

Guidelines:
- "like" posts from people who match the target audience or are experiencing the problem this startup solves
- "follow" accounts posting consistently relevant content worth tracking
- "like_and_follow" for highly relevant potential customers or partners
- "comment" ONLY for high-traction posts (replies, retweets, or likes suggest visibility) where a thoughtful reply from this startup's perspective would genuinely add value — not just agree or promote
- "skip" for spam, irrelevant content, ads, or people clearly outside the target audience

Return ONLY the JSON object. No markdown, no explanation outside it."""
    else:
        system = """You are Spirit, an autonomous growth agent browsing X/Twitter.
Your job is to evaluate posts and decide how to interact, exactly like a senior market analyst building a personal brand.

For each post, return a JSON object with:
- "action": one of "like", "follow", "like_and_follow", "comment", or "skip"
- "reason": one short sentence explaining your decision

Guidelines:
- "like" posts that are relevant, insightful, or align with the goal
- "follow" accounts posting consistently good content worth tracking
- "like_and_follow" for highly relevant accounts
- "comment" ONLY for high-traction posts where a thoughtful reply would be visible and add real value
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


def _generate_comment(post_text: str, startup_context: dict) -> str:
    """Generate a contextual reply in the startup's voice. Returns comment text or empty string on failure."""
    if not GROQ_API_KEY:
        return ""
    name     = startup_context.get('name', 'us')
    one_liner = startup_context.get('one_liner', '')
    tone     = startup_context.get('tone', 'direct and genuine')
    problem  = startup_context.get('problem_solved', '')

    system = f"""You write short, human X/Twitter replies on behalf of {name} ({one_liner}).
Tone: {tone}.
Core problem we solve: {problem}.

Rules:
- 1-2 sentences max. No hashtags. No emojis unless the tone calls for it.
- Sound like a real person, not a brand account.
- Add genuine value — insight, a question, or a relatable observation.
- Never mention the product name or pitch anything.
- If you can't add value, return exactly: SKIP"""

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("GROQ_MODEL", GROQ_MODEL),
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Write a reply to this post:\n\n{post_text[:400]}"}
                ],
                "temperature": 0.7,
                "max_tokens": 80
            },
            timeout=15.0
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()
        return "" if text == "SKIP" else text
    except Exception:
        return ""


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



async def setup_cookies_interactive(websocket, clerk_id: str = None, supabase=None) -> dict:
    """
    Asks the user for their X browser cookies (auth_token + ct0).
    Go to x.com → F12 → Application → Cookies → x.com → copy values.
    Bypasses Cloudflare — no login request made.
    """
    async def ask(field: str, label: str) -> str:
        await websocket.send_json({"type": "prompt", "field": field, "text": label, "masked": True})
        raw = await websocket.receive_text()
        payload = json.loads(raw)
        if payload.get("type") == "prompt_response" and payload.get("field") == field:
            return payload.get("value", "").strip()
        return ""

    await websocket.send_json({"type": "info", "text": "Go to x.com → F12 → Application tab → Cookies → https://x.com"})

    auth_token = await ask("auth_token", "Paste your 'auth_token' cookie value:")
    if not auth_token:
        await websocket.send_json({"type": "error", "text": "Cancelled — no auth_token provided."})
        return {}

    ct0 = await ask("ct0", "Paste your 'ct0' cookie value:")
    if not ct0:
        await websocket.send_json({"type": "error", "text": "Cancelled — no ct0 provided."})
        return {}

    cookies = {"auth_token": auth_token, "ct0": ct0}
    store_key = clerk_id or "default"
    _stored_credentials[store_key] = cookies

    if supabase and clerk_id:
        try:
            supabase.table("channel_credentials").upsert({
                "clerk_id": clerk_id,
                "platform": "twitter",
                "account_type": "cookie_session",
                "auth_token": json.dumps(cookies),
                "handle": "cookie_auth",
                "name": "cookie_auth",
                "avatar_url": ""
            }, on_conflict="clerk_id,platform,account_type").execute()
        except Exception as db_err:
            await websocket.send_json({"type": "warn", "text": f"Saved in memory only — DB save failed: {str(db_err)[:60]}"})

    await websocket.send_json({"type": "success", "text": "X cookies saved. Now give Spirit a scouting task to begin."})
    return cookies


# ─────────────────────────────────────────────────────────────────────────────
# twikit session — lightweight HTTP-based X client, no browser required.
# Runs in a dedicated OS thread via asyncio.run().
# ─────────────────────────────────────────────────────────────────────────────
async def _run_twikit(goal: str, log_queue: list, num_posts: int, credentials: dict, startup_context: dict = None, limits: dict = None):
    from twikit import Client

    if not credentials:
        log_queue.append(("error", "Not connected to X. Type 'setup cookies' first."))
        log_queue.append(("__results__", []))
        return

    client = Client('en-US')

    # Cookie auth (preferred — bypasses Cloudflare entirely)
    if credentials.get("auth_token") and credentials.get("ct0"):
        log_queue.append(("info", "Connecting to X with session cookies..."))
        client.set_cookies({"auth_token": credentials["auth_token"], "ct0": credentials["ct0"]})
        log_queue.append(("success", "Connected. Searching for relevant posts..."))
    # Username/password fallback
    elif credentials.get("username") and credentials.get("password"):
        log_queue.append(("info", "Connecting to X..."))
        try:
            await client.login(
                auth_info_1=credentials["username"],
                password=credentials["password"]
            )
            log_queue.append(("success", "Connected. Searching for relevant posts..."))
        except Exception as ex:
            log_queue.append(("error", f"Login failed: {str(ex)[:120]}"))
            log_queue.append(("__results__", []))
            return
    else:
        log_queue.append(("error", "No valid credentials. Type 'setup cookies' first."))
        log_queue.append(("__results__", []))
        return

    try:
        tweets = await client.search_tweet(goal, product='Latest', count=num_posts * 2)
        tweet_list = list(tweets)[:num_posts]
    except Exception as ex:
        log_queue.append(("warn", f"Search failed, trying home timeline..."))
        try:
            tweets = await client.get_latest_timeline(count=num_posts * 2)
            tweet_list = list(tweets)[:num_posts]
        except Exception as ex2:
            log_queue.append(("error", f"Could not fetch posts: {str(ex2)[:80]}"))
            log_queue.append(("__results__", []))
            return

    log_queue.append(("info", f"Found {len(tweet_list)} posts. Analyzing with AI..."))

    loop = asyncio.get_event_loop()
    results = []
    lim = limits or DEFAULT_CONFIG
    like_count = follow_count = comment_count = 0

    for idx, tweet in enumerate(tweet_list):
        try:
            post_text = getattr(tweet, 'text', None) or getattr(tweet, 'full_text', None) or "(no text)"
            user = getattr(tweet, 'user', None)
            handle = f"@{user.screen_name}" if user else f"@user_{idx}"

            preview = post_text[:70].replace('\n', ' ')
            log_queue.append(("info", f"Evaluating [{idx+1}/{len(tweet_list)}] {handle}: \"{preview}...\""))

            decision = await loop.run_in_executor(None, _evaluate_post, post_text, goal, startup_context)
            action = decision.get("action", "skip")
            reason = decision.get("reason", "")

            if action == "skip":
                log_queue.append(("warn", f"  → Skip — {reason}"))
                await asyncio.sleep(0.5)
                continue

            # Enforce per-sweep caps — downgrade action if limit reached
            wants_like    = "like" in action
            wants_follow  = "follow" in action
            wants_comment = action == "comment"

            if wants_like   and like_count    >= lim["max_likes"]:    wants_like = False
            if wants_follow and follow_count  >= lim["max_follows"]:  wants_follow = False
            if wants_comment and comment_count >= lim["max_comments"]: wants_comment = False

            if not wants_like and not wants_follow and not wants_comment:
                log_queue.append(("warn", f"  → Cap reached, skipping {handle}"))
                continue

            # Build final action label
            if wants_comment:
                final_action = "comment"
            elif wants_like and wants_follow:
                final_action = "like_and_follow"
            elif wants_like:
                final_action = "like"
            else:
                final_action = "follow"

            log_queue.append(("cmd", f"  → {final_action.upper()} — {reason}"))

            # ── Execute interactions ──────────────────────────────────────────
            comment_text = ""
            try:
                if wants_like:
                    await tweet.favorite()
                    like_count += 1
                    await asyncio.sleep(1.5)

                if wants_follow and user:
                    await client.follow_user(user.id)
                    follow_count += 1
                    await asyncio.sleep(1.5)

                if wants_comment and startup_context:
                    comment_text = await loop.run_in_executor(None, _generate_comment, post_text, startup_context)
                    if comment_text:
                        await tweet.reply(comment_text)
                        comment_count += 1
                        log_queue.append(("info", f"  ↩ Commented: \"{comment_text[:80]}\""))
                        await asyncio.sleep(2.0)

            except Exception as act_err:
                log_queue.append(("warn", f"  Action failed: {str(act_err)[:60]}"))

            results.append({
                "handle": handle,
                "content": post_text[:300],
                "action": final_action,
                "reason": reason,
                "comment": comment_text,
            })

            await asyncio.sleep(2.0)

        except Exception as ex:
            log_queue.append(("warn", f"Skipped post #{idx+1}: {str(ex)[:60]}"))

    log_queue.append(("__results__", results))


def _run_session(goal: str, log_queue: list, num_posts: int = 8, credentials: dict = None, startup_context: dict = None, limits: dict = None):
    """Entry point called from the OS thread — runs twikit async session."""
    asyncio.run(_run_twikit(goal, log_queue, num_posts, credentials, startup_context, limits))


async def stream_agent_logic(user_input: str, websocket, clerk_id: str = None, supabase=None, timeframe: str = None):
    """
    Main execution loop. Runs one sweep — the frontend timer schedules repeats based on timeframe.
    """
    limits = TIMEFRAME_CONFIG.get(timeframe, DEFAULT_CONFIG)
    num_posts = limits["posts"]

    # 1. Fetch startup profile to give Spirit context
    startup_context = None
    if supabase and clerk_id:
        try:
            res = supabase.table("startups").select("*").eq("clerk_id", clerk_id).execute()
            if res.data:
                startup_context = res.data[0]
                startup_name = startup_context.get("name", "your startup")
                await websocket.send_json({"type": "info", "text": f"Spirit loaded profile for {startup_name}."})
            else:
                await websocket.send_json({"type": "warn", "text": "No startup profile found — complete onboarding for smarter scouting."})
        except Exception as e:
            await websocket.send_json({"type": "warn", "text": f"Could not load startup profile: {str(e)[:60]}"})

    # 2. Acknowledge
    await websocket.send_json({"type": "ai_response", "text": f"Spirit activated. Mission: '{user_input}'"})
    await asyncio.sleep(0.3)
    await websocket.send_json({"type": "info", "text": "Initializing X session..."})

    log_queue = []

    # Look up stored credentials — memory first, then Supabase (survives restarts)
    # Priority: cookie_session > playwright_session (username/password)
    store_key = clerk_id or "default"
    credentials = _stored_credentials.get(store_key)
    if not credentials and supabase and clerk_id:
        for account_type in ["cookie_session", "playwright_session"]:
            try:
                res = supabase.table("channel_credentials").select("auth_token").eq("clerk_id", clerk_id).eq("platform", "twitter").eq("account_type", account_type).execute()
                if res.data:
                    credentials = json.loads(res.data[0]["auth_token"])
                    _stored_credentials[store_key] = credentials
                    break
            except Exception:
                pass

    thread = threading.Thread(
        target=_run_session,
        args=(user_input, log_queue, num_posts, credentials, startup_context, limits),
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

    # 3. Save results to DB and stream each lead to frontend
    saved = 0
    for r in results:
        # Stream structured lead card to frontend
        await websocket.send_json({
            "type": "lead",
            "handle": r["handle"],
            "content": r["content"],
            "action": r["action"],
            "reason": r["reason"],
        })
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
