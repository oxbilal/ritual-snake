"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, type Address, type Hash } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWalletClient,
} from "wagmi";
import { ritualChain } from "../../lib/chain";
import { errorMessage, shortenHex } from "../../lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "ritual-streak-hub";

const testContractAbi = [
  {
    inputs: [
      { internalType: "string", name: "label_", type: "string" },
      { internalType: "string", name: "message_", type: "string" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    inputs: [],
    name: "createdAt",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "creator",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "label",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "message",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const testContractBytecode =
  "0x608060405234801561000f575f5ffd5b50604051610912380380610912833981810160405281019061003191906101eb565b815f908161003f9190610482565b50806001908161004f9190610482565b503360025f6101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550426003819055505050610551565b5f604051905090565b5f5ffd5b5f5ffd5b5f5ffd5b5f5ffd5b5f601f19601f8301169050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52604160045260245ffd5b6100fd826100b7565b810181811067ffffffffffffffff8211171561011c5761011b6100c7565b5b80604052505050565b5f61012e61009e565b905061013a82826100f4565b919050565b5f67ffffffffffffffff821115610159576101586100c7565b5b610162826100b7565b9050602081019050919050565b8281835e5f83830152505050565b5f61018f61018a8461013f565b610125565b9050828152602081018484840111156101ab576101aa6100b3565b5b6101b684828561016f565b509392505050565b5f82601f8301126101d2576101d16100af565b5b81516101e284826020860161017d565b91505092915050565b5f5f60408385031215610201576102006100a7565b5b5f83015167ffffffffffffffff81111561021e5761021d6100ab565b5b61022a858286016101be565b925050602083015167ffffffffffffffff81111561024b5761024a6100ab565b5b610257858286016101be565b9150509250929050565b5f81519050919050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f60028204905060018216806102af57607f821691505b6020821081036102c2576102c161026b565b5b50919050565b5f819050815f5260205f209050919050565b5f6020601f8301049050919050565b5f82821b905092915050565b5f600883026103247fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff826102e9565b61032e86836102e9565b95508019841693508086168417925050509392505050565b5f819050919050565b5f819050919050565b5f61037261036d61036884610346565b61034f565b610346565b9050919050565b5f819050919050565b61038b83610358565b61039f61039782610379565b8484546102f5565b825550505050565b5f5f905090565b6103b66103a7565b6103c1818484610382565b505050565b5f5b828110156103e7576103dc5f8284016103ae565b6001810190506103c8565b505050565b601f82111561043a578282111561043957610406816102c8565b61040f836102da565b610418856102da565b6020861015610425575f90505b808301610434828403826103c6565b505050505b5b505050565b5f82821c905092915050565b5f61045a5f198460080261043f565b1980831691505092915050565b5f610472838361044b565b9150826002028217905092915050565b61048b82610261565b67ffffffffffffffff8111156104a4576104a36100c7565b5b6104ae8254610298565b6104b98282856103ec565b5f60209050601f8311600181146104ea575f84156104d8578287015190505b6104e28582610467565b865550610549565b601f1984166104f8866102c8565b5f5b8281101561051f578489015182556001820191506020850194506020810190506104fa565b8683101561053c5784890151610538601f89168261044b565b8355505b6001600288020188555050505b505050505050565b6103b48061055e5f395ff3fe608060405234801561000f575f5ffd5b506004361061004a575f3560e01c806302d05d3f1461004e578063cb4774c41461006c578063cf09e0d01461008a578063e21f37ce146100a8575b5f5ffd5b6100566100c6565b6040516100639190610247565b60405180910390f35b6100746100eb565b60405161008191906102d0565b60405180910390f35b610092610176565b60405161009f9190610308565b60405180910390f35b6100b061017c565b6040516100bd91906102d0565b60025f9054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b5f80546100f79061034e565b80601f01602080910402602001604051908101604052809291908181526020018280546101239061034e565b801561016e5780601f106101455761010080835404028352916020019161016e565b820191905f5260205f20905b81548152906001019060200180831161015157829003601f168201915b505050505081565b60035481565b600180546101899061034e565b80601f01602080910402602001604051908101604052809291908181526020018280546101b59061034e565b80156102005780601f106101d757610100808354040283529160200191610200565b820191905f5260205f20905b8154815290600101906020018083116101e357829003601f168201915b505050505081565b5f73ffffffffffffffffffffffffffffffffffffffff82169050919050565b5f61023182610208565b9050919050565b61024181610227565b82525050565b5f60208201905061025a5f830184610238565b92915050565b5f81519050919050565b5f82825260208201905092915050565b8281835e5f83830152505050565b5f601f19601f8301169050919050565b5f6102a282610260565b6102ac818561026a565b93506102bc81856020860161027a565b6102c581610288565b840191505092915050565b5f6020820190508181035f8301526102e88184610298565b905092915050565b5f819050919050565b610302816102f0565b82525050565b5f60208201905061031b5f8301846102f9565b92915050565b7f4e487b71000000000000000000000000000000000000000000000000000000005f52602260045260245ffd5b5f600282049050600182168061036557607f821691505b60208210810361037857610377610321565b5b5091905056fea2646970667358221220058e77e905a54f3235bd5bde56a36603a9c86bcad8c6b3169a7651b118b5845964736f6c63430008230033" as const;

type DeploymentRecord = {
  label: string;
  message: string;
  address: Address;
  txHash: Hash;
  createdAt: number;
};

type StreakData = {
  currentStreak: number;
  bestStreak: number;
  totalCheckIns: number;
  totalTransactions: number;
  activeDays: string[];
  lastCheckInTxHash?: Hash;
  lastCheckInAt?: number;
  deployments: DeploymentRecord[];
};

const emptyData: StreakData = {
  currentStreak: 0,
  bestStreak: 0,
  totalCheckIns: 0,
  totalTransactions: 0,
  activeDays: [],
  deployments: [],
};

function storageKey(address?: Address) {
  return address ? `${STORAGE_PREFIX}:${address.toLowerCase()}` : "";
}

function dayKey(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function formatDuration(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function loadData(address?: Address): StreakData {
  if (typeof window === "undefined" || !address) return emptyData;

  try {
    const stored = window.localStorage.getItem(storageKey(address));
    if (!stored) return emptyData;
    const parsed = JSON.parse(stored) as Partial<StreakData>;
    return {
      ...emptyData,
      ...parsed,
      activeDays: Array.isArray(parsed.activeDays) ? parsed.activeDays : [],
      deployments: Array.isArray(parsed.deployments) ? parsed.deployments : [],
    };
  } catch {
    return emptyData;
  }
}

function saveData(address: Address | undefined, data: StreakData) {
  if (typeof window === "undefined" || !address) return;
  window.localStorage.setItem(storageKey(address), JSON.stringify(data));
}

function metric(label: string, value: string | number, tone = "text-zinc-50") {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/90 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
      <p className={`mt-3 break-words font-mono text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export default function RitualStreakHub() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { data: walletClient } = useWalletClient({ chainId: ritualChain.id });
  const { data: balance, refetch: refetchBalance } = useBalance({
    address,
    chainId: ritualChain.id,
    query: { enabled: Boolean(address) },
  });

  const [data, setData] = useState<StreakData>(emptyData);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const [txError, setTxError] = useState("");
  const [dailyHash, setDailyHash] = useState<Hash>();
  const [extraHash, setExtraHash] = useState<Hash>();
  const [deployHash, setDeployHash] = useState<Hash>();
  const [handledHashes, setHandledHashes] = useState<Hash[]>([]);
  const [contractLabel, setContractLabel] = useState("");
  const [contractMessage, setContractMessage] = useState("");
  const [pendingDeployMeta, setPendingDeployMeta] = useState<{ label: string; message: string }>();

  const dailyReceipt = useWaitForTransactionReceipt({ hash: dailyHash, chainId: ritualChain.id });
  const extraReceipt = useWaitForTransactionReceipt({ hash: extraHash, chainId: ritualChain.id });
  const deployReceipt = useWaitForTransactionReceipt({ hash: deployHash, chainId: ritualChain.id });

  const isWrongChain = isConnected && chainId !== ritualChain.id;
  const connector = connectors.find((item) => item.id === "injected") ?? connectors[0];
  const lastCheckInAt = data.lastCheckInAt ?? 0;
  const nextAvailableAt = lastCheckInAt ? lastCheckInAt + DAY_MS : 0;
  const checkInAvailable = !lastCheckInAt || now >= nextAvailableAt;
  const nextWindowMissed = Boolean(lastCheckInAt && now > nextAvailableAt + DAY_MS);
  const countdown = checkInAvailable ? "00:00:00" : formatDuration(nextAvailableAt - now);
  const timerProgress = lastCheckInAt ? Math.min(100, Math.max(0, ((now - lastCheckInAt) / DAY_MS) * 100)) : 0;
  const explorerTx = (hash?: Hash) => (hash ? `${ritualChain.blockExplorers.default.url}/tx/${hash}` : "");
  const pendingTx = dailyReceipt.isLoading || extraReceipt.isLoading || deployReceipt.isLoading;

  useEffect(() => {
    setData(loadData(address));
    setNotice("");
    setTxError("");
  }, [address]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const updateData = (recipe: (current: StreakData) => StreakData) => {
    setData((current) => {
      const next = recipe(current);
      saveData(address, next);
      return next;
    });
  };

  const connectWallet = () => {
    setTxError("");
    if (!connector) {
      setTxError("MetaMask or an injected wallet was not found.");
      return;
    }
    connect({ connector }, { onError: (error) => setTxError(errorMessage(error)) });
  };

  const ensureReady = () => {
    setTxError("");
    setNotice("");

    if (!isConnected) {
      connectWallet();
      return false;
    }

    if (isWrongChain) {
      switchChain({ chainId: ritualChain.id }, { onError: (error) => setTxError(errorMessage(error)) });
      return false;
    }

    if (!walletClient || !address) {
      setTxError("Wallet client is not ready. Reconnect MetaMask and try again.");
      return false;
    }

    return true;
  };

  const sendSelfTransaction = async (kind: "daily" | "extra") => {
    if (!ensureReady() || !walletClient || !address) return;

    if (kind === "daily" && !checkInAvailable) {
      setNotice("Already checked in today.");
      return;
    }

    try {
      setNotice("Confirm the 0 RITUAL self-transaction in MetaMask.");
      const hash = await walletClient.sendTransaction({
        account: address,
        chain: ritualChain,
        to: address,
        value: 0n,
      });
      if (kind === "daily") setDailyHash(hash);
      if (kind === "extra") setExtraHash(hash);
      setNotice("Transaction submitted. Waiting for Ritual testnet confirmation.");
    } catch (error) {
      setTxError(errorMessage(error));
    }
  };

  const deployTestContract = async () => {
    if (!ensureReady() || !walletClient || !address) return;
    const label = contractLabel.trim();
    const message = contractMessage.trim();

    if (!label) {
      setTxError("Contract label/name is required.");
      return;
    }

    try {
      setPendingDeployMeta({ label, message });
      setNotice("Confirm contract deployment in MetaMask.");
      const hash = await walletClient.deployContract({
        abi: testContractAbi,
        bytecode: testContractBytecode,
        args: [label, message],
        account: address,
        chain: ritualChain,
      });
      setDeployHash(hash);
      setNotice("Deployment submitted. Waiting for confirmation.");
    } catch (error) {
      setPendingDeployMeta(undefined);
      setTxError(errorMessage(error));
    }
  };

  useEffect(() => {
    if (!address || !dailyHash || !dailyReceipt.isSuccess || handledHashes.includes(dailyHash)) return;

    const confirmedAt = Date.now();
    updateData((current) => {
      const previous = current.lastCheckInAt ?? 0;
      const nextStreak = !previous || confirmedAt > previous + DAY_MS * 2 ? 1 : current.currentStreak + 1;
      const activeDays = Array.from(new Set([...current.activeDays, dayKey(confirmedAt)]));
      return {
        ...current,
        currentStreak: nextStreak,
        bestStreak: Math.max(current.bestStreak, nextStreak),
        totalCheckIns: current.totalCheckIns + 1,
        totalTransactions: current.totalTransactions + 1,
        activeDays,
        lastCheckInAt: confirmedAt,
        lastCheckInTxHash: dailyHash,
      };
    });
    setHandledHashes((hashes) => [...hashes, dailyHash]);
    setNotice("Daily check-in confirmed. Your 24-hour timer has restarted.");
    refetchBalance();
  }, [address, dailyHash, dailyReceipt.isSuccess, handledHashes, refetchBalance]);

  useEffect(() => {
    if (!address || !extraHash || !extraReceipt.isSuccess || handledHashes.includes(extraHash)) return;

    updateData((current) => ({
      ...current,
      totalTransactions: current.totalTransactions + 1,
    }));
    setHandledHashes((hashes) => [...hashes, extraHash]);
    setNotice("Extra activity transaction confirmed. Streak unchanged.");
    refetchBalance();
  }, [address, extraHash, extraReceipt.isSuccess, handledHashes, refetchBalance]);

  useEffect(() => {
    const contractAddress = deployReceipt.data?.contractAddress;
    if (!address || !deployHash || !deployReceipt.isSuccess || !contractAddress || !pendingDeployMeta || handledHashes.includes(deployHash)) return;

    updateData((current) => ({
      ...current,
      totalTransactions: current.totalTransactions + 1,
      deployments: [
        {
          label: pendingDeployMeta.label,
          message: pendingDeployMeta.message,
          address: contractAddress,
          txHash: deployHash,
          createdAt: Date.now(),
        },
        ...current.deployments,
      ],
    }));
    setHandledHashes((hashes) => [...hashes, deployHash]);
    setNotice(`Test contract deployed at ${contractAddress}.`);
    setPendingDeployMeta(undefined);
    refetchBalance();
  }, [address, deployHash, deployReceipt.data?.contractAddress, deployReceipt.isSuccess, handledHashes, pendingDeployMeta, refetchBalance]);

  const checkInLabel = !isConnected
    ? "Connect Wallet"
    : isWrongChain
      ? "Switch to Ritual Testnet"
      : pendingTx
        ? "Waiting for confirmation..."
        : checkInAvailable
          ? "Daily Check-in TX"
          : "Already checked in today";

  const walletLine = useMemo(() => {
    if (!isConnected) return "No wallet connected";
    return `${shortenHex(address, 8, 6)} on ${chain?.name ?? "unknown network"}`;
  }, [address, chain?.name, isConnected]);

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(18,255,158,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(18,255,158,0.06)_1px,transparent_1px)] bg-[size:44px_44px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(18,255,158,0.18),transparent_38%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">Ritual testnet activity hub</p>
            <h1 className="mt-2 font-display text-4xl font-black leading-none text-zinc-50 sm:text-6xl">Ritual Streak Hub</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-400">
              Maintain a daily onchain streak with user-confirmed 0 test RITUAL transactions. No private keys, no seed phrases, no automatic sends.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 font-mono text-xs font-bold text-emerald-200">
              Chain ID 1979
            </span>
            <button
              onClick={() => (isConnected ? disconnect() : connectWallet())}
              className="rounded-lg border border-emerald-300 px-4 py-2.5 text-sm font-black text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-wait disabled:opacity-60"
              disabled={isConnecting}
            >
              {isConnected ? "Disconnect" : isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          </div>
        </header>

        {(notice || txError || nextWindowMissed) && (
          <section className="mt-4 grid gap-3">
            {notice && <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-100">{notice}</div>}
            {txError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200">{txError}</div>}
            {nextWindowMissed && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">
                More than 24h passed after your next window opened. The next successful check-in will reset the streak to 1.
              </div>
            )}
          </section>
        )}

        <section className="grid flex-1 gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-lg border border-emerald-400/30 bg-zinc-950 p-5 shadow-glow-green">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Current streak</p>
                <div className="mt-5 flex items-end gap-3">
                  <span className="font-display text-8xl font-black leading-none text-emerald-300">{data.currentStreak}</span>
                  <span className="pb-3 text-2xl font-black text-zinc-400">days</span>
                </div>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-zinc-900">
                  <div className="h-full rounded-full bg-emerald-300 transition-all" style={{ width: `${timerProgress}%` }} />
                </div>
                <p className="mt-3 font-mono text-sm text-zinc-300">Next check-in available in {countdown}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {metric("Best streak", data.bestStreak, "text-emerald-300")}
                {metric("Total check-ins", data.totalCheckIns)}
                {metric("Total transactions", data.totalTransactions)}
                {metric("Active days", data.activeDays.length)}
                {metric("Last check-in date", formatDate(data.lastCheckInAt), "text-zinc-200")}
                {metric("Last check-in tx", data.lastCheckInTxHash ? shortenHex(data.lastCheckInTxHash, 8, 6) : "--", "text-emerald-300")}
              </div>
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Daily check-in</p>
                  <h2 className="mt-2 font-display text-3xl font-black text-zinc-50">Send a 0 test RITUAL self-transaction</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">
                    One confirmed check-in counts per 24-hour window. Confirmations happen only in MetaMask.
                  </p>
                </div>
                <button
                  onClick={() => sendSelfTransaction("daily")}
                  disabled={pendingTx || isSwitching || (!isConnected && isConnecting)}
                  className="rounded-lg border border-emerald-300 px-6 py-5 text-base font-black text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-wait disabled:opacity-60"
                >
                  {checkInLabel}
                </button>
              </div>
              {dailyHash && (
                <a href={explorerTx(dailyHash)} target="_blank" rel="noreferrer" className="mt-4 block font-mono text-xs text-emerald-300 hover:text-emerald-100">
                  Last submitted daily tx: {shortenHex(dailyHash, 10, 8)}
                </a>
              )}
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Extra activity tx</p>
                <h2 className="mt-2 font-display text-2xl font-black text-zinc-50">Add a non-streak transaction</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Sends another 0 test RITUAL self-transaction and increases total transactions only.
                </p>
                <button
                  onClick={() => sendSelfTransaction("extra")}
                  disabled={pendingTx || isSwitching || (!isConnected && isConnecting)}
                  className="mt-5 w-full rounded-lg border border-zinc-700 px-4 py-3 text-sm font-black text-zinc-200 transition hover:border-emerald-300 hover:text-emerald-200 disabled:cursor-wait disabled:opacity-60"
                >
                  Extra Activity TX
                </button>
                {extraHash && (
                  <a href={explorerTx(extraHash)} target="_blank" rel="noreferrer" className="mt-4 block font-mono text-xs text-emerald-300 hover:text-emerald-100">
                    Extra tx: {shortenHex(extraHash, 10, 8)}
                  </a>
                )}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Wallet</p>
                <h2 className="mt-2 font-display text-2xl font-black text-zinc-50">{walletLine}</h2>
                <div className="mt-4 grid gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black px-3 py-3">
                    <span className="text-sm text-zinc-500">Test RITUAL balance</span>
                    <span className="font-mono text-sm text-emerald-300">{formatEther(balance?.value ?? 0n)} RITUAL</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black px-3 py-3">
                    <span className="text-sm text-zinc-500">RPC</span>
                    <span className="font-mono text-xs text-zinc-300">https://rpc.ritualfoundation.org</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-emerald-400/25 bg-zinc-950 p-5 shadow-glow-green">
              <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Deploy Test Contract</p>
                <h2 className="font-display text-3xl font-black text-zinc-50">Deploy a simple test contract</h2>
                <p className="max-w-2xl text-sm leading-6 text-zinc-500">
                  Deployment is testnet-only and opens in MetaMask from your connected wallet. Nothing deploys until you confirm there.
                </p>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Contract label/name</span>
                  <input
                    value={contractLabel}
                    onChange={(event) => setContractLabel(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-zinc-100 outline-none transition focus:border-emerald-300"
                    placeholder="Morning Ritual"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Optional message</span>
                  <input
                    value={contractMessage}
                    onChange={(event) => setContractMessage(event.target.value)}
                    className="mt-2 w-full rounded-lg border border-zinc-800 bg-black px-4 py-3 text-zinc-100 outline-none transition focus:border-emerald-300"
                    placeholder="Built during my streak"
                  />
                </label>
              </div>

              <button
                onClick={deployTestContract}
                disabled={pendingTx || isSwitching || (!isConnected && isConnecting)}
                className="mt-5 w-full rounded-lg border border-emerald-300 px-4 py-4 text-sm font-black text-emerald-200 transition hover:bg-emerald-300 hover:text-black disabled:cursor-wait disabled:opacity-60"
              >
                {!isConnected ? "Connect Wallet" : isWrongChain ? "Switch to Ritual Testnet" : pendingTx ? "Waiting for confirmation..." : "Deploy Test Contract"}
              </button>

              <div className="mt-5 grid gap-3">
                {data.deployments.length === 0 ? (
                  <p className="rounded-lg border border-zinc-800 bg-black p-4 text-sm text-zinc-500">No test contracts deployed from this wallet yet.</p>
                ) : (
                  data.deployments.map((deployment) => (
                    <div key={deployment.txHash} className="rounded-lg border border-zinc-800 bg-black p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-zinc-100">{deployment.label}</p>
                          <p className="mt-1 truncate text-sm text-zinc-500">{deployment.message || "No message"}</p>
                        </div>
                        <span className="rounded-md border border-emerald-400/30 px-2 py-1 font-mono text-xs text-emerald-300">
                          {formatDate(deployment.createdAt)}
                        </span>
                      </div>
                      <p className="mt-3 font-mono text-xs text-zinc-300">Contract: {shortenHex(deployment.address, 10, 8)}</p>
                      <a href={explorerTx(deployment.txHash)} target="_blank" rel="noreferrer" className="mt-2 block font-mono text-xs text-emerald-300 hover:text-emerald-100">
                        Tx: {shortenHex(deployment.txHash, 10, 8)}
                      </a>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Activity rules</p>
              <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
                <p>One check-in counts per 24h.</p>
                <p>Early repeat check-ins show "Already checked in today" and do not open a transaction.</p>
                <p>If more than 24h passes after the next window opens, your next check-in resets the streak to 1.</p>
                <p>Data is stored locally and separately for each wallet address.</p>
              </div>
            </section>

            <section className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-5 text-sm font-bold leading-6 text-amber-100">
              Ritual testnet only - no real value.
            </section>

            <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
              <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Safety</p>
              <div className="mt-4 grid gap-3 text-sm text-zinc-400">
                <div className="rounded-lg border border-zinc-800 bg-black p-3">No private keys.</div>
                <div className="rounded-lg border border-zinc-800 bg-black p-3">No seed phrases.</div>
                <div className="rounded-lg border border-zinc-800 bg-black p-3">No real funds.</div>
                <div className="rounded-lg border border-zinc-800 bg-black p-3">Every transaction requires MetaMask confirmation.</div>
              </div>
            </section>
          </aside>
        </section>

        <footer className="flex flex-col gap-2 border-t border-zinc-800 py-5 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Built by <span className="font-bold text-emerald-300">@0xblp</span>
          </span>
          <span className="font-mono text-xs">Ritual testnet only - no real value.</span>
        </footer>
      </div>
    </main>
  );
}
