import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { createPublicClient, createWalletClient, defineChain, formatEther, http, parseEther } from "viem";
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
    process.env[trimmed.slice(0, index)] ||= trimmed.slice(index + 1);
  }
}

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

function compile() {
  const sourcePath = "contracts/RitualQuestHub.sol";
  const input = {
    language: "Solidity",
    sources: {
      [sourcePath]: { content: fs.readFileSync(path.join(root, sourcePath), "utf8") },
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
  if (errors.length > 0) throw new Error(errors.map((error) => error.formattedMessage).join("\n"));
  const contract = output.contracts[sourcePath].RitualQuestHub;
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
}

const artifact = compile();
if (compileOnly) {
  console.log("RitualQuestHub compiles successfully.");
  process.exit(0);
}

const rawPrivateKey = process.env.PRIVATE_KEY?.trim();
const privateKey = rawPrivateKey ? (rawPrivateKey.startsWith("0x") ? rawPrivateKey : `0x${rawPrivateKey}`) : undefined;
if (!privateKey) throw new Error("Set PRIVATE_KEY in .env.local before deploying.");

const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: ritualChain, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: ritualChain, transport: http(rpcUrl) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Deployer: ${account.address}`);
console.log(`RITUAL balance: ${formatEther(balance)}`);
if (balance < parseEther("0.005")) {
  throw new Error("Deployer needs Ritual testnet funds for gas.");
}

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode,
  account,
  chain: ritualChain,
});
console.log(`RitualQuestHub tx: ${hash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) {
  throw new Error(`RitualQuestHub deployment failed: ${hash}`);
}

const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const lines = existing
  .split(/\r?\n/)
  .filter((line) => line.trim() && !line.startsWith("NEXT_PUBLIC_RITUAL_QUEST_HUB="));
lines.push(`NEXT_PUBLIC_RITUAL_QUEST_HUB=${receipt.contractAddress}`);
fs.writeFileSync(envPath, `${lines.join("\n")}\n`);

console.log(`RitualQuestHub deployed: ${receipt.contractAddress}`);
console.log(`NEXT_PUBLIC_RITUAL_QUEST_HUB=${receipt.contractAddress}`);
