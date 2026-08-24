import type { CreatePantryItemInput, PantryItem, PantryResponse, PantryView, UpdatePantryItemInput } from "@blw/shared";
import { apiGet, apiPatch, apiPost } from "../../lib/api.js";

export function fetchPantry(view: PantryView): Promise<PantryResponse> {
  return apiGet<PantryResponse>(`/api/pantry?view=${view}`);
}

export function createPantryItem(input: CreatePantryItemInput): Promise<PantryItem> {
  return apiPost<PantryItem>("/api/pantry", input);
}

export function updatePantryItem(id: string, input: UpdatePantryItemInput): Promise<PantryItem> {
  return apiPatch<PantryItem>(`/api/pantry/${id}`, input);
}
