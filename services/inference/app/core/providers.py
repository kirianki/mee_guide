"""
Provider abstraction layer — OpenAI primary, Anthropic fallback.

Model mapping by tier:
  lightweight → gpt-4o-mini         / claude-haiku-3-5
  standard    → gpt-4o              / claude-sonnet-4
  heavy       → gpt-4o (high ctx)   / claude-opus-4
"""
import asyncio
import logging
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic
from app.core.config import settings

logger = logging.getLogger(__name__)

openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

OPENAI_MODELS = {
    "lightweight": "gpt-4o-mini",
    "standard":    "gpt-4o",
    "heavy":       "gpt-4o",
}

ANTHROPIC_MODELS = {
    "lightweight": "claude-haiku-3-5-20241022",
    "standard":    "claude-sonnet-4-5",
    "heavy":       "claude-opus-4-5",
}

# Locked output schema prompt appended to every system prompt
OUTPUT_SCHEMA = """
Respond ONLY with valid JSON matching this exact schema:
{
  "reasoning": "<internal CoT: 1. Identify site/brand. 2. Compare current snapshot vs last known history. 3. Decide if previous goal is active or if we should re-explore.>",
  "guideTitle": "<max 6 words, current active context>",
  "narrative": "<a friendly, brand-aware greeting and explanation of what to do next>",
  "suggestedIntents": [
    {
      "id": "<kebab-case-id>",
      "title": "<user goal, e.g. 'Sell an Item'>",
      "description": "<max 10 words>",
      "confidence": 0.0
    }
  ],
  "steps": [
    {
      "stepIndex": 0,
      "instruction": "<imperative verb, max 18 words>",
      "tooltipText": "<max 12 words or null>",
      "elementSelector": "<exact structural CSS selector, never null>",
      "elementId": "<the exact 'wgId' from the snapshot or null>",
      "completionTrigger": "<click|input|navigation|publisher_signal|manual>",
      "completionSelector": "<CSS selector that triggers completion or null>"
    }
  ],
  "errorDetected": "<max 15 words or null>",
  "confidence": 0.0
}
No markdown, no explanation, only the JSON object.
"""

SYSTEM_PROMPT = (
    "You are WebGuide, an elite natural language situational co-pilot for the web.\n\n"
    "OPERATIONAL PHASES:\n"
    "1. SCAN & DISCOVER: Review the `pageMarkdown` DOM snapshot carefully. The initial scan dictates EVERYTHING the user can do. "
    "ABSOLUTE RULE: Do NOT hallucinate features based on outside knowledge. However, you MUST be consistent with your internal reasoning pass. "
    "If you identified an element (like a filter or search bar) in your thoughts, you MUST include it in the final JSON.\n"
    "2. TUTORIAL GUIDANCE: When responding to a goal, your `narrative` MUST be a fluid, natural language tutorial. "
    "Speak conversationally (e.g., 'To start a chat, click the new chat icon right here.').\n"
    "3. TARGETING: Strictly map your tutorial to the `steps` array by grabbing the exact `wg-id` from the markup.\n\n"
    "NARRATIVE GUIDELINES:\n"
    "- ALWAYS use natural, friendly narrative.\n"
    "- ZERO TECH-TALK: Never mention 'DOM', 'wgId', or 'snapshot' to the user.\n"
    "- STRICT CONSISTENCY: Your JSON output must perfectly reflect your internal reasoning pass findings.\n\n"
    "Return a JSON object. Be high-precision and helpful.\n\n"
    + OUTPUT_SCHEMA
)

REASONING_PROMPT = (
    "You are the internal reasoning engine for WebGuide. Analyze the `pageMarkdown` DOM snapshot and the conversational history. "
    "1. Identify the site/brand and its current state. Look specifically for search bars, filters, sorting options, and navigation menus.\n"
    "2. Determine exactly what the user is trying to accomplish.\n"
    "3. Map their goal to the exact `wg-id`s. In the markdown, interactive elements look like `[Role: Description](wg-id)`. "
    "Pay extremely close attention to 'Input', 'Select', and 'Button' roles that mention 'Search', 'Filter', 'Location', or 'Apply'.\n"
    "4. Draft a step-by-step UI plan.\n"
    "Output your internal thoughts in plain text. Be highly analytical and explicitly list the `wg-id`s you'll use for each step."
)


