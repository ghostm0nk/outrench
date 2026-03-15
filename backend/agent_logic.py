import json
import os
import requests
import asyncio
import threading
from typing import List, Dict

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

# In-memory credentials store: {clerk_id: {"username": ..., "password": ...}}
_stored_credentials: dict = {}

# Per-sweep limits by timeframe.
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
            return requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
                json={
                    "model": os.getenv("GROQ_MODEL", GROQ_MODEL),
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


def _generate_search_queries(startup_context: dict, user_goal: str = "") -> list:
    """
    Generate targeted X/Twitter search queries from startup context.
    Returns 3-4 specific queries Spirit will search across in one session.
    Falls back to user_goal if AI call fails or no context.
    """
    if not GROQ_API_KEY or not startup_context:
        return [user_goal] if user_goal else ["founder personal brand growth", "building in public"]

    name     = startup_context.get("name", "")
    problem  = startup_context.get("problem_solved", "")
    audience = startup_context.get("target_audience", "founders")
    mode     = startup_context.get("mode", "growth")

    system = """You generate targeted X/Twitter search queries for founder growth.

Return ONLY a JSON array of 4 short search query strings.
Each query should find people actively experiencing the problem OR discussing the space.
Focus on: complaint language, advice-seeking, building-in-public posts, pain points.
Write queries the way real people tweet — no hashtags, 2-5 words each."""

    prompt = f"""Startup: {name}
Problem it solves: {problem}
Target audience: {audience}
Mode: {mode}
User's session goal hint: {user_goal}

Generate 4 X/Twitter search queries to find this audience right now."""

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
                "temperature": 0.4,
                "max_tokens": 150
            },
            timeout=15.0
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()
        start = text.find("[")
        end   = text.rfind("]") + 1
        queries = json.loads(text[start:end])
        return [q for q in queries if q][:4]
    except Exception:
        return [user_goal] if user_goal else ["founder growth twitter", "building in public"]


def _evaluate_post(post_text: str, goal: str, startup_context: dict = None) -> dict:
    """
    Evaluate a post and decide how to interact.
    Priority (highest ROI first): comment > like_and_follow > follow > like > skip
    Returns: {"action": "like" | "follow" | "like_and_follow" | "comment" | "skip", "reason": str}
    """
    if not GROQ_API_KEY:
        return {"action": "skip", "reason": "No API key"}

    if startup_context:
        name     = startup_context.get("name", "a startup")
        one_liner = startup_context.get("one_liner", "")
        audience = startup_context.get("target_audience", "founders")
        problem  = startup_context.get("problem_solved", "")
        tone     = startup_context.get("tone", "direct and genuine")
        mode     = startup_context.get("mode", "growth")

        system = f"""You are Spirit, the AI growth agent working for {name} — {one_liner}.
The account owner is a founder trying to grow their personal brand on X/Twitter.
Current mode: {mode}.

Target audience: {audience}
Problem {name} solves: {problem}

ACTION PRIORITY (use the highest-value action that fits):
1. "comment" — A thoughtful reply. Use when: the post has traction (likes/replies visible), the author is a real founder sharing a struggle/milestone/insight, and a reply from {name}'s founder perspective would genuinely add value. This is the most visible and highest-ROI action.
2. "like_and_follow" — For accounts consistently posting highly relevant content worth tracking long-term.
3. "follow" — For relevant accounts posting in the right space, even if this specific post isn't comment-worthy.
4. "like" — Quick acknowledgment for relevant posts not worth a comment or follow.
5. "skip" — Use for everything else.

ENGAGE with posts that show:
- A founder venting about growth, visibility, or audience-building struggles
- Someone asking for advice on building in public, personal branding, or the problem {name} solves
- A milestone post (launched something, hit a number, learned something hard)
- A genuine building-in-public update with real substance
- High-traction conversation where {name}'s perspective adds something real

SKIP immediately if:
- It looks like an ad, sponsored post, or brand account promotion
- It's a retweet or quote tweet with no original thinking
- It's a bot, spam, or engagement-bait ("follow for follow", "like this if...")
- The poster is a large company, media outlet, or influencer brand — not a real founder
- It's unrelated to founders, startups, growth, or the problem {name} solves

Return ONLY a JSON object. No markdown, no explanation outside it:
{{"action": "...", "reason": "one short sentence"}}"""

    else:
        system = """You are Spirit, a growth agent for a founder building their personal brand on X/Twitter.

ACTION PRIORITY:
1. "comment" — For high-traction posts where a genuine insight from a founder's perspective adds real value
2. "like_and_follow" — For highly relevant accounts worth tracking long-term
3. "follow" — For relevant accounts posting in the founder/startup space
4. "like" — For relevant posts not worth a comment or follow
5. "skip" — For ads, bots, spam, brands, irrelevant content

Focus on: founders building in public, startup growth discussions, personal brand building.
Skip: brand accounts, ads, retweets without commentary, bots, engagement bait.

Return ONLY a JSON object:
{"action": "...", "reason": "one short sentence"}"""

    prompt = f"Search context: {goal}\n\nPost:\n{post_text[:500]}"

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
        text  = response.json()["choices"][0]["message"]["content"].strip()
        start = text.find("{")
        end   = text.rfind("}") + 1
        return json.loads(text[start:end])
    except Exception as ex:
        return {"action": "skip", "reason": f"Eval error: {str(ex)[:40]}"}


