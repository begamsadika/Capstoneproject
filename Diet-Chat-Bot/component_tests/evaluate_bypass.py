from bypass_handlers import (
    detect_bmi_faq_query, detect_goal_calorie_query, detect_ideal_weight_query,
    detect_profile_fact_query, detect_safe_timeline_query,
    detect_time_to_goal_query, detect_weight_assessment_query,
    detect_weight_recommendation_query,
)
from component_tests.common import keyword_score, save, show_case, timed

METRICS = {
    "weight_kg": 70, "height_cm": 160, "age": 28, "gender": "female",
    "bmi": 27.3, "bmi_category": "Overweight", "health_goal": "lose_weight",
    "target_calories": 1653, "maintenance_calories": 2153,
    "ideal_weight_kg": 55.9, "weight_to_goal_kg": -14.1,
    "estimated_weeks_to_goal": 28,
}

GROUPS = [
    ("profile_fact", detect_profile_fact_query, ["What is my BMI?", "Tell me my current BMI", "What is my current weight?", "How much do I weigh?", "How tall am I?"], [["27.3"], ["27.3"], ["70"], ["70"], ["160"]]),
    ("bmi_faq", lambda q, m: detect_bmi_faq_query(q), ["What is BMI?", "How is BMI calculated?", "What does BMI mean?", "Explain body mass index", "How do doctors calculate BMI?"], [["body mass index"], ["weight", "height"], ["body mass index"], ["weight", "height"], ["weight", "height"]]),
    ("goal_calories", detect_goal_calorie_query, ["How many calories should I eat to lose weight?", "What is my calorie target?", "What is my maintenance calorie?", "How many calories do I need to maintain?", "Tell me my daily calorie deficit target"], [["1653"], ["1653"], ["2153"], ["2153"], ["calorie", "target"]]),
    ("ideal_weight", detect_ideal_weight_query, ["What is my ideal weight?", "How much should I ideally weigh?", "Tell me my healthy target weight", "What should my target body weight be?", "Calculate my ideal weight"], [["55.9"], ["55.9"], ["55.9"], ["55.9"], ["55.9"]]),
    ("time_to_goal", detect_time_to_goal_query, ["How long until I reach my goal?", "How many weeks to my target weight?", "When will I reach my ideal weight?", "Estimate my time to goal", "How long to lose the weight to my goal?"], [["week"], ["week"], ["week"], ["week"], ["week"]]),
    ("safe_timeline", detect_safe_timeline_query, ["Is it safe to lose 10kg in one month?", "Can I safely gain 10kg in two months?", "Is losing 5kg in two weeks safe?", "What is a safe pace for weight loss?", "Can I lose 20kg in 30 days safely?"], [["safe"], ["safe"], ["safe"], ["week"], ["safe"]]),
    ("weight_recommendation", detect_weight_recommendation_query, ["Should I lose or gain weight?", "Do I need to lose weight?", "Should I gain weight based on my BMI?", "What weight change do you recommend?", "Am I better off losing weight?"], [["lose"], ["lose"], ["weight"], ["weight"], ["lose"]]),
    ("weight_assessment", detect_weight_assessment_query, ["Am I overweight?", "Is my weight healthy?", "Assess my current weight", "What does my BMI category mean for me?", "Is 70kg healthy for my height?"], [["overweight"], ["weight"], ["weight"], ["overweight"], ["weight"]]),
    ("goal_calories", detect_goal_calorie_query, ["What is my TDEE?", "Calories per day for my goal?", "Show my maintenance and target calories", "What daily intake supports weight loss?", "How large is my calorie deficit?"], [["2153"], ["calorie"], ["2153", "1653"], ["1653"], ["500"]]),
    ("profile_fact", detect_profile_fact_query, ["Can you remind me of my height?", "Remind me of my body weight", "Show my saved BMI", "What BMI is recorded in my profile?", "What height is saved for me?"], [["160"], ["70"], ["27.3"], ["27.3"], ["160"]]),
]

results = []
case_id = 0
for handler_name, handler, questions, expectations in GROUPS:
    for question, expected in zip(questions, expectations):
        case_id += 1
        answer, error, elapsed = timed(lambda h=handler, q=question: h(q, METRICS))
        score, matched = keyword_score(answer or "", expected)
        results.append({"id": case_id, "handler": handler_name, "question": question, "expected_keywords": expected, "matched_keywords": matched, "answer": answer, "score": round(score, 2), "error": error, "elapsed_ms": elapsed, "status": "PASS" if not error and answer and score >= 0.5 else "FAIL"})
        show_case(results[-1], answer, "Bypass answer")

save("bypass", results, "bypass_results.json")
