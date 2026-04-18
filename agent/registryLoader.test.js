// File: Desktop/The-Acquirer/agent/registryLoader.test.js
const {
  getAllAPIs,
  getAPIById,
  getAPIsUnderBudget,
  getBestAPI,
} = require('./registryLoader');

function assertPass(condition, description) {
  if (condition) {
    console.log(`✅ PASS: ${description}`);
  } else {
    console.log(`❌ FAIL: ${description}`);
  }
}

const allAPIs = getAllAPIs();
assertPass(Array.isArray(allAPIs) && allAPIs.length === 3, 'getAllAPIs() returns array of length 3');
assertPass(getAPIById('weather-basic') !== null, 'getAPIById("weather-basic") is not null');
assertPass(getAPIById('nonexistent') === null, 'getAPIById("nonexistent") is null');
assertPass(getAPIsUnderBudget(0.03).length === 2, 'getAPIsUnderBudget(0.03) returns exactly 2 results');
assertPass(getBestAPI(0.10)?.id === 'openai-gpt4o-mini', 'getBestAPI(0.10) returns the entry with id "openai-gpt4o-mini"');