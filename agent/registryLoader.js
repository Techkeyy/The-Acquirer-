// File: Desktop/The-Acquirer/agent/registryLoader.js
const fs = require('fs');
const path = require('path');

const registryPath = path.join(__dirname, 'registry.json');
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

function getAllAPIs() {
  return registry;
}

function getAPIById(id) {
  return registry.find((api) => api.id === id) || null;
}

function getAPIsUnderBudget(remainingBudget) {
  return registry
    .filter((api) => api.costUSDC <= remainingBudget)
    .sort((left, right) => right.qualityScore - left.qualityScore);
}

function getBestAPI(remainingBudget) {
  const affordableAPIs = getAPIsUnderBudget(remainingBudget);
  return affordableAPIs.length > 0 ? affordableAPIs[0] : null;
}

module.exports = {
  getAllAPIs,
  getAPIById,
  getAPIsUnderBudget,
  getBestAPI,
};