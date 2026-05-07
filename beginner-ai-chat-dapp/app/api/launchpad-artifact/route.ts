import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import solc from "solc";

export async function GET() {
  const sourcePath = path.join(process.cwd(), "contracts", "LaunchpadToken.sol");
  const source = fs.readFileSync(sourcePath, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      "LaunchpadToken.sol": { content: source },
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
  const errors = output.errors?.filter((error: { severity: string }) => error.severity === "error") ?? [];
  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: "Launchpad token compile failed." }, { status: 500 });
  }

  const contract = output.contracts["LaunchpadToken.sol"].LaunchpadToken;
  return NextResponse.json({
    ok: true,
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  });
}
