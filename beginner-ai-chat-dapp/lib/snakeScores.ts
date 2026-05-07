import { isAddress, type Address } from "viem";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const configuredContractAddress = process.env.NEXT_PUBLIC_RITUAL_SNAKE_SCORES;

export const CONTRACT_ADDRESS = (
  configuredContractAddress && isAddress(configuredContractAddress) ? configuredContractAddress : ZERO_ADDRESS
) as Address;

export type LeaderboardRow = {
  player: string;
  score: bigint;
  rank: string;
};

export const snakeScoresAbi = [
  { type: "function", name: "startRun", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "submitScore",
    stateMutability: "nonpayable",
    inputs: [{ name: "score", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getRank",
    stateMutability: "pure",
    inputs: [{ name: "score", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "getPlayer",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "playerTotalPoints", type: "uint256" },
      { name: "playerBestScore", type: "uint256" },
      { name: "playerTotalGames", type: "uint256" },
      { name: "rank", type: "string" },
    ],
  },
  {
    type: "function",
    name: "getPlayers",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function",
    name: "getLeaderboard",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "player", type: "address" },
          { name: "score", type: "uint256" },
          { name: "rank", type: "string" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "RunStarted",
    inputs: [
      { name: "player", type: "address", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ScoreSubmitted",
    inputs: [
      { name: "player", type: "address", indexed: false },
      { name: "score", type: "uint256", indexed: false },
      { name: "totalPoints", type: "uint256", indexed: false },
      { name: "bestScore", type: "uint256", indexed: false },
      { name: "rank", type: "string", indexed: false },
    ],
  },
] as const;
