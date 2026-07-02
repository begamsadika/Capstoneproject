import pandas as pd
import networkx as nx
import pickle
import json

def load_graph(filename='enhanced_diet_knowledge_graph.gpickle'):
    """Load the NetworkX graph"""
    try:
        # Try the newer method first
        with open(filename, 'rb') as f:
            G = pickle.load(f)
    except:
        # Fallback for older NetworkX versions
        G = nx.read_gpickle(filename)
    return G

def get_recommended_meal_plans_for_condition(G, condition):
    """Get recommended meal plans for a specific medical condition"""
    if not G.has_node(condition):
        return []
    
    meal_plans = []
    # Look for edges from condition to meal plans
    for neighbor in G.neighbors(condition):
        edge_data = G.get_edge_data(condition, neighbor)
        if edge_data.get('relationship') == 'recommends':
            # Verify it's a meal plan node
            neighbor_data = G.nodes[neighbor]
            if neighbor_data.get('type') == 'meal_plan':
                meal_plans.append(neighbor)
    
    return meal_plans

def get_foods_by_meal_plan(G, meal_plan):
    """Get foods that might be suitable for a meal plan (simplified)"""
    # In a real system, you'd have more sophisticated mapping
    # For now, we'll return foods that match general dietary guidelines
    
    # Get food nodes
    food_nodes = [n for n, d in G.nodes(data=True) if d.get('type') == 'food']
    
    # Filter based on meal plan characteristics (simplified)
    suitable_foods = []
    
    for food in food_nodes:
        food_data = G.nodes[food]
        score = 0
        
        # Simple scoring based on meal plan type
        if meal_plan == 'Low-Fat Diet':
            # Prefer lower fat foods
            fat_g = food_data.get('fat_g', 0)
            if fat_g < 10:  # Arbitrary threshold
                score += 1
                
        elif meal_plan == 'Low-Carb Diet':
            # Prefer lower carb foods
            carbs_g = food_data.get('carbs_g', 0)
            if carbs_g < 30:  # Arbitrary threshold
                score += 1
                
        elif meal_plan == 'High-Protein Diet':
            # Prefer higher protein foods
            protein_g = food_data.get('protein_g', 0)
            if protein_g > 15:  # Arbitrary threshold
                score += 1
                
        elif meal_plan == 'Balanced Diet':
            # Accept most foods in moderation
            score += 1
        
        if score > 0:
            suitable_foods.append((food, score))
    
    # Sort by score (descending) and return food names
    suitable_foods.sort(key=lambda x: x[1], reverse=True)
    return [food for food, _ in suitable_foods]

def get_ingredients_to_avoid_for_allergy(G, allergy):
    """Get ingredients that should be avoided for a specific allergy"""
    # Mapping of allergies to ingredients to avoid
    allergy_ingredients = {
        'Lactose Intolerance': ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'ghee', 'paneer'],
        'Nut Allergy': ['peanuts', 'almonds', 'walnuts', 'cashews', 'sesame seeds', 'pistachios', 'hazelnuts'],
        'Gluten Intolerance': ['wheat flour', 'white rice flour', 'red rice flour', 'brown rice flour', 
                              'millet flour', 'sorghum flour', 'corn flour', 'chickpea flour',
                              'green gram flour', 'black gram flour', 'lentil flour', 'barley flour',
                              'oat flour', 'coconut flour', 'tapioca flour', 'arrowroot flour',
                              'cassava flour']
    }
    
    if allergy in allergy_ingredients:
        # Return only those ingredients that actually exist in our graph
        available_ingredients = []
        for ingredient in allergy_ingredients[allergy]:
            if G.has_node(ingredient):
                available_ingredients.append(ingredient)
        return available_ingredients
    
    return []

def get_nutrition_info(G, ingredient_name):
    """Get nutritional information for an ingredient"""
    if G.has_node(ingredient_name):
        node_data = G.nodes[ingredient_name]
        if node_data.get('type') == 'ingredient':
            # Return key nutritional info
            return {
                'calories': node_data.get('calories', 0),
                'protein': node_data.get('protein', 0),
                'carbs': node_data.get('carbs', 0),
                'fat': node_data.get('fat', 0),
                'fiber': node_data.get('fiber', 0),
                'category': node_data.get('category', 'Unknown'),
                'veg_nonveg': node_data.get('veg_nonveg', 'Unknown')
            }
    return None

def get_food_nutrition_summary(G, food_name):
    """Get nutrition summary for a food item"""
    if G.has_node(food_name):
        food_data = G.nodes[food_name]
        if food_data.get('type') == 'food':
            return {
                'calories': food_data.get('calories', 0),
                'protein_g': food_data.get('protein_g', 0),
                'carbs_g': food_data.get('carbs_g', 0),
                'fat_g': food_data.get('fat_g', 0),
                'fiber_g': food_data.get('fiber_g', 0),
                'category': food_data.get('category', 'Unknown'),
                'dietary_tags': food_data.get('dietary_tags', '')
            }
    return None

def main():
    """Demo queries on the enhanced knowledge graph"""
    print("=== Enhanced Diet Knowledge Graph Query Demo ===")
    
    # Load the graph
    G = load_graph()
    print(f"Loaded graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    
    # Example queries for different conditions
    conditions = ['Diabetes', 'Hypertension', 'Heart Disease', 'Obesity']
    
    for condition in conditions:
        print(f"\n{condition}:")
        
        # Get recommended meal plans
        meal_plans = get_recommended_meal_plans_for_condition(G, condition)
        if meal_plans:
            print(f"  Recommended meal plans: {', '.join(meal_plans)}")
            
            # Get sample foods for each meal plan
            for plan in meal_plans[:2]:  # Limit to first 2 plans
                suitable_foods = get_foods_by_meal_plan(G, plan)
                if suitable_foods:
                    print(f"  Sample foods for {plan}: {', '.join(suitable_foods[:3])}")
        else:
            print(f"  No specific recommendations found for {condition}")
    
    # Example allergy queries
    print(f"\nAllergy Information:")
    allergies = ['Lactose Intolerance', 'Nut Allergy', 'Gluten Intolerance']
    for allergy in allergies:
        avoid_ingredients = get_ingredients_to_avoid_for_allergy(G, allergy)
        if avoid_ingredients:
            print(f"  {allergy} - Avoid: {', '.join(avoid_ingredients[:5])}...")
        else:
            print(f"  {allergy} - No specific avoidance list")
    
    # Example ingredient nutrition lookup
    print(f"\nIngredient Nutrition Examples:")
    sample_ingredients = ['White rice', 'Lentils', 'Chicken breast', 'Spinach']
    for ingredient in sample_ingredients:
        nutrition = get_nutrition_info(G, ingredient)
        if nutrition:
            print(f"  {ingredient}: {nutrition['calories']} cal, {nutrition['protein']}g protein, {nutrition['carbs']}g carbs")
        else:
            print(f"  {ingredient}: Not found in nutrition database")
    
    # Example food nutrition lookup
    print(f"\nFood Nutrition Examples:")
    sample_foods = ['Kiribath', 'Dhal Curry', 'Kottu Roti', 'Hoppers Appa']
    for food in sample_foods:
        nutrition = get_food_nutrition_summary(G, food)
        if nutrition:
            print(f"  {food}: {nutrition['calories']} cal, {nutrition['protein_g']}g protein, {nutrition['carbs_g']}g carbs")
        else:
            print(f"  {food}: Not found in food database")
    
    print("\n=== Demo Complete ===")

if __name__ == "__main__":
    main()