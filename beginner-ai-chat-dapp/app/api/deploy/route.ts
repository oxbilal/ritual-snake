import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { loadEnvConfig } from "@next/env";

let deployInProgress = false;

export async function POST() {
  loadEnvConfig(process.cwd());

  const rawPrivateKey = process.env.PRIVATE_KEY?.trim();
  const privateKeyLoaded = Boolean(rawPrivateKey);
  const privateKeyLength = rawPrivateKey?.length ?? 0;
  const normalizedPrivateKey = rawPrivateKey
    ? rawPrivateKey.startsWith("0x")
      ? rawPrivateKey
      : `0x${rawPrivateKey}`
    : undefined;
  const privateKeyDebug = { privateKeyLoaded, privateKeyLength };

  if (!normalizedPrivateKey) {
    return NextResponse.json(
      { ok: false, error: "PRIVATE_KEY is missing in .env.local.", ...privateKeyDebug },
      { status: 400 },
    );
  }

  if (deployInProgress) {
    return NextResponse.json(
      { ok: false, error: "Deployment is already running.", ...privateKeyDebug },
      { status: 409 },
    );
  }

  deployInProgress = true;

  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(process.execPath, ["scripts/deploy-ritualswap.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, PRIVATE_KEY: normalizedPrivateKey },
      shell: false,
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      deployInProgress = false;
      resolve({ code, output });
    });
    child.on("error", (error) => {
      deployInProgress = false;
      resolve({ code: 1, output: error.message });
    });
  });

  return NextResponse.json({
    ok: result.code === 0,
    ...privateKeyDebug,
    output: result.output,
  }, { status: result.code === 0 ? 200 : 500 });
}
