import {
  decodeAbiParameters,
  encodeAbiParameters,
  isAddress,
  keccak256,
  parseAbiParameters,
  stringToHex,
  type Address,
  type Hex,
  type TransactionReceipt
} from "viem";
import { DEFAULT_LLM_MODEL, RITUAL_LLM_PRECOMPILE } from "./chain";
import { cleanAssistantText } from "./format";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmRequestOptions {
  executor: Address;
  messages: ChatMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
  ttlBlocks?: bigint;
}

export interface DecodedLlmResult {
  content: string;
  model: string;
  finishReason: string;
  usage: {
    promptTokens: bigint;
    completionTokens: bigint;
    totalTokens: bigint;
  };
}

const llmRequestAbi = parseAbiParameters(
  [
    "address, bytes[], uint256, bytes[], bytes,",
    "string, string, int256, string, bool, int256, string, string,",
    "uint256, bool, int256, string, bytes, int256, string, string, bool,",
    "int256, bytes, bytes, int256, int256, string, bool,",
    "(string,string,string)"
  ].join("")
);

const llmEnvelopeAbi = parseAbiParameters("bool, bytes, bytes, string, (string,string,string)");
const completionDataAbi = parseAbiParameters(
  "string, string, uint256, string, string, string, uint256, bytes[], bytes"
);
const usageAbi = parseAbiParameters("uint256, uint256, uint256");
const choiceAbi = parseAbiParameters("uint256, string, bytes");
const chatMessageAbi = parseAbiParameters("string, string, string, uint256, bytes[]");
const asyncEnvelopeAbi = parseAbiParameters("bytes, bytes");
const precompileCalledAbi = parseAbiParameters("address, bytes, bytes");
const precompileCalledTopic = keccak256(stringToHex("PrecompileCalled(address,bytes,bytes)"));

export function encodeLlmRequest({
  executor,
  messages,
  temperature = 0.7,
  maxCompletionTokens = 4096,
  ttlBlocks = 300n
}: LlmRequestOptions): Hex {
  if (!isAddress(executor)) {
    throw new Error("Paste a valid LLM executor address before sending.");
  }

  return encodeAbiParameters(llmRequestAbi, [
    executor,
    [],
    ttlBlocks,
    [],
    "0x",
    JSON.stringify(messages),
    DEFAULT_LLM_MODEL,
    0n,
    "",
    false,
    BigInt(maxCompletionTokens),
    "",
    "",
    1n,
    true,
    0n,
    "medium",
    "0x",
    -1n,
    "auto",
    "",
    false,
    BigInt(Math.round(temperature * 1000)),
    "0x",
    "0x",
    -1n,
    1000n,
    "",
    false,
    ["", "", ""]
  ]);
}

export function extractLlmResult(receipt: TransactionReceipt): Hex | null {
  const receiptWithSpc = receipt as TransactionReceipt & {
    spcCalls?: Array<{ output?: Hex; actualOutput?: Hex }>;
  };

  const spcOutput = receiptWithSpc.spcCalls?.find((call) => call.output || call.actualOutput);
  if (spcOutput?.actualOutput) return spcOutput.actualOutput;
  if (spcOutput?.output) {
    return unwrapAsyncEnvelope(spcOutput.output);
  }

  for (const log of receipt.logs) {
    if (log.topics[0] !== precompileCalledTopic) continue;

    const [addr, , output] = decodeAbiParameters(precompileCalledAbi, log.data);
    if ((addr as string).toLowerCase() !== RITUAL_LLM_PRECOMPILE.toLowerCase()) continue;

    return unwrapAsyncEnvelope(output as Hex);
  }

  return null;
}

export function decodeLlmResult(resultHex: Hex): DecodedLlmResult {
  const [hasError, completionData, , error] = decodeAbiParameters(llmEnvelopeAbi, resultHex);

  if (hasError) {
    throw new Error(error || "Ritual executor returned an LLM error.");
  }

  if (!completionData || completionData === "0x") {
    throw new Error("Ritual returned an empty completion payload.");
  }

  const [, , , model, , , choicesCount, choicesData, usageData] = decodeAbiParameters(
    completionDataAbi,
    completionData
  );

  const [promptTokens, completionTokens, totalTokens] = decodeAbiParameters(usageAbi, usageData);

  if (choicesCount === 0n || choicesData.length === 0) {
    throw new Error("Ritual returned no assistant choices.");
  }

  const [, finishReason, messageData] = decodeAbiParameters(choiceAbi, choicesData[0]);
  const [, content] = decodeAbiParameters(chatMessageAbi, messageData);

  return {
    content: cleanAssistantText(content),
    model,
    finishReason,
    usage: { promptTokens, completionTokens, totalTokens }
  };
}

function unwrapAsyncEnvelope(output: Hex): Hex {
  try {
    const [, actual] = decodeAbiParameters(asyncEnvelopeAbi, output);
    return actual as Hex;
  } catch {
    return output;
  }
}
