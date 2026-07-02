import os
import json
import networkx as nx

from typing import Dict, List, Any

from langchain.tools import tool
from langchain_core.messages import HumanMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import create_agent

from langchain_ollama import ChatOllama

# ============================================================
# LOAD KNOWLEDGE GRAPH
# ============================================================

GRAPH_PATH = os.path.join("DataSets", "drug_food_knowledge_graph.graphml")

graph = nx.read_graphml(GRAPH_PATH)

print(f"[INFO] KG Loaded " f"({len(graph.nodes)} nodes, " f"{len(graph.edges)} edges)")


# ============================================================
# HELPERS
# ============================================================


def normalize_text(text: str) -> str:
    return text.strip().lower()


# ============================================================
# TOOL FUNCTIONS
# ============================================================


@tool
def get_condition_info(condition: str) -> str:
    """
    Retrieve food and dietary information
    related to a medical condition.
    """

    condition = normalize_text(condition)

    if condition not in graph:

        print(f"[DEBUG] Condition: {condition}")
        return json.dumps(
            {
                "found": False,
                "condition": condition,
                "message": "Condition not found in KG",
            }
        )

    neighbors = list(graph.neighbors(condition))

    related_entities = []

    for neighbor in neighbors:

        edge_data = graph.get_edge_data(condition, neighbor)

        related_entities.append({"entity": neighbor, "relationship": edge_data})
    print(f"[DEBUG] Condition: {condition}")
    print(f"[DEBUG] Related Entities: {related_entities}")

    return json.dumps(
        {"found": True, "condition": condition, "related_entities": related_entities}
    )


@tool
def get_drug_food_interactions(drug: str) -> str:
    """
    Retrieve drug-food interaction data.
    """

    drug = normalize_text(drug)

    if drug not in graph:

        return json.dumps(
            {"found": False, "drug": drug, "message": "Drug not found in KG"}
        )

    neighbors = list(graph.neighbors(drug))

    interactions = []

    for neighbor in neighbors:

        edge_data = graph.get_edge_data(drug, neighbor)

        interactions.append({"entity": neighbor, "relationship": edge_data})
    print(f"[DEBUG] Drug: {drug}")
    print(f"[DEBUG] Interactions: {interactions}")
    return json.dumps({"found": True, "drug": drug, "interactions": interactions})


@tool
def recommend_foods(conditions: List[str], medications: List[str]) -> str:
    """
    Recommend foods based on illnesses
    and medications.
    """

    recommended = set()
    avoid = set()

    # --------------------------------------------------------
    # CONDITIONS
    # --------------------------------------------------------

    for condition in conditions:

        condition = normalize_text(condition)

        if condition in graph:

            neighbors = list(graph.neighbors(condition))

            for neighbor in neighbors:

                edge_data = str(graph.get_edge_data(condition, neighbor)).lower()

                if (
                    "recommend" in edge_data
                    or "good" in edge_data
                    or "beneficial" in edge_data
                ):
                    recommended.add(neighbor)

                if "avoid" in edge_data or "bad" in edge_data or "harmful" in edge_data:
                    avoid.add(neighbor)

    # --------------------------------------------------------
    # MEDICATIONS
    # --------------------------------------------------------

    for medication in medications:

        medication = normalize_text(medication)

        if medication in graph:

            neighbors = list(graph.neighbors(medication))

            for neighbor in neighbors:

                edge_data = str(graph.get_edge_data(medication, neighbor)).lower()

                if (
                    "interaction" in edge_data
                    or "avoid" in edge_data
                    or "contraindicated" in edge_data
                ):
                    avoid.add(neighbor)
    print(f"[DEBUG] Recommended: {recommended}")
    print(f"[DEBUG] Avoid: {avoid}")
    return json.dumps(
        {
            "conditions": conditions,
            "medications": medications,
            "recommended_foods": list(recommended),
            "foods_to_avoid": list(avoid),
        }
    )


# ============================================================
# TOOLS
# ============================================================

tools = [get_condition_info, get_drug_food_interactions, recommend_foods]


# ============================================================
# LLM
# ============================================================

llm = ChatOllama(
    # model="gpt-oss:20b-cloud",
    model="gemma3:1b",
    temperature=0.2,
    base_url="http://localhost:11434",
)


# ============================================================
# PROMPT
# ============================================================