async def run_inference_stream(
    snapshot: dict,
    conversation_history: list[dict],
    grounding_context: str | None = None,
    tier: str = "standard",
):
    """
    Run inference in 2 passes: Reasoning -> JSON Synthesis.
    Yields JSON lines (`{"type": "thought", "content": ...}` then `{"type": "result", ...}`).
    """
    reasoning_messages = _build_reasoning_messages(snapshot, conversation_history, grounding_context)
    synthesis_messages = _build_messages(snapshot, conversation_history, grounding_context)

    import time
    import json
    
    for attempt in range(2):
        try:
            t0 = time.time()
            logger.info(f"[Inference 2-Pass] Starting Reasoning Stream Pass.")
            reasoning_text = ""
            
            # Pass 1: Streaming reasoning thoughts
            async for chunk in _call_openai_stream(reasoning_messages, tier):
                reasoning_text += chunk
                yield json.dumps({"type": "thought", "content": chunk}) + "\n"
            
            logger.info(f"[Inference 2-Pass] Reasoning completed in {time.time() - t0:.2f}s.")

            # Pass 2: Synthesis
            t1 = time.time()
            logger.info(f"[Inference 2-Pass] Starting Synthesis Pass (JSON Structuring).")
            synthesis_messages.insert(-1, {
                "role": "assistant",
                "content": f"My internal reasoning and wgId map:\n{reasoning_text}\n\nI will now convert this logic into the exact JSON schema."
            })
            
            result = await asyncio.wait_for(
                _call_openai(synthesis_messages, tier, response_format={"type": "json_object"}), timeout=60.0
            )
            logger.info(f"[Inference 2-Pass] Synthesis completed in {time.time() - t1:.2f}s.")
            
            yield json.dumps({"type": "result", "content": result, "provider": "openai"}) + "\n"
            return
        except Exception as e:
            logger.warning(f"OpenAI attempt {attempt + 1} failed ({type(e).__name__}): {e}")

    raise RuntimeError("OpenAI inference failed after retry")

async def _call_openai_stream(messages: list[dict], tier: str):
    model = OPENAI_MODELS[tier]
    response = await openai_client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=1024,
        temperature=0.2,
        stream=True
    )
    async for chunk in response:
        content = chunk.choices[0].delta.content
        if content:
            yield content

async def _call_openai(messages: list[dict], tier: str, response_format: dict | None = None) -> dict | str:
    import json
    model = OPENAI_MODELS[tier]
    
    kwargs = {
        "model": model,
        "messages": messages,
        "max_tokens": 1024,
        "temperature": 0.2,
    }
    if response_format:
        kwargs["response_format"] = response_format

    response = await openai_client.chat.completions.create(**kwargs)
    content = response.choices[0].message.content
    
    if response_format and response_format.get("type") == "json_object":
        return json.loads(content)
    return content

def _build_reasoning_messages(
    snapshot: dict,
    history: list[dict],
    grounding: str | None,
) -> list[dict]:
    messages = [{"role": "system", "content": REASONING_PROMPT}]

    if grounding:
        messages.append({
            "role": "user",
            "content": f"[GROUNDING CONTEXT]\n{grounding}\n[END GROUNDING]"
        })
        messages.append({"role": "assistant", "content": "Understood, I have the grounding context."})

    messages.extend(history[-12:])

    import json
    messages.append({
        "role": "user",
        "content": (
            f"Current page snapshot:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n"
            "Analyze the above DOM and history. Output your thought process and map the required wgIds before synthesizing."
        )
    })
    return messages


def _build_messages(
    snapshot: dict,
    history: list[dict],
    grounding: str | None,
) -> list[dict]:
    """Assemble the message array: system → grounding → history → current snapshot."""
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    if grounding:
        messages.append({
            "role": "user",
            "content": f"[GROUNDING CONTEXT]\n{grounding}\n[END GROUNDING]"
        })
        messages.append({"role": "assistant", "content": "Understood, I have the grounding context."})

    # Conversation history (rolling 6-turn window)
    messages.extend(history[-12:])  # 6 turns × 2 (user+assistant)

    # Dynamic Context Instruction
    instruction = (
        "Evaluate the current page strictly using the pageMarkdown snapshot. "
        "1. If this is a new scan, analyze what the user can do ONLY based on visible elements, and list true capabilities in 'suggestedIntents'. "
        "2. If the user elected an option or asked a question, write a natural language tutorial in 'narrative' explaining exactly what to do using 'click here' styled conversational references. "
        "3. Provide exactly ONE step object per required interaction, targeting the explicitly requested 'wgId'."
    )

    import json
    messages.append({
        "role": "user",
        "content": (
            f"Current page snapshot:\n{json.dumps(snapshot, ensure_ascii=False)}\n\n"
            f"{instruction}"
        )
    })
    return messages
