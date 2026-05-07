"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { formatEther } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { ritualChain } from "../lib/chain";
import { errorMessage, shortenHex } from "../lib/format";
import { CONTRACT_ADDRESS, snakeScoresAbi, ZERO_ADDRESS, type LeaderboardRow } from "../lib/snakeScores";

const size = 14;
const cell = 14;
const startSnake = [
  [5, 6],
  [4, 6],
  [3, 6],
  [2, 6],
];
const startFood = [10, 4];
const sessionsKey = "ritualSnake.totalSessions";
const transactionsKey = "ritualSnake.totalOnchainTransactions";

type PlayerStats = {
  totalPoints: bigint;
  bestScore: bigint;
  totalGames: bigint;
  rank: string;
};

function debugContractCall(functionName: string, args: unknown[]) {
  console.debug("[RitualSnake contract call]", {
    contractAddress: CONTRACT_ADDRESS,
    functionName,
    argTypes: args.map((arg) => (typeof arg === "string" && arg.startsWith("0x") ? "address/string" : typeof arg)),
  });
}

function getRank(score: number) {
  if (score >= 5000) return "Legendary";
  if (score >= 3000) return "Master";
  if (score >= 2000) return "Expert";
  if (score >= 1000) return "Advanced";
  return "Beginner";
}

let audioContext: AudioContext | null = null;

function playSound(type: "countdown" | "go" | "eat" | "gameOver" | "submitSuccess") {
  try {
    if (typeof window === "undefined") return;
    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioContext) audioContext = new AudioContextClass();
    const context = audioContext;
    if (!context) return;
    const now = context.currentTime;

    const tones = {
      countdown: [{ frequency: 520, start: 0, duration: 0.08, gain: 0.045 }],
      go: [
        { frequency: 660, start: 0, duration: 0.07, gain: 0.05 },
        { frequency: 880, start: 0.08, duration: 0.1, gain: 0.05 },
      ],
      eat: [
        { frequency: 760, start: 0, duration: 0.045, gain: 0.04 },
        { frequency: 1040, start: 0.045, duration: 0.06, gain: 0.035 },
      ],
      gameOver: [
        { frequency: 220, start: 0, duration: 0.12, gain: 0.05 },
        { frequency: 150, start: 0.12, duration: 0.16, gain: 0.045 },
      ],
      submitSuccess: [
        { frequency: 540, start: 0, duration: 0.08, gain: 0.04 },
        { frequency: 720, start: 0.08, duration: 0.08, gain: 0.04 },
        { frequency: 960, start: 0.16, duration: 0.12, gain: 0.035 },
      ],
    }[type];

    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.start);
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(tone.gain, now + tone.start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + tone.start);
      oscillator.stop(now + tone.start + tone.duration + 0.02);
    }
  } catch {
    // Audio can be blocked before a user gesture; gameplay should continue silently.
  }
}

function formatBalance(value?: bigint) {
  if (value === undefined) return "--";
  const display = Number(formatEther(value));
  if (!Number.isFinite(display)) return "--";
  return display.toLocaleString("en-US", { maximumFractionDigits: 5 });
}

function displayUint(value: bigint) {
  return value.toString();
}

function readStoredCount(key: string) {
  if (typeof window === "undefined") return 0;
  const value = window.localStorage.getItem(key);
  return value ? Number.parseInt(value, 10) || 0 : 0;
}

function normalizePlayer(data: unknown): PlayerStats {
  if (!data) return { totalPoints: 0n, bestScore: 0n, totalGames: 0n, rank: "Beginner" };
  if (Array.isArray(data)) {
    const [totalPoints, bestScore, totalGames, rank] = data;
    return {
      totalPoints: typeof totalPoints === "bigint" ? totalPoints : 0n,
      bestScore: typeof bestScore === "bigint" ? bestScore : 0n,
      totalGames: typeof totalGames === "bigint" ? totalGames : 0n,
      rank: String(rank ?? "Beginner"),
    };
  }

  const player = data as {
    playerTotalPoints?: bigint;
    playerBestScore?: bigint;
    playerTotalGames?: bigint;
    totalPoints?: bigint;
    bestScore?: bigint;
    totalGames?: bigint;
    rank?: string;
  };
  return {
    totalPoints: player.playerTotalPoints ?? player.totalPoints ?? 0n,
    bestScore: player.playerBestScore ?? player.bestScore ?? 0n,
    totalGames: player.playerTotalGames ?? player.totalGames ?? 0n,
    rank: player.rank ?? "Beginner",
  };
}

