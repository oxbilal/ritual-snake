import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  formatEther,
  http,
  parseEther,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = process.cwd();
const compileOnly = process.argv.includes("--compile-only");
const envPath = path.join(root, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1);
    process.env[key] ||= value;
  }
}

const rawPrivateKey = process.env.PRIVATE_KEY?.trim();
const privateKey = rawPrivateKey
  ? rawPrivateKey.startsWith("0x")
    ? rawPrivateKey
    : `0x${rawPrivateKey}`
  : undefined;
const rpcUrl = process.env.NEXT_PUBLIC_RITUAL_RPC_URL || "https://rpc.ritualfoundation.org";

const ritualChain = defineChain({
  id: 1979,
  name: "Ritual Testnet",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: { name: "Ritual Explorer", url: "https://explorer.ritualfoundation.org" },
  },
});

const publicClient = createPublicClient({
  chain: ritualChain,
  transport: http(rpcUrl),
});

function readSource(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function compile() {
  const input = {
    language: "Solidity",
    sources: {
      "contracts/RitualSwap.sol": { content: readSource("contracts/RitualSwap.sol") },
      "contracts/RitualTokens.sol": { content: readSource("contracts/RitualTokens.sol") },
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = output.errors?.filter((error) => error.severity === "error") ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  }
  return output.contracts;
}

function artifact(compiled, source, name) {
  const contract = compiled[source][name];
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
}

async function wait(hash, label) {
  console.log(`${label} tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${label} failed: ${hash}`);
  console.log(`${label}: ${receipt.contractAddress ?? "confirmed"}`);
  return receipt;
}

async function deployContract(label, art, args = []) {
  const hash = await walletClient.deployContract({
    abi: art.abi,
    bytecode: art.bytecode,
    args,
    account,
    chain: ritualChain,
  });
  const receipt = await wait(hash, label);
  return receipt.contractAddress;
}

async function write(address, abi, functionName, args = [], value = 0n, label = functionName) {
  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName,
    args,
    value,
    account,
    chain: ritualChain,
  });
  await wait(hash, label);
}

function updateEnv(addresses) {
  const envPath = path.join(root, ".env.local");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const lines = existing.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("NEXT_PUBLIC_WRITUAL=")
    && !line.startsWith("NEXT_PUBLIC_RBTC=")
    && !line.startsWith("NEXT_PUBLIC_RETH=")
    && !line.startsWith("NEXT_PUBLIC_RUSDC=")
    && !line.startsWith("NEXT_PUBLIC_RUSDT=")
    && !line.startsWith("NEXT_PUBLIC_DEX_FACTORY=")
    && !line.startsWith("NEXT_PUBLIC_DEX_ROUTER="));

  lines.push(`NEXT_PUBLIC_WRITUAL=${addresses.wrappedRitual}`);
  lines.push(`NEXT_PUBLIC_RBTC=${addresses.rBTC}`);
  lines.push(`NEXT_PUBLIC_RETH=${addresses.rETH}`);
  lines.push(`NEXT_PUBLIC_RUSDC=${addresses.rUSDC}`);
  lines.push(`NEXT_PUBLIC_RUSDT=${addresses.rUSDT}`);
  lines.push(`NEXT_PUBLIC_DEX_FACTORY=${addresses.factory}`);
  lines.push(`NEXT_PUBLIC_DEX_ROUTER=${addresses.router}`);
  fs.writeFileSync(envPath, `${lines.join("\n")}\n`);
}

const compiled = compile();
if (compileOnly) {
  console.log("Contracts compile successfully.");
  process.exit(0);
}

if (!privateKey) {
  throw new Error("Set PRIVATE_KEY in .env.local before deploying.");
}

