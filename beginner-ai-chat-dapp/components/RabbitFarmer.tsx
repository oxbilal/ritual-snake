"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
type PlotStatus = "empty" | "planted" | "growing" | "ready" | "harvested";

interface Plot {
  id: number;
  status: PlotStatus;
  plantedAt: number | null;
  txHash: string | null;
}

interface LeaderboardEntry {
  wallet: string;
  fruits: number;
}

interface GameState {
  plots: Plot[];
  seeds: number;
  fruits: number;
  totalHarvests: number;
  seedRefillAt: number | null; // timestamp when seeds refill
  lastTx: string;
  leaderboard: LeaderboardEntry[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GROW_TIME = 40_000; // 40 seconds
const SEED_REFILL_TIME = 3_600_000; // 1 hour
const INITIAL_SEEDS = 24;
const HARVEST_FRUITS = 10;
const RITUAL_CHAIN_ID = "0x7bb"; // Ritual testnet chain id (decimal 1979)
const RITUAL_RPC = "https://rpc.ritualfoundation.org";

// ─── Ritual Testnet Config ────────────────────────────────────────────────────
const RITUAL_NETWORK = {
  chainId: RITUAL_CHAIN_ID,
  chainName: "Ritual Testnet",
  nativeCurrency: { name: "test RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: [RITUAL_RPC],
  blockExplorerUrls: ["https://explorer.ritual.net"],
};

// ─── localStorage helpers ─────────────────────────────────────────────────────
const STORAGE_KEY = "ritualRabbitFarmer_v2";

function loadState(): GameState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeState(JSON.parse(raw) as Partial<GameState>);
  } catch {}
  return defaultState();
}

function saveState(state: GameState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function defaultState(): GameState {
  return {
    plots: Array.from({ length: 12 }, (_, i) => ({
      id: i,
      status: "empty",
      plantedAt: null,
      txHash: null,
    })),
    seeds: INITIAL_SEEDS,
    fruits: 0,
    totalHarvests: 0,
    seedRefillAt: null,
    lastTx: "",
    leaderboard: [],
  };
}

function normalizeState(saved: Partial<GameState>): GameState {
  const fallback = defaultState();
  return {
    plots: Array.isArray(saved.plots) && saved.plots.length === 12 ? saved.plots : fallback.plots,
    seeds: typeof saved.seeds === "number" ? saved.seeds : fallback.seeds,
    fruits: typeof saved.fruits === "number" ? saved.fruits : fallback.fruits,
    totalHarvests: typeof saved.totalHarvests === "number" ? saved.totalHarvests : fallback.totalHarvests,
    seedRefillAt: typeof saved.seedRefillAt === "number" ? saved.seedRefillAt : null,
    lastTx: typeof saved.lastTx === "string" ? saved.lastTx : "",
    leaderboard: Array.isArray(saved.leaderboard) ? saved.leaderboard : [],
  };
}

function updateLeaderboard(leaderboard: LeaderboardEntry[], wallet: string, fruits: number) {
  const normalizedWallet = wallet.toLowerCase();
  const withoutCurrent = leaderboard.filter((entry) => entry.wallet.toLowerCase() !== normalizedWallet);
  return [...withoutCurrent, { wallet, fruits }]
    .sort((a, b) => b.fruits - a.fruits)
    .slice(0, 10);
}

// ─── Helper: short address ─────────────────────────────────────────────────────
function shortAddr(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

// ─── Helper: format countdown ─────────────────────────────────────────────────
function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

// ─── Growth stage visuals ─────────────────────────────────────────────────────
function GrowthSprite({ status, elapsed }: { status: PlotStatus; elapsed: number }) {
  if (status === "empty") return <span className="plot-sprite empty-sprite">🟫</span>;
  if (status === "ready") return <span className="plot-sprite ready-sprite">🥕</span>;
  if (status === "harvested") return <span className="plot-sprite harvested-sprite">✨</span>;

  const pct = Math.min(elapsed / GROW_TIME, 1);
  if (pct < 0.3) return <span className="plot-sprite seed-sprite">🌱</span>;
  if (pct < 0.7) return <span className="plot-sprite sprout-sprite">🌿</span>;
  return <span className="plot-sprite carrot-sprite">🥦</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RabbitFarmer() {
  const [game, setGame] = useState<GameState>(defaultState);
  const [hasLoadedGame, setHasLoadedGame] = useState<boolean>(false);
  const [account, setAccount] = useState<string>("");
  const [balance, setBalance] = useState<string>("0");
  const [now, setNow] = useState<number>(Date.now());
  const [activeTab, setActiveTab] = useState<string>("Farm");
  const [toast, setToast] = useState<string>("");
  const [pendingPlot, setPendingPlot] = useState<number | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load from localStorage on mount ────────────────────────────────────────
  useEffect(() => {
    setGame(loadState());
    setHasLoadedGame(true);
  }, []);

  // ── Tick every second ──────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Save whenever game changes ─────────────────────────────────────────────
  useEffect(() => {
    if (!hasLoadedGame) return;
    saveState(game);
  }, [game, hasLoadedGame]);

  // ── Seed refill logic ──────────────────────────────────────────────────────
  useEffect(() => {
    if (game.seedRefillAt && now >= game.seedRefillAt) {
      setGame((g) => ({ ...g, seeds: INITIAL_SEEDS, seedRefillAt: null }));
    }
  }, [now, game.seedRefillAt]);

  // ── Auto-update plot statuses ──────────────────────────────────────────────
  useEffect(() => {
    setGame((g) => {
      let changed = false;
      const plots = g.plots.map((p) => {
        if ((p.status === "planted" || p.status === "growing") && p.plantedAt) {
          const elapsed = now - p.plantedAt;
          if (elapsed >= GROW_TIME) {
            changed = true;
            return { ...p, status: "ready" as PlotStatus };
          }
          if (elapsed < GROW_TIME && p.status === "planted") {
            changed = true;
            return { ...p, status: "growing" as PlotStatus };
          }
        }
        return p;
      });
      return changed ? { ...g, plots } : g;
    });
  }, [now]);

  // ── Toast helper ───────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 3000);
  }, []);

  // ── Connect wallet ─────────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) { showToast("🦊 MetaMask not found! Please install it."); return; }
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      // Switch or add Ritual testnet
      try {
        await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: RITUAL_CHAIN_ID }] });
      } catch (e: any) {
        if (e.code === 4902) {
          await eth.request({ method: "wallet_addEthereumChain", params: [RITUAL_NETWORK] });
        }
      }
      // Fetch balance
      const bal = await eth.request({ method: "eth_getBalance", params: [accounts[0], "latest"] });
      const balNum = parseInt(bal, 16) / 1e18;
      setBalance(balNum.toFixed(4));
    } catch (e: any) {
      showToast("❌ " + (e.message || "Connection failed"));
    }
  }, [showToast]);

  // ── Send 0-value self-transaction ─────────────────────────────────────────
  const sendSelfTx = useCallback(async (): Promise<string> => {
    const eth = (window as any).ethereum;
    if (!eth || !account) throw new Error("Wallet not connected");
    const txHash = await eth.request({
      method: "eth_sendTransaction",
      params: [{ from: account, to: account, value: "0x0", gas: "0x5208" }],
    });
    return txHash as string;
  }, [account]);

  // ── Plant ──────────────────────────────────────────────────────────────────
  const handlePlant = useCallback(async (plotId: number) => {
    if (!account) { showToast("🐰 Connect your wallet first!"); return; }
    if (game.seeds <= 0) { showToast("🌱 No seeds left! Wait for refill."); return; }
    setPendingPlot(plotId);
    try {
      const txHash = await sendSelfTx();
      setGame((g) => ({
        ...g,
        lastTx: txHash,
        seeds: g.seeds - 1,
        seedRefillAt: g.seeds - 1 <= 0 && !g.seedRefillAt ? Date.now() + SEED_REFILL_TIME : g.seedRefillAt,
        plots: g.plots.map((p) =>
          p.id === plotId ? { ...p, status: "planted", plantedAt: Date.now(), txHash } : p
        ),
      }));
      showToast("🌱 Carrot planted! Growing in 40s…");
    } catch (e: any) {
      showToast("❌ " + (e.message || "Transaction failed"));
    } finally {
      setPendingPlot(null);
    }
  }, [account, game.seeds, sendSelfTx, showToast]);

  // ── Harvest ────────────────────────────────────────────────────────────────
  const handleHarvest = useCallback(async (plotId: number) => {
    if (!account) { showToast("🐰 Connect your wallet first!"); return; }
    setPendingPlot(plotId);
    try {
      const txHash = await sendSelfTx();
      setGame((g) => ({
        ...g,
        lastTx: txHash,
        fruits: g.fruits + HARVEST_FRUITS,
        totalHarvests: g.totalHarvests + 1,
        leaderboard: updateLeaderboard(g.leaderboard, account, g.fruits + HARVEST_FRUITS),
        plots: g.plots.map((p) =>
          p.id === plotId ? { ...p, status: "harvested", txHash } : p
        ),
      }));
      showToast(`🥕 Harvested +${HARVEST_FRUITS} fruits!`);
      // Reset harvested plot to empty after 2s
      setTimeout(() => {
        setGame((g) => ({
          ...g,
          plots: g.plots.map((p) =>
            p.id === plotId ? { ...p, status: "empty", plantedAt: null, txHash: null } : p
          ),
        }));
      }, 2000);
    } catch (e: any) {
      showToast("❌ " + (e.message || "Transaction failed"));
    } finally {
      setPendingPlot(null);
    }
  }, [account, sendSelfTx, showToast]);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const growing = game.plots.filter((p) => p.status === "planted" || p.status === "growing").length;
  const ready = game.plots.filter((p) => p.status === "ready").length;
  const seedRefillMs = game.seedRefillAt ? Math.max(0, game.seedRefillAt - now) : 0;
  const sortedLeaderboard = [...game.leaderboard].sort((a, b) => b.fruits - a.fruits);

  const resetGame = useCallback(() => {
    const freshState = {
      ...defaultState(),
      leaderboard: game.leaderboard,
    };
    setGame(freshState);
    showToast("Game reset.");
  }, [game.leaderboard, showToast]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="game-root">
      {/* ── Toast ── */}
      {toast && <div className="toast">{toast}</div>}

      {/* ── Sky/Background ── */}
      <div className="sky-bg" />

      {/* ── Top Title Board ── */}
      <header className="title-board">
        <div className="title-board-inner">
          <div className="title-left">
            <div className="pixel-rabbit">🐰</div>
          </div>
          <div className="title-center">
            <h1 className="game-title">Ritual Rabbit Farmer</h1>
            <p className="game-subtitle">🌱 Grow. Harvest. Earn on Ritual Testnet.</p>
          </div>
          <div className="title-right">
            {account ? (
              <div className="top-cards">
                <div className="top-card">
                  <span className="top-card-label">💰 Balance</span>
                  <span className="top-card-value">{balance} test RITUAL</span>
                </div>
                <div className="top-card">
                  <span className="top-card-label">👛 Wallet</span>
                  <span className="top-card-value">{shortAddr(account)}</span>
                </div>
              </div>
            ) : (
              <button className="btn-connect" onClick={connectWallet}>
                🦊 Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main Game Area ── */}
      <main className="game-main">
        {/* ── Left Panel ── */}
        <aside className="left-panel panel">
          <div className="panel-title">🐰 Farm Stats</div>

          <div className="stat-row">
            <span className="stat-icon">🌱</span>
            <span className="stat-label">Seeds</span>
            <span className="stat-value">{game.seeds}</span>
          </div>
          {game.seeds === 0 && game.seedRefillAt && (
            <div className="seed-countdown">
              ⏳ Refill in: <strong>{formatCountdown(seedRefillMs)}</strong>
            </div>
          )}

          <div className="stat-row">
            <span className="stat-icon">🥕</span>
            <span className="stat-label">Fruits</span>
            <span className="stat-value">{game.fruits}</span>
          </div>

          <div className="stat-row">
            <span className="stat-icon">🌿</span>
            <span className="stat-label">Growing</span>
            <span className="stat-value">{growing}</span>
          </div>

          <div className="stat-row">
            <span className="stat-icon">✅</span>
            <span className="stat-label">Harvests</span>
            <span className="stat-value">{game.totalHarvests}</span>
          </div>

          <div className="divider" />

          <div className="panel-title">🏆 Leaderboard</div>
          {!account ? (
            <div className="leaderboard-empty">Connect wallet to join leaderboard</div>
          ) : (
            <div className="leaderboard-table">
              <div className="leaderboard-head">
                <span>Rank</span>
                <span>Wallet</span>
                <span>Fruits</span>
              </div>
              {sortedLeaderboard.length === 0 ? (
                <div className="leaderboard-empty">Harvest carrots to rank.</div>
              ) : (
                sortedLeaderboard.map((entry, index) => (
                  <div
                    key={entry.wallet}
                    className={`leaderboard-row ${
                      entry.wallet.toLowerCase() === account.toLowerCase() ? "leaderboard-current" : ""
                    }`}
                  >
                    <span>#{index + 1}</span>
                    <span>{shortAddr(entry.wallet)}</span>
                    <span>{entry.fruits}</span>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="divider" />

          {/* Rabbit mascot */}
          <div className="mascot-area">
            <div className="mascot-bubble">
              {game.seeds === 0
                ? "🌱 Seeds depleted!\nRefilling soon…"
                : ready > 0
                ? `🥕 ${ready} plot${ready > 1 ? "s" : ""} ready\nto harvest!`
                : growing > 0
                ? `🌿 ${growing} carrot${growing > 1 ? "s" : ""} growing!\nPatience…`
                : "Plant some\ncarrots! 🐾"}
            </div>
            <div className="mascot">
              🐰
              <div className="mascot-shadow" />
            </div>
          </div>

          <div className="creator-tag">Built by @0xblp</div>
          <button className="btn-reset-game" onClick={resetGame} type="button">
            Reset Game
          </button>
        </aside>

        {/* ── Center Farm ── */}
        <section className="farm-center">
          <div className="farm-scene">
            {/* Decorations */}
            <div className="deco deco-tl">🌲</div>
            <div className="deco deco-tr">🌲</div>
            <div className="fence fence-top" />

            <div className="farm-label">🌾 Carrot Farm</div>

            <div className="plots-grid">
              {game.plots.map((plot) => {
                const elapsed = plot.plantedAt ? now - plot.plantedAt : 0;
                const pct = Math.min(elapsed / GROW_TIME, 1);
                const remaining = plot.plantedAt ? Math.max(0, GROW_TIME - elapsed) : 0;
                const isPending = pendingPlot === plot.id;

                return (
                  <div
                    key={plot.id}
                    className={`plot plot-${plot.status} ${isPending ? "plot-pending" : ""}`}
                  >
                    <div className="plot-inner">
                      <GrowthSprite status={plot.status} elapsed={elapsed} />

                      {(plot.status === "planted" || plot.status === "growing") && (
                        <>
                          <div className="grow-bar-wrap">
                            <div className="grow-bar" style={{ width: `${pct * 100}%` }} />
                          </div>
                          <div className="plot-timer">{Math.ceil(remaining / 1000)}s</div>
                        </>
                      )}

                      {plot.status === "ready" && (
                        <div className="plot-ready-label">Ready!</div>
                      )}

                      {plot.status === "empty" && (
                        <button
                          className="plot-btn btn-plant"
                          disabled={!account || game.seeds <= 0 || isPending}
                          onClick={() => handlePlant(plot.id)}
                        >
                          {isPending ? "⏳" : "🌱 Plant"}
                        </button>
                      )}

                      {plot.status === "ready" && (
                        <button
                          className="plot-btn btn-harvest"
                          disabled={!account || isPending}
                          onClick={() => handleHarvest(plot.id)}
                        >
                          {isPending ? "⏳" : "🥕 Harvest"}
                        </button>
                      )}

                      {plot.status === "harvested" && (
                        <div className="plot-harvested-label">✨ +{HARVEST_FRUITS}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="fence fence-bottom" />
            <div className="deco deco-bl">🌸</div>
            <div className="deco deco-br">🌸</div>
          </div>
        </section>

        {/* ── Right Panel ── */}
        <aside className="right-panel panel">
          <div className="panel-title">🏪 Ritual Wallet</div>

          <div className="wallet-section">
            <div className="wallet-row">
              <span className="wallet-label">🌐 Network</span>
              <span className="wallet-val network-badge">Ritual Testnet</span>
            </div>

            {account ? (
              <>
                <div className="wallet-row">
                  <span className="wallet-label">👛 Wallet</span>
                  <span className="wallet-val addr">{shortAddr(account)}</span>
                </div>
                <div className="wallet-row">
                  <span className="wallet-label">💰 Balance</span>
                  <span className="wallet-val balance">{balance} <em>test RITUAL</em></span>
                </div>
                {game.lastTx && (
                  <div className="wallet-row tx-row">
                    <span className="wallet-label">📜 Last TX</span>
                    <span className="wallet-val tx-hash">{shortAddr(game.lastTx)}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="wallet-connect-prompt">
                <p>Connect your wallet to start farming!</p>
                <button className="btn-connect-big" onClick={connectWallet}>
                  🦊 Connect MetaMask
                </button>
              </div>
            )}
          </div>

          <div className="divider" />

          <div className="panel-title">🏬 Market</div>
          <div className="market-area">
            <div className="market-item">
              <span>🥕 Carrot</span>
              <span className="market-price">FREE</span>
            </div>
            <div className="market-item">
              <span>🌱 Seeds</span>
              <span className="market-price">24 / hr</span>
            </div>
            <div className="market-item market-coming-soon">
              <span>⚗️ Potions</span>
              <span className="market-price">Soon™</span>
            </div>
          </div>

          <div className="divider" />

          <div className="panel-title">📋 How to Play</div>
          <ol className="how-to-list">
            <li>Connect MetaMask wallet</li>
            <li>Switch to Ritual Testnet</li>
            <li>Click <strong>Plant</strong> on a plot</li>
            <li>Confirm 0 RITUAL tx in MetaMask</li>
            <li>Wait 40s for carrot to grow</li>
            <li>Click <strong>Harvest</strong> + confirm</li>
            <li>Earn 🥕 fruits!</li>
          </ol>
        </aside>
      </main>

      {/* ── Bottom Nav ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          <div className="chain-badge">⛓ Ritual Chain Testnet</div>
          {["Farm", "Inventory", "Achievements", "Leaderboard"].map((tab) => (
            <button
              key={tab}
              className={`nav-tab ${activeTab === tab ? "nav-tab-active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "Farm" && "🌾 "}
              {tab === "Inventory" && "🎒 "}
              {tab === "Achievements" && "🏆 "}
              {tab === "Leaderboard" && "📊 "}
              {tab}
            </button>
          ))}
          <button className="nav-tab nav-icon" title="Settings">⚙️</button>
          <button className="nav-tab nav-icon" title="Help">❓</button>
        </div>
      </nav>
    </div>
  );
}
