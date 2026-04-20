// File: Desktop/The-Acquirer/contracts/hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  networks: {
    kite_testnet: {
      url: process.env.KITE_RPC_URL || "https://rpc-testnet.gokite.ai/",
      chainId: 2368,
      accounts: process.env.PRIVATE_KEY ? [
        process.env.PRIVATE_KEY.startsWith("0x")
          ? process.env.PRIVATE_KEY
          : "0x" + process.env.PRIVATE_KEY
      ] : [],
      gasPrice: "auto"
    },
    hardhat: {
      chainId: 31337
    }
  }
};