prompt = """
You are an advanced AI dietary recommendation assistant.

Responsibilities:
- Help users with diet recommendations
- Consider illnesses and chronic conditions
- Consider medications and drug-food interactions
- Use tools whenever retrieval is needed
- Mention foods to consume
- Mention foods to avoid
- Give nutritional guidance
- Avoid unsafe medical advice
- Encourage doctor consultation for serious conditions

IMPORTANT TOOL USAGE RULES:
- ALWAYS use tools when the user mentions:
    * diseases
    * illnesses
    * medications
    * food restrictions
    * dietary plans
    * nutritional concerns
- Never hallucinate medical or nutritional facts.
- Use recommend_foods whenever the user asks for:
    * meal recommendations
    * dietary plans
    * foods to eat
    * foods to avoid
- Use get_condition_info when the user asks about a disease or condition.
- Use get_drug_food_interactions when the user asks about medications or drug-food interactions.
- Multiple tools can be used if necessary.
- If enough information already exists from previous tool outputs, avoid unnecessary repeated tool calls.

----------------------------------------
TOOL USAGE EXAMPLES
----------------------------------------

Example 1:

User:
"I have diabetes and hypertension. What foods should I eat?"

Assistant Thought:
The user mentioned medical conditions and is asking for dietary recommendations.
I should use recommend_foods.

Tool Call:
recommend_foods(
    conditions=["diabetes", "hypertension"],
    medications=[]
)

Tool Result:
{
    "recommended_foods": [
        "oats",
        "leafy greens",
        "salmon"
    ],
    "foods_to_avoid": [
        "sugary drinks",
        "processed foods"
    ]
}

Final Response:
- Recommend high fiber foods such as oats and leafy greens
- Include healthy fats and lean proteins
- Avoid sugary drinks and processed foods
- Maintain sodium and sugar control

----------------------------------------

Example 2:

User:
"I take warfarin daily. Are there foods I should avoid?"

Assistant Thought:
The user is asking about a medication interaction.
I should use get_drug_food_interactions.

Tool Call:
get_drug_food_interactions(
    drug="warfarin"
)

Tool Result:
{
    "interactions": [
        "spinach",
        "kale",
        "broccoli"
    ]
}

Final Response:
Foods high in vitamin K such as spinach, kale, and broccoli may affect warfarin effectiveness.
Maintain consistent vitamin K intake and consult your doctor before major dietary changes.

----------------------------------------

Example 3:

User:
"I have kidney disease and also take aspirin. Give me a meal recommendation."

Assistant Thought:
The user mentioned:
- a disease
- a medication
- meal recommendations

I should use recommend_foods.

Tool Call:
recommend_foods(
    conditions=["kidney disease"],
    medications=["aspirin"]
)

Tool Result:
{
    "recommended_foods": [
        "cauliflower",
        "blueberries",
        "egg whites"
    ],
    "foods_to_avoid": [
        "processed meats",
        "high sodium foods"
    ]
}

Final Response:
Recommended foods include cauliflower, blueberries, and egg whites due to lower sodium and kidney-friendly nutrients.
Avoid processed meats and high sodium foods.
Stay hydrated according to physician recommendations.

----------------------------------------

Example 4:

User:
"What is good for hypertension?"

Assistant Thought:
The user is asking about a condition.
Use get_condition_info.

Tool Call:
get_condition_info(
    condition="hypertension"
)

Tool Result:
{
    "related_entities": [
        "low sodium diet",
        "banana",
        "leafy greens"
    ]
}

Final Response:
For hypertension:
- Reduce sodium intake
- Increase potassium-rich foods such as bananas
- Eat more leafy greens
- Limit processed and salty foods

----------------------------------------

Always provide:
1. Condition summary
2. Recommended foods
3. Foods to avoid
4. Nutritional tips
5. Safety guidance

Keep responses medically cautious, structured, and helpful.
"""


# ============================================================
# AGENT
# ============================================================

# agent = create_tool_calling_agent(
#     llm=llm,
#     tools=tools,
#     prompt=prompt
# )


agent_executor = create_agent(model=llm, tools=tools, system_prompt=prompt)


# ============================================================
# MAIN LOOP
# ============================================================


def main():

    print("\n================================================")
    print(" AI DIETARY RECOMMENDATION ASSISTANT")
    print(" LangChain + Ollama + Knowledge Graph")
    print("================================================\n")

    print("Examples:")
    print("- I have diabetes and hypertension")
    print("- I take aspirin and warfarin")
    print("- Recommend foods for kidney disease")
    print("- Foods to avoid while taking statins")
    print("- I need a low sodium meal plan\n")

    while True:

        user_input = input("\nYou: ")

        if user_input.lower() in ["exit", "quit", "bye"]:
            print("\nGoodbye!\n")
            break

        try:

            response = agent_executor.invoke(
                {"messages": [{"role": "user", "content": user_input}]}
            )

            print("\nAssistant:\n")
            print(response.get("messages")[-1].content)

        except Exception as e:

            print(f"\n[ERROR] {e}")


# ============================================================

if __name__ == "__main__":
    main()
