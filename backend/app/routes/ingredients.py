from fastapi import APIRouter

router = APIRouter(prefix="/ingredients", tags=["Ingredients"])


INGREDIENTS = [
    {"id": "apple", "name": "Apple", "active": True, "nutritionPer100g": {"calories": 52, "protein": 0.3, "carbs": 13.8, "fat": 0.2}},
    {"id": "apple-green", "name": "Apple Green", "active": True, "nutritionPer100g": {"calories": 58, "protein": 0.4, "carbs": 13.6, "fat": 0.2}},
    {"id": "apple-red", "name": "Apple Red", "active": True, "nutritionPer100g": {"calories": 52, "protein": 0.3, "carbs": 14.0, "fat": 0.2}},
    {"id": "banana", "name": "Banana", "active": True, "nutritionPer100g": {"calories": 89, "protein": 1.1, "carbs": 22.8, "fat": 0.3}},
    {"id": "mango", "name": "Mango", "active": True, "nutritionPer100g": {"calories": 60, "protein": 0.8, "carbs": 15.0, "fat": 0.4}},
    {"id": "pineapple", "name": "Pineapple", "active": True, "nutritionPer100g": {"calories": 50, "protein": 0.5, "carbs": 13.1, "fat": 0.1}},
    {"id": "orange", "name": "Orange", "active": True, "nutritionPer100g": {"calories": 47, "protein": 0.9, "carbs": 11.8, "fat": 0.1}},
    {"id": "strawberry", "name": "Strawberry", "active": True, "nutritionPer100g": {"calories": 32, "protein": 0.7, "carbs": 7.7, "fat": 0.3}},
    {"id": "blueberry", "name": "Blueberry", "active": True, "nutritionPer100g": {"calories": 57, "protein": 0.7, "carbs": 14.5, "fat": 0.3}},
    {"id": "avocado", "name": "Avocado", "active": True, "nutritionPer100g": {"calories": 160, "protein": 2.0, "carbs": 8.5, "fat": 14.7}},
    {"id": "broccoli", "name": "Broccoli", "active": True, "nutritionPer100g": {"calories": 35, "protein": 2.4, "carbs": 7.2, "fat": 0.4}},
    {"id": "broccoli-sprouts", "name": "Broccoli Sprouts", "active": True, "nutritionPer100g": {"calories": 35, "protein": 2.3, "carbs": 5.5, "fat": 0.5}},
    {"id": "spinach", "name": "Spinach", "active": True, "nutritionPer100g": {"calories": 23, "protein": 2.9, "carbs": 3.6, "fat": 0.4}},
    {"id": "kale", "name": "Kale", "active": True, "nutritionPer100g": {"calories": 49, "protein": 4.3, "carbs": 8.8, "fat": 0.9}},
    {"id": "carrot", "name": "Carrot", "active": True, "nutritionPer100g": {"calories": 41, "protein": 0.9, "carbs": 9.6, "fat": 0.2}},
    {"id": "potato", "name": "Potato", "active": True, "nutritionPer100g": {"calories": 77, "protein": 2.0, "carbs": 17.0, "fat": 0.1}},
    {"id": "sweet-potato", "name": "Sweet Potato", "active": True, "nutritionPer100g": {"calories": 86, "protein": 1.6, "carbs": 20.1, "fat": 0.1}},
    {"id": "tomato", "name": "Tomato", "active": True, "nutritionPer100g": {"calories": 18, "protein": 0.9, "carbs": 3.9, "fat": 0.2}},
    {"id": "cucumber", "name": "Cucumber", "active": True, "nutritionPer100g": {"calories": 15, "protein": 0.7, "carbs": 3.6, "fat": 0.1}},
    {"id": "onion", "name": "Onion", "active": True, "nutritionPer100g": {"calories": 40, "protein": 1.1, "carbs": 9.3, "fat": 0.1}},
    {"id": "garlic", "name": "Garlic", "active": True, "nutritionPer100g": {"calories": 149, "protein": 6.4, "carbs": 33.1, "fat": 0.5}},
    {"id": "ginger", "name": "Ginger", "active": True, "nutritionPer100g": {"calories": 80, "protein": 1.8, "carbs": 17.8, "fat": 0.8}},
    {"id": "cilantro", "name": "Cilantro", "active": True, "nutritionPer100g": {"calories": 23, "protein": 2.1, "carbs": 3.7, "fat": 0.5}},
    {"id": "basil", "name": "Basil", "active": True, "nutritionPer100g": {"calories": 23, "protein": 3.2, "carbs": 2.7, "fat": 0.6}},
    {"id": "cinnamon", "name": "Cinnamon", "active": True, "nutritionPer100g": {"calories": 247, "protein": 4.0, "carbs": 80.6, "fat": 1.2}},
    {"id": "turmeric", "name": "Turmeric", "active": True, "nutritionPer100g": {"calories": 312, "protein": 9.7, "carbs": 67.1, "fat": 3.3}},
    {"id": "chicken-breast", "name": "Chicken Breast", "active": True, "nutritionPer100g": {"calories": 165, "protein": 31.0, "carbs": 0.0, "fat": 3.6}},
    {"id": "chicken-thigh", "name": "Chicken Thigh", "active": True, "nutritionPer100g": {"calories": 209, "protein": 26.0, "carbs": 0.0, "fat": 10.9}},
    {"id": "chicken-liver", "name": "Chicken Liver", "active": True, "nutritionPer100g": {"calories": 167, "protein": 24.5, "carbs": 0.9, "fat": 6.5}},
    {"id": "turkey-breast", "name": "Turkey Breast", "active": True, "nutritionPer100g": {"calories": 135, "protein": 29.0, "carbs": 0.0, "fat": 1.6}},
    {"id": "beef", "name": "Beef", "active": True, "nutritionPer100g": {"calories": 250, "protein": 26.0, "carbs": 0.0, "fat": 15.0}},
    {"id": "pork-loin", "name": "Pork Loin", "active": True, "nutritionPer100g": {"calories": 242, "protein": 27.3, "carbs": 0.0, "fat": 14.0}},
    {"id": "egg", "name": "Egg", "active": True, "nutritionPer100g": {"calories": 155, "protein": 13.0, "carbs": 1.1, "fat": 11.0}},
    {"id": "salmon", "name": "Salmon", "active": True, "nutritionPer100g": {"calories": 208, "protein": 20.0, "carbs": 0.0, "fat": 13.0}},
    {"id": "tuna", "name": "Tuna", "active": True, "nutritionPer100g": {"calories": 132, "protein": 28.0, "carbs": 0.0, "fat": 1.3}},
    {"id": "shrimp", "name": "Shrimp", "active": True, "nutritionPer100g": {"calories": 99, "protein": 24.0, "carbs": 0.2, "fat": 0.3}},
    {"id": "cod", "name": "Cod", "active": True, "nutritionPer100g": {"calories": 82, "protein": 18.0, "carbs": 0.0, "fat": 0.7}},
    {"id": "milk", "name": "Milk", "active": True, "nutritionPer100g": {"calories": 61, "protein": 3.2, "carbs": 4.8, "fat": 3.3}},
    {"id": "greek-yogurt", "name": "Greek Yogurt", "active": True, "nutritionPer100g": {"calories": 59, "protein": 10.0, "carbs": 3.6, "fat": 0.4}},
    {"id": "cheddar-cheese", "name": "Cheddar Cheese", "active": True, "nutritionPer100g": {"calories": 403, "protein": 24.9, "carbs": 1.3, "fat": 33.1}},
    {"id": "butter", "name": "Butter", "active": True, "nutritionPer100g": {"calories": 717, "protein": 0.9, "carbs": 0.1, "fat": 81.1}},
    {"id": "white-rice", "name": "White Rice", "active": True, "nutritionPer100g": {"calories": 130, "protein": 2.7, "carbs": 28.2, "fat": 0.3}},
    {"id": "brown-rice", "name": "Brown Rice", "active": True, "nutritionPer100g": {"calories": 111, "protein": 2.6, "carbs": 23.0, "fat": 0.9}},
    {"id": "basmati-rice", "name": "Basmati Rice", "active": True, "nutritionPer100g": {"calories": 121, "protein": 3.5, "carbs": 25.2, "fat": 0.4}},
    {"id": "jasmine-rice", "name": "Jasmine Rice", "active": True, "nutritionPer100g": {"calories": 129, "protein": 2.9, "carbs": 27.9, "fat": 0.3}},
    {"id": "oats", "name": "Oats", "active": True, "nutritionPer100g": {"calories": 389, "protein": 16.9, "carbs": 66.3, "fat": 6.9}},
    {"id": "quinoa", "name": "Quinoa", "active": True, "nutritionPer100g": {"calories": 120, "protein": 4.4, "carbs": 21.3, "fat": 1.9}},
    {"id": "pasta", "name": "Pasta", "active": True, "nutritionPer100g": {"calories": 131, "protein": 5.0, "carbs": 25.0, "fat": 1.1}},
    {"id": "spaghetti", "name": "Spaghetti", "active": True, "nutritionPer100g": {"calories": 158, "protein": 5.8, "carbs": 30.9, "fat": 0.9}},
    {"id": "bread", "name": "Bread", "active": True, "nutritionPer100g": {"calories": 265, "protein": 9.0, "carbs": 49.0, "fat": 3.2}},
    {"id": "whole-wheat-flour", "name": "Whole Wheat Flour", "active": True, "nutritionPer100g": {"calories": 340, "protein": 13.2, "carbs": 72.0, "fat": 2.5}},
    {"id": "sugar", "name": "Sugar", "active": True, "nutritionPer100g": {"calories": 387, "protein": 0.0, "carbs": 100.0, "fat": 0.0}},
    {"id": "lentils", "name": "Lentils", "active": True, "nutritionPer100g": {"calories": 116, "protein": 9.0, "carbs": 20.0, "fat": 0.4}},
    {"id": "chickpeas", "name": "Chickpeas", "active": True, "nutritionPer100g": {"calories": 164, "protein": 8.9, "carbs": 27.4, "fat": 2.6}},
    {"id": "black-beans", "name": "Black Beans", "active": True, "nutritionPer100g": {"calories": 132, "protein": 8.9, "carbs": 23.7, "fat": 0.5}},
    {"id": "tofu", "name": "Tofu", "active": True, "nutritionPer100g": {"calories": 76, "protein": 8.0, "carbs": 1.9, "fat": 4.8}},
    {"id": "tempeh", "name": "Tempeh", "active": True, "nutritionPer100g": {"calories": 193, "protein": 20.3, "carbs": 7.6, "fat": 10.8}},
    {"id": "almonds", "name": "Almonds", "active": True, "nutritionPer100g": {"calories": 579, "protein": 21.2, "carbs": 21.6, "fat": 49.9}},
    {"id": "peanuts", "name": "Peanuts", "active": True, "nutritionPer100g": {"calories": 567, "protein": 25.8, "carbs": 16.1, "fat": 49.2}},
    {"id": "chia-seeds", "name": "Chia Seeds", "active": True, "nutritionPer100g": {"calories": 486, "protein": 16.5, "carbs": 42.1, "fat": 30.7}},
    {"id": "sunflower-seeds", "name": "Sunflower Seeds", "active": True, "nutritionPer100g": {"calories": 584, "protein": 20.8, "carbs": 20.0, "fat": 51.5}},
    {"id": "olive-oil", "name": "Olive Oil", "active": True, "nutritionPer100g": {"calories": 884, "protein": 0.0, "carbs": 0.0, "fat": 100.0}},
    {"id": "coconut-milk", "name": "Coconut Milk", "active": True, "nutritionPer100g": {"calories": 230, "protein": 2.3, "carbs": 5.5, "fat": 23.8}},
    {"id": "soy-sauce", "name": "Soy Sauce", "active": True, "nutritionPer100g": {"calories": 53, "protein": 8.1, "carbs": 4.9, "fat": 0.6}},
    {"id": "tomato-sauce", "name": "Tomato Sauce", "active": True, "nutritionPer100g": {"calories": 29, "protein": 1.3, "carbs": 6.7, "fat": 0.2}},
    {"id": "mayonnaise", "name": "Mayonnaise", "active": True, "nutritionPer100g": {"calories": 680, "protein": 1.0, "carbs": 0.6, "fat": 75.0}},
    {"id": "green-tea", "name": "Green Tea", "active": True, "nutritionPer100g": {"calories": 1, "protein": 0.0, "carbs": 0.0, "fat": 0.0}},
    {"id": "orange-juice", "name": "Orange Juice", "active": True, "nutritionPer100g": {"calories": 45, "protein": 0.7, "carbs": 10.4, "fat": 0.2}},
]


def relevance_score(name: str, query: str) -> tuple[int, int, str]:
    lower_name = name.lower()
    words = lower_name.split()
    if lower_name == query:
        rank = 0
    elif lower_name.startswith(query):
        rank = 1
    elif any(word.startswith(query) for word in words):
        rank = 2
    elif query in lower_name:
        rank = 3
    else:
        rank = 4
    return (rank, lower_name.find(query), lower_name)


@router.get("/search")
def search_ingredients(q: str = ""):
    query = q.strip().lower()
    if len(query) < 2:
        return []

    matches = [
        item
        for item in INGREDIENTS
        if item.get("active") and query in item["name"].lower()
    ]
    matches.sort(key=lambda item: relevance_score(item["name"], query))

    return [
        {
            "id": item["id"],
            "name": item["name"],
            "nutritionPer100g": item["nutritionPer100g"],
        }
        for item in matches[:20]
    ]
