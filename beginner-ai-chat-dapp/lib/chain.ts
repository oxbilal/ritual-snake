import { defineChain } from "viem";

export const ritualChain = defineChain({
  id: 1979,
  name: "Ritual Testnet",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RITUAL_RPC_URL || "https://rpc.ritualfoundation.org"]
    }
  },
  blockExplorers: {
    default: { name: "Ritual Explorer", url: "https://explorer.ritualfoundation.org" }
  }
});

export const REQUESTED_WALLET = process.env.NEXT_PUBLIC_EXPECTED_WALLET || "";
export const RITUAL_LLM_PRECOMPILE = "0x0000000000000000000000000000000000000802" as const;
export const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948" as const;
export const ASYNC_JOB_TRACKER = "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5" as const;
export const DEFAULT_LLM_MODEL = "zai-org/GLM-4.7-FP8";
