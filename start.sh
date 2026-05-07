#!/bin/bash
set -e

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEMO_DIR"

CONTAINER_NAME="portkey-gateway-demo"
USE_NGROK=false

# Parse flags
for arg in "$@"; do
    case $arg in
        --ngrok) USE_NGROK=true ;;
    esac
done

cleanup() {
    echo ""
    echo "Shutting down..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    if [ -n "$NEXT_PID" ]; then
        kill "$NEXT_PID" 2>/dev/null || true
    fi
    if [ -n "$NGROK_PID" ]; then
        kill "$NGROK_PID" 2>/dev/null || true
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

# Wait for Next.js
for i in $(seq 1 30); do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        break
    fi
    sleep 1
done

echo ""
echo "========================================"
echo "  Demo is running!"
echo ""
echo "  Chat UI:         http://localhost:3000"
echo "  Gateway Console: http://localhost:8787/public/"
echo "  API Endpoint:    http://localhost:3000/api/v1/chat/completions"

# Start ngrok if requested
if [ "$USE_NGROK" = true ]; then
    if ! command -v ngrok &> /dev/null; then
        echo ""
        echo "  WARNING: ngrok not found. Install from https://ngrok.com"
        echo "========================================"
    else
        echo ""
        echo "  Starting ngrok tunnel..."
        ngrok http 3000 --log=stdout > /tmp/ngrok-portkey.log 2>&1 &
        NGROK_PID=$!

        # Wait for ngrok to establish the tunnel
        NGROK_URL=""
        for i in $(seq 1 15); do
            NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "import sys,json; t=json.load(sys.stdin).get('tunnels',[]); print(t[0]['public_url'] if t else '')" 2>/dev/null)
            if [ -n "$NGROK_URL" ]; then
                break
            fi
            sleep 1
        done

        if [ -n "$NGROK_URL" ]; then
            echo ""
            echo "  ----------------------------------------"
            echo "  NGROK TUNNEL ACTIVE"
            echo ""
            echo "  Public URL:      $NGROK_URL"
            echo "  Red Team Target: $NGROK_URL/api/v1/chat/completions"
            echo "  ----------------------------------------"
            echo ""
            echo "  Use this URL as the target in Strata Cloud Manager:"
            echo "  AI Runtime Security > Red Teaming > Targets > New Target"
            echo "    Type:   API Endpoint"
            echo "    URL:    $NGROK_URL/api/v1/chat/completions"
            echo "    Format: OpenAI Chat Completions"
        else
            echo ""
            echo "  WARNING: ngrok started but tunnel URL not detected."
            echo "  Check: http://localhost:4040"
        fi
    fi
fi

echo "========================================"
echo ""
echo "Press Ctrl+C to stop all services."

wait
