"use client";

import { reportConnectivityFailure, reportConnectivityResponse } from "./connectivity-store";

export async function fetchWithConnectivity(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = await fetch(input, init);
    reportConnectivityResponse();
    return response;
  } catch (error) {
    reportConnectivityFailure(error);
    throw error;
  }
}
