import type {
  CreateStorageItemInput,
  CreateStorageItemResponse,
  StorageItem,
  StorageResponse,
  StorageView,
  ServeStorageInput,
  ServeStorageResponse,
  UpdateStorageItemInput,
} from "@blw/shared";
import { apiGet, apiPatch, apiPost } from "../../lib/api.js";

export function fetchStorage(view: StorageView): Promise<StorageResponse> {
  return apiGet<StorageResponse>(`/api/storage?view=${view}`);
}

/**
 * POST /api/storage answers with `{ items }` — ONE container by default,
 * even when several foods went into it, and one per food when the caller
 * asked for separate containers (item 347). Unwrapped here so every caller
 * reads the same list either way and never branches on what it asked for.
 */
export function createStorageItem(input: CreateStorageItemInput): Promise<StorageItem[]> {
  return apiPost<CreateStorageItemResponse>("/api/storage", input).then((response) => response.items);
}

export function updateStorageItem(id: string, input: UpdateStorageItemInput): Promise<StorageItem> {
  return apiPatch<StorageItem>(`/api/storage/${id}`, input);
}

/** One sitting from one or more containers, plus fresh foods and recipes
 * (ledger 760). Undo is `deleteMeal` with the returned meal's id. */
export function serveStorage(input: ServeStorageInput): Promise<ServeStorageResponse> {
  return apiPost<ServeStorageResponse>("/api/storage/serve", input);
}
