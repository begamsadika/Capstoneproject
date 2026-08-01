# api.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import networkx as nx
from pathlib import Path
import requests

app = FastAPI()

# Allow your React app to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite dev server
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the knowledge graph once at startup
BASE_DIR = Path(__file__).resolve().parent
graph = nx.read_graphml(BASE_DIR / "DataSets" / "drug_food_knowledge_graph.graphml")

class ChatRequest(BaseModel):
    message: str
    condition: str = ""  # optional: diabetes, hypertension, etc.

def query_ollama(prompt: str) -> str:
    url = "http://localhost:11434/api/generate"
    try:
        response = requests.post(
            url,
            json={
                "model": "llama3.2:3b",
                "prompt": prompt,
                "stream": False,
            },
            timeout=60,
        )
        response.raise_for_status()
    except requests.RequestException:
        return "Diet AI is temporarily unavailable. Please make sure Ollama is running and try again."
    return response.json().get("response", "Sorry, I couldn't generate a response.")


def build_prompt(req: ChatRequest) -> str:
    context = ""
    if req.condition:
        for node, data in graph.nodes(data=True):
            if req.condition.lower() in str(data).lower():
                context += f"- {node}: {data}\n"

    condition_line = f"Patient condition: {req.condition}" if req.condition else ""
    context_line = f"Relevant knowledge graph data:\n{context}" if context else ""

    return f"""You are a diet and nutrition assistant for Wellora.

User question: {req.message}
{condition_line}
{context_line}

Provide a helpful, concise dietary recommendation."""

@app.post("/chat")
def chat(req: ChatRequest):
    answer = query_ollama(build_prompt(req))
    return {"reply": answer}


@app.post("/chat/stream")
def chat_stream(req: ChatRequest):
    def event_stream():
        answer = query_ollama(build_prompt(req))
        for token in answer.split(" "):
            yield f"data: {json.dumps({'token': token + ' '})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