function normalizeLeaderboard(data: unknown): LeaderboardRow[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => {
      if (!Array.isArray(item)) {
        const row = item as { player?: string; score?: bigint; rank?: string };
        if (!row?.player) return null;
        return {
          player: row.player,
          score: typeof row.score === "bigint" ? row.score : 0n,
          rank: row.rank ?? "Beginner",
        };
      }
      return {
        player: String(item[0]),
        score: typeof item[1] === "bigint" ? item[1] : 0n,
        rank: String(item[2] ?? "Beginner"),
      };
    })
    .filter((item): item is LeaderboardRow => Boolean(item))
    .sort((a, b) => (b.score > a.score ? 1 : b.score < a.score ? -1 : 0));
}

function Button({
  children,
  className,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-bold transition disabled:cursor-not-allowed ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

export default function App() {
  const { address, isConnected, chain } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync, isPending: isWalletPending } = useWriteContract();
  const { data: nativeBalance } = useBalance({
    address,
    chainId: ritualChain.id,
    query: { enabled: Boolean(address) },
  });

  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [snake, setSnake] = useState<number[][]>(startSnake);
  const [food, setFood] = useState<number[]>(startFood);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [pending, setPending] = useState<"startRun()" | "submitScore(score)" | null>(null);
  const [status, setStatus] = useState("Connect wallet, confirm start tx, then play.");
  const [submitError, setSubmitError] = useState("");
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  const [lastStartTx, setLastStartTx] = useState<`0x${string}` | null>(null);
  const [lastSubmitTx, setLastSubmitTx] = useState<`0x${string}` | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalOnchainTransactions, setTotalOnchainTransactions] = useState(0);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [confirmedPlayer, setConfirmedPlayer] = useState<ReturnType<typeof normalizePlayer> | null>(null);
  const [confirmedPlayerAddress, setConfirmedPlayerAddress] = useState<string | null>(null);
  const [confirmedLeaderboard, setConfirmedLeaderboard] = useState<LeaderboardRow[] | null>(null);

  const dirRef = useRef([1, 0]);
  const scoreRef = useRef(0);
  const foodRef = useRef(startFood);
  const comboRef = useRef(0);
  const submittingRef = useRef(false);

  const grid = useMemo(() => Array.from({ length: size * size }), []);
  const connector = connectors.find((item) => item.id === "injected") ?? connectors[0];
  const contractReady = CONTRACT_ADDRESS !== ZERO_ADDRESS;
  const isWrongChain = isConnected && chainId !== ritualChain.id;

  const incrementStoredCount = useCallback((key: string, setter: React.Dispatch<React.SetStateAction<number>>) => {
    setter((current) => {
      const next = current + 1;
      window.localStorage.setItem(key, String(next));
      return next;
    });
  }, []);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    foodRef.current = food;
  }, [food]);

  useEffect(() => {
    comboRef.current = combo;
  }, [combo]);

  useEffect(() => {
    setTotalSessions(readStoredCount(sessionsKey));
    setTotalOnchainTransactions(readStoredCount(transactionsKey));
  }, []);

  useEffect(() => {
    if (!contractReady) setStatus("Score contract not deployed yet.");
  }, [contractReady]);

  useEffect(() => {
    if (!address) {
      setConfirmedPlayer(null);
      setConfirmedPlayerAddress(null);
      return;
    }
    setConfirmedPlayer(null);
    setConfirmedPlayerAddress(null);
  }, [address]);

  const player = address && confirmedPlayerAddress === address && confirmedPlayer ? confirmedPlayer : normalizePlayer(null);
  const totalPoints = player.totalPoints;
  const best = player.bestScore;
  const totalGames = player.totalGames;
  const leaderboard = confirmedLeaderboard ?? [];
  const leaderboardRows = leaderboard.map((row) => ({
    ...row,
    isCurrentUser: Boolean(address && row.player.toLowerCase() === address.toLowerCase()),
  }));

  const resetGame = () => {
    setScore(0);
    setCombo(0);
    setSnake(startSnake);
    setFood(startFood);
    setGameOver(false);
    setSubmitError("");
    setScoreSubmitted(false);
    setLastSubmitTx(null);
    dirRef.current = [1, 0];
    scoreRef.current = 0;
    comboRef.current = 0;
    foodRef.current = startFood;
  };

  const connectWallet = () => {
    if (!connector || isConnected) return;
    setStatus("Opening wallet connection.");
    connect(
      { connector },
      {
        onSuccess: () => {
          setWalletMenuOpen(false);
          setStatus("Wallet connected. Confirm startRun() to play.");
        },
        onError: (error) => setStatus(`Wallet connection failed: ${errorMessage(error)}`),
      },
    );
  };

  const randomFood = (body: number[][]) => {
    const empty: number[][] = [];
    for (let x = 0; x < size; x += 1) {
      for (let y = 0; y < size; y += 1) {
        if (!body.some(([sx, sy]) => sx === x && sy === y)) empty.push([x, y]);
      }
    }
    return empty[Math.floor(Math.random() * empty.length)] || startFood;
  };

  const beginCountdown = () => {
    setCountdown(3);
    playSound("countdown");
    let v = 3;
    const timer = window.setInterval(() => {
      v -= 1;
      if (v === 0) {
        window.clearInterval(timer);
        setCountdown(null);
        setPlaying(true);
        setStatus("Run is live. Use arrows or the on-screen controls.");
      } else {
        playSound(v === 1 ? "go" : "countdown");
        setCountdown(v);
      }
    }, 650);
  };

  const ensureReady = () => {
    if (!isConnected) {
      setStatus("Connect wallet first.");
      connectWallet();
      return false;
    }
    if (isWrongChain) {
      setStatus("Switch to Ritual Testnet before sending game transactions.");
      switchChain({ chainId: ritualChain.id });
      return false;
    }
    if (!contractReady) {
      setStatus("Score contract not deployed yet.");
      return false;
    }
    if (!publicClient) {
      setStatus("Ritual RPC client is not ready yet. Try again in a moment.");
      return false;
    }
    return true;
  };

  const startRun = async () => {
    if (playing || countdown !== null || pending || isWalletPending || isConnecting) return;
    if (!ensureReady()) return;

    setPending("startRun()");
    setStatus("Waiting for wallet confirmation: startRun()");

    try {
      debugContractCall("startRun", []);
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: snakeScoresAbi,
        functionName: "startRun",
        chainId: ritualChain.id,
      });

      setStatus("Confirming startRun() on Ritual Testnet...");
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("startRun() failed on-chain.");

      setLastStartTx(hash);
      incrementStoredCount(sessionsKey, setTotalSessions);
      incrementStoredCount(transactionsKey, setTotalOnchainTransactions);
      resetGame();
      setStatus("startRun() confirmed. Get ready.");
      beginCountdown();
    } catch (error) {
      setStatus(`startRun() not completed: ${errorMessage(error)}`);
    } finally {
      setPending(null);
    }
  };

  const refreshContractData = useCallback(async () => {
    if (!publicClient || !contractReady) return;

    if (address) {
      try {
        debugContractCall("getPlayer", [address]);
        const freshPlayer = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: snakeScoresAbi,
          functionName: "getPlayer",
          args: [address],
        });

        setConfirmedPlayer(normalizePlayer(freshPlayer));
        setConfirmedPlayerAddress(address);
      } catch (error) {
        console.error("[RitualSnake getPlayer failed]", error);
        setStatus(`Could not refresh player stats: ${errorMessage(error)}`);
      }
    }

    try {
      debugContractCall("getLeaderboard", []);
      const freshLeaderboard = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: snakeScoresAbi,
        functionName: "getLeaderboard",
      });

      setConfirmedLeaderboard(normalizeLeaderboard(freshLeaderboard));
    } catch (error) {
      console.error("[RitualSnake getLeaderboard failed]", error);
    }
  }, [address, contractReady, publicClient]);

  useEffect(() => {
    if (!contractReady || !publicClient) {
      setConfirmedLeaderboard(null);
      return;
    }
    void refreshContractData();
  }, [address, contractReady, publicClient, refreshContractData]);

  const submitScore = useCallback(
    async (finalScore: number) => {
      if (submittingRef.current || pending === "submitScore(score)") return;
      setLastScore(finalScore);
      setSubmitError("");
      setLastSubmitTx(null);

      if (finalScore <= 0) {
        setSubmitError("Score must be above zero before it can be submitted on-chain.");
        setStatus("Score was 0, so submitScore(score) was not sent. Play again and eat at least one food.");
        return;
      }

      if (!ensureReady()) {
        setSubmitError("Wallet, network, or contract is not ready. Fix it and retry submit.");
        return;
      }

      submittingRef.current = true;
      setPending("submitScore(score)");
      setStatus("Waiting for wallet confirmation: submitScore(score)");

      try {
        debugContractCall("submitScore", [BigInt(finalScore)]);
        const hash = await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: snakeScoresAbi,
          functionName: "submitScore",
          args: [BigInt(finalScore)],
          chainId: ritualChain.id,
        });

        setStatus("Confirming submitScore(score) on Ritual Testnet...");
        const receipt = await publicClient!.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("submitScore(score) failed on-chain.");

        await refreshContractData();
        setLastSubmitTx(hash);
        incrementStoredCount(transactionsKey, setTotalOnchainTransactions);
        setStatus(`submitScore tx: ${hash}`);
        setScoreSubmitted(true);
        playSound("submitSuccess");
      } catch (error) {
        setSubmitError(errorMessage(error));
        setStatus(`Score not submitted: ${errorMessage(error)}`);
      } finally {
        setPending(null);
        submittingRef.current = false;
      }
    },
    [address, contractReady, incrementStoredCount, isWrongChain, pending, publicClient, refreshContractData, writeContractAsync],
  );

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const map: Record<string, number[]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      const next = map[e.key];
      if (!next) return;
      e.preventDefault();
      const cur = dirRef.current;
      if (next[0] + cur[0] === 0 && next[1] + cur[1] === 0) return;
      dirRef.current = next;
    };

    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!playing && countdown === null) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [countdown, playing]);

  useEffect(() => {
    if (!playing || countdown !== null) return;

    const timer = window.setInterval(() => {
      setSnake((old) => {
        const head = old[0];
        const nextHead = [head[0] + dirRef.current[0], head[1] + dirRef.current[1]];
        const ateFood = nextHead[0] === foodRef.current[0] && nextHead[1] === foodRef.current[1];
        const hitWall = nextHead[0] < 0 || nextHead[1] < 0 || nextHead[0] >= size || nextHead[1] >= size;
        const bodyToCheck = ateFood ? old : old.slice(0, -1);
        const hitSelf = bodyToCheck.some(([x, y]) => x === nextHead[0] && y === nextHead[1]);
        const hasCollision = hitWall || hitSelf;

        if (hasCollision) {
          const finalScore = scoreRef.current;
          setPlaying(false);
          setLastScore(finalScore);
          setSubmitError("");
          setScoreSubmitted(false);
          setLastSubmitTx(null);
          setGameOver(true);
          playSound("gameOver");
          return old;
        }

        const fresh = [nextHead, ...old];

        if (ateFood) {
          const nextCombo = comboRef.current + 1;
          const bonus = nextCombo % 3 === 0 ? 20 : 0;
          const nextScore = scoreRef.current + 20 + bonus;
          const nextFood = randomFood(fresh);
          comboRef.current = nextCombo;
          scoreRef.current = nextScore;
          foodRef.current = nextFood;
          setCombo(nextCombo);
          setScore(nextScore);
          setFood(nextFood);
          playSound("eat");
          return fresh;
        }

        return fresh.slice(0, -1);
      });
    }, Math.max(70, 145 - Math.floor(scoreRef.current / 100) * 10));

    return () => window.clearInterval(timer);
  }, [countdown, playing, submitScore]);

  const arrow = (next: number[]) => {
    const cur = dirRef.current;
    if (next[0] + cur[0] === 0 && next[1] + cur[1] === 0) return;
    dirRef.current = next;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#121212] p-4 text-white">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#070707] shadow-2xl"
      >
        <header className="relative flex flex-col gap-4 border-b border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 font-bold">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-black p-1.5 shadow-[0_0_24px_rgba(16,185,129,.45)] sm:h-12 sm:w-12">
              <img src="/ritual-logo.png" alt="Ritual logo" className="h-full w-full object-contain" />
            </span>
            <span>Ritual Snake</span>
            <a
              href="https://faucet.ritualfoundation.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-400 transition hover:border-emerald-400 hover:bg-emerald-500/10"
            >
              Ritual Faucet
            </a>
            <a
              href="https://discord.com/invite/ritual-net"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-emerald-500/30 px-2.5 py-1 text-xs font-bold text-emerald-400 transition hover:border-emerald-400 hover:bg-emerald-500/10"
            >
              Ritual Discord
            </a>
          </div>

          <div className="sm:absolute sm:left-1/2 sm:flex sm:-translate-x-1/2 sm:items-center sm:gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1 text-sm font-bold text-emerald-400">
            <span className="mr-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
            Testnet is live
          </div>

          <div className="relative flex items-center gap-3">
            {isConnected && <span className="hidden text-xs text-emerald-400 sm:block">{formatBalance(nativeBalance?.value)} RITUAL</span>}
            <Button
              onClick={() => (isConnected ? setWalletMenuOpen((open) => !open) : connectWallet())}
              disabled={isConnecting}
              className="rounded-xl bg-white px-4 py-2 text-black hover:bg-zinc-200 disabled:opacity-60"
            >
              {isConnected ? shortenHex(address) : isConnecting ? "Connecting..." : "Connect Wallet"}
            </Button>

            {walletMenuOpen && isConnected && (
              <div className="absolute right-0 top-full z-20 mt-3 w-72 rounded-xl border border-white/10 bg-[#101010] p-3 shadow-2xl">
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Connected wallet</p>
                <p className="mt-2 font-mono text-sm text-zinc-200">{shortenHex(address, 8, 6)}</p>
                <p className="mt-1 font-mono text-xs text-emerald-300">{formatBalance(nativeBalance?.value)} RITUAL</p>
                <p className={isWrongChain ? "mt-1 text-xs text-amber-300" : "mt-1 text-xs text-zinc-500"}>
                  {chain?.name ?? "Unknown network"}
                </p>
                {isWrongChain && (
                  <Button
                    onClick={() => switchChain({ chainId: ritualChain.id })}
                    disabled={isSwitching}
                    className="mt-3 w-full rounded-lg border border-amber-300/50 px-3 py-2 text-sm text-amber-200 hover:bg-amber-300 hover:text-black"
                  >
                    {isSwitching ? "Switching..." : "Switch Network"}
                  </Button>
                )}
                <Button
                  onClick={() => {
                    disconnect();
                    setWalletMenuOpen(false);
                    setStatus("Wallet disconnected. Connect wallet to play.");
                  }}
                  className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300 hover:border-red-400 hover:text-red-300"
                >
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </header>

        <main className="p-6">
          <section className="flex justify-center">
            <div className="w-full max-w-[440px] rounded-2xl border border-white/10 bg-[#111111] text-white">
              <div className="p-6">
                <div className="mx-auto rounded-2xl border border-white/20 bg-[#0a0f12] p-4" style={{ width: size * (cell + 2) + 32 }}>
                  <div className="relative grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${size}, ${cell}px)` }}>
                    {countdown !== null && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-5xl font-black">
                        {countdown === 1 ? "GO" : countdown}
                      </div>
                    )}

                    {grid.map((_, i) => (
                      <div key={i} className="rounded-[4px] bg-[#07171a]" style={{ width: cell, height: cell }} />
                    ))}

                    {snake.map(([x, y], i) => (
                      <div
                        key={`${x}-${y}-${i}`}
                        className="absolute rounded-[3px] bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,.8)]"
                        style={{ left: x * (cell + 2), top: y * (cell + 2), width: cell, height: cell }}
                      />
                    ))}

                    <div
                      className="absolute rounded-full bg-red-500 shadow-[0_0_14px_rgba(239,68,68,.8)]"
                      style={{ left: food[0] * (cell + 2), top: food[1] * (cell + 2), width: cell, height: cell }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xs text-zinc-500">Total Points</p>
                    <b className="text-xl text-white">{displayUint(totalPoints)}</b>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Best</p>
                    <b className="text-xl text-amber-300">{displayUint(best)}</b>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Rank</p>
                    <b className="text-base text-emerald-400">{player.rank}</b>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Games</p>
                    <b className="text-xl text-sky-400">{displayUint(totalGames)}</b>
                  </div>
                </div>

                <Button
                  onClick={startRun}
                  disabled={!contractReady || playing || countdown !== null || pending !== null || isWalletPending || isConnecting}
                  className="mt-3 w-full rounded-xl border border-white/20 bg-transparent px-4 py-2 hover:bg-white hover:text-black disabled:opacity-50"
                >
                  {pending === "startRun()" ? "Confirming..." : playing ? "Playing..." : countdown !== null ? "Starting..." : "Start Game TX"}
                </Button>

                <p className="mt-3 min-h-10 text-center text-sm leading-5 text-zinc-500">{status}</p>
                {!contractReady && (
                  <p className="mt-1 text-center font-mono text-xs text-amber-300">
                    Score contract not deployed yet.
                  </p>
                )}
                <div className="mt-3 space-y-1 text-xs text-zinc-500">
                  <p className="flex justify-between gap-3">
                    <span>Total sessions</span>
                    <b className="text-emerald-400">{totalSessions}</b>
                  </p>
                  <p className="flex justify-between gap-3">
                    <span>Total onchain transactions</span>
                    <b className="text-emerald-400">{totalOnchainTransactions}</b>
                  </p>
                  <p className="break-all font-mono">
                    <span className="text-zinc-600">Last start tx: </span>
                    {lastStartTx ?? "--"}
                  </p>
                  <p className="break-all font-mono">
                    <span className="text-zinc-600">Last score submit tx: </span>
                    {lastSubmitTx ?? "--"}
                  </p>
                </div>
                {pending === "submitScore(score)" && <p className="mt-1 text-center text-xs font-bold text-emerald-300">Submitting final score...</p>}
                {submitError && (
                  <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-center text-sm text-red-200">
                    <p>{submitError}</p>
                    {lastScore > 0 && (
                      <Button
                        onClick={() => void submitScore(lastScore)}
                        disabled={pending !== null}
                        className="mt-2 rounded-lg border border-red-300/40 px-3 py-1 text-xs hover:bg-red-300 hover:text-black disabled:opacity-50"
                      >
                        Retry Submit TX
                      </Button>
                    )}
                  </div>
                )}

                <div className="mx-auto mt-4 grid max-w-36 grid-cols-3 gap-2">
                  <span />
                  <Button className="rounded-lg border border-white/20 bg-transparent px-3 py-2 hover:bg-white hover:text-black" onClick={() => arrow([0, -1])}>
                    ▲
                  </Button>
                  <span />
                  <Button className="rounded-lg border border-white/20 bg-transparent px-3 py-2 hover:bg-white hover:text-black" onClick={() => arrow([-1, 0])}>
                    ◀
                  </Button>
                  <span />
                  <Button className="rounded-lg border border-white/20 bg-transparent px-3 py-2 hover:bg-white hover:text-black" onClick={() => arrow([1, 0])}>
                    ▶
                  </Button>
                  <span />
                  <Button className="rounded-lg border border-white/20 bg-transparent px-3 py-2 hover:bg-white hover:text-black" onClick={() => arrow([0, 1])}>
                    ▼
                  </Button>
                  <span />
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-xs font-black text-zinc-500">LEADERBOARD</h2>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <div className="grid grid-cols-[40px_1fr_90px_120px] gap-2 border-b border-white/10 px-4 py-2 text-xs font-bold text-zinc-500">
                <span>#</span>
                <span>Player</span>
                <span className="text-right">Points</span>
                <span className="text-center">Rank</span>
              </div>

              {leaderboardRows.length === 0 ? (
                <div className="px-4 py-5 text-center text-sm text-zinc-500">No scores yet. Be the first player.</div>
              ) : (
                leaderboardRows.map((row, i) => (
                  <div
                    key={`${row.player}-${i}`}
                    className={`grid grid-cols-[40px_1fr_90px_120px] gap-2 border-b border-white/10 px-4 py-3 text-sm last:border-b-0 ${
                      row.isCurrentUser ? "bg-emerald-500/[0.06]" : ""
                    }`}
                  >
                    <span className="text-amber-400">{i + 1}</span>
                    <span className="flex items-center gap-2 font-mono text-zinc-500">
                      {shortenHex(row.player)}
                      {row.isCurrentUser && (
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-sans text-[10px] font-bold text-emerald-400">
                          You
                        </span>
                      )}
                    </span>
                    <b className="text-right">{displayUint(row.score)}</b>
                    <span className="rounded-full bg-emerald-500/10 px-2 text-center text-xs text-emerald-400">{row.rank}</span>
                  </div>
                ))
              )}
            </div>
          </section>

        </main>

        <footer className="flex items-center justify-between border-t border-white/10 px-6 py-4 text-xs text-zinc-600">
          <span>Made by @0xblp</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Chain ID 1979
          </span>
        </footer>
      </motion.div>

      {gameOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-[#101010] p-6 text-center shadow-2xl"
          >
            <button onClick={() => setGameOver(false)} className="absolute right-4 top-4 text-xl text-zinc-500 hover:text-white">
              ×
            </button>
            <h2 className="text-2xl font-black">Game Over</h2>
            <p className="mt-3 text-sm text-zinc-500">Final score</p>
            <p className="text-5xl font-black">{lastScore}</p>
            <p className="mt-3 text-sm text-zinc-500">Rank</p>
            <p className="text-xl font-bold text-emerald-400">{getRank(lastScore)}</p>
            {!scoreSubmitted ? (
              <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
                <p className="text-sm text-zinc-400">Submit your score to Ritual Testnet.</p>
                {submitError && <p className="mt-3 text-sm text-red-300">{submitError}</p>}
                <Button
                  onClick={() => void submitScore(lastScore)}
                  disabled={pending !== null}
                  className="mt-4 w-full rounded-xl bg-white px-4 py-2 text-black hover:bg-zinc-200 disabled:opacity-50"
                >
                  {pending === "submitScore(score)" ? "Confirming..." : "Submit Score TX"}
                </Button>
              </div>
            ) : (
              <div className="mt-6">
                {lastSubmitTx && <p className="mb-3 break-all font-mono text-xs text-emerald-300">Tx: {lastSubmitTx}</p>}
                <div className="grid grid-cols-2 gap-3">
                  <Button onClick={startRun} className="rounded-xl bg-white px-4 py-2 text-black hover:bg-zinc-200">
                    Start Game TX
                  </Button>
                  <Button
                    onClick={() =>
                      window.open(
                        `https://twitter.com/intent/tweet?text=${encodeURIComponent(`I scored ${lastScore} on Ritual Snake`)}`,
                        "_blank",
                      )
                    }
                    className="rounded-xl border border-white/20 bg-transparent px-4 py-2 hover:bg-white hover:text-black"
                  >
                    Share on X
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
}
