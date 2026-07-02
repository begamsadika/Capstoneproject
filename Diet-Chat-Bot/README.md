# Diet Knowledge Graph

This project builds a NetworkX-based knowledge graph connecting nutritional ingredients, food items, patient conditions, dietary recommendations, and drug-food interactions for personalized nutrition advice. It also includes an Ollama-powered retrieval agent for generating intelligent responses.

## Files Created

1. `build_diet_knowledge_graph.py` - Basic food-ingredient-nutrient graph
2. `build_enhanced_diet_kg.py` - Enhanced graph with patient condition connections
3. `build_final_diet_kg.py` - Drug-food interaction knowledge graph
4. `query_diet_kg.py` - Demo queries for basic graph
5. `query_enhanced_diet_kg.py` - Demo queries for enhanced graph
6. `ollama_retrieval_agent.py` - Ollama-powered retrieval agent for dietary recommendations
7. `diet_knowledge_graph.gpickle` - Saved basic knowledge graph
8. `enhanced_diet_knowledge_graph.gpickle` - Saved enhanced knowledge graph
9. `drug_food_knowledge_graph.graphml` - Saved drug-food interaction graph
10. `graph_summary.json` - Summary of basic graph
11. `enhanced_graph_summary.json` - Summary of enhanced graph

## Graph Structure

### Knowledge Graphs

#### 1. Basic Knowledge Graph (`diet_knowledge_graph.gpickle`)
- **Nodes**: Food items, Ingredients, Nutrients
- **Edges**: contains, has_nutrient

#### 2. Enhanced Knowledge Graph (`enhanced_diet_knowledge_graph.gpickle`)
- **Nodes**:
  - **Food Items**: Prepared dishes with nutritional info and dietary tags
  - **Ingredients**: Raw food components with detailed nutritional profiles
  - **Chronic Diseases**: Medical conditions like Diabetes, Hypertension, etc.
  - **Meal Plans**: Recommended dietary approaches (Low-Fat, High-Protein, etc.)
  - **Allergies**: Common food allergies (Lactose Intolerance, Nut Allergy, etc.)
- **Edges**:
  - **contains**: Food → Ingredient (what ingredients make up a food)
  - **recommends**: Condition → Meal Plan (what diet is suggested for a condition)
  - **has nutrient**: Implied through ingredient nutritional data

#### 3. Drug-Food Interaction Graph (`drug_food_knowledge_graph.graphml`)
- **Nodes**:
  - **Drugs**: Medications extracted from the drug-food interactions dataset
  - **Foods**: Food items that interact with specific drugs
- **Edges**:
  - **interacts_with**: Drug → Food (indicates a drug-food interaction)
- **Dataset**: `DataSets/Drug to Food interactions Dataset.xlsx` containing 1423 drug entries with multiple food interaction columns (`food_interactions/0` through `food_interactions/7`)

## Graph Analysis

### Enhanced Graph Statistics
- **Nodes**: 559 nodes
- **Edges**: 627 edges
- **Node Types**: food, ingredient, chronic_disease, meal_plan, allergy
- **Edge Types**: contains, recommends

### Drug-Food Interaction Graph Statistics
- **Nodes**: Drugs and foods extracted from 1423 drug entries
- **Edges**: Drug-food interaction relationships
- **Data Source**: Excel dataset with columns: `name`, `reference`, `food_interactions/0` through `food_interactions/7`

The drug-food graph enables querying specific dietary restrictions or recommendations for patients on particular medications, supporting personalized dietary advice based on drug interactions.

## Ollama Retrieval Agent

The `ollama_retrieval_agent.py` integrates the knowledge graph with a local Ollama instance (using the `gemma3:1b` model) to provide intelligent, context-aware dietary recommendations.

### How It Works

1. **Load Knowledge Graph**: The agent loads the NetworkX graph from `drug_food_knowledge_graph.graphml` using `nx.read_graphml()`.

2. **Query Ollama Model**: The agent sends prompts to the local Ollama instance via HTTP POST requests:
   ```python
   url = f"http://localhost:11434/api/models/{model}/generate"
   response = requests.post(url, json={"prompt": prompt})
   ```

3. **Functions**:
   - `get_drug_info(graph, drug)`: Retrieves drug information from the graph, including connected food nodes and relationships.
   - `generate_diet_recommendation(graph, condition)`: Analyzes the graph for conditions and related foods, then prompts Ollama to generate dietary recommendations.
   - `query_ollama(model, prompt)`: Handles communication with the Ollama API.

4. **Response Generation**: The agent combines graph data (drug-food relationships, condition-diet mappings) with Ollama's natural language generation to provide personalized recommendations.

### Usage

```python
from ollama_retrieval_agent import load_knowledge_graph, get_drug_info, generate_diet_recommendation

# Load the graph
graph = load_knowledge_graph('DataSets/drug_food_knowledge_graph.graphml')

# Get drug information
drug_info = get_drug_info(graph, 'aspirin')

# Generate diet recommendations for a condition
recommendation = generate_diet_recommendation(graph, 'hypertension')
```

## Dataset Sources

- `nutrition_data_my.csv`: Nutritional profiles of 237 Sri Lankan ingredients
- `Illness__Diet_Recommendations.csv`: 5000 patient records with conditions and diet recommendations
- `food_ingredient_my.csv`: 200 prepared Sri Lankan food items with their ingredients
- `DataSets/Drug to Food interactions Dataset.xlsx`: Drug-food interactions dataset with 1423 entries

## Extending the Graph

To add drug/medication information:
1. Add drug nodes with attributes (name, dosage, side effects)
2. Create edges from drugs to conditions they treat
3. Create edges from drugs to foods they interact with
4. Add nutrient interaction data where relevant

## Requirements

- Python 3.x
- NetworkX
- Pandas
- Requests (for Ollama API communication)
- openpyxl (for Excel file handling)

Install with:
```bash
pip install networkx pandas requests openpyxl langchain langchain-community ollama
```
Run cmd app
```bash
python ollama_retrieval_agent.py
```
