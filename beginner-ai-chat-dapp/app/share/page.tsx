import type { Metadata } from "next";
import Link from "next/link";

type SharePageProps = {
  searchParams?: {
    score?: string;
    rank?: string;
    wallet?: string;
  };
};

function scoreImagePath(searchParams: SharePageProps["searchParams"]) {
  const params = new URLSearchParams();
  params.set("score", searchParams?.score || "0");
  params.set("rank", searchParams?.rank || "Beginner");
  params.set("wallet", searchParams?.wallet || "");
  return `/api/og?${params.toString()}`;
}

export function generateMetadata({ searchParams }: SharePageProps): Metadata {
  const score = searchParams?.score || "0";
  const rank = searchParams?.rank || "Beginner";
  const image = scoreImagePath(searchParams);
  const title = `I scored ${score} on Ritual Snake`;
  const description = `Rank: ${rank}. Play Ritual Snake on Ritual Testnet.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default function SharePage({ searchParams }: SharePageProps) {
  const score = searchParams?.score || "0";
  const rank = searchParams?.rank || "Beginner";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#121212] p-4 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#070707] p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-black p-2 shadow-[0_0_24px_rgba(16,185,129,.45)]">
          <img src="/ritual-logo.png" alt="Ritual logo" className="h-full w-full object-contain" />
        </div>
        <h1 className="mt-5 text-2xl font-black">Ritual Snake</h1>
        <p className="mt-3 text-sm text-zinc-500">Score shared from Ritual Testnet</p>
        <p className="mt-4 text-5xl font-black text-emerald-400">{score}</p>
        <p className="mt-2 text-sm text-zinc-500">Rank: {rank}</p>
        <Link
          href="/"
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-4 py-2 font-bold text-black transition hover:bg-zinc-200"
        >
          Play Ritual Snake
        </Link>
      </section>
    </main>
  );
}
