"""
Health calculation service.
All formulas used for BMI, BMR, macros, etc.
This data feeds the AI recommendation engine.
"""

ACTIVITY_FACTORS = {
    "sedentary": 1.2,  # desk job, no exercise
    "light": 1.375,  # light exercise 1-3 days/week
    "moderate": 1.55,  # moderate exercise 3-5 days/week
    "active": 1.725,  # hard exercise 6-7 days/week
    "very_active": 1.9,  # very hard exercise, physical job
}

GOAL_CALORIE_ADJUSTMENTS = {
    "lose": -500,  # 0.5 kg per week deficit
    "maintain": 0,
    "gain": +500,  # 0.5 kg per week surplus
}


def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    """Body Mass Index"""
    if height_cm <= 0:
        return 0.0
    height_m = height_cm / 100
    return round(weight_kg / (height_m**2), 1)


def get_bmi_category(bmi: float) -> str:
    if bmi < 18.5:
        return "Underweight"
    if bmi < 25.0:
        return "Normal weight"
    if bmi < 30.0:
        return "Overweight"
    return "Obese"


def calculate_bmr(weight_kg: float, height_cm: float, age: int, gender: str) -> float:
    """
    Mifflin-St Jeor Equation (most accurate modern formula)
    Male:   BMR = 10W + 6.25H - 5A + 5
    Female: BMR = 10W + 6.25H - 5A - 161
    """
    bmr = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if gender == "male":
        bmr += 5
    else:
        bmr -= 161
    return round(bmr, 1)


def calculate_maintenance_calories(bmr: float, activity_level: str) -> int:
    """Total Daily Energy Expenditure (TDEE)"""
    factor = ACTIVITY_FACTORS.get(activity_level, 1.55)
    return round(bmr * factor)


def calculate_target_calories(maintenance: int, health_goal: str) -> int:
    """Adjust calories based on goal"""
    adjustment = GOAL_CALORIE_ADJUSTMENTS.get(health_goal, 0)
    return max(1200, maintenance + adjustment)  # never below 1200


def calculate_macros(target_calories: int, health_goal: str):
    """
    Macro split based on goal:
    - Lose:     High protein (40/30/30)
    - Maintain: Balanced    (30/40/30)
    - Gain:     High carbs  (30/50/20)
    Returns (protein_g, carbs_g, fat_g)
    """
    if health_goal == "lose":
        protein_pct, carbs_pct, fat_pct = 0.40, 0.30, 0.30
    elif health_goal == "gain":
        protein_pct, carbs_pct, fat_pct = 0.30, 0.50, 0.20
    else:
        protein_pct, carbs_pct, fat_pct = 0.30, 0.40, 0.30

    protein_g = round((target_calories * protein_pct) / 4, 1)
    carbs_g = round((target_calories * carbs_pct) / 4, 1)
    fat_g = round((target_calories * fat_pct) / 9, 1)
    return protein_g, carbs_g, fat_g


def calculate_ideal_weight(height_cm: float, gender: str) -> float:
    """
    Devine Formula
    Male:   52 + 2.3 × (height_inches - 60)
    Female: 49 + 2.3 × (height_inches - 60)
    """
    height_inches = height_cm / 2.54
    base = 52 if gender == "male" else 49
    return round(base + 2.3 * (height_inches - 60), 1)


def calculate_weeks_to_goal(
    current_weight: float, goal_weight: float, health_goal: str
) -> int:
    """Estimate weeks to reach goal at 0.5 kg/week"""
    if health_goal == "maintain":
        return 0
    diff = abs(current_weight - goal_weight)
    return round(diff / 0.5)


def calculate_wellness_score(
    calories_consumed: int, calorie_target: int, meals_count: int
) -> int:
    """
    Score 0-100 based on:
    - Calorie adherence (70%)
    - Meal frequency     (30%)
    """
    # Calorie score
    if calorie_target > 0:
        ratio = calories_consumed / calorie_target
        cal_score = 100 if 0.9 <= ratio <= 1.1 else max(0, 100 - abs(ratio - 1.0) * 200)
    else:
        cal_score = 0

    # Meal frequency score (3 meals = 100%)
    meal_score = min(100, (meals_count / 3) * 100)

    return round(cal_score * 0.7 + meal_score * 0.3)


def build_health_metrics(
    user_id: int,
    gender: str,
    height_cm: float,
    weight_kg: float,
    health_goal: str,
    activity_level: str = "moderate",
    age: int = 30,
    dietary_pref: str = "",
    allergies: str = "",
):
    """
    Master function — calculates ALL health metrics.
    Call this after onboarding or profile update.
    """
    bmi = calculate_bmi(height_cm, weight_kg)
    bmi_category = get_bmi_category(bmi)
    bmr = calculate_bmr(weight_kg, height_cm, age, gender)
    maintenance_cal = calculate_maintenance_calories(bmr, activity_level)
    target_cal = calculate_target_calories(maintenance_cal, health_goal)
    protein_g, carbs_g, fat_g = calculate_macros(target_cal, health_goal)
    ideal_weight = calculate_ideal_weight(height_cm, gender)
    weight_diff = round(weight_kg - ideal_weight, 1)
    weeks_to_goal = calculate_weeks_to_goal(weight_kg, ideal_weight, health_goal)
    cal_deficit = target_cal - maintenance_cal

    return {
        "user_id": user_id,
        "height_cm": height_cm,
        "weight_kg": weight_kg,
        "bmi": bmi,
        "bmi_category": bmi_category,
        "bmr": bmr,
        "maintenance_calories": maintenance_cal,
        "target_calories": target_cal,
        "protein_target_g": protein_g,
        "carbs_target_g": carbs_g,
        "fat_target_g": fat_g,
        "health_goal": health_goal,
        "activity_level": activity_level,
        "dietary_preference": dietary_pref,
        "allergies": allergies,
        "ideal_weight_kg": ideal_weight,
        "weight_to_goal_kg": weight_diff,
        "estimated_weeks_to_goal": weeks_to_goal,
        "calorie_deficit_surplus": cal_deficit,
    }
