import pandas as pd
import networkx as nx
import pickle
import json
import os

def load_and_analyze_data():
    """Load and analyze the CSV datasets"""
    print("Loading datasets...")
    
    # Load the three CSV files
    nutrition_df = pd.read_csv('DataSets/nutrition_data_my.csv')
    illness_df = pd.read_csv('DataSets/Illness__Diet_Recommendations.csv')
    food_df = pd.read_csv('DataSets/food_ingredient_my.csv')
    
    print(f"Nutrition data: {nutrition_df.shape[0]} ingredients")
    print(f"Illness/Diet data: {illness_df.shape[0]} patient records")
    print(f"Food ingredients data: {food_df.shape[0]} food items")
    
    return nutrition_df, illness_df, food_df

def create_enhanced_knowledge_graph(nutrition_df, illness_df, food_df):
    """Create an enhanced knowledge graph connecting foods, ingredients, nutrients, and patient data"""
    print("Building enhanced knowledge graph...")
    
    # Initialize directed graph
    G = nx.DiGraph()
    
    # Add ingredient nodes with nutritional attributes
    print("Adding ingredient nodes...")
    for _, row in nutrition_df.iterrows():
        ingredient = row['ingredient']
        # Add ingredient node
        G.add_node(ingredient, 
                   type='ingredient',
                   calories=row['calories'],
                   protein=row['protein'],
                   carbs=row['carbs'],
                   fat=row['fat'],
                   fiber=row['fiber'],
                   sugars=row['sugars'],
                   calcium_mg=row['calcium_mg'],
                   iron_mg=row['iron_mg'],
                   magnesium_mg=row['magnesium_mg'],
                   phosphorus_mg=row['phosphorus_mg'],
                   potassium_mg=row['potassium_mg'],
                   sodium_mg=row['sodium_mg'],
                   zinc_mg=row['zinc_mg'],
                   vitamin_c_mg=row['vitamin_c_mg'],
                   thiamin_mg=row['thiamin_mg'],
                   riboflavin_mg=row['riboflavin_mg'],
                   niacin_mg=row['niacin_mg'],
                   vitamin_b6_mg=row['vitamin_b6_mg'],
                   folate_mcg=row['folate_mcg'],
                   vitamin_a_mcg=row['vitamin_a_mcg'],
                   vitamin_e_mg=row['vitamin_e_mg'],
                   category=row['category'],
                   veg_nonveg=row['veg_nonveg'])
    
    # Add food item nodes and connect to ingredients
    print("Adding food item nodes and connections...")
    for _, row in food_df.iterrows():
        food_item = row['food_item']
        food_id = row['food_id']
        
        # Add food node
        G.add_node(food_item,
                   type='food',
                   food_id=food_id,
                   serving_size_g=row['serving_size_g'],
                   category=row['category'],
                   calories=row['calories'],
                   protein_g=row['protein_g'],
                   carbs_g=row['carbs_g'],
                   fat_g=row['fat_g'],
                   fiber_g=row['fiber_g'],
                   nutrition_notes=row['nutrition_notes'],
                   dietary_tags=row['dietary_tags'])
        
        # Parse main ingredients (they're comma-separated in quotes)
        main_ingredients_str = row['main_ingredients']
        if pd.notna(main_ingredients_str) and main_ingredients_str.strip():
            # Remove quotes and split by comma
            ingredients_list = [ing.strip().strip('"') for ing in main_ingredients_str.split(',')]
            
            # Add edges from food to ingredients
            for ingredient in ingredients_list:
                # Check if ingredient exists in our nutrition data
                if ingredient in nutrition_df['ingredient'].values:
                    G.add_edge(food_item, ingredient, relationship='contains')
                else:
                    # If ingredient not in nutrition data, still add it as a node but without nutritional info
                    if not G.has_node(ingredient):
                        G.add_node(ingredient, type='ingredient', category='Unknown')
                    G.add_edge(food_item, ingredient, relationship='contains')
    
    # Add patient data nodes and connections
    print("Adding patient data nodes and connections...")
    
    # We'll create aggregated nodes for common conditions, meal plans, and allergies
    # rather than individual patient nodes to keep the graph manageable
    
    # Add chronic disease nodes
    chronic_diseases = illness_df['Chronic_Disease'].unique()
    for disease in chronic_diseases:
        if pd.notna(disease) and disease != 'None':
            G.add_node(disease, type='chronic_disease')
    
    # Add recommended meal plan nodes
    meal_plans = illness_df['Recommended_Meal_Plan'].unique()
    for plan in meal_plans:
        if pd.notna(plan):
            G.add_node(plan, type='meal_plan')
    
    # Add allergy nodes
    allergies = illness_df['Allergies'].unique()
    for allergy in allergies:
        if pd.notna(allergy) and allergy != 'None':
            G.add_node(allergy, type='allergy')
    
    # Create edges based on patterns in the data
    print("Creating relationships from patient data...")
    
    # For demonstration, we'll create some sample connections
    # In a real system, you'd use more sophisticated logic or ML models
    
    # Map conditions to generally recommended meal plans (based on common medical knowledge)
    condition_to_mealplan = {
        'Diabetes': ['Low-Carb Diet', 'Balanced Diet', 'High-Protein Diet'],
        'Heart Disease': ['Low-Fat Diet', 'Balanced Diet', 'Mediterranean'],
        'Hypertension': ['Low-Fat Diet', 'Low-Carb Diet', 'Balanced Diet'],
        'Obesity': ['Low-Carb Diet', 'High-Protein Diet', 'Balanced Diet'],
        'None': ['Balanced Diet', 'Low-Fat Diet']
    }
    
    # Add edges from conditions to meal plans
    for condition, plans in condition_to_mealplan.items():
        if G.has_node(condition):
            for plan in plans:
                if G.has_node(plan):
                    G.add_edge(condition, plan, relationship='recommends')
    
    # Map allergies to foods to avoid (simplified)
    allergy_avoidance = {
        'Lactose Intolerance': ['dairy', 'milk', 'cheese', 'yogurt', 'butter', 'cream'],
        'Nut Allergy': ['nuts', 'peanuts', 'almonds', 'walnuts', 'cashews', 'sesame'],
        'Gluten Intolerance': ['wheat', 'flour', 'bread', 'roti', 'paratha', 'naan']
    }
    
    # For simplicity, we'll note that foods containing certain ingredients should be avoided
    # In a real implementation, you'd check food ingredients against allergy lists
    
    print(f"Enhanced graph created with {G.number_of_nodes()} nodes and {G.number_of_edges()} edges")
    return G

