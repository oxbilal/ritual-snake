import type { Address, Hash } from "viem";

export function shortenHex(value?: Address | Hash | string, head = 6, tail = 4) {
  if (!value) return "";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function cleanAssistantText(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Something went wrong.";
}
