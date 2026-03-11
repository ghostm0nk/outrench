from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
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

class OutreachRequest(BaseModel):
    username: str
    target_platform: str = "tiktok"

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Outrench API is running"}

@app.post("/api/generate")
def generate_outreach(req: OutreachRequest):
    # TODO: 1. Scrape user context using username
    # TODO: 2. Call Groq API to generate message
    # TODO: 3. Return the generated message
    
    # Placeholder for MVP
    generated_message = f"Hey @{req.username}, loved your recent video! Just launched Tagmine, thought you might find it useful."
    
    return {
        "username": req.username,
        "message": generated_message
    }
