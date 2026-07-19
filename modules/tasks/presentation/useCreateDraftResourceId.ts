"use client";

import { useRef } from "react";

export function useCreateDraftResourceId() {
  const resource = useRef<{ payload: string; resourceId: string } | null>(null);

  return {
    confirm(payload: string) {
      if (resource.current?.payload === payload) resource.current = null;
    },
    payloadChanged(payload: string) {
      if (!resource.current || resource.current.payload === payload) return false;
      resource.current = null;
      return true;
    },
    resourceId(payload: string) {
      if (!resource.current || resource.current.payload !== payload) {
        resource.current = { payload, resourceId: crypto.randomUUID() };
      }
      return resource.current.resourceId;
    },
  };
}
