# Osmosis-3 Factory Pattern Contracts Makefile

.PHONY: help build deploy test clean install check-docker all

# Default target
help:
	@echo "Osmosis-3 Factory Pattern Contracts"
	@echo "===================================="
	@echo ""
	@echo "Available commands:"
	@echo "  make install    - Install Node.js dependencies"
	@echo "  make build      - Build all contracts with Docker"
	@echo "  make deploy     - Deploy contracts to Osmosis testnet"
	@echo "  make test       - Test deployed contracts"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make help       - Show this help message"
	@echo ""

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	@npm install

# Check if Docker is running
check-docker:
	@echo "🐳 Checking Docker daemon..."
	@docker info > /dev/null 2>&1 || (echo "❌ Docker is not running. Please start Docker Desktop and try again." && exit 1)
	@echo "✅ Docker is running"

# Build all contracts with Docker
build: check-docker
	@echo "🔨 Building HTLC contract with Docker..."
	docker run --rm --memory=4g --cpus=2 \
		-v "$(PWD)/escrow":/code \
		cosmwasm/rust-optimizer:0.17.0
	@echo "✅ Escrow contract built!"

	@echo "🔨 Building HTLC Factory contract with Docker..."
	docker run --rm --memory=4g --cpus=2 \
		-v "$(PWD)/escrowFactory":/code \
		cosmwasm/rust-optimizer:0.17.0
	@echo "✅ Escrow Factory contract built!"

	@echo "🔨 Building IBC contract with Docker..."
	docker run --rm --memory=4g --cpus=2 \
		-v "$(PWD)/ibc":/code \
		cosmwasm/rust-optimizer:0.17.0
	@echo "✅ IBC contract built!"

	@echo "🎉 All contracts built successfully!"

# Deploy contracts
deploy: build
	@echo "🚀 Deploying contracts..."
	npm run deploy

# Test contracts
test:
	@echo "🧪 Testing contracts..."
	npm run test

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf escrow/target/
	rm -rf escrowFactory/target/
	rm -rf ibc/target/
	rm -rf escrow/artifacts/
	rm -rf escrowFactory/artifacts/
	rm -rf ibc/artifacts/
	rm -rf node_modules/
	rm -f deployment.json
	@echo "✅ Clean completed!"

# Full deployment pipeline
all: install build deploy test
	@echo "🎉 Full deployment pipeline completed!"


