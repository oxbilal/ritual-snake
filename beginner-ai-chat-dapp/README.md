# Ritual Quest Hub

A Next.js + wagmi dApp for Ritual Testnet daily quests. Users connect a real
wallet, see their RITUAL balance, and complete three on-chain actions:

- Daily Check-in
- Vote of the Day
- Claim XP

The leaderboard and badges are intentionally mocked for now.

## Setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Configuration

Fill `.env.local` after deployment:

```bash
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
NEXT_PUBLIC_RITUAL_QUEST_HUB=
PRIVATE_KEY=
```

`NEXT_PUBLIC_RITUAL_QUEST_HUB` is the deployed `RitualQuestHub` contract
address. `PRIVATE_KEY` is only used by the deployment script; use a testnet-only
wallet.

## Contract

The Solidity source is in `contracts/RitualQuestHub.sol`.

- `checkIn()` gives 25 XP and updates the streak once per day.
- `voteDaily(uint8 option)` gives 40 XP once per day and accepts options 0-3.
- `claimDailyXP()` gives 60 XP once per day after check-in and vote.
- `getPlayer(address user)` returns total XP, streak, and last action days.

## Deploy

Compile the quest contract:

```bash
npm run compile:questhub
```

Deploy to Ritual Testnet:

```bash
npm run deploy:questhub
```

The deploy script waits for the deployment receipt and writes:

```bash
NEXT_PUBLIC_RITUAL_QUEST_HUB=0x...
```

to `.env.local`. Restart the dev server after deployment so Next.js picks up the
new public environment variable.

## Notes

This app does not simulate transaction success. The UI marks a task done only
after the wallet transaction is submitted, the Ritual Testnet receipt confirms
success, and the contract player data is refetched.
