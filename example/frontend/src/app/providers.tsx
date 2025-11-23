"use client";

import { AgentServiceProvider } from "@hhopkins/agent-runtime-react";
import { BACKEND_URL, API_KEY } from "@/lib/constants";

/**
 * Client-side providers wrapper
 *
 * Wraps the application with AgentServiceProvider to enable all agent runtime hooks
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AgentServiceProvider
      baseUrl={BACKEND_URL}
      apiKey={API_KEY}
      autoConnect={true}
    >
      {children}
    </AgentServiceProvider>
  );
}
