import type {
  CreateStorageItemInput,
  StorageItem,
  StorageResponse,
  StorageView,
  ServeStorageItemInput,
  ServeStorageItemResponse,
  UpdateStorageItemInput,
} from "@blw/shared";
import { apiGet, apiPatch, apiPost } from "../../lib/api.js";

export function fetchStorage(view: StorageView): Promise<StorageResponse> {
  return apiGet<StorageResponse>(`/api/storage?view=${view}`);
}

export function createStorageItem(input: CreateStorageItemInput): Promise<StorageItem[]> {
  return apiPost<StorageItem[]>("/api/storage", input);
}

export function updateStorageItem(id: string, input: UpdateStorageItemInput): Promise<StorageItem> {
  return apiPatch<StorageItem>(`/api/storage/${id}`, input);
}

export function serveStorageItem(id: string, input: ServeStorageItemInput): Promise<ServeStorageItemResponse> {
  return apiPost<ServeStorageItemResponse>(`/api/storage/${id}/serve`, input);
}
