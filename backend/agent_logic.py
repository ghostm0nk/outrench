import json
import os
import requests
import asyncio
from typing import List, Dict

# Standard configuration
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-70b-versatile")

async def get_ai_response(prompt: str, system_prompt: str = "You are a helpful AI assistant.") -> str:
    """Helper to call Groq via requests."""
    if not GROQ_API_KEY:
        return "Error: GROQ_API_KEY missing."

    try:
        # We use a thread pool for requests since it's synchronous
        loop = asyncio.get_event_loop()
        
        def make_request():
            return requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.2,
                    "max_tokens": 500
                },
                timeout=15.0
            )

        response = await loop.run_in_executor(None, make_request)
        response.raise_for_status()
        return str(response.json()["choices"][0]["message"]["content"]).strip()
    except Exception as e:
        return f"Error connecting to Groq: {str(e)}"

async def plan_task(user_input: str) -> List[Dict]:
    """Uses LLM to breakdown a command into steps."""
    system_prompt = """
    You are 'Spirit', the brain of 'Outrench', an AI agent that finds and reaches out to people. 
    Breakdown the user's request into a logically sequenced list of 4-6 actions.
    Each action should have:
    - type: 'info', 'success', 'warn', or 'error'
    - text: A human-readable description of what the bot is doing (e.g. 'Searching for founders on LinkedIn')
    - simulated_delay: How many seconds this step would realistically take (1.0 to 3.0)
    
    Output ONLY a raw JSON array of objects. No markdown, no filler.
    """
    
    prompt = f"User Request: {user_input}"
    
    response_text = await get_ai_response(prompt, system_prompt)
    
    try:
        content = str(response_text)
        start = content.find('[')
        end = content.rfind(']') + 1
        if start != -1 and end != 0:
            return json.loads(content[start:end])
        return []
    except:
        return [
            {"type": "error", "text": "Failed to generate plan. Reverting to default mode.", "simulated_delay": 0.5},
            {"type": "info", "text": "Analyzing request manually...", "simulated_delay": 1.5}
        ]

async def stream_agent_logic(user_input: str, websocket):
    """The main execution loop for the agent on a specific task."""
    
    # 1. Spirit Acknowledgement
    ack_system = "You are Spirit, an efficient AI agent for Outrench. Acknowledge the user's task in 1 short sentence."
    acknowledgement = await get_ai_response(f"Acknowledge this task: {user_input}", ack_system)
    
    await websocket.send_json({
        "type": "ai_response",
        "text": acknowledgement
    })
    
    await asyncio.sleep(0.5)
    
    # 2. Planning Phase
    await websocket.send_json({"type": "info", "text": "Generating execution plan..."})
    plan = await plan_task(user_input)
    
    # 3. Execution Phase (Simulated for now until tools are built)
    for step in plan:
        await asyncio.sleep(step.get("simulated_delay", 1.5))
        await websocket.send_json({
            "type": step.get("type", "info"),
            "text": step.get("text", "Unknown action")
        })
    
    await websocket.send_json({"type": "success", "text": "Workflow finished. Standing by."})
