#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEMO_DIR"

CONTAINER_NAME="portkey-gateway-demo"

cleanup() {
    echo ""
    echo "Shutting down..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    if [ -n "$NEXT_PID" ]; then
        kill "$NEXT_PID" 2>/dev/null || true
    fi
    exit 0
}
trap cleanup INT TERM

echo "========================================"
echo "  Portkey AI Gateway + Prisma AIRS Demo"
echo "========================================"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Install Docker Desktop first."
    echo "       https://www.docker.com/products/docker-desktop/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "ERROR: Docker daemon is not running. Start Docker Desktop first."
    exit 1
fi

# Check for .env.local
if [ ! -f .env.local ]; then
    echo "Generating .env.local from shell environment..."
    cat > .env.local << EOF
OPENAI_API_KEY=$OPENAI_API_KEY
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
PRISMA_AIRS_API_KEY=$PRISMA_AIRS_API_KEY
PRISMA_AIRS_PROFILE_NAME=chatbot
PORTKEY_GATEWAY_URL=http://localhost:8787/v1
EOF
    echo "Created .env.local"
fi

# Stop any existing gateway container
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

# Start Portkey Gateway via Docker
echo "[1/2] Starting Portkey AI Gateway (Docker) on port 8787..."
docker run -d --name "$CONTAINER_NAME" -p 8787:8787 portkeyai/gateway
echo "     Container started: $CONTAINER_NAME"

# Wait for gateway to be ready
echo "     Waiting for gateway..."
for i in $(seq 1 30); do
    if curl -s http://localhost:8787/v1 > /dev/null 2>&1; then
        echo "     Gateway is ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "     ERROR: Gateway failed to start after 30s"
        echo "     Check: docker logs $CONTAINER_NAME"
        exit 1
    fi
    sleep 1
done

echo ""

# Start Next.js
echo "[2/2] Starting Next.js dev server on port 3000..."
npm run dev &
NEXT_PID=$!

echo ""
echo "========================================"
echo "  Demo is running!"
echo ""
echo "  Chat UI:         http://localhost:3000"
echo "  Gateway Console: http://localhost:8787/public/"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
