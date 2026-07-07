import os
import json
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import requests
from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# Used automatically whenever the real AI call can't be completed (no credits,
# no key, offline, rate limited, etc.) so the app always has something to show.
FALLBACK_RESPONSE = {
    "documentation": [
        {
            "method": "GET",
            "path": "/posts/1",
            "summary": "Fetch a single post by id",
            "description": "Returns the post with the given id, including its title, body and author id.",
            "parameters": [
                {"name": "id", "type": "integer", "required": True, "description": "The id of the post to fetch, passed in the URL path."}
            ],
            "exampleRequest": {"method": "GET", "url": "https://jsonplaceholder.typicode.com/posts/1"},
            "exampleResponse": {"id": 1, "userId": 1, "title": "sample post title", "body": "sample post body text"},
        },
        {
            "method": "POST",
            "path": "/posts",
            "summary": "Create a new post",
            "description": "Creates a new post resource and returns it with a newly assigned id.",
            "parameters": [
                {"name": "title", "type": "string", "required": True, "description": "Title of the post."},
                {"name": "body", "type": "string", "required": True, "description": "Body content of the post."},
                {"name": "userId", "type": "integer", "required": True, "description": "Id of the user creating the post."},
            ],
            "exampleRequest": {"title": "foo", "body": "bar", "userId": 1},
            "exampleResponse": {"id": 101, "title": "foo", "body": "bar", "userId": 1},
        },
        {
            "method": "GET",
            "path": "/posts/9999",
            "summary": "Fetch a post that does not exist",
            "description": "Demonstrates the API's not-found behavior for an id outside the valid range.",
            "parameters": [
                {"name": "id", "type": "integer", "required": True, "description": "A non-existent post id."}
            ],
            "exampleRequest": {"method": "GET", "url": "https://jsonplaceholder.typicode.com/posts/9999"},
            "exampleResponse": {},
        },
    ],
    "testCases": [
        {"id": "t0", "name": "Get existing post returns 200", "method": "GET", "url": "https://jsonplaceholder.typicode.com/posts/1", "headers": {}, "body": None, "expectedStatus": 200, "category": "happy_path"},
        {"id": "t1", "name": "Create post returns 201", "method": "POST", "url": "https://jsonplaceholder.typicode.com/posts", "headers": {}, "body": {"title": "foo", "body": "bar", "userId": 1}, "expectedStatus": 201, "category": "happy_path"},
        {"id": "t2", "name": "Get non-existent post returns 404", "method": "GET", "url": "https://jsonplaceholder.typicode.com/posts/9999", "headers": {}, "body": None, "expectedStatus": 404, "category": "edge_case"},
        {"id": "t3", "name": "Create post with missing fields", "method": "POST", "url": "https://jsonplaceholder.typicode.com/posts", "headers": {}, "body": {}, "expectedStatus": 201, "category": "invalid_input"},
    ],
}

app = FastAPI(title="AI API Doc & Testing Portal Backend")

# Allow the Vite dev server to call this backend directly during local dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    spec: Dict[str, Any]


class RunTestRequest(BaseModel):
    method: str
    url: str
    headers: Optional[Dict[str, str]] = {}
    body: Optional[Dict[str, Any]] = None


GENERATE_PROMPT = """You are an API documentation and test generation engine.
Given this API spec (base URL plus a list of endpoints), produce a single JSON object
with two keys: "documentation" and "testCases". Respond with ONLY raw JSON, no prose, no markdown fences.

"documentation" is an array of objects: {{ method, path, summary, description, parameters:
[{{name, type, required, description}}], exampleRequest, exampleResponse }}.

"testCases" is an array of objects: {{ id, name, method, url (full absolute URL using the base
URL plus path), headers (object), body (object or null), expectedStatus (number), category
(one of: happy_path, edge_case, invalid_input, auth) }}. Generate 2-4 test cases per endpoint
covering different categories. Use the base URL exactly as given to build full urls.

API spec:
{spec}
"""


@app.post("/api/generate")
def generate(req: GenerateRequest):
    # No API key configured at all -> go straight to the demo fallback.
    if client is None:
        return {**FALLBACK_RESPONSE, "_demo_mode": True}

    prompt = GENERATE_PROMPT.format(spec=json.dumps(req.spec, indent=2))

    try:
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw_text = "".join(block.text for block in response.content if block.type == "text")
        cleaned = raw_text.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        return parsed
    except Exception:
        # Covers: no credits, invalid key, network issue, rate limit, bad JSON, etc.
        # The app still returns a fully working example so the demo never breaks.
        return {**FALLBACK_RESPONSE, "_demo_mode": True}


@app.post("/api/run-test")
def run_test(req: RunTestRequest):
    start = time.time()
    try:
        kwargs: Dict[str, Any] = {"headers": req.headers or {}, "timeout": 15}
        if req.body is not None and req.method.upper() != "GET":
            kwargs["json"] = req.body

        resp = requests.request(req.method.upper(), req.url, **kwargs)

        try:
            body = resp.json()
        except ValueError:
            body = resp.text

        return {
            "status": resp.status_code,
            "body": body,
            "latency_ms": round((time.time() - start) * 1000),
        }
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Request to target API failed: {e}")


@app.get("/api/health")
def health():
    return {"status": "ok"}
