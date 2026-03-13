import json
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import httpx
from dotenv import load_dotenv
from supabase import create_client, Client
from svix.webhooks import Webhook, WebhookVerificationError

# Initialize dotenv
load_dotenv()

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

supabase: Client = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    print("Supabase client initialized successfully")
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


@app.post("/api/generate")
async def generate_outreach(req: OutreachRequest):
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
        async with httpx.AsyncClient() as client:
            response = await client.post(
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
