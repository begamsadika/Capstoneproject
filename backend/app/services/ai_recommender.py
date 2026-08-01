"""
AI Recommendation Service
Uses Groq (FREE) with Llama 3.1 model to generate
personalized meal recommendations based on user health data.
"""

import json
import re
from groq import Groq
from typing import List, Optional
from ..core.config import GROQ_API_KEY


def build_user_context(
    health_metric: dict,
    today_log: dict,
    recent_orders: List[dict],
) -> str:
    goal_map = {
        "lose": "Weight Loss",
        "maintain": "Weight Maintenance",
        "gain": "Muscle/Weight Gain",
    }
    goal_label = goal_map.get(health_metric.get("health_goal", ""), "General Health")
    calories_today = today_log.get("calories_consumed", 0)
    calorie_target = today_log.get(
        "calorie_target", health_metric.get("target_calories", 2000)
    )
    calories_left = max(0, calorie_target - calories_today)

    # Build order history with ratings
    order_history_lines = []
    liked_meals = []
    disliked_meals = []
    for o in recent_orders[:10]:
        name = o["meal_name"]
        rating = o.get("rating")
        if rating is not None:
            order_history_lines.append(f"  - {name} (rated {rating}/5)")
            if rating >= 4:
                liked_meals.append(name)
            elif rating <= 2:
                disliked_meals.append(name)
        else:
            order_history_lines.append(f"  - {name} (not yet rated)")

    order_history = "\n".join(order_history_lines) if order_history_lines else "  None"
    liked_str = ", ".join(liked_meals) if liked_meals else "None"
    disliked_str = ", ".join(disliked_meals) if disliked_meals else "None"

    return f"""USER HEALTH PROFILE:
- BMI: {health_metric.get('bmi', 'N/A')} ({health_metric.get('bmi_category', 'N/A')})
- Health Goal: {goal_label}
- Daily Calorie Target: {calorie_target} kcal
- Calories Consumed Today: {calories_today} kcal
- Calories Remaining Today: {calories_left} kcal
- Protein Target: {health_metric.get('protein_target_g', 0)}g
- Carbs Target: {health_metric.get('carbs_target_g', 0)}g
- Fat Target: {health_metric.get('fat_target_g', 0)}g
- Dietary Preference: {health_metric.get('dietary_preference') or 'None'}
- Allergies: {health_metric.get('allergies') or 'None'}
- Medical Conditions: {health_metric.get('medical_conditions') or 'None reported'}
- Medications: {health_metric.get('medications') or 'None reported'}
- Activity Level: {health_metric.get('activity_level', 'moderate')}

ORDER HISTORY (last 30 days):
{order_history}

USER TASTE PREFERENCES (from ratings):
- Highly Rated Meals (loved): {liked_str}
- Low Rated Meals (disliked): {disliked_str}"""


def build_meals_context(meals: List[dict]) -> str:
    if not meals:
        return "No meals available."
    lines = ["AVAILABLE MEALS:"]
    for m in meals:
        lines.append(
            f"- ID:{m['id']} | {m['name']} | {m['category']} | "
            f"{m['calories']} kcal | ${m['price']:.2f} | {m['dietary']}"
        )
    return "\n".join(lines)


def get_ai_recommendations(
    health_metric: dict,
    today_log: dict,
    recent_orders: List[dict],
    available_meals: List[dict],
    user_message: Optional[str] = None,
) -> dict:
    """
    Calls Groq (FREE Llama 3.1) and returns structured meal recommendations.
    """
    client = Groq(api_key=GROQ_API_KEY)

    user_ctx = build_user_context(health_metric, today_log, recent_orders)
    meals_ctx = build_meals_context(available_meals)

    calorie_target = today_log.get(
        "calorie_target", health_metric.get("target_calories", 2000)
    )
    calories_left = max(0, calorie_target - today_log.get("calories_consumed", 0))
    custom = f"\nUser's specific request: {user_message}" if user_message else ""

    prompt = f"""You are Wellora's AI nutritionist. Recommend meals from the available list based on the user's health profile.

{user_ctx}

{meals_ctx}
{custom}

Select TOP 3-5 meals that best match:
1. The user's health goal and calorie budget ({calories_left} kcal remaining today)
2. Their dietary preferences and allergies (NEVER recommend meals with allergens)
3. Their reported medical conditions and medication-related food restrictions
4. Nutritional balance
5. Prioritize meals similar to their highly-rated (4-5 star) meals
6. AVOID recommending meals rated 1-2 stars by the user
7. Provide variety — avoid repeating meals ordered very recently

Respond ONLY in this exact JSON format, no extra text, no markdown:
{{
  "recommendations": [
    {{
      "meal_id": <integer>,
      "meal_name": "<name>",
      "reason": "<1-2 sentence personalized reason>",
      "priority": "<high|medium|low>",
      "calories": <integer>,
      "dietary": "<type>"
    }}
  ],
  "ai_summary": "<2-3 sentence nutrition advice for the user>",
  "daily_tip": "<one actionable wellness tip based on their data>",
  "calories_remaining": {calories_left}
}}"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",  # FREE model
        messages=[
            {
                "role": "system",
                "content": "You are a professional nutritionist AI. Always respond with valid JSON only. No markdown, no explanations outside JSON.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=1024,
    )

    raw = response.choices[0].message.content.strip()

    # Clean up common issues
    raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        result = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON block if surrounded by text
        match = re.search(r"\{[\s\S]*\}", raw)
        if match:
            result = json.loads(match.group())
        else:
            raise ValueError(f"AI returned invalid response: {raw[:300]}")

    return result
