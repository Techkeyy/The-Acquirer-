// File: Desktop/The-Acquirer/frontend/next.config.js
// File: Desktop/The-Acquirer/frontend/next.config.js
const nextConfig = {
	async rewrites() {
		return [{ source: "/api/:path*", destination: "http://localhost:4000/:path*" }];
	},
};

module.exports = nextConfig;
