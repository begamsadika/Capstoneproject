import api from "./client";

export interface PartnerClient {
  id: number;
  user_id: number;
  name: string;
  email: string;
  gender: string;
  age?: number;
  fitness_goal: string;
  dietary_preference: string;
  notes: string;
  status: "Active" | "Needs Attention" | "Inactive";
  assigned_date: string;
  invitation_status: string;
  invitation_link?: string;
}

export interface CreatePartnerClientPayload {
  full_name: string;
  email: string;
  gender: string;
  age?: number;
  fitness_goal: string;
  dietary_preference: string;
  notes: string;
}

export const getPartnerClients = async (): Promise<PartnerClient[]> => {
  const res = await api.get("/api/partner/users");
  return res.data;
};

export const createPartnerClient = async (
  payload: CreatePartnerClientPayload,
): Promise<PartnerClient> => {
  const res = await api.post("/api/partner/users", payload);
  return res.data;
};

export const recommendPartnerMeals = async (
  clientId: number,
  mealIds: number[],
  note = "",
) => {
  const res = await api.post(`/api/partner/users/${clientId}/recommend-meals`, {
    meal_ids: mealIds,
    note,
  });
  return res.data;
};

export const setInvitationPassword = async (token: string, password: string) => {
  const res = await api.post(`/api/partner/invitations/${token}/set-password`, {
    password,
  });
  return res.data;
};

export interface PartnerRecommendedMeal {
  id: number;
  meal_id: number;
  meal_name: string;
  category: string;
  calories: number;
  price: number;
  dietary: string;
  partner_name: string;
  note: string;
  status: string;
  created_at: string;
}

export const getMyPartnerRecommendedMeals = async (): Promise<
  PartnerRecommendedMeal[]
> => {
  const res = await api.get("/api/partner/my-recommended-meals");
  return res.data;
};
