import api from "./client";
import type { MealIngredient } from "./meals";

export interface IngredientSearchResult {
  id: string;
  name: string;
  nutritionPer100g: MealIngredient["nutrition"];
}

interface IngredientSearchResponse {
  id: string;
  name: string;
  nutritionPer100g: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
}

export const searchIngredients = async (
  query: string,
): Promise<IngredientSearchResult[]> => {
  const res = await api.get<IngredientSearchResponse[]>("/ingredients/search", {
    params: { q: query },
  });

  return res.data.map((item) => ({
    id: item.id,
    name: item.name,
    nutritionPer100g: {
      calories: item.nutritionPer100g.calories,
      protein: item.nutritionPer100g.protein,
      carbs: item.nutritionPer100g.carbs,
      fats: item.nutritionPer100g.fat,
    },
  }));
};
