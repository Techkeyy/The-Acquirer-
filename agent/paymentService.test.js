// File: Desktop/The-Acquirer/agent/paymentService.test.js
const realEthersModule = require("ethers");

process.env.PRIVATE_KEY = process.env.PRIVATE_KEY || "0x59c6995e998f97a5a0044966f094538dcb8e7d2f3b6f4f2d9b2f6f5d7f2b0f0a";
process.env.KITE_RPC_URL = process.env.KITE_RPC_URL || "http://127.0.0.1:8545";

const mockContract = {
  remainingBudget: async () => realEthersModule.ethers.parseEther("0.5"),
  totalDeposited: async () => realEthersModule.ethers.parseEther("1.0"),
  totalSpent: async () => realEthersModule.ethers.parseEther("0.5"),
  paymentCount: async () => 2n,
  pay: async () => ({ wait: async () => ({ hash: "0xMOCKHASH", blockNumber: 42 }) }),
  deposit: async () => ({ wait: async () => ({ hash: "0xMOCKDEPOSIT" }) }),
  getPayment: async (i) => ({
    id: i,
    apiId: "weather-basic",
    amountPaid: realEthersModule.ethers.parseEther("0.00001"),
    timestamp: 1700000000n,
    txNote: "test",
  }),
};

const ethersModulePath = require.resolve("ethers");
require.cache[ethersModulePath] = {
  id: ethersModulePath,
  filename: ethersModulePath,
  loaded: true,
  exports: {
    ethers: {
      ...realEthersModule.ethers,
      JsonRpcProvider: class JsonRpcProviderMock {
        constructor() {}
      },
      Wallet: class WalletMock {
        constructor() {
          this.address = "0x0000000000000000000000000000000000000001";
        }
      },
      Contract: function ContractMock() {
        return mockContract;
      },
    },
  },
};

const paymentService = require("./paymentService");

async function runTest(description, testFn) {
  try {
    await testFn();
    console.log(`✅ PASS: ${description}`);
  } catch (error) {
    console.log(`❌ FAIL: ${description} ${error.message}`);
  }
}

(async () => {
  await runTest("getStatus() returns an object with remainingBudget field", async () => {
    const status = await paymentService.getStatus();
    if (!status || typeof status !== "object" || !Object.prototype.hasOwnProperty.call(status, "remainingBudget")) {
      throw new Error("remainingBudget field missing");
    }
  });

  await runTest('recordPayment("weather-basic", 0.01, "Test call") returns { success: true }', async () => {
    const result = await paymentService.recordPayment("weather-basic", 0.01, "Test call");
    if (!result || result.success !== true) {
      throw new Error("success was not true");
    }
  });

  await runTest("checkBudgetSufficient(0.01) returns true", async () => {
    const sufficient = await paymentService.checkBudgetSufficient(0.01);
    if (sufficient !== true) {
      throw new Error("budget check returned false");
    }
  });
})();