def analyze_patient_data(illness_df):
    """Analyze patient data for patterns"""
    print("Analyzing patient data...")
    
    # Basic statistics
    chronic_diseases = illness_df['Chronic_Disease'].value_counts()
    print("Chronic diseases distribution:")
    print(chronic_diseases.head(10))
    
    # Dietary recommendations
    meal_plans = illness_df['Recommended_Meal_Plan'].value_counts()
    print("\nRecommended meal plans distribution:")
    print(meal_plans.head())
    
    # Common allergies
    allergies = illness_df['Allergies'].value_counts()
    print("\nAllergies distribution:")
    print(allergies.head(10))
    
    return {
        'chronic_diseases': chronic_diseases.to_dict(),
        'meal_plans': meal_plans.to_dict(),
        'allergies': allergies.to_dict()
    }

def save_graph(G, filename='enhanced_diet_knowledge_graph.gpickle'):
    """Save the NetworkX graph"""
    print(f"Saving graph to {filename}...")
    try:
        # Try the newer method first
        nx.write_gpickle(G, filename)
    except AttributeError:
        # Fallback to pickle for older NetworkX versions
        import pickle
        with open(filename, 'wb') as f:
            pickle.dump(G, f)
    print("Graph saved successfully!")

def export_graph_summary(G, filename='enhanced_graph_summary.json'):
    """Export a summary of the graph for inspection"""
    print(f"Exporting graph summary to {filename}...")
    
    # Count node types
    node_types = {}
    for node, data in G.nodes(data=True):
        node_type = data.get('type', 'unknown')
        node_types[node_type] = node_types.get(node_type, 0) + 1
    
    # Count edge types
    edge_types = {}
    for u, v, data in G.edges(data=True):
        edge_type = data.get('relationship', 'unknown')
        edge_types[edge_type] = edge_types.get(edge_type, 0) + 1
    
    # Sample some connections
    sample_edges = list(G.edges(data=True))[:10]
    
    summary = {
        'total_nodes': G.number_of_nodes(),
        'total_edges': G.number_of_edges(),
        'node_types': node_types,
        'edge_types': edge_types,
        'sample_edges': [{'source': u, 'target': v, 'relationship': d.get('relationship', 'unknown')} 
                        for u, v, d in sample_edges]
    }
    
    with open(filename, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print("Graph summary exported!")

def main():
    """Main function to build the enhanced knowledge graph"""
    print("=== Building Enhanced Diet Knowledge Graph ===")
    
    # Load data
    nutrition_df, illness_df, food_df = load_and_analyze_data()
    
    # Analyze patient data
    patient_stats = analyze_patient_data(illness_df)
    
    # Create the enhanced food-ingredient-nutrient-patient graph
    G = create_enhanced_knowledge_graph(nutrition_df, illness_df, food_df)
    
    # Save the graph
    save_graph(G, 'enhanced_diet_knowledge_graph.gpickle')
    
    # Export summary
    export_graph_summary(G, 'enhanced_graph_summary.json')
    
    print("\n=== Enhanced Knowledge Graph Construction Complete ===")
    print(f"Nodes: {G.number_of_nodes()}")
    print(f"Edges: {G.number_of_edges()}")
    
    return G, patient_stats

if __name__ == "__main__":
    graph, stats = main()