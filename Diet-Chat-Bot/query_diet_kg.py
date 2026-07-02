import pandas as pd
import networkx as nx
import pickle
import json

def load_graph(filename='diet_knowledge_graph.gpickle'):
    """Load the NetworkX graph"""
    try:
        # Try the newer method first
        with open(filename, 'rb') as f:
            G = pickle.load(f)
    except:
        # Fallback for older NetworkX versions
        G = nx.read_gpickle(filename)
    return G

def get_foods_for_condition(G, condition, limit=10):
    """
    Find foods that might be suitable for a given condition
    This is a simplified example - in practice, you'd need more sophisticated logic
    """
    # Find patient records with this condition
    # For now, we'll return some general healthy foods
    # In a real system, you'd correlate conditions with recommended meal plans
    
    # Get food nodes
    food_nodes = [n for n, d in G.nodes(data=True) if d.get('type') == 'food']
    
    # Filter for vegetarian foods (as example)
    veg_foods = []
    for food in food_nodes:
        food_data = G.nodes[food]
        if 'dietary_tags' in food_data and 'Vegetarian' in food_data['dietary_tags']:
            veg_foods.append((food, food_data.get('calories', 0)))
    
    # Sort by calories (lower calorie foods first as example)
    veg_foods.sort(key=lambda x: x[1])
    
    return [food for food, _ in veg_foods[:limit]]

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
                'category': node_data.get('category', 'Unknown')
            }
    return None

def get_ingredients_in_food(G, food_name):
    """Get ingredients that make up a food item"""
    if G.has_node(food_name):
        food_data = G.nodes[food_name]
        if food_data.get('type') == 'food':
            # Get all ingredients this food contains
            ingredients = []
            for neighbor in G.neighbors(food_name):
                edge_data = G.get_edge_data(food_name, neighbor)
                if edge_data.get('relationship') == 'contains':
                    ingredients.append(neighbor)
            return ingredients
    return []

def find_similar_foods(G, food_name, limit=5):
    """Find foods with similar nutritional profiles"""
    if not G.has_node(food_name):
        return []
    
    target_food = G.nodes[food_name]
    if target_food.get('type') != 'food':
        return []
    
    # Get target nutrition
    target_calories = target_food.get('calories', 0)
    target_protein = target_food.get('protein_g', 0)
    
    # Compare with other foods
    similarities = []
    for node, node_data in G.nodes(data=True):
        if node_data.get('type') == 'food' and node != food_name:
            # Simple distance based on calories and protein
            cal_diff = abs(node_data.get('calories', 0) - target_calories)
            prot_diff = abs(node_data.get('protein_g', 0) - target_protein)
            distance = cal_diff * 0.1 + prot_diff  # Weight calories less
            
            similarities.append((node, distance))
    
    # Sort by distance (closest first)
    similarities.sort(key=lambda x: x[1])
    
    return [food for food, _ in similarities[:limit]]

def main():
    """Demo queries on the knowledge graph"""
    print("=== Diet Knowledge Graph Query Demo ===")
    
    # Load the graph
    G = load_graph()
    print(f"Loaded graph with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    
    # Example queries
    print("\n1. Finding vegetarian foods (lower calorie options):")
    veg_foods = get_foods_for_condition(G, "general", limit=5)
    for i, food in enumerate(veg_foods, 1):
        food_data = G.nodes[food]
        calories = food_data.get('calories', 'N/A')
        print(f"   {i}. {food} ({calories} calories)")
    
    print("\n2. Getting ingredients for 'Kiribath':")
    kiribath_ingredients = get_ingredients_in_food(G, "Kiribath")
    if kiribath_ingredients:
        print(f"   Kiribath contains: {', '.join(kiribath_ingredients)}")
        
        # Get nutrition for first ingredient
        if kiribath_ingredients:
            first_ing = kiribath_ingredients[0]
            nutrition = get_nutrition_info(G, first_ing)
            if nutrition:
                print(f"   Nutrition for {first_ing}:")
                for key, value in nutrition.items():
                    print(f"     {key}: {value}")
    else:
        print("   Could not find ingredients for Kiribath")
    
    print("\n3. Finding foods similar to 'Dhal Curry':")
    similar_foods = find_similar_foods(G, "Dhal Curry", limit=3)
    for i, food in enumerate(similar_foods, 1):
        food_data = G.nodes[food]
        calories = food_data.get('calories', 'N/A')
        print(f"   {i}. {food} ({calories} calories)")
    
    print("\n4. Checking if graph has nutrient connections:")
    # Check if we have ingredient nodes with nutritional data
    ingredient_nodes = [n for n, d in G.nodes(data=True) if d.get('type') == 'ingredient']
    if ingredient_nodes:
        sample_ing = ingredient_nodes[0]
        ing_data = G.nodes[sample_ing]
        print(f"   Sample ingredient: {sample_ing}")
        print(f"   Has nutritional data: {'calories' in ing_data}")
        if 'calories' in ing_data:
            print(f"   Calories: {ing_data['calories']}")
    
    print("\n=== Demo Complete ===")

if __name__ == "__main__":
    main()