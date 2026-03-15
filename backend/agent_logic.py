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
# twikit session — lightweight HTTP-based X client, no browser required.
# Runs in a dedicated OS thread via asyncio.run().
# ─────────────────────────────────────────────────────────────────────────────
async def _run_twikit(goal: str, log_queue: list, num_posts: int, credentials: dict):
    from twikit import Client

    if not credentials or not credentials.get("username") or not credentials.get("password"):
        log_queue.append(("error", "Not logged in to X. Type 'setup login' first."))
        log_queue.append(("__results__", []))
        return

    client = Client('en-US')
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

    try:
        tweets = await client.search_tweet(goal, product='Latest', count=num_posts * 2)
        tweet_list = list(tweets)[:num_posts]
    except Exception as ex:
        log_queue.append(("warn", f"Search failed, trying home timeline..."))
        try:
            tweets = await client.get_home_timeline(count=num_posts * 2)
            tweet_list = list(tweets)[:num_posts]
        except Exception as ex2:
            log_queue.append(("error", f"Could not fetch posts: {str(ex2)[:80]}"))
            log_queue.append(("__results__", []))
            return

    log_queue.append(("info", f"Found {len(tweet_list)} posts. Analyzing with AI..."))

    loop = asyncio.get_event_loop()
    results = []

    for idx, tweet in enumerate(tweet_list):
        try:
            post_text = getattr(tweet, 'text', None) or getattr(tweet, 'full_text', None) or "(no text)"
            user = getattr(tweet, 'user', None)
            handle = f"@{user.screen_name}" if user else f"@user_{idx}"

            preview = post_text[:70].replace('\n', ' ')
            log_queue.append(("info", f"Evaluating [{idx+1}/{len(tweet_list)}] {handle}: \"{preview}...\""))

            decision = await loop.run_in_executor(None, _evaluate_post, post_text, goal)
            action = decision.get("action", "skip")
            reason = decision.get("reason", "")

            if action == "skip":
                log_queue.append(("warn", f"  → Skip — {reason}"))
                await asyncio.sleep(0.5)
                continue

            log_queue.append(("cmd", f"  → {action.upper()} — {reason}"))

            if "like" in action:
                try:
                    await tweet.favorite()
                    log_queue.append(("success", f"  ✓ Liked {handle}"))
                    await asyncio.sleep(1.0)
                except Exception as ex:
                    log_queue.append(("warn", f"  Like failed: {str(ex)[:50]}"))

            if "follow" in action and user:
                try:
                    await client.follow_user(user.id)
                    log_queue.append(("success", f"  ✓ Followed {handle}"))
                    await asyncio.sleep(1.5)
                except Exception as ex:
                    log_queue.append(("warn", f"  Follow failed: {str(ex)[:50]}"))

            results.append({
                "handle": handle,
                "content": post_text[:300],
                "action": action,
                "reason": reason
            })

            await asyncio.sleep(1.0)

        except Exception as ex:
            log_queue.append(("warn", f"Skipped post #{idx+1}: {str(ex)[:60]}"))

    log_queue.append(("__results__", results))


def _run_session(goal: str, log_queue: list, num_posts: int = 8, credentials: dict = None):
    """Entry point called from the OS thread — runs twikit async session."""
    asyncio.run(_run_twikit(goal, log_queue, num_posts, credentials))


async def stream_agent_logic(user_input: str, websocket, clerk_id: str = None, supabase=None):
    """
    Main execution loop.
    Ghost Driver opens the home feed, reads posts, evaluates each with the LLM,
    and interacts (like / follow) based on the user's goal.
    """

    # 1. Acknowledge
    await websocket.send_json({"type": "ai_response", "text": f"Ghost Driver activated. Mission: '{user_input}'"})
    await asyncio.sleep(0.3)
    await websocket.send_json({"type": "info", "text": "Initializing X session..."})

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