def _generate_comment(post_text: str, startup_context: dict) -> str:
    """
    Generate a contextual reply in the founder's voice.
    Sounds like a real person, never pitches, always adds value.
    Returns comment text or empty string if Spirit can't add value.
    """
    if not GROQ_API_KEY:
        return ""

    name      = startup_context.get("name", "us")
    one_liner = startup_context.get("one_liner", "")
    tone      = startup_context.get("tone", "direct and genuine")
    problem   = startup_context.get("problem_solved", "")
    audience  = startup_context.get("target_audience", "founders")

    system = f"""You write X/Twitter replies for the founder of {name} ({one_liner}).

You speak in first person as the founder. Tone: {tone}.
You deeply understand this problem: {problem} — because you're building a solution for it.
Your audience: {audience}.

Rules:
- 1-2 sentences max. No hashtags. No emojis unless the tone strongly calls for it.
- Sound like a real founder who genuinely relates to this post — not a brand, not a bot.
- Add real value: a hard-earned insight, a question that opens a conversation, or a relatable observation.
- NEVER pitch the product or mention {name} by name. This is relationship building, not marketing.
- For struggle posts: lead with empathy, then share a genuine insight or ask a real question.
- For milestone posts: lead with honest acknowledgment, then add a perspective or ask something interesting.
- For advice posts: engage with the substance, share a real take.
- If you genuinely cannot add value to this specific post, return exactly: SKIP"""

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": os.getenv("GROQ_MODEL", GROQ_MODEL),
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": f"Write a reply to this post:\n\n{post_text[:500]}"}
                ],
                "temperature": 0.75,
                "max_tokens": 100
            },
            timeout=15.0
        )
        response.raise_for_status()
        text = response.json()["choices"][0]["message"]["content"].strip()
        # Strip wrapping quotes if model added them
        if text.startswith('"') and text.endswith('"'):
            text = text[1:-1].strip()
        return "" if text == "SKIP" else text
    except Exception:
        return ""


