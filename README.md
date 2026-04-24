# The Acquirer ⚡
> On-chain API Acquisition Protocol · Kite Chain · x402 Payment Standard

**Live Demo:** https://the-acquirer.vercel.app
**Backend API:** https://the-acquirer-api.railway.app
**Contract:** [0x3E595b27F23C95fC772D7Ee65926895A55D6C1a0](https://testnet.kitescan.ai/address/0x3E595b27F23C95fC772D7Ee65926895D6C1a0)
**Network:** Kite Testnet (chainId: 2368)
**Track:** Agentic Commerce

---

## What It Is

The Acquirer is a trustless API acquisition protocol
where autonomous AI agents:

1. **Discover** services from an on-chain registry on Kite chain
2. **Pay** autonomously using USDC via the x402 payment standard
3. **Execute** the service and receive an immutable on-chain receipt
4. **Build reputation** through the Kite Agent Passport system

No human approves payments. No middlemen. Pure agentic economy.

---

## x402 Protocol Flow
Agent → POST /agent/execute
← HTTP 402 + nonce + payment details
Agent pays on Kite chain → gets txHash
Agent → POST /agent/execute + X-Payment-Receipt header
← HTTP 200 + verified answer + on-chain proof

---

## Kite Agent Passport

Every successful API call generates an `AgentAttestation`
event on-chain compatible with the Kite Agent Passport schema:

- Agent identity tied to wallet address
- Verifiable task execution history on Kite chain
- On-chain reputation score (0-100, staking-enforced)
- Cross-referenceable attestation hashes

---

## Architecture

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Smart Contract | Solidity 0.8.20 | Budget, registry, attestations, reputation |
| Agent Orchestrator | Node.js + Groq | Deep reasoning, multi-agent decomposition |
| Payment Layer | x402 + ethers.js | Trustless USDC settlement |
| Frontend | Next.js 14 | Dashboard + marketplace + docs |
| Chain | Kite Testnet | All transactions and attestations |

---

## Quick Start (External Agent)

```bash
# Step 1: Call without payment — get 402 challenge
curl -X POST https://the-acquirer-api.railway.app/agent/execute \
  -H "Content-Type: application/json" \
  -d '{"task": "What is Bitcoin price?"}'

# Returns HTTP 402:
# { "nonce": "abc123", "amount": "0.00002", "payTo": "0x..." }

# Step 2: Pay on Kite chain

# Step 3: Retry with payment proof
curl -X POST https://the-acquirer-api.railway.app/agent/execute \
  -H "Content-Type: application/json" \
  -H "X-Payment-Receipt: 0xYOUR_TX_HASH" \
  -H "X-Payment-Sender: 0xYOUR_WALLET" \
  -H "X-Payment-Nonce: abc123" \
  -d '{"task": "What is Bitcoin price?"}'

# Returns HTTP 200:
# { "answer": "Bitcoin is at $78,374", "verified": true }
```

---

## SDK (Node.js)

```javascript
const { AcquirerClient } = require("./agent-sdk");

const agent = new AcquirerClient({
  baseUrl: "https://the-acquirer-api.railway.app",
  privateKey: process.env.WALLET_KEY,
  rpcUrl: "https://rpc-testnet.gokite.ai/"
});

// Automatic x402 payment handling
const result = await agent.execute(
  "What is Bitcoin price and should I invest?"
);

console.log(result.answer);
// "Bitcoin is at $78,374. Market is stable..."
console.log(result.payment.receipt);
// "0xabc123..." — on-chain proof
```

---

## Reputation & Staking System

- Providers stake minimum 0.001 ETH to register a service
- Reputation starts at 50/100, increases +2 per successful call
- Each dispute reduces reputation by 10 points
- 3 disputes triggers automatic stake slashing and deactivation
- Agents route by reputation score — bad providers get fewer calls

---

## USDC Settlement

All payments use USDC (ERC-20, 6 decimals). On Kite testnet,
a Kite-USDC token is used since Circle has not yet bridged to
Kite testnet. The contract uses a swappable token address —
one transaction (`setUSDCToken()`) switches to Circle USDC on mainnet.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/agent/execute` | POST | x402-protected agent execution |
| `/agent/info` | GET | Protocol discovery |
| `/marketplace` | GET | On-chain service registry |
| `/leaderboard` | GET | Reputation scores |
| `/agent-passport` | GET | Agent identity + attestations |
| `/protocol-stats` | GET | Volume and transaction stats |
| `/register-api` | POST | Register new service on-chain |
| `/dispute` | POST | File dispute against provider |

---

## Local Development

```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — Frontend  
cd frontend && npm run dev

# Open http://localhost:3000
```

## Environment Variables
KITE_RPC_URL=https://rpc-testnet.gokite.ai/
KITE_CHAIN_ID=2368
PRIVATE_KEY=your_wallet_private_key
GROQ_API_KEY=your_groq_api_key
KITE_EXPLORER_URL=https://testnet.kitescan.ai/

---

## Why This Wins the Agentic Commerce Track

1. **Real x402** — not mocked, full HTTP 402 → pay → verify flow
2. **USDC settlement** — 6 decimal ERC-20 compatible token
3. **Agent Passport** — `AgentAttestation` events on every call
4. **Open registry** — any developer registers their API
5. **Reputation staking** — providers have real skin in the game
6. **Deep reasoning** — chain-of-thought synthesis with confidence scores
7. **Fully deployed** — live on Kite testnet, publicly accessible

---

Built for **Kite AI Global Hackathon 2026 — Agentic Economy**
