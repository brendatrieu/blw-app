import type {
  CreateFridgeItemInput,
  FridgeItem,
  FridgeResponse,
  FridgeView,
  ServeFridgeItemInput,
  ServeFridgeItemResponse,
  UpdateFridgeItemInput,
} from "@blw/shared";
import { apiGet, apiPatch, apiPost } from "../../lib/api.js";

export function fetchFridge(view: FridgeView): Promise<FridgeResponse> {
  return apiGet<FridgeResponse>(`/api/fridge?view=${view}`);
}

export function createFridgeItem(input: CreateFridgeItemInput): Promise<FridgeItem[]> {
  return apiPost<FridgeItem[]>("/api/fridge", input);
}

export function updateFridgeItem(id: string, input: UpdateFridgeItemInput): Promise<FridgeItem> {
  return apiPatch<FridgeItem>(`/api/fridge/${id}`, input);
}

export function serveFridgeItem(id: string, input: ServeFridgeItemInput): Promise<ServeFridgeItemResponse> {
  return apiPost<ServeFridgeItemResponse>(`/api/fridge/${id}/serve`, input);
}
