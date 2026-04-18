# The Acquirer — 3 Minute Demo Script

## Before Judges Arrive
1. Terminal 1: cd backend && node server.js
2. Terminal 2: cd frontend && npm run dev  
3. Open http://localhost:3000 in incognito
4. Confirm green "● LIVE · KITE CHAIN" in header
5. Confirm budget shows > 0 USDC
6. Have this URL ready:
   https://testnet.kitescan.ai/address/0xcB29aB5819A57A79d1160E25098eE9e0D8c5a726

## Minute 1 — The Protocol (30 seconds talk, 30 seconds show)
SAY: "Most hackathon projects build agents. We built the
	infrastructure agents run on."

SAY: "The Acquirer is an on-chain API acquisition protocol.
	Any agent plugs in, discovers services, pays trustlessly,
	gets a receipt. No humans. No middlemen."

SHOW: Point to the 4 protocol steps at the top
SHOW: Click MARKETPLACE tab
SHOW: "These 3 services are registered on Kite chain right now.
	 Anyone can register their API here."

## Minute 2 — Live Agent Run
SHOW: Click AGENT tab
TYPE: "What is the current Bitcoin price?"
CLICK: RUN AGENT (not dry run — real payment)

POINT to each step as it appears:
- PLAN: "Agent reads its budget from the chain"
- SELECT: "Cost-quality scoring — picks best affordable API"  
- BUDGET CHECK: "Smart contract enforces the limit"
- PAY: "Real transaction — watch this hash"
- EXECUTE: "CoinGecko called — live Bitcoin price"
- EVALUATE: "Mission complete"

SAY: "That payment just happened on Kite chain.
	Here is the transaction hash."

## Minute 3 — On-Chain Proof
SHOW: Copy the txHash from the execution log
OPEN: https://testnet.kitescan.ai/tx/<PASTE_HASH>
SAY: "This is the permanent on-chain receipt.
	The agent spent $0.02 USDC autonomously.
	No human approved that transaction."

SHOW: Scroll to ON-CHAIN RECEIPTS section in UI
SAY: "Every payment is logged. The registry is open.
	This is the economic layer the agent economy needs."

## If Budget Runs Out
Run in terminal:
  cd contracts
  npx hardhat run scripts/deposit-budget.js --network kite_testnet
Then click RESET in the UI.

## Key Numbers To Mention
- Contract: 0xcB29aB5819A57A79d1160E25098eE9e0D8c5a726
- Chain: Kite Testnet (chainId 2368)
- Services registered: 3
- Cost per call: $0.01 - $0.05 USDC
- AI provider: Claude Haiku (Anthropic)