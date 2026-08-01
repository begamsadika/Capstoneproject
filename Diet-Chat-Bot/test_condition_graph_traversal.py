import unittest

from config import condition_graph
from kg_queries import retrieve_condition_foods, retrieve_condition_meal_plans


class ConditionGraphTraversalTests(unittest.TestCase):
    def test_condition_recommends_meal_plan(self):
        edge = condition_graph.get_edge_data("Diabetes", "Low-Carb Diet")
        self.assertIsNotNone(edge)
        self.assertEqual(edge.get("relationship"), "recommends")

    def test_meal_plan_includes_foods(self):
        included = [
            node
            for node in condition_graph.neighbors("Low-Carb Diet")
            if condition_graph.nodes[node].get("type") == "food"
            and condition_graph.get_edge_data("Low-Carb Diet", node).get("relationship")
            == "includes"
        ]
        self.assertGreater(len(included), 0)

    def test_condition_retrieval_returns_real_graph_foods(self):
        recommended, _ = retrieve_condition_foods("diabetes")
        graph_foods = {
            node
            for node, data in condition_graph.nodes(data=True)
            if data.get("type") == "food"
        }
        self.assertTrue(recommended)
        self.assertTrue(set(recommended[:10]).issubset(graph_foods))

    def test_condition_retrieval_exposes_meal_plans(self):
        plans = retrieve_condition_meal_plans("diabetes")
        self.assertIn("Low-Carb Diet", plans)
        self.assertIn("Balanced Diet", plans)


if __name__ == "__main__":
    unittest.main()
