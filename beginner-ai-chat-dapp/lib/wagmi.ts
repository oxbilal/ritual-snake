"use client";

import { http } from "viem";
import { injected } from "@wagmi/core";
import { createConfig } from "wagmi";
import { ritualChain } from "./chain";

export const wagmiConfig = createConfig({
  chains: [ritualChain],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [ritualChain.id]: http(process.env.NEXT_PUBLIC_RITUAL_RPC_URL || "https://rpc.ritualfoundation.org")
  },
  ssr: true
});
