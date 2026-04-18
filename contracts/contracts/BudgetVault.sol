// File: Desktop/The-Acquirer/contracts/contracts/BudgetVault.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BudgetVault {
	address public owner;
	address payable public constant defaultProvider = payable(0x2B18CA5c477802bEfEaFC140675a2DBECbCE60f5);
	uint256 public totalDeposited;
	uint256 public totalSpent;
	uint256 public remainingBudget;

	struct Payment {
		uint256 id;
		string apiId;
		uint256 amountPaid;
		uint256 timestamp;
		string txNote;
	}

	struct APIService {
		uint256 id;
		string apiId;
		string name;
		string endpoint;
		uint256 pricePerCall;
		address payable provider;
		bool active;
		uint256 totalCalls;
		uint256 totalEarned;
	}

	mapping(uint256 => Payment) public payments;
	uint256 public paymentCount;
	mapping(uint256 => APIService) public apiServices;
	mapping(string => uint256) public apiIdToIndex;
	mapping(string => bool) public apiIdExists;
	uint256 public serviceCount;

	event Deposited(address indexed from, uint256 amount);
	event PaymentMade(uint256 indexed paymentId, string apiId, uint256 amount, string note);
	event BudgetExhausted(uint256 totalSpent);
	event APIRegistered(uint256 indexed serviceId, string apiId, address indexed provider, uint256 pricePerCall);
	event APIPurchased(uint256 indexed serviceId, string apiId, address indexed buyer, uint256 amountPaid, uint256 paymentId);

	constructor() {
		owner = msg.sender;
		remainingBudget = 0;
	}

	modifier onlyOwner() {
		require(msg.sender == owner, "Not owner");
		_;
	}

	function deposit() external payable onlyOwner {
		totalDeposited += msg.value;
		remainingBudget = totalDeposited - totalSpent;
		emit Deposited(msg.sender, msg.value);
	}

	function pay(string calldata apiId, uint256 amount, string calldata note) external onlyOwner {
		require(amount > 0, "Amount must be > 0");
		require(remainingBudget >= amount, "Insufficient budget");

		payments[paymentCount] = Payment(paymentCount, apiId, amount, block.timestamp, note);
		paymentCount++;
		totalSpent += amount;
		remainingBudget = totalDeposited - totalSpent;

		address payable provider = defaultProvider;
		if (apiIdExists[apiId]) {
			provider = apiServices[apiIdToIndex[apiId]].provider;
		}
		provider.transfer(amount);

		emit PaymentMade(paymentCount - 1, apiId, amount, note);
		if (remainingBudget == 0) {
			emit BudgetExhausted(totalSpent);
		}
	}

	function getPayment(uint256 id) external view returns (Payment memory) {
		require(id < paymentCount, "Payment not found");
		return payments[id];
	}

	function getAllPaymentIds() external view returns (uint256[] memory) {
		uint256[] memory ids = new uint256[](paymentCount);
		for (uint256 i = 0; i < paymentCount; i++) {
			ids[i] = i;
		}
		return ids;
	}

	function withdraw() external onlyOwner {
		uint256 balance = address(this).balance;
		(bool success, ) = payable(owner).call{value: balance}("");
		require(success, "Withdraw failed");
		totalDeposited = 0;
		totalSpent = 0;
		remainingBudget = 0;
	}

	function registerAPI(string calldata apiId, string calldata name, string calldata endpoint, uint256 pricePerCall) external returns (uint256 serviceId) {
		require(bytes(apiId).length > 0, "apiId required");
		require(!apiIdExists[apiId], "apiId already registered");
		require(pricePerCall > 0, "Price must be > 0");

		serviceId = serviceCount;
		apiServices[serviceId] = APIService({
			id: serviceId,
			apiId: apiId,
			name: name,
			endpoint: endpoint,
			pricePerCall: pricePerCall,
			provider: payable(msg.sender),
			active: true,
			totalCalls: 0,
			totalEarned: 0
		});
		apiIdToIndex[apiId] = serviceId;
		apiIdExists[apiId] = true;
		serviceCount++;
		emit APIRegistered(serviceId, apiId, msg.sender, pricePerCall);
		return serviceId;
	}

	function registerAPIForProvider(
		string calldata apiId,
		string calldata name,
		string calldata endpoint,
		uint256 pricePerCall,
		address payable providerAddress
	) external onlyOwner returns (uint256) {
		require(bytes(apiId).length > 0, "apiId required");
		require(!apiIdExists[apiId], "apiId already registered");
		require(pricePerCall > 0, "Price must be > 0");
		require(providerAddress != address(0), "Invalid provider");

		uint256 serviceId = serviceCount;
		apiServices[serviceId] = APIService({
			id: serviceId,
			apiId: apiId,
			name: name,
			endpoint: endpoint,
			pricePerCall: pricePerCall,
			provider: providerAddress,
			active: true,
			totalCalls: 0,
			totalEarned: 0
		});
		apiIdToIndex[apiId] = serviceId;
		apiIdExists[apiId] = true;
		serviceCount++;
		emit APIRegistered(serviceId, apiId, providerAddress, pricePerCall);
		return serviceId;
	}

	function purchaseAPI(string calldata apiId, string calldata note) external {
		require(apiIdExists[apiId], "API not found");
		uint256 idx = apiIdToIndex[apiId];
		APIService storage service = apiServices[idx];
		require(service.active, "API not active");
		require(remainingBudget >= service.pricePerCall, "Insufficient budget");

		payments[paymentCount] = Payment({
			id: paymentCount,
			apiId: apiId,
			amountPaid: service.pricePerCall,
			timestamp: block.timestamp,
			txNote: note
		});
		paymentCount++;
		totalSpent += service.pricePerCall;
		remainingBudget = totalDeposited - totalSpent;

		service.totalCalls += 1;
		service.totalEarned += service.pricePerCall;
		service.provider.transfer(service.pricePerCall);

		emit APIPurchased(idx, apiId, msg.sender, service.pricePerCall, paymentCount - 1);
		if (remainingBudget == 0) emit BudgetExhausted(totalSpent);
	}

	function getService(uint256 serviceId) external view returns (APIService memory) {
		require(serviceId < serviceCount, "Service not found");
		return apiServices[serviceId];
	}

	function getAllServiceIds() external view returns (uint256[] memory) {
		uint256[] memory ids = new uint256[](serviceCount);
		for (uint256 i = 0; i < serviceCount; i++) {
			ids[i] = i;
		}
		return ids;
	}

	function deactivateService(uint256 serviceId) external {
		require(serviceId < serviceCount, "Service not found");
		APIService storage service = apiServices[serviceId];
		require(msg.sender == service.provider || msg.sender == owner, "Not authorized");
		service.active = false;
	}

	function getServiceByApiId(string calldata apiId) external view returns (APIService memory) {
		require(apiIdExists[apiId], "API not found");
		return apiServices[apiIdToIndex[apiId]];
	}

	function seedDemoServices() external onlyOwner {
		if (serviceCount > 0) return;

		apiServices[0] = APIService({
			id: 0,
			apiId: "weather-v1",
			name: "Open-Meteo Weather",
			endpoint: "https://api.open-meteo.com/v1/forecast",
			pricePerCall: 10000000000000,
			provider: payable(owner),
			active: true,
			totalCalls: 0,
			totalEarned: 0
		});
		apiIdToIndex["weather-v1"] = 0;
		apiIdExists["weather-v1"] = true;

		apiServices[1] = APIService({
			id: 1,
			apiId: "crypto-price-v1",
			name: "CoinGecko Price Feed",
			endpoint: "https://api.coingecko.com/api/v3/simple/price",
			pricePerCall: 20000000000000,
			provider: payable(owner),
			active: true,
			totalCalls: 0,
			totalEarned: 0
		});
		apiIdToIndex["crypto-price-v1"] = 1;
		apiIdExists["crypto-price-v1"] = true;

		apiServices[2] = APIService({
			id: 2,
			apiId: "ai-inference-v1",
			name: "GPT-4o-mini Inference",
			endpoint: "https://api.openai.com/v1/chat/completions",
			pricePerCall: 50000000000000,
			provider: payable(owner),
			active: true,
			totalCalls: 0,
			totalEarned: 0
		});
		apiIdToIndex["ai-inference-v1"] = 2;
		apiIdExists["ai-inference-v1"] = true;

		serviceCount = 3;

		emit APIRegistered(0, "weather-v1", owner, 10000000000000);
		emit APIRegistered(1, "crypto-price-v1", owner, 20000000000000);
		emit APIRegistered(2, "ai-inference-v1", owner, 50000000000000);
	}
}
