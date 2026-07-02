# api.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import networkx as nx
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
graph = nx.read_graphml("DataSets/drug_food_knowledge_graph.graphml")

class ChatRequest(BaseModel):
    message: str
    condition: str = ""  # optional: diabetes, hypertension, etc.

def query_ollama(prompt: str) -> str:
    url = "http://localhost:11434/api/generate"
    response = requests.post(url, json={
        "model": "gemma3:1b",
        "prompt": prompt,
        "stream": False
    })
    return response.json().get("response", "Sorry, I couldn't generate a response.")

@app.post("/chat")
def chat(req: ChatRequest):
    # Build context from knowledge graph
    context = ""
    if req.condition:
        # Pull relevant nodes from graph based on condition
        for node, data in graph.nodes(data=True):
            if req.condition.lower() in str(data).lower():
                context += f"- {node}: {data}\n"

    prompt = f"""You are a diet and nutrition assistant for MealMind.
    
User question: {req.message}
{f"Patient condition: {req.condition}" if req.condition else ""}
{f"Relevant knowledge graph data:\n{context}" if context else ""}

Provide a helpful, concise dietary recommendation."""

    answer = query_ollama(prompt)
    return {"reply": answer}