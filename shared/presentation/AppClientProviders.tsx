"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

import styles from "./AppClientProviders.module.css";

export function AppClientProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: { retry: false },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        closeButton
        toastOptions={{
          classNames: {
            toast: styles.toast ?? "",
            title: styles.title ?? "",
            description: styles.description ?? "",
            actionButton: styles.action ?? "",
            cancelButton: styles.cancel ?? "",
            closeButton: styles.close ?? "",
            error: styles.error ?? "",
            success: styles.success ?? "",
          },
        }}
      />
    </QueryClientProvider>
  );
}
