from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import httpx
from dotenv import load_dotenv

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

class OutreachRequest(BaseModel):
    username: str
    target_platform: str = "reddit"
    bio: str = ""
    latest_post: str = ""

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
