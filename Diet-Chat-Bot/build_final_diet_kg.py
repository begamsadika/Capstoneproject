import pandas as pd
import networkx as nx
import os

def load_drug_food_data(filepath):
    """
    Load drug-food interaction data from an Excel file.
    Expects a column 'Drug' for drug names and 'Food_Interactions' for food items.

    :param filepath: Path to the Excel file.
    :return: DataFrame with drug and food interactions.
    """
    try:
        data = pd.read_excel(filepath)
        interaction_columns = [col for col in data.columns if col.startswith('food_interactions/')]
        data['Food_Interactions'] = data[interaction_columns].apply(lambda x: ','.join(x.dropna().astype(str)), axis=1)
        return data[['name', 'Food_Interactions']].rename(columns={'name': 'Drug'})
    except Exception as e:
        raise FileNotFoundError(f"Error reading the file: {e}")

def build_drug_food_kg(data):
    """
    Create a knowledge graph from drug-food interaction data.

    :param data: DataFrame containing 'Drug' and 'Food_Interactions'.
    :return: NetworkX graph with the drug-food interactions.
    """
    graph = nx.Graph()

    for _, row in data.iterrows():
        drug = row['Drug']
        interactions = str(row['Food_Interactions']).split(',')  # Assume interactions are comma-separated

        for food in interactions:
            food_cleaned = food.strip()
            if food_cleaned:  # Avoid empty values
                graph.add_node(drug, type='drug')
                graph.add_node(food_cleaned, type='food')
                graph.add_edge(drug, food_cleaned, relation='interacts_with')

    return graph

def save_knowledge_graph(graph, output_path):
    """
    Save the knowledge graph to a file.

    :param graph: NetworkX graph to save.
    :param output_path: File path to save the graph.
    """
    nx.write_graphml(graph, output_path.replace('.gpickle', '.graphml'))

def main():
    # Define file paths
    dataset_path = os.path.join('DataSets', 'Drug to Food interactions Dataset.xlsx')
    output_graph_path = os.path.join('DataSets', 'drug_food_knowledge_graph.gpickle')

    # Load data
    print("Loading drug-food interactions data...")
    data = load_drug_food_data(dataset_path)

    # Build knowledge graph
    print("Building the knowledge graph...")
    graph = build_drug_food_kg(data)

    # Save the graph
    print("Saving the knowledge graph...")
    save_knowledge_graph(graph, output_graph_path)
    print(f"Knowledge graph saved to {output_graph_path}")

if __name__ == "__main__":
    main()