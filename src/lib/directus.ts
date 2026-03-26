/**
 * Directus helpers that bypass strict SDK v18 generics.
 * Same pattern as sev-agent-ads — cast through `any` so ad_* collection names work.
 */

import {
  createItem as _createItem,
  readItems as _readItems,
  updateItem as _updateItem,
  deleteItems as _deleteItems,
} from "@directus/sdk";
import type { GoogleAdsAgent } from "../agent.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { request: (query: any) => Promise<any> };

export function getClient(agent: GoogleAdsAgent): AnyClient {
  return agent.directus.getClient("sev-ai") as unknown as AnyClient;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const readItems = _readItems as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const createItem = _createItem as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateItem = _updateItem as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteItems = _deleteItems as any;
