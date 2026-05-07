import type { Address } from "viem";

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_RITUAL_QUEST_HUB ||
  "0x0000000000000000000000000000000000000000") as Address;

export const taskIds = {
  checkIn: 0,
  ping: 1,
  boost: 2,
  signal: 3,
  claimXp: 4,
  protect: 5,
} as const;

export const questHubAbi = [
  { type: "function", name: "checkIn", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "dailyPing", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "dailyBoost", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "ritualSignal", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "claimDailyXP", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "streakProtect", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "getPlayer",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalXP", type: "uint256" },
          { name: "streak", type: "uint256" },
          { name: "level", type: "uint256" },
          { name: "lastActionDay", type: "uint256" },
          { name: "lastCheckInDay", type: "uint256" },
          { name: "protectionCharges", type: "uint256" },
          { name: "badges", type: "uint256" },
          { name: "completedToday", type: "uint8" },
          { name: "actionCount", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getRecentActions",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      {
        name: "actions",
        type: "tuple[]",
        components: [
          { name: "day", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "taskId", type: "uint8" },
          { name: "xp", type: "uint16" },
          { name: "totalXP", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getCompletedTasks",
    stateMutability: "view",
    inputs: [
      { name: "user", type: "address" },
      { name: "dayNumber", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "event",
    name: "QuestCompleted",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "taskId", type: "uint8", indexed: true },
      { name: "xp", type: "uint16", indexed: false },
      { name: "totalXP", type: "uint256", indexed: false },
      { name: "streak", type: "uint256", indexed: false },
      { name: "level", type: "uint256", indexed: false },
      { name: "day", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "BadgeUnlocked",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "badgeId", type: "uint8", indexed: true },
      { name: "badges", type: "uint256", indexed: false },
    ],
  },
] as const;

export type PlayerData = {
  totalXP: bigint;
  streak: bigint;
  level: bigint;
  lastActionDay: bigint;
  lastCheckInDay: bigint;
  protectionCharges: bigint;
  badges: bigint;
  completedToday: number;
  actionCount: bigint;
};

export type ActivityData = {
  day: bigint;
  timestamp: bigint;
  taskId: number;
  xp: number;
  totalXP: bigint;
};
