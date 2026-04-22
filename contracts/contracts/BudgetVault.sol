// File: Desktop/The-Acquirer/contracts/contracts/BudgetVault.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
	function transferFrom(address from, address to, uint256 amount) external returns (bool);
	function transfer(address to, uint256 amount) external returns (bool);
	function balanceOf(address account) external view returns (uint256);
	function approve(address spender, uint256 amount) external returns (bool);
}

contract BudgetVault {
	address public owner;
	address payable public constant defaultProvider = payable(0x2B18CA5c477802bEfEaFC140675a2DBECbCE60f5);
	uint256 public totalDeposited;
	uint256 public totalSpent;
	uint256 public remainingBudget;
	address public usdcToken;
	bool public usdcMode;

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
		uint256 stakeAmount;
		uint256 reputationScore;
		uint256 disputeCount;
		bool slashed;
	}

	mapping(uint256 => Payment) public payments;
	uint256 public paymentCount;
	mapping(uint256 => APIService) public apiServices;
	mapping(string => uint256) public apiIdToIndex;
	mapping(string => bool) public apiIdExists;
	uint256 public serviceCount;
	uint256 public constant MIN_STAKE = 0.001 ether;
	uint256 public constant SLASH_AMOUNT = 0.0005 ether;
	mapping(address => uint256) public providerReputation;

	event Deposited(address indexed from, uint256 amount);
	event PaymentMade(uint256 indexed paymentId, string apiId, uint256 amount, string note);
	event BudgetExhausted(uint256 totalSpent);
	event APIRegistered(uint256 indexed serviceId, string apiId, address indexed provider, uint256 pricePerCall);
	event APIPurchased(uint256 indexed serviceId, string apiId, address indexed buyer, uint256 amountPaid, uint256 paymentId);
	event ServiceStaked(uint256 indexed serviceId, address indexed provider, uint256 amount);
	event DisputeFiled(uint256 indexed serviceId, address indexed filer, string reason);
	event ProviderSlashed(uint256 indexed serviceId, address indexed provider, uint256 amount);
	event ReputationUpdated(uint256 indexed serviceId, uint256 oldScore, uint256 newScore);

	constructor() {
		owner = msg.sender;
		remainingBudget = 0;
		usdcToken = address(0);
		usdcMode = false;
	}

	modifier onlyOwner() {
		require(msg.sender == owner, "Not owner");
		_;
	}

	function deposit() external payable onlyOwner {
		if (usdcMode && usdcToken != address(0)) {
			revert("Use depositUSDC() when in USDC mode");
		}
		totalDeposited += msg.value;
		remainingBudget = totalDeposited - totalSpent;
		emit Deposited(msg.sender, msg.value);
	}

	function setUSDCToken(address _usdcToken) external onlyOwner {
		usdcToken = _usdcToken;
		usdcMode = true;
	}

	function depositUSDC(uint256 amount) external onlyOwner {
		require(usdcMode, "Not in USDC mode");
		require(usdcToken != address(0), "USDC not configured");
		IERC20 usdc = IERC20(usdcToken);
		require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
		totalDeposited += amount;
		remainingBudget = totalDeposited - totalSpent;
		emit Deposited(msg.sender, amount);
	}

	function _transferPayment(address payable provider, uint256 amount) internal {
		if (usdcMode && usdcToken != address(0)) {
			IERC20 usdc = IERC20(usdcToken);
			require(usdc.transfer(provider, amount), "USDC transfer failed");
			return;
		}
		provider.transfer(amount);
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
		_transferPayment(provider, amount);

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
		if (usdcMode && usdcToken != address(0)) {
			IERC20 usdc = IERC20(usdcToken);
			uint256 balance = usdc.balanceOf(address(this));
			require(usdc.transfer(owner, balance), "Withdraw failed");
		} else {
			uint256 balance = address(this).balance;
			(bool success, ) = payable(owner).call{value: balance}("");
			require(success, "Withdraw failed");
		}
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
			totalEarned: 0,
			stakeAmount: 0,
			reputationScore: 50,
			disputeCount: 0,
			slashed: false
		});
		apiIdToIndex[apiId] = serviceId;
		apiIdExists[apiId] = true;
		serviceCount++;
		providerReputation[msg.sender] = 50;
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
			totalEarned: 0,
			stakeAmount: 0,
			reputationScore: 50,
			disputeCount: 0,
			slashed: false
		});
		apiIdToIndex[apiId] = serviceId;
		apiIdExists[apiId] = true;
		serviceCount++;
		providerReputation[providerAddress] = 50;
		emit APIRegistered(serviceId, apiId, providerAddress, pricePerCall);
		return serviceId;
	}

	function registerAPIWithStake(
		string calldata apiId,
		string calldata name,
		string calldata endpoint,
		uint256 pricePerCall,
		address payable providerAddress
	) external payable onlyOwner returns (uint256) {
		require(bytes(apiId).length > 0, "apiId required");
		require(!apiIdExists[apiId], "apiId already registered");
		require(pricePerCall > 0, "Price must be > 0");
		require(msg.value >= MIN_STAKE, "Must stake minimum 0.001 ETH");
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
			totalEarned: 0,
			stakeAmount: msg.value,
			reputationScore: 50,
			disputeCount: 0,
			slashed: false
		});
		apiIdToIndex[apiId] = serviceId;
		apiIdExists[apiId] = true;
		serviceCount++;
		providerReputation[providerAddress] = 50;

		emit APIRegistered(serviceId, apiId, providerAddress, pricePerCall);
		emit ServiceStaked(serviceId, providerAddress, msg.value);
		return serviceId;
	}

	function purchaseAPI(string calldata apiId, string calldata note) external {
		require(apiIdExists[apiId], "API not found");
		uint256 idx = apiIdToIndex[apiId];
		APIService storage service = apiServices[idx];
		require(service.active, "API not active");
		require(!service.slashed, "Provider has been slashed");
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
		_transferPayment(service.provider, service.pricePerCall);
		uint256 oldScore = service.reputationScore;
		service.reputationScore = service.reputationScore < 98 ? service.reputationScore + 2 : 100;
		providerReputation[service.provider] = service.reputationScore;
		emit ReputationUpdated(idx, oldScore, service.reputationScore);

		emit APIPurchased(idx, apiId, msg.sender, service.pricePerCall, paymentCount - 1);
		if (remainingBudget == 0) emit BudgetExhausted(totalSpent);
	}

	function fileDispute(uint256 serviceId, string calldata reason) external {
		require(serviceId < serviceCount, "Service not found");
		APIService storage service = apiServices[serviceId];
		require(service.active, "Service not active");
		require(!service.slashed, "Already slashed");

		service.disputeCount += 1;

		uint256 oldScore = service.reputationScore;
		if (service.reputationScore >= 10) {
			service.reputationScore -= 10;
		} else {
			service.reputationScore = 0;
		}
		providerReputation[service.provider] = service.reputationScore;

		emit DisputeFiled(serviceId, msg.sender, reason);
		emit ReputationUpdated(serviceId, oldScore, service.reputationScore);

		if (service.disputeCount >= 3) {
			_slashProvider(serviceId);
		}
	}

	function _slashProvider(uint256 serviceId) internal {
		APIService storage service = apiServices[serviceId];
		require(!service.slashed, "Already slashed");

		service.slashed = true;
		service.active = false;
		service.reputationScore = 0;
		providerReputation[service.provider] = 0;

		uint256 slashAmt = service.stakeAmount > SLASH_AMOUNT ? SLASH_AMOUNT : service.stakeAmount;
		service.stakeAmount -= slashAmt;

		if (slashAmt > 0) {
			(bool sent,) = payable(owner).call{value: slashAmt}("");
			require(sent, "Slash transfer failed");
		}

		emit ProviderSlashed(serviceId, service.provider, slashAmt);
	}

	function goodServiceCall(uint256 serviceId) external onlyOwner {
		require(serviceId < serviceCount, "Service not found");
		APIService storage service = apiServices[serviceId];

		uint256 oldScore = service.reputationScore;
		if (service.reputationScore < 100) {
			service.reputationScore += 2;
			if (service.reputationScore > 100) {
				service.reputationScore = 100;
			}
		}
		service.totalCalls += 1;
		providerReputation[service.provider] = service.reputationScore;

		emit ReputationUpdated(serviceId, oldScore, service.reputationScore);
	}

	function getReputationLeaderboard()
		external view returns (
			uint256[] memory ids,
			uint256[] memory scores,
			uint256[] memory calls
		) {
		ids = new uint256[](serviceCount);
		scores = new uint256[](serviceCount);
		calls = new uint256[](serviceCount);

		for (uint256 i = 0; i < serviceCount; i++) {
			ids[i] = i;
			scores[i] = apiServices[i].reputationScore;
			calls[i] = apiServices[i].totalCalls;
		}
		return (ids, scores, calls);
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
			totalEarned: 0,
			stakeAmount: 0,
			reputationScore: 50,
			disputeCount: 0,
			slashed: false
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
			totalEarned: 0,
			stakeAmount: 0,
			reputationScore: 50,
			disputeCount: 0,
			slashed: false
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
			totalEarned: 0,
			stakeAmount: 0,
			reputationScore: 50,
			disputeCount: 0,
			slashed: false
		});
		apiIdToIndex["ai-inference-v1"] = 2;
		apiIdExists["ai-inference-v1"] = true;

		serviceCount = 3;

		emit APIRegistered(0, "weather-v1", owner, 10000000000000);
		emit APIRegistered(1, "crypto-price-v1", owner, 20000000000000);
		emit APIRegistered(2, "ai-inference-v1", owner, 50000000000000);
	}
}
