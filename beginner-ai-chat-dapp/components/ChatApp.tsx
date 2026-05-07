"use client";

import { FormEvent, useMemo, useState } from "react";
import { encodeFunctionData, formatEther, isAddress, parseEther, type Address, type Hex } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWalletClient
} from "wagmi";
import {
  ASYNC_JOB_TRACKER,
  DEFAULT_LLM_MODEL,
  REQUESTED_WALLET,
  RITUAL_LLM_PRECOMPILE,
  RITUAL_WALLET,
  ritualChain
} from "../lib/chain";
import { errorMessage, shortenHex } from "../lib/format";
import { ChatMessage, decodeLlmResult, encodeLlmRequest, extractLlmResult } from "../lib/llm";

type StatusKind = "idle" | "ready" | "submitting" | "waiting" | "decoding" | "settled" | "error";
type PendingAction = "chat" | "deposit" | null;

const systemPrompt =
  "You are a friendly Ritual testnet assistant. Explain concepts simply, avoid hype, and keep answers beginner-friendly.";

const ritualWalletAbi = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "lockDuration", type: "uint256" }],
    outputs: [],
    stateMutability: "payable"
  }
] as const;

const asyncJobTrackerAbi = [
  {
    type: "function",
    name: "hasPendingJobForSender",
    inputs: [{ name: "sender", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view"
  }
] as const;

export function ChatApp() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const { data: readinessReads } = useReadContracts({
    contracts: address
      ? [
          {
            address: RITUAL_WALLET,
            abi: ritualWalletAbi,
            functionName: "balanceOf",
            args: [address]
          },
          {
            address: ASYNC_JOB_TRACKER,
            abi: asyncJobTrackerAbi,
            functionName: "hasPendingJobForSender",
            args: [address]
          }
        ]
      : [],
    query: { enabled: Boolean(address && chainId === ritualChain.id) }
  });

  const [executor, setExecutor] = useState(
    process.env.NEXT_PUBLIC_RITUAL_LLM_EXECUTOR || ""
  );
  const [depositAmount, setDepositAmount] = useState("0.01");
  const [prompt, setPrompt] = useState("Explain what Ritual testnet does in plain English.");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingMessages, setPendingMessages] = useState<ChatMessage[] | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [status, setStatus] = useState<StatusKind>("idle");
  const [statusText, setStatusText] = useState("Connect a wallet and paste an LLM executor to begin.");
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [lastUsage, setLastUsage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wrongChain = isConnected && chainId !== ritualChain.id;
  const walletBalance = readinessReads?.[0]?.status === "success" ? readinessReads[0].result : undefined;
  const senderLocked = readinessReads?.[1]?.status === "success" ? readinessReads[1].result : false;
  const hasWalletDeposit = walletBalance === undefined || walletBalance > 0n;
  const expectedWallet = REQUESTED_WALLET || address || "";
  const walletMismatch =
    isConnected &&
    address &&
    REQUESTED_WALLET.length > 0 &&
    address.toLowerCase() !== REQUESTED_WALLET.toLowerCase();
  const canPrepare =
    isConnected &&
    !wrongChain &&
    isAddress(executor) &&
    prompt.trim().length > 0 &&
    hasWalletDeposit &&
    !senderLocked;
  const primaryConnector = connectors[0];

  const statusItems = useMemo(
    () => [
      { key: "SUBMITTING", label: "Wallet confirmation", active: status === "submitting" },
      { key: "PENDING_COMMITMENT", label: "Commitment pending", active: status === "waiting" },
      { key: "COMMITTED", label: "Job committed", active: status === "waiting" },
      { key: "EXECUTOR_PROCESSING", label: "TEE executor processing", active: status === "waiting" },
      { key: "RESULT_READY", label: "Result ready", active: status === "decoding" },
      { key: "PENDING_SETTLEMENT", label: "Settlement pending", active: status === "decoding" },
      { key: "SETTLED", label: "Receipt decoded", active: status === "settled" },
      { key: "FAILED", label: "Error handled", active: status === "error" },
      { key: "EXPIRED", label: "Expired", active: false }
    ],
    [status]
  );

  function prepareSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!canPrepare) {
      setStatus("error");
      setStatusText("Connect on Ritual, add an executor address, and enter a prompt first.");
      return;
    }

    const nextMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.filter((message) => message.role !== "system"),
      { role: "user", content: prompt.trim() }
    ];

    setPendingMessages(nextMessages);
    setPendingAction("chat");
    setStatus("ready");
    setStatusText("Review the transaction details, then confirm if you want your wallet to send it.");
  }

  function prepareDeposit() {
    setError(null);

    if (!isConnected || wrongChain || !address) {
      setStatus("error");
      setStatusText("Connect your wallet on Ritual Chain before preparing a deposit.");
      return;
    }

    try {
      const parsedAmount = parseEther(depositAmount);
      if (parsedAmount <= 0n) throw new Error("Deposit amount must be greater than zero.");
      setPendingAction("deposit");
      setStatus("ready");
      setStatusText("Review the RitualWallet deposit details, then confirm if you want your wallet to send it.");
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      setStatus("error");
      setStatusText(message);
    }
  }

  async function sendChatTransaction() {
    if (!walletClient || !publicClient || !pendingMessages || !isAddress(executor) || !address) return;

    setError(null);
    setStatus("submitting");
    setStatusText("Asking your wallet to send the Ritual LLM precompile transaction.");

    try {
      const data = encodeLlmRequest({
        executor: executor as Address,
        messages: pendingMessages,
        maxCompletionTokens: 4096,
        ttlBlocks: 300n
      });

      const hash = await walletClient.sendTransaction({
        account: address,
        chain: ritualChain,
        to: RITUAL_LLM_PRECOMPILE,
        data,
        gas: 3_000_000n
      });

      setTxHash(hash);
      setStatus("waiting");
      setStatusText("Transaction sent. Waiting for Ritual settlement and receipt output.");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      setStatus("decoding");
      setStatusText("Receipt found. Decoding the LLM response envelope.");

      const result = extractLlmResult(receipt);
      if (!result) {
        throw new Error("No settled LLM output was found in the receipt yet. Wait a few blocks and retry the prompt.");
      }

      const decoded = decodeLlmResult(result);
      setMessages([
        ...pendingMessages.filter((message) => message.role !== "system"),
        { role: "assistant", content: decoded.content || "(The model returned an empty final answer.)" }
      ]);
      setLastUsage(
        `${decoded.model} / finish=${decoded.finishReason} / tokens=${decoded.usage.totalTokens.toString()}`
      );
      setPrompt("");
      setPendingMessages(null);
      setPendingAction(null);
      setStatus("settled");
      setStatusText("Settled on Ritual and decoded successfully.");
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      setStatus("error");
      setStatusText(message);
    }
  }

  async function sendDepositTransaction() {
    if (!walletClient || !publicClient || !address) return;

    setError(null);
    setStatus("submitting");
    setStatusText("Asking your wallet to send the RitualWallet deposit transaction.");

    try {
      const value = parseEther(depositAmount);
      const data = encodeFunctionData({
        abi: ritualWalletAbi,
        functionName: "deposit",
        args: [100000n]
      });

      const hash = await walletClient.sendTransaction({
        account: address,
        chain: ritualChain,
        to: RITUAL_WALLET,
        data,
        value
      });

      setTxHash(hash);
      setStatus("waiting");
      setStatusText("Deposit transaction sent. Waiting for confirmation.");

      await publicClient.waitForTransactionReceipt({ hash });
      setPendingAction(null);
      setStatus("settled");
      setStatusText("RitualWallet deposit confirmed. Refresh or wait for the balance read to update.");
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      setStatus("error");
      setStatusText(message);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 text-gray-300 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-5 border-b border-gray-800 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="font-mono text-xs uppercase text-ritual-green">Ritual Chain / LLM precompile 0x0802</p>
            <h1 className="mt-3 font-display text-4xl font-black text-gray-100 sm:text-5xl">
              Beginner AI Chat
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-400">
              A small testnet chat dApp that keeps the scary parts visible: wallet, executor, model, gas,
              transaction hash, and receipt decoding.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {!isConnected ? (
              <button
                type="button"
                onClick={() => primaryConnector && connect({ connector: primaryConnector })}
                disabled={!primaryConnector || isConnecting}
                className="rounded-lg border border-ritual-green px-4 py-2.5 text-sm font-semibold text-ritual-green shadow-glow-green transition hover:bg-ritual-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
              >
                {isConnecting ? "Connecting" : "Connect Wallet"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => disconnect()}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-400 transition hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
              >
                Disconnect {shortenHex(address)}
              </button>
            )}

            {wrongChain && (
              <button
                type="button"
                onClick={() => switchChain({ chainId: ritualChain.id })}
                disabled={isSwitching}
                className="rounded-lg border border-ritual-gold px-4 py-2.5 text-sm font-semibold text-ritual-gold transition hover:bg-ritual-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
              >
                {isSwitching ? "Switching" : "Switch to Ritual"}
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-[620px] flex-col rounded-lg border border-gray-800 bg-ritual-elevated/95 shadow-card">
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-100">Chat</h2>
                <p className="mt-1 text-sm text-gray-400">Stateless by default; each send is one Ritual LLM call.</p>
              </div>
              <span className="rounded-md border border-ritual-pink/50 px-2.5 py-1 font-mono text-xs text-ritual-pink">
                {DEFAULT_LLM_MODEL}
              </span>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {messages.length === 0 ? (
                <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border border-dashed border-gray-800 bg-black/20 p-6 text-center text-sm leading-6 text-gray-400">
                  Ask a simple question, review the confirmation, and your wallet will submit one async LLM
                  precompile transaction only after you approve it.
                </div>
              ) : (
                messages.map((message, index) => (
                  <article
                    key={`${message.role}-${index}`}
                    className={`rounded-lg border p-4 ${
                      message.role === "assistant"
                        ? "border-ritual-pink/40 bg-ritual-pink/5"
                        : "border-gray-800 bg-black/25"
                    }`}
                  >
                    <p className="font-mono text-xs uppercase text-gray-500">{message.role}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">{message.content}</p>
                  </article>
                ))
              )}
            </div>

            <form onSubmit={prepareSubmit} className="border-t border-gray-800 p-5">
              <label htmlFor="prompt" className="text-sm font-semibold text-gray-300">
                Prompt
              </label>
              <textarea
                id="prompt"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={4}
                className="mt-2 w-full resize-none rounded-lg border border-gray-700 bg-ritual-surface px-4 py-3 text-sm text-gray-200 outline-none transition placeholder:text-gray-500 focus-visible:ring-2 focus-visible:ring-ritual-green/50"
                placeholder="Ask Ritual AI something beginner-friendly..."
              />
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-gray-500">This prepares a transaction; it does not send until you confirm.</p>
                <button
                  type="submit"
                  disabled={!canPrepare || status === "submitting" || status === "waiting" || status === "decoding"}
                  className="rounded-lg border border-ritual-green px-4 py-2.5 text-sm font-semibold text-ritual-green transition hover:bg-ritual-green/10 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
                >
                  Prepare Chat Tx
                </button>
              </div>
            </form>
          </div>

          <aside className="space-y-5">
            <Panel title="Network">
              <Info label="Expected wallet" value={expectedWallet ? shortenHex(expectedWallet, 8, 6) : "Connect wallet"} />
              <Info label="Connected" value={address ? shortenHex(address, 8, 6) : "Not connected"} />
              {walletMismatch && (
                <p className="rounded-md border border-ritual-gold/40 bg-ritual-gold/10 p-3 text-xs leading-5 text-ritual-gold">
                  Connected wallet differs from the wallet provided for this build.
                </p>
              )}
              <Info label="Chain" value={chainId ? String(chainId) : "Unknown"} />
              <Info
                label="RitualWallet"
                value={walletBalance === undefined ? "Read pending" : `${Number(formatEther(walletBalance)).toFixed(6)} RITUAL`}
              />
              <Info label="Sender lock" value={senderLocked ? "Pending job" : "Clear"} />
              {!hasWalletDeposit && (
                <p className="rounded-md border border-ritual-gold/40 bg-ritual-gold/10 p-3 text-xs leading-5 text-ritual-gold">
                  RitualWallet balance reads as zero. Deposit separately before inference settlement.
                </p>
              )}
              {senderLocked && (
                <p className="rounded-md border border-ritual-gold/40 bg-ritual-gold/10 p-3 text-xs leading-5 text-ritual-gold">
                  This sender already has a pending async job. Wait for it to settle before sending another.
                </p>
              )}
              <Info label="Precompile" value={shortenHex(RITUAL_LLM_PRECOMPILE, 8, 6)} />
            </Panel>

            <Panel title="Deposit">
              <label htmlFor="depositAmount" className="text-sm font-semibold text-gray-300">
                Amount
              </label>
              <input
                id="depositAmount"
                value={depositAmount}
                onChange={(event) => setDepositAmount(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-700 bg-ritual-surface px-3 py-2.5 font-mono text-xs text-gray-200 outline-none transition placeholder:text-gray-600 focus-visible:ring-2 focus-visible:ring-ritual-green/50"
                inputMode="decimal"
                placeholder="0.01"
              />
              <Info label="Contract" value={shortenHex(RITUAL_WALLET, 8, 6)} />
              <Info label="Function" value="deposit(uint256)" />
              <Info label="lockDuration" value="100000" />
              <button
                type="button"
                onClick={prepareDeposit}
                disabled={!isConnected || wrongChain || status === "submitting" || status === "waiting" || status === "decoding"}
                className="w-full rounded-lg border border-ritual-gold px-4 py-2.5 text-sm font-semibold text-ritual-gold transition hover:bg-ritual-gold/10 disabled:cursor-not-allowed disabled:border-gray-700 disabled:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
              >
                Prepare Deposit
              </button>
              <p className="text-xs leading-5 text-gray-500">
                This prepares a payable deposit transaction only. Your wallet will not open until you confirm.
              </p>
            </Panel>

            <Panel title="Executor">
              <label htmlFor="executor" className="text-sm font-semibold text-gray-300">
                LLM executor address
              </label>
              <input
                id="executor"
                value={executor}
                onChange={(event) => setExecutor(event.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-700 bg-ritual-surface px-3 py-2.5 font-mono text-xs text-gray-200 outline-none transition placeholder:text-gray-600 focus-visible:ring-2 focus-visible:ring-ritual-green/50"
                placeholder="0x..."
              />
              <p className="mt-3 text-xs leading-5 text-gray-500">
                Use a registered TEE executor with LLM capability. The app never reads registry endpoints.
              </p>
            </Panel>

            <Panel title="Lifecycle">
              <div className="space-y-2">
                {statusItems.map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2">
                    <span className="text-xs text-gray-400">{item.label}</span>
                    <span
                      className={`font-mono text-xs ${
                        item.active ? "text-ritual-green" : "text-gray-600"
                      }`}
                    >
                      {item.key}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Status">
              <p className="text-sm leading-6 text-gray-300">{statusText}</p>
              {txHash && (
                <a
                  href={`${ritualChain.blockExplorers.default.url}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 block font-mono text-xs text-ritual-lime underline decoration-ritual-lime/40 underline-offset-4"
                >
                  {shortenHex(txHash, 10, 8)}
                </a>
              )}
              {lastUsage && <p className="mt-3 font-mono text-xs text-gray-500">{lastUsage}</p>}
              {error && <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
            </Panel>
          </aside>
        </section>
      </div>

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4">
          <div className="w-full max-w-lg rounded-lg border border-gray-700 bg-ritual-elevated p-5 shadow-card">
            <p className="font-mono text-xs uppercase text-ritual-gold">Final confirmation</p>
            {pendingAction === "chat" ? (
              <>
                <h2 className="mt-2 text-xl font-semibold text-gray-100">Send one Ritual LLM transaction?</h2>
                <div className="mt-4 space-y-2 text-sm leading-6 text-gray-400">
                  <p>To: <span className="font-mono text-gray-300">{shortenHex(RITUAL_LLM_PRECOMPILE, 10, 8)}</span></p>
                  <p>Executor: <span className="font-mono text-gray-300">{shortenHex(executor, 10, 8)}</span></p>
                  <p>Gas limit: <span className="font-mono text-gray-300">3,000,000</span></p>
                  <p>Model: <span className="font-mono text-gray-300">{DEFAULT_LLM_MODEL}</span></p>
                  <p>History storage: <span className="font-mono text-gray-300">empty StorageRef</span></p>
                </div>
              </>
            ) : (
              <>
                <h2 className="mt-2 text-xl font-semibold text-gray-100">Deposit test RITUAL into RitualWallet?</h2>
                <div className="mt-4 space-y-2 text-sm leading-6 text-gray-400">
                  <p>Contract: <span className="font-mono text-gray-300">{shortenHex(RITUAL_WALLET, 10, 8)}</span></p>
                  <p>Function: <span className="font-mono text-gray-300">deposit(uint256)</span></p>
                  <p>lockDuration: <span className="font-mono text-gray-300">100000</span></p>
                  <p>Value: <span className="font-mono text-gray-300">{depositAmount || "0"} test RITUAL</span></p>
                  <p>Chain: <span className="font-mono text-gray-300">Ritual 1979</span></p>
                </div>
              </>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setPendingMessages(null);
                  setPendingAction(null);
                }}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-400 transition hover:border-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={pendingAction === "chat" ? sendChatTransaction : sendDepositTransaction}
                className="rounded-lg border border-ritual-green px-4 py-2.5 text-sm font-semibold text-ritual-green transition hover:bg-ritual-green/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ritual-green/50"
              >
                Confirm and Send
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-ritual-elevated/95 p-4 shadow-card">
      <h2 className="mb-4 text-sm font-semibold uppercase text-gray-300">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-black/20 px-3 py-2">
      <span className="text-xs uppercase text-gray-500">{label}</span>
      <span className="truncate font-mono text-xs text-gray-300">{value}</span>
    </div>
  );
}