async def setup_login_interactive(websocket, clerk_id: str = None, supabase=None) -> dict:
    """
    Asks the user for X/Twitter credentials interactively through the browser terminal.
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
    store_key = clerk_id or "default"
    _stored_credentials[store_key] = creds

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
# ─────────────────────────────────────────────────────────────────────────────
async def _run_twikit(goal: str, log_queue: list, num_posts: int, credentials: dict, startup_context: dict = None, limits: dict = None):
    from twikit import Client

    if not credentials:
        log_queue.append(("error", "Not connected to X. Type 'setup cookies' first."))
        log_queue.append(("__results__", []))
        return

    client = Client('en-US')

    # Cookie auth (preferred — bypasses Cloudflare)
    if credentials.get("auth_token") and credentials.get("ct0"):
        log_queue.append(("info", "Connecting to X with session cookies..."))
        client.set_cookies({"auth_token": credentials["auth_token"], "ct0": credentials["ct0"]})
        log_queue.append(("success", "Connected."))
    elif credentials.get("username") and credentials.get("password"):
        log_queue.append(("info", "Connecting to X..."))
        try:
            await client.login(
                auth_info_1=credentials["username"],
                password=credentials["password"]
            )
            log_queue.append(("success", "Connected."))
        except Exception as ex:
            log_queue.append(("error", f"Login failed: {str(ex)[:120]}"))
            log_queue.append(("__results__", []))
            return
    else:
        log_queue.append(("error", "No valid credentials. Type 'setup cookies' first."))
        log_queue.append(("__results__", []))
        return

    # Generate targeted search queries from startup context
    log_queue.append(("info", "Spirit is identifying the best search targets..."))
    queries = _generate_search_queries(startup_context, goal)
    log_queue.append(("cmd", f"Search queries: {' | '.join(queries)}"))

    # Fetch posts across all queries, deduplicate by tweet ID
    seen_ids = set()
    tweet_list = []
    per_query = max(4, (num_posts * 2) // len(queries))

    for query in queries:
        if len(tweet_list) >= num_posts * 2:
            break
        try:
            results = await client.search_tweet(query, product='Latest', count=per_query)
            for tweet in list(results):
                tweet_id = getattr(tweet, 'id', None)
                if tweet_id and tweet_id not in seen_ids:
                    seen_ids.add(tweet_id)
                    tweet_list.append(tweet)
        except Exception as ex:
            log_queue.append(("warn", f"Search '{query}' failed: {str(ex)[:60]}"))

    # Fallback to home timeline if all searches failed
    if not tweet_list:
        log_queue.append(("warn", "All searches failed — falling back to home timeline..."))
        try:
            results = await client.get_latest_timeline(count=num_posts * 2)
            tweet_list = list(results)
        except Exception as ex2:
            log_queue.append(("error", f"Could not fetch posts: {str(ex2)[:80]}"))
            log_queue.append(("__results__", []))
            return

    tweet_list = tweet_list[:num_posts]
    log_queue.append(("info", f"Found {len(tweet_list)} posts across {len(queries)} searches. Analyzing..."))

    loop     = asyncio.get_event_loop()
    results  = []
    lim      = limits or DEFAULT_CONFIG
    like_count = follow_count = comment_count = 0

    for idx, tweet in enumerate(tweet_list):
        try:
            post_text = getattr(tweet, 'text', None) or getattr(tweet, 'full_text', None) or "(no text)"
            user      = getattr(tweet, 'user', None)
            handle    = f"@{user.screen_name}" if user else f"@user_{idx}"

            preview = post_text[:70].replace('\n', ' ')
            log_queue.append(("info", f"[{idx+1}/{len(tweet_list)}] {handle}: \"{preview}...\""))

            decision = await loop.run_in_executor(None, _evaluate_post, post_text, goal, startup_context)
            action   = decision.get("action", "skip")
            reason   = decision.get("reason", "")

            if action == "skip":
                log_queue.append(("warn", f"  → Skip — {reason}"))
                await asyncio.sleep(0.5)
                continue

            # Enforce per-sweep caps — downgrade if limit reached
            wants_like    = "like" in action
            wants_follow  = "follow" in action
            wants_comment = action == "comment"

            if wants_like    and like_count    >= lim["max_likes"]:    wants_like    = False
            if wants_follow  and follow_count  >= lim["max_follows"]:  wants_follow  = False
            if wants_comment and comment_count >= lim["max_comments"]: wants_comment = False

            if not wants_like and not wants_follow and not wants_comment:
                log_queue.append(("warn", f"  → Cap reached, skipping {handle}"))
                continue

            # Final action label
            if wants_comment:
                final_action = "comment"
            elif wants_like and wants_follow:
                final_action = "like_and_follow"
            elif wants_like:
                final_action = "like"
            else:
                final_action = "follow"

            log_queue.append(("cmd", f"  → {final_action.upper()} — {reason}"))

            # Execute interactions
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
                        await asyncio.sleep(2.5)

            except Exception as act_err:
                log_queue.append(("warn", f"  Action failed: {str(act_err)[:60]}"))

            results.append({
                "handle":  handle,
                "content": post_text[:300],
                "action":  final_action,
                "reason":  reason,
                "comment": comment_text,
            })

            await asyncio.sleep(2.0)

        except Exception as ex:
            log_queue.append(("warn", f"Skipped post #{idx+1}: {str(ex)[:60]}"))

    log_queue.append(("__results__", results))


def _run_session(goal: str, log_queue: list, num_posts: int = 8, credentials: dict = None, startup_context: dict = None, limits: dict = None):
    """Entry point called from OS thread — runs twikit async session."""
    asyncio.run(_run_twikit(goal, log_queue, num_posts, credentials, startup_context, limits))


async def stream_agent_logic(user_input: str, websocket, clerk_id: str = None, supabase=None, timeframe: str = None):
    """
    Main execution loop. Runs one sweep — the frontend timer schedules repeats based on timeframe.
    """
    limits    = TIMEFRAME_CONFIG.get(timeframe, DEFAULT_CONFIG)
    num_posts = limits["posts"]

    # 1. Fetch startup profile — Spirit needs this to know who it's working for
    startup_context = None
    if supabase and clerk_id:
        try:
            res = supabase.table("startups").select("*").eq("clerk_id", clerk_id).execute()
            if res.data:
                startup_context = res.data[0]
                startup_name    = startup_context.get("name", "your startup")
                mode            = startup_context.get("mode", "growth")
                await websocket.send_json({"type": "info", "text": f"Spirit loaded profile: {startup_name} · {mode} mode"})
            else:
                await websocket.send_json({"type": "warn", "text": "No startup profile found — complete onboarding for smarter scouting."})
        except Exception as e:
            await websocket.send_json({"type": "warn", "text": f"Could not load startup profile: {str(e)[:60]}"})

    # 2. Acknowledge
    await websocket.send_json({"type": "ai_response", "text": f"Spirit activated. Goal: '{user_input}'"})
    await asyncio.sleep(0.3)
    await websocket.send_json({"type": "info", "text": "Initializing X session..."})

    log_queue = []

    # Load credentials — memory first, then Supabase (survives restarts)
    store_key   = clerk_id or "default"
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

    # Stream logs in real-time
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

    # Save results to DB and stream each lead card to frontend
    for r in results:
        await websocket.send_json({
            "type":    "lead",
            "handle":  r["handle"],
            "content": r["content"],
            "action":  r["action"],
            "reason":  r["reason"],
            "comment": r.get("comment", ""),
        })
        if supabase and clerk_id:
            try:
                supabase.table("market_leads").insert({
                    "clerk_id":  clerk_id,
                    "platform":  "twitter",
                    "handle":    r["handle"],
                    "name":      r["action"],
                    "content":   r["content"],
                    "reason":    r["reason"],
                    "avatar_url": ""
                }).execute()
            except Exception as db_err:
                await websocket.send_json({"type": "warn", "text": f"DB: {str(db_err)[:80]}"})

    # Session summary
    likes    = sum(1 for r in results if "like"    in r.get("action", ""))
    follows  = sum(1 for r in results if "follow"  in r.get("action", ""))
    comments = sum(1 for r in results if r.get("comment"))
    await websocket.send_json({
        "type": "success",
        "text": f"Session complete — {comments} comments, {likes} likes, {follows} follows. {len(results)} interactions total."
    })