const account = privateKeyToAccount(privateKey);
const walletClient = createWalletClient({
  account,
  chain: ritualChain,
  transport: http(rpcUrl),
});

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer: ${account.address}`);
console.log(`RITUAL balance: ${formatEther(balance)}`);
if (balance < parseEther("0.06")) {
  throw new Error("Deployer needs at least ~0.06 RITUAL testnet for deployment, gas, and seed liquidity.");
}

const wrappedRitualArt = artifact(compiled, "contracts/RitualSwap.sol", "WrappedRitual");
const factoryArt = artifact(compiled, "contracts/RitualSwap.sol", "RitualFactory");
const routerArt = artifact(compiled, "contracts/RitualSwap.sol", "RitualRouter");
const erc20Art = artifact(compiled, "contracts/RitualSwap.sol", "MockERC20");
const rBTCArt = artifact(compiled, "contracts/RitualTokens.sol", "RitualBTC");
const rETHArt = artifact(compiled, "contracts/RitualTokens.sol", "RitualETH");
const rUSDCArt = artifact(compiled, "contracts/RitualTokens.sol", "RitualUSDC");
const rUSDTArt = artifact(compiled, "contracts/RitualTokens.sol", "RitualUSDT");

const wrappedRitual = await deployContract("WRITUAL", wrappedRitualArt);
const rBTC = await deployContract("rBTC", rBTCArt);
const rETH = await deployContract("rETH", rETHArt);
const rUSDC = await deployContract("rUSDC", rUSDCArt);
const rUSDT = await deployContract("rUSDT", rUSDTArt);
const factory = await deployContract("Factory", factoryArt);
const router = await deployContract("Router", routerArt, [factory, wrappedRitual]);

await write(rBTC, erc20Art.abi, "mint", [account.address, parseEther("1000000")], 0n, "mint rBTC");
await write(rETH, erc20Art.abi, "mint", [account.address, parseEther("1000000")], 0n, "mint rETH");
await write(rUSDC, erc20Art.abi, "mint", [account.address, parseUnits("1000000", 6)], 0n, "mint rUSDC");
await write(rUSDT, erc20Art.abi, "mint", [account.address, parseUnits("1000000", 6)], 0n, "mint rUSDT");

await write(wrappedRitual, wrappedRitualArt.abi, "deposit", [], parseEther("0.04"), "wrap RITUAL");

for (const token of [wrappedRitual, rBTC, rETH, rUSDC, rUSDT]) {
  await write(token, erc20Art.abi, "approve", [router, 2n ** 256n - 1n], 0n, `approve ${token}`);
}

await write(router, routerArt.abi, "addLiquidity", [wrappedRitual, rBTC, parseEther("0.01"), parseEther("100"), account.address], 0n, "seed rBTC pool");
await write(router, routerArt.abi, "addLiquidity", [wrappedRitual, rETH, parseEther("0.01"), parseEther("100"), account.address], 0n, "seed rETH pool");
await write(router, routerArt.abi, "addLiquidity", [wrappedRitual, rUSDC, parseEther("0.01"), parseUnits("100", 6), account.address], 0n, "seed rUSDC pool");
await write(router, routerArt.abi, "addLiquidity", [wrappedRitual, rUSDT, parseEther("0.01"), parseUnits("100", 6), account.address], 0n, "seed rUSDT pool");

const addresses = { wrappedRitual, rBTC, rETH, rUSDC, rUSDT, factory, router };
updateEnv(addresses);

console.log("\nDeployment complete. Added these values to .env.local:");
console.log(`NEXT_PUBLIC_WRITUAL=${wrappedRitual}`);
console.log(`NEXT_PUBLIC_RBTC=${rBTC}`);
console.log(`NEXT_PUBLIC_RETH=${rETH}`);
console.log(`NEXT_PUBLIC_RUSDC=${rUSDC}`);
console.log(`NEXT_PUBLIC_RUSDT=${rUSDT}`);
console.log(`NEXT_PUBLIC_DEX_FACTORY=${factory}`);
console.log(`NEXT_PUBLIC_DEX_ROUTER=${router}`);
