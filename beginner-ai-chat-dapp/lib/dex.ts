import type { Address } from "viem";

export type TokenSymbol = "RITUAL" | "rBTC" | "rETH" | "rUSDC" | "rUSDT";

export type DexToken = {
  symbol: TokenSymbol;
  name: string;
  decimals: number;
  address?: Address;
  color: string;
};

function envAddress(value?: string): Address | undefined {
  return value && value.startsWith("0x") && value.length === 42 ? (value as Address) : undefined;
}

export const DEX_ADDRESSES = {
  router: envAddress(process.env.NEXT_PUBLIC_DEX_ROUTER),
  factory: envAddress(process.env.NEXT_PUBLIC_DEX_FACTORY),
  wrappedRitual: envAddress(process.env.NEXT_PUBLIC_WRITUAL),
  rBTC: envAddress(process.env.NEXT_PUBLIC_RBTC),
  rETH: envAddress(process.env.NEXT_PUBLIC_RETH),
  rUSDC: envAddress(process.env.NEXT_PUBLIC_RUSDC),
  rUSDT: envAddress(process.env.NEXT_PUBLIC_RUSDT),
};

export const TOKENS: Record<TokenSymbol, DexToken> = {
  RITUAL: {
    symbol: "RITUAL",
    name: "Ritual",
    decimals: 18,
    address: DEX_ADDRESSES.wrappedRitual,
    color: "from-emerald-300 to-lime-200",
  },
  rBTC: {
    symbol: "rBTC",
    name: "Ritual BTC",
    decimals: 18,
    address: DEX_ADDRESSES.rBTC,
    color: "from-amber-300 to-orange-300",
  },
  rETH: {
    symbol: "rETH",
    name: "Ritual ETH",
    decimals: 18,
    address: DEX_ADDRESSES.rETH,
    color: "from-cyan-300 to-indigo-300",
  },
  rUSDC: {
    symbol: "rUSDC",
    name: "Ritual USDC",
    decimals: 6,
    address: DEX_ADDRESSES.rUSDC,
    color: "from-sky-300 to-blue-300",
  },
  rUSDT: {
    symbol: "rUSDT",
    name: "Ritual USDT",
    decimals: 6,
    address: DEX_ADDRESSES.rUSDT,
    color: "from-teal-300 to-emerald-300",
  },
};

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export const routerAbi = [
  {
    type: "function",
    name: "getAmountsOut",
    stateMutability: "view",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "path", type: "address[]" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactRitualForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "swapExactTokensForRitual",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "path", type: "address[]" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "amounts", type: "uint256[]" }],
  },
] as const;
