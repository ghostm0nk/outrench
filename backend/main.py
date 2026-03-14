import json
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv

# Load .env FIRST — before importing any local modules that read env vars at import time
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from svix.webhooks import Webhook, WebhookVerificationError
from agent_logic import stream_agent_logic
from twitter_api import verify_twitter_credentials

app = FastAPI(title="Outrench AI Backend")

# Allowing CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")
if not GROQ_API_KEY:
    print("Warning: GROQ_API_KEY is missing from environment")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
CLERK_WEBHOOK_SECRET = os.getenv("CLERK_WEBHOOK_SECRET")

class SupabaseRestWrapper:
    def __init__(self, url, key):
        self.base_url = f"{url}/rest/v1"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def table(self, name):
        url = f"{self.base_url}/{name}"
        headers = self.headers
        class TableWrapper:
            def insert(self, data):
                class Req:
                    def execute(self):
                        with requests.Session() as c:
                            return c.post(url, headers=headers, json=data).raise_for_status()
                return Req()
            def update(self, data):
                class Req:
                    def eq(self, k, v):
                        self.k, self.v = k, v
                        return self
                    def execute(self):
                        with requests.Session() as c:
                            return c.patch(f"{url}?{self.k}=eq.{self.v}", headers=headers, json=data).raise_for_status()
                return Req()
            def delete(self):
                class Req:
                    def eq(self, k, v):
                        self.k, self.v = k, v
                        return self
                    def execute(self):
                        with requests.Session() as c:
                            return c.delete(f"{url}?{self.k}=eq.{self.v}", headers=headers).raise_for_status()
                return Req()
            def upsert(self, data, on_conflict="id"):
                class Req:
                    def execute(self):
                        h = headers.copy()
                        h["Prefer"] = "resolution=merge-duplicates"
                        with requests.Session() as c:
                            return c.post(f"{url}?on_conflict={on_conflict}", headers=h, json=data).raise_for_status()
                return Req()
            def select(self, fields="*"):
                class Req:
                    def eq(self, k, v):
                        self.k, self.v = k, v
                        return self
                    def execute(self):
                        with requests.Session() as c:
                            r = c.get(f"{url}?select={fields}&{self.k}=eq.{self.v}", headers=headers)
                            r.raise_for_status()
                            class Res:
                                data = r.json()
                            return Res()
                return Req()
        return TableWrapper()

supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = SupabaseRestWrapper(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    print("Supabase REST client initialized successfully")
else:
    print("Warning: Supabase credentials missing from environment")


if not CLERK_WEBHOOK_SECRET:
    print("Warning: CLERK_WEBHOOK_SECRET is missing from environment")


class OutreachRequest(BaseModel):
    username: str
    target_platform: str = "reddit"
    bio: str = ""
    latest_post: str = ""


class OnboardingRequest(BaseModel):
    clerk_id: str
    name: str
    one_liner: str = ""
    website_url: str = ""
    category: str = ""
    target_audience: str = ""
    problem_solved: str = ""
    unique_value: str = ""
    tone: str = "casual"


class ChannelCredentialsRequest(BaseModel):
    clerk_id: str
    platform: str
    account_type: str
    auth_token: str
    handle: Optional[str] = None
    name: Optional[str] = None
    avatar_url: Optional[str] = None

class MarketLeadRequest(BaseModel):
    clerk_id: str
    platform: str
    handle: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    content: Optional[str] = None
    reason: Optional[str] = None


# ── Content Safeguards (server-side) ───────────────────────────────────────────
PROFANITY_LIST = [
    'fuck','shit','ass','bitch','damn','dick','cock','cunt','bastard','slut',
    'whore','fag','nigger','nigga','retard','piss','wank','twat','bollocks',
    'motherfuck','bullshit','asshole','dumbass','jackass','goddamn',
    'fucking','fucker','bitches','cunts','sluts','faggot',
    'rape','rapist','kill','murder','porn','xxx','hentai','onlyfans',
    'escort','prostitut','trafficking','molest','pedophil',
    'cocaine','heroin','meth','fentanyl',
]

BANNED_KEYWORDS = [
    'gambling','casino','betting','poker','slot machine',
    'adult','pornography','escort service','sex work','onlyfans',
    'weapon','firearm','gun shop','ammunition','explosive',
    'drug','narcotic','dispensary',
    'pyramid scheme','mlm','multi-level','ponzi',
    'hate group','supremacist','extremis','terroris',
    'counterfeit','fraud','scam','phishing','money launder',
    'dark web','darknet','black market',
    'crypto pump','rug pull',
]

ALLOWED_CATEGORIES = [
    'SaaS','E-Commerce','Fintech','Health & Wellness','Education',
    'Developer Tools','Marketing','AI / ML','Social / Community','Other',
]

def check_profanity(text: str) -> bool:
    if not text:
        return False
    lower = ''.join(c if c.isalpha() or c.isspace() else '' for c in text.lower())
    words = lower.split()
    return any(p in words or any(p in w for w in words) for p in PROFANITY_LIST)

def check_banned_content(text: str) -> str | None:
    if not text:
        return None
    lower = text.lower()
    for keyword in BANNED_KEYWORDS:
        if keyword in lower:
            return keyword
    return None

def validate_onboarding(req: OnboardingRequest) -> str | None:
    """Returns an error message if validation fails, None if all good."""
    fields_to_check = [req.name, req.one_liner, req.target_audience, req.problem_solved, req.unique_value]
    
    for field in fields_to_check:
        if check_profanity(field):
            return "Inappropriate language detected. Please keep it professional."
        banned = check_banned_content(field)
        if banned:
            return f'Outrench cannot be used for "{banned}"-related businesses.'
    
    if req.category and req.category not in ALLOWED_CATEGORIES:
        return f"Invalid category: {req.category}"
    
    if req.name and len(req.name.strip()) < 2:
        return "Startup name must be at least 2 characters."
    
    return None


@app.get("/")
def health_check():
    return {"status": "ok", "message": "Outrench API is running"}


@app.get("/api/ping")
def ping():
    """Lightweight wake-up endpoint. Frontend pings this before opening WebSocket."""
    return {"pong": True}


@app.post("/api/generate")
def generate_outreach(req: OutreachRequest):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is missing")

    prompt = f"""You are an expert AI outreach copywriter for the startup "Tagmine".
Your goal is to write a highly casual, non-spammy, friendly outbound message to a user.
The message MUST sound like it was written by a real human (e.g. casual tone, lowercase, friendly, very concise).
Do not be overly sales-y. Mention "Tagmine" naturally.

User's platform: {req.target_platform}
User's handle: {req.username}
User's bio context (if any): {req.bio}
User's latest post/comment (if any): {req.latest_post}

Write a 2-3 sentence outreach message responding to their context (or just reaching out if no context is provided) and casually mentioning how Tagmine could help them or just sharing Tagmine with them.
"""

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "You are a casual and friendly outreach expert. Output ONLY the message itself, without quotes or extra conversational text."},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "max_tokens": 150
            },
            timeout=10.0
        )
        response.raise_for_status()
        data = response.json()
        generated_message = data["choices"][0]["message"]["content"].strip()

        return {
            "username": req.username,
            "platform": req.target_platform,
            "message": generated_message
        }

    except Exception as e:
        print(f"Error calling Groq API: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Clerk Webhook (syncs users into Supabase) ─────────────────────────────────
@app.post("/api/webhooks/clerk")
async def clerk_webhook(request: Request):
    """
    Handle Clerk webhook events.
    Verifies the Svix signature, then syncs user data into Supabase.
    
    Supported events:
      - user.created  → Insert new user into Supabase
      - user.updated  → Update existing user in Supabase
      - user.deleted  → Delete user from Supabase
    """
    body = await request.body()

    # ── Verify webhook signature via Svix (exactly like Contynue) ──
    svix_id = request.headers.get("svix-id", "")
    svix_timestamp = request.headers.get("svix-timestamp", "")
    svix_signature = request.headers.get("svix-signature", "")

    if not svix_id or not svix_timestamp or not svix_signature:
        raise HTTPException(status_code=400, detail="Missing svix headers")

    try:
        wh = Webhook(CLERK_WEBHOOK_SECRET)
        wh.verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except WebhookVerificationError:
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    payload = json.loads(body)
    event_type = payload.get("type")
    data = payload.get("data", {})

    clerk_id = data.get("id")
    if not clerk_id:
        raise HTTPException(status_code=400, detail="Missing user ID in webhook data")

    # ── Extract user fields ──
    email = None
    email_addresses = data.get("email_addresses", [])
    if email_addresses:
        primary = next(
            (e for e in email_addresses if e.get("id") == data.get("primary_email_address_id")),
            email_addresses[0],
        )
        email = primary.get("email_address")

    username = data.get("username")

    if not supabase:
        print("Supabase client not initialized")
        raise HTTPException(status_code=500, detail="Database not configured")

    # ── Handle events ──
    if event_type == "user.created":
        supabase.table("users").insert({
            "clerk_id": clerk_id,
            "email": email,
            "username": username,
        }).execute()
        print(f"User created in Supabase: {username or email}")
        return {"status": "user_created"}

    elif event_type == "user.updated":
        supabase.table("users").update({
            "email": email,
            "username": username,
        }).eq("clerk_id", clerk_id).execute()
        print(f"User updated in Supabase: {username or email}")
        return {"status": "user_updated"}

    elif event_type == "user.deleted":
        supabase.table("users").delete().eq("clerk_id", clerk_id).execute()
        print(f"User deleted from Supabase: {clerk_id}")
        return {"status": "user_deleted"}

    return {"status": "ignored", "event": event_type}


# ── Onboarding (saves startup profile) ─────────────────────────────────────────
@app.post("/api/onboarding")
async def save_onboarding(req: OnboardingRequest):
    """Save the user's startup profile and mark them as onboarded."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    # ── Validate content before saving ──
    rejection_reason = validate_onboarding(req)
    if rejection_reason:
        print(f"Onboarding REJECTED for {req.clerk_id}: {rejection_reason}")
        return {"status": "rejected", "reason": rejection_reason}

    try:
        # Find the user by clerk_id
        user_result = supabase.table("users").select("id").eq("clerk_id", req.clerk_id).execute()
        user_id = user_result.data[0]["id"] if user_result.data else None

        # Upsert startup data
        startup_data = {
            "clerk_id": req.clerk_id,
            "user_id": user_id,
            "name": req.name,
            "one_liner": req.one_liner,
            "website_url": req.website_url,
            "category": req.category,
            "target_audience": req.target_audience,
            "problem_solved": req.problem_solved,
            "unique_value": req.unique_value,
            "tone": req.tone,
        }
        supabase.table("startups").upsert(startup_data, on_conflict="clerk_id").execute()

        # Mark user as onboarded
        supabase.table("users").update({"onboarded": True}).eq("clerk_id", req.clerk_id).execute()

        print(f"Onboarding complete for: {req.name} ({req.clerk_id})")
        return {"status": "success", "startup_name": req.name}

    except Exception as e:
        print(f"Onboarding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/onboarding/status/{clerk_id}")
async def check_onboarding(clerk_id: str):
    """Check if a user has completed onboarding."""
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    try:
        result = supabase.table("users").select("onboarded").eq("clerk_id", clerk_id).execute()
        if result.data:
            return {"onboarded": result.data[0].get("onboarded", False)}
        return {"onboarded": False}
    except Exception as e:
        print(f"Check onboarding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Channel Credentials endpoints ──────────────────────────────────────────────
@app.post("/api/channels/connect")
async def connect_channel(req: ChannelCredentialsRequest):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    handle = None
    name = None
    avatar_url = None

    if req.platform.lower() == "twitter":
        print(f"DEBUG: Connecting Twitter for {req.clerk_id} with token: '{req.auth_token}'")
        if req.auth_token.strip().upper() == "GHOST_DRIVER_SESSION":
            # Direct sync from Ghost Driver, use provided fields
            handle = req.handle
            name = req.name
            avatar_url = req.avatar_url
        else:
            try:
                profile = verify_twitter_credentials(req.auth_token)
                handle = profile["handle"]
                name = profile["name"]
                avatar_url = profile["avatar_url"]
            except Exception as e:
                # If the token is dead or invalid, throw a 401 right back to the frontend
                raise HTTPException(status_code=401, detail=str(e))
    else:
        # Placeholder for TikTok or others
        pass

    try:
        data = {
            "clerk_id": req.clerk_id,
            "platform": req.platform,
            "account_type": req.account_type,
            "auth_token": req.auth_token,
            "handle": handle,
            "name": name,
            "avatar_url": avatar_url
        }
        supabase.table("channel_credentials").upsert(data, on_conflict="clerk_id,platform,account_type").execute()
        return {"status": "success", "profile": {"handle": handle, "name": name, "avatar_url": avatar_url}}
    except Exception as e:
        error_msg = str(e)
        if hasattr(e, 'response') and e.response is not None:
             error_msg += f" | Body: {e.response.text}"
        print(f"Error saving channel credentials: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Database save failed: {error_msg}")

# ── Market Scout endpoints ─────────────────────────────────────────────────────

@app.get("/api/market/strategy/{clerk_id}")
async def get_market_strategy(clerk_id: str):
    if not supabase: raise HTTPException(status_code=500, detail="Database error")
    
    # 1. Fetch startup info
    res = supabase.table("startups").select("*").eq("clerk_id", clerk_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Please complete onboarding first")
    
    startup = res.data[0]
    
    # 2. Use Agent Logic to generate search terms
    from agent_logic import get_ai_response
    prompt = f"""
    Based on this startup:
    Name: {startup['name']}
    Problem: {startup['problem_solved']}
    Target: {startup['target_audience']}
    Unique Value: {startup['unique_value']}
    
    Identify 5 specific Twitter search queries (keywords or phrases) that would find people currently experiencing the problem this startup solves.
    Focus on "complaint" keywords or "advice seeking" questions.
    Return ONLY a JSON list of strings.
    """
    
    response = await get_ai_response(prompt, "You are an expert market researcher.")
    try:
        # Simple extraction
        import json
        start = response.find('[')
        end = response.rfind(']') + 1
        queries = json.loads(response[start:end])
        return {"queries": queries}
    except:
        return {"queries": ["overthinking intros", "dating app fatigue", "first message anxiety"]}

@app.post("/api/market/leads")
async def save_market_lead(req: MarketLeadRequest):
    if not supabase: raise HTTPException(status_code=500, detail="Database error")
    data = req.dict()
    try:
        # Check if already exists to avoid spamming
        existing = supabase.table("market_leads").select("id").eq("clerk_id", req.clerk_id).eq("handle", req.handle).execute()
        if existing.data:
            return {"status": "skipped", "message": "Lead already exists"}
            
        supabase.table("market_leads").insert(data).execute()
        return {"status": "success"}
    except Exception as e:
        print(f"Error saving lead: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market/leads/{clerk_id}")
async def get_market_leads(clerk_id: str):
    if not supabase: raise HTTPException(status_code=500, detail="Database error")
    try:
        res = supabase.table("market_leads").select("*").eq("clerk_id", clerk_id).order("created_at", desc=True).limit(20).execute()
        return {"leads": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/content/queue/{clerk_id}")
async def get_content_queue(clerk_id: str):
    if not supabase: raise HTTPException(status_code=500, detail="Database error")
    try:
        res = supabase.table("content_queue").select("*").eq("clerk_id", clerk_id).order("created_at", desc=True).limit(20).execute()
        return {"queue": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/growth/trends/{clerk_id}")
async def get_growth_trends(clerk_id: str):
    if not supabase: raise HTTPException(status_code=500, detail="Database error")
    try:
        res = supabase.table("growth_trends").select("*").eq("clerk_id", clerk_id).order("created_at", desc=True).limit(20).execute()
        return {"trends": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/channels/status/{clerk_id}")
async def get_channel_status(clerk_id: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
    try:
        res = supabase.table("channel_credentials").select("platform,account_type,auth_token,handle,name,avatar_url").eq("clerk_id", clerk_id).execute()
        connections = {}
        tokens = {}
        for r in res.data:
            key = f"{r['platform']}_{r['account_type']}"
            connections[key] = {
                "handle": r.get('handle'),
                "name": r.get('name'),
                "avatar_url": r.get('avatar_url')
            }
            tokens[key] = r['auth_token']
        return {"connections": connections, "tokens": tokens}
    except Exception as e:
        print(f"Error getting channel status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/channels/disconnect/{clerk_id}/{platform}/{account_type}")
async def disconnect_channel(clerk_id: str, platform: str, account_type: str):
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")
    try:
        # Make a direct REST call with multiple conditions since our simple wrapper only supports .eq() once
        url = f"{supabase.base_url}/channel_credentials?clerk_id=eq.{clerk_id}&platform=eq.{platform}&account_type=eq.{account_type}"
        with requests.Session() as c:
            c.delete(url, headers=supabase.headers).raise_for_status()
        return {"status": "success"}
    except Exception as e:
        print(f"Error disconnecting channel: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Agent WebSocket (Terminal Streaming) ───────────────────────────────────────
@app.websocket("/api/agent/stream")
async def agent_stream(websocket: WebSocket):
    await websocket.accept()
    print("Agent WebSocket connected.")
    try:
        while True:
            # Wait for user input from the frontend
            raw_data = await websocket.receive_text()
            try:
                payload = json.loads(raw_data)
                task = payload.get("task", "")
                clerk_id = payload.get("clerk_id")
            except:
                # Fallback for old simple string messages
                task = raw_data
                clerk_id = None

            print(f"Agent received task: {task} from {clerk_id}")
            
            # Use the new agent logic to plan and stream execution
            await stream_agent_logic(task, websocket, clerk_id=clerk_id, supabase=supabase)
                
    except WebSocketDisconnect:
        print("Agent WebSocket disconnected.")
    except Exception as e:
        print(f"WebSocket error: {e}")
