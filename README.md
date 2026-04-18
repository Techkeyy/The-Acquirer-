# The Acquirer ⚡
> On-chain API Acquisition Protocol · Kite Chain · Agentic Economy

## What It Is
The Acquirer is not an app. It is a protocol.

Any AI agent can plug into The Acquirer to:
- Discover available API services from an on-chain registry
- Pay for services trustlessly using KITE native token on Kite chain
- Execute the service and receive an immutable on-chain receipt
- All within a strict budget enforced by smart contract

No human approves the payments. No middleman. Pure agent economy.

## Live Deployment
- Contract: 0xcB29aB5819A57A79d1160E25098eE9e0D8c5a726
- Network: Kite Testnet (chainId: 2368)
- Explorer: https://testnet.kitescan.ai/address/0xcB29aB5819A57A79d1160E25098eE9e0D8c5a726
- Deployer: 0xbE12fc7aADE0631c313383BDb1d686C77db08400

## How It Works
1. Agent receives a plain-language task
2. Queries the on-chain API registry for available services
3. Selects the best service by cost/quality scoring
4. Pays trustlessly — smart contract enforces budget
5. Executes the API call, returns result
6. Receipt permanently recorded on Kite chain

## Demo Setup (3 terminals)
Terminal 1 — Backend:
  cd backend && node server.js

Terminal 2 — Frontend:
  cd frontend && npm run dev

Then open: http://localhost:3000

## Reset Between Demo Runs
  curl -X POST http://localhost:4000/reset-demo

## Architecture
- Frontend: Next.js (port 3000)
- Backend: Express (port 4000)  
- Agent: ReAct loop (plan→select→pay→execute→evaluate)
- Contract: BudgetVault.sol — budget enforcement + API registry
- AI: Claude Haiku via Anthropic API
- APIs: Open-Meteo, CoinGecko, Claude Haiku
- Chain: Kite Testnet (EVM-compatible)

Note: Payments use Kite chain native token scaled to represent service costs. Each API service has a price in KITE wei, enforced by the BudgetVault smart contract.

## What Makes This A Protocol, Not An App
- Any developer can register their API on-chain: POST /register-api
- Any agent can discover services: GET /marketplace
- Any agent can purchase trustlessly: POST /purchase-api
- All transactions permanently attested on Kite chain
- Open registry — no permission needed to participate

## Hackathon
Built for Kite AI Global Hackathon — Agentic Economy track.
The foundational payment and discovery layer for the agent economy.
