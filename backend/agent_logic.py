import json
import os
import requests
import asyncio
from typing import List, Dict

# Standard configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

async def get_ai_response(prompt: str, system_prompt: str = "You are a helpful AI assistant.") -> str:
    """Helper to call Groq via requests."""
    if not GROQ_API_KEY:
        return "Error: GROQ_API_KEY missing."

    try:
        loop = asyncio.get_event_loop()
        def make_request():
            # Ensure model is updated if changed in env
            model = os.getenv("GROQ_MODEL", GROQ_MODEL)
            return requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 1000
                },
                timeout=20.0
            )

        response = await loop.run_in_executor(None, make_request)
        response.raise_for_status()
        return str(response.json()["choices"][0]["message"]["content"]).strip()
    except Exception as e:
        return f"Error connecting to Groq (Model: {os.getenv('GROQ_MODEL', GROQ_MODEL)}): {str(e)}"

async def plan_task(user_input: str, startup_context: str = "") -> List[Dict]:
    """Uses LLM to breakdown a command into steps focused on Google Search & Market Scout."""
    system_prompt = f"""
    You are 'Spirit', the brain of 'Outrench'. 
    The user wants you to scout the market using Google Search.
    
    Startup Context: {startup_context}
    
    Breakdown the request into 4-6 actions.
    Actions must include:
    - type: 'info', 'success', 'warn', 'cmd', or 'ai_response'
    - text: Human-readable description.
    - search_query: (Optional) The specific Google search query you are "typing".
    - rationale: (Optional) Why you are performing this specific search.
    - data_to_save: (Optional) An object with 'leads' (links), 'queue' (captions), or 'trends' (trending keywords).
    - simulated_delay: 1.0 to 3.0 seconds.
    
    Example data_to_save shape:
    {{
       "leads": [{{ "handle": "Google Result", "content": "Found relevant article...", "reason": "...", "avatar_url": "..." }}],
       "queue": [{{ "platform": "twitter", "content": "Drafted hook...", "account_type": "personal" }}],
       "trends": ["search keyword 1", "search keyword 2"]
    }}
    
    Output ONLY a raw JSON array.
    """
    
    prompt = f"User Request: {user_input}"
    response_text = await get_ai_response(prompt, system_prompt)
    
    try:
        start = response_text.find('[')
        end = response_text.rfind(']') + 1
        return json.loads(response_text[start:end])
    except:
        return [{"type": "error", "text": "Plan failed. Reverting to basic scout.", "simulated_delay": 1.0}]

async def stream_agent_logic(user_input: str, websocket, clerk_id: str = None, supabase = None):
    """The main execution loop with Google Search logic and database persistence."""
    
    # 0. Check Platform Connection FIRST
    if supabase and clerk_id:
        channels = supabase.table("channel_credentials").select("id").eq("clerk_id", clerk_id).execute()
        if not channels.data:
            await websocket.send_json({
                "type": "error", 
                "text": "Mission Aborted: No platforms connected. Spirit requires an active X/Twitter connection to deploy scouting results. Please go to the 'Channels' tab and sync your account first."
            })
            return

    # 1. Get Startup Context
    startup_context = "Unknown startup."
    if supabase and clerk_id:
        res = supabase.table("startups").select("*").eq("clerk_id", clerk_id).execute()
        if res.data:
            s = res.data[0]
            startup_context = f"{s['name']}: {s['one_liner']}. Targeting: {s['target_audience']}"

    # 2. Spirit Acknowledgement
    try:
        ack_system = "You are Spirit. Acknowledge the user's scouting request in one short, mysterious, but helpful sentence."
        acknowledgement = await get_ai_response(f"Acknowledge: {user_input}", ack_system)
        
        await websocket.send_json({"type": "ai_response", "text": acknowledgement})
        await asyncio.sleep(0.8)
    except:
        await websocket.send_json({"type": "error", "text": "Spirit is having trouble manifesting thoughts (Groq Error). Check backend logs."})
        return

    # 3. Planning
    await websocket.send_json({"type": "info", "text": "Spirit is expanding its vision to the global network..."})
    plan = await plan_task(user_input, startup_context)
    
    # 3. Execution
    for step in plan:
        # Log the typing/rationale if present
        if step.get("search_query"):
            await websocket.send_json({
                "type": "cmd", 
                "text": f'Typing into Google: "{step["search_query"]}"'
            })
            await asyncio.sleep(1.0)
            if step.get("rationale"):
                await websocket.send_json({
                    "type": "info", 
                    "text": f'Spirit Ratio: {step["rationale"]}'
                })
        
        await asyncio.sleep(step.get("simulated_delay", 1.5))
        
        # Send update to terminal
        await websocket.send_json({
            "type": step.get("type", "info"),
            "text": step.get("text", "Searching...")
        })

        # Save data to database if Spirit "found" something
        if supabase and clerk_id and step.get("data_to_save"):
            save = step["data_to_save"]
            
            # Save Leads
            if save.get("leads"):
                for lead in save["leads"]:
                    try:
                        supabase.table("market_leads").insert({
                            "clerk_id": clerk_id,
                            "platform": "google",
                            "handle": lead.get("handle", "Network Source"),
                            "name": lead.get("name", "Insight"),
                            "content": lead.get("content", ""),
                            "reason": lead.get("reason", "Captured by Spirit Broadsearch"),
                            "avatar_url": "https://www.google.com/favicon.ico"
                        }).execute()
                    except: pass
            
            # Save Queue (Captions/Hooks)
            if save.get("queue"):
                for item in save["queue"]:
                    try:
                        supabase.table("content_queue").insert({
                            "clerk_id": clerk_id,
                            "platform": item.get("platform", "twitter"),
                            "account_type": item.get("account_type", "personal"),
                            "content": item.get("content", ""),
                            "status": "draft"
                        }).execute()
                    except: pass

            # Save Trends
            if save.get("trends"):
                for trend in save["trends"]:
                    try:
                        supabase.table("growth_trends").insert({
                            "clerk_id": clerk_id,
                            "keyword": trend if isinstance(trend, str) else trend.get("keyword"),
                            "volume": "High"
                        }).execute()
                    except: pass

    await websocket.send_json({"type": "success", "text": "Spirit broadsearch complete. Artifacts placed in your Channels, Queue, and Growth tabs."})
