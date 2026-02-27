#!/usr/bin/env bash

################################################################################
# pane-run.sh - Smart development server for Pane git worktrees
#
# This script intelligently handles running the Pane Electron app from any
# git worktree, with dynamic port allocation to prevent conflicts between
# multiple concurrent worktree sessions.
#
# Features:
# - Works from any git worktree directory (auto-detects main repo)
# - Dynamic port allocation based on directory hash (no conflicts)
# - Finds dependencies in local or parent directories (handles monorepo)
# - Safe process management (checks existing processes on port)
# - Auto-detects project type (Node.js, Electron, monorepo, etc.)
# - Clear output with URL/port information
################################################################################

set -euo pipefail

# Color output for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Base port for development server (frontend Vite dev server)
BASE_PORT=4521
# Base port for Electron inspection
BASE_INSPECT_PORT=9200

################################################################################
# Helper Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "\n${CYAN}===${NC} $1 ${CYAN}===${NC}"
}

# Generate a numeric hash from a string (directory path)
hash_string() {
    local str="$1"
    # Use cksum for portability (available on macOS and Linux)
    local hash=$(echo -n "$str" | cksum | awk '{print $1}')
    echo "$hash"
}

# Check if a port is in use
is_port_in_use() {
    local port=$1
    if command -v lsof &> /dev/null; then
        lsof -i :"$port" -sTCP:LISTEN -t >/dev/null 2>&1
    elif command -v netstat &> /dev/null; then
        netstat -an | grep ":$port " | grep -q LISTEN
    else
        # Fallback: try to connect
        (echo >/dev/tcp/localhost/"$port") &>/dev/null
    fi
}

# Kill process on a specific port
kill_process_on_port() {
    local port=$1
    log_warning "Attempting to kill process on port $port..."

    if command -v lsof &> /dev/null; then
        local pid=$(lsof -ti :"$port" -sTCP:LISTEN)
        if [ -n "$pid" ]; then
            kill -9 "$pid" 2>/dev/null || true
            sleep 1
            log_success "Killed process $pid on port $port"
            return 0
        fi
    elif command -v fuser &> /dev/null; then
        fuser -k "$port"/tcp 2>/dev/null || true
        sleep 1
        log_success "Killed process on port $port"
        return 0
    fi

    log_error "Could not kill process on port $port"
    return 1
}

# Find the git repository root (handles worktrees)
find_git_root() {
    local current_dir="$PWD"

    # Check if we're in a git repository
    if ! git rev-parse --git-dir &>/dev/null; then
        log_error "Not in a git repository"
        exit 1
    fi

    # Get the common dir (points to main repo for worktrees)
    local git_common_dir=$(git rev-parse --git-common-dir)

    # If we're in a worktree, git_common_dir points to main repo's .git
    if [[ "$git_common_dir" == *"/.git" ]] || [[ "$git_common_dir" == *"\\.git" ]]; then
        # Extract the main repo path
        local main_repo=$(dirname "$git_common_dir")
        echo "$main_repo"
    else
        # We're in the main repo
        git rev-parse --show-toplevel
    fi
}

# Find node_modules by checking current dir, then parent directories
find_node_modules() {
    local search_dir="${1:-$PWD}"
    local max_depth=5
    local depth=0

    while [ "$depth" -lt "$max_depth" ]; do
        if [ -d "$search_dir/node_modules" ]; then
            echo "$search_dir/node_modules"
            return 0
        fi

        # Move up one directory
        local parent_dir=$(dirname "$search_dir")
        if [ "$parent_dir" == "$search_dir" ]; then
            # Reached filesystem root
            break
        fi
        search_dir="$parent_dir"
        ((depth++))
    done

    return 1
}

# Find package.json by checking current dir, then parent directories
find_package_json() {
    local search_dir="${1:-$PWD}"
    local max_depth=5
    local depth=0

    while [ "$depth" -lt "$max_depth" ]; do
        if [ -f "$search_dir/package.json" ]; then
            echo "$search_dir/package.json"
            return 0
        fi

        # Move up one directory
        local parent_dir=$(dirname "$search_dir")
        if [ "$parent_dir" == "$search_dir" ]; then
            # Reached filesystem root
            break
        fi
        search_dir="$parent_dir"
        ((depth++))
    done

    return 1
}

# Detect if this is a monorepo (pnpm, yarn, npm workspaces, lerna, etc.)
is_monorepo() {
    local repo_root="$1"

    # Check for pnpm workspace
    if [ -f "$repo_root/pnpm-workspace.yaml" ]; then
        echo "pnpm"
        return 0
    fi

    # Check for yarn workspaces
    if [ -f "$repo_root/package.json" ]; then
        if grep -q '"workspaces"' "$repo_root/package.json" 2>/dev/null; then
            if command -v yarn &> /dev/null; then
                echo "yarn"
            else
                echo "npm"
            fi
            return 0
        fi
    fi

    # Check for lerna
    if [ -f "$repo_root/lerna.json" ]; then
        echo "lerna"
        return 0
    fi

    return 1
}

# Calculate dynamic port based on current directory path
calculate_port() {
    local base_port=$1
    local current_path="$PWD"

    # Generate hash from current directory path
    local path_hash=$(hash_string "$current_path")

    # Calculate port offset (0-999 range to avoid conflicts)
    local offset=$((path_hash % 1000))

    # Calculate final port
    local port=$((base_port + offset))

    echo "$port"
}

################################################################################
# Main Logic
################################################################################

log_section "Pane Development Server Launcher"

# 1. Detect git repository and worktree status
log_info "Detecting git repository structure..."
REPO_ROOT=$(find_git_root)
CURRENT_DIR="$PWD"
log_success "Repository root: $REPO_ROOT"

if [ "$REPO_ROOT" != "$CURRENT_DIR" ]; then
    log_info "Running from worktree: $CURRENT_DIR"
    WORKTREE_NAME=$(basename "$CURRENT_DIR")
    log_info "Worktree name: $WORKTREE_NAME"
else
    log_info "Running from main repository"
    WORKTREE_NAME="main"
fi

# 2. Detect project type and structure
log_section "Analyzing Project Structure"

PACKAGE_JSON=$(find_package_json "$REPO_ROOT")
if [ -z "$PACKAGE_JSON" ]; then
    log_error "No package.json found. Is this a Node.js project?"
    exit 1
fi

PROJECT_ROOT=$(dirname "$PACKAGE_JSON")
log_success "Project root: $PROJECT_ROOT"

# Check if monorepo
MONOREPO_TYPE=$(is_monorepo "$PROJECT_ROOT" || echo "none")
if [ "$MONOREPO_TYPE" != "none" ]; then
    log_info "Detected monorepo type: $MONOREPO_TYPE"
fi

# 3. Find dependencies
log_section "Locating Dependencies"

NODE_MODULES=$(find_node_modules "$PROJECT_ROOT")
if [ -n "$NODE_MODULES" ]; then
    log_success "Found node_modules: $NODE_MODULES"
else
    log_warning "No node_modules found. Run 'pnpm install' or 'npm install' first."
    read -p "Install dependencies now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$PROJECT_ROOT"
        if [ "$MONOREPO_TYPE" == "pnpm" ]; then
            pnpm install
        elif [ "$MONOREPO_TYPE" == "yarn" ]; then
            yarn install
        else
            npm install
        fi
        NODE_MODULES=$(find_node_modules "$PROJECT_ROOT")
    else
        log_error "Cannot proceed without dependencies."
        exit 1
    fi
fi

# 4. Calculate dynamic ports
log_section "Port Allocation"

FRONTEND_PORT=$(calculate_port "$BASE_PORT")
INSPECT_PORT=$(calculate_port "$BASE_INSPECT_PORT")

log_info "Base frontend port: $BASE_PORT"
log_info "Calculated frontend port for this worktree: $FRONTEND_PORT"
log_info "Calculated Electron inspect port: $INSPECT_PORT"

# 5. Check if ports are already in use
if is_port_in_use "$FRONTEND_PORT"; then
    log_warning "Port $FRONTEND_PORT is already in use!"
    echo -e "\nOptions:"
    echo "  1) Kill the existing process and use this port"
    echo "  2) Use a different port (+1)"
    echo "  3) Exit"
    read -p "Choose an option (1/2/3): " -n 1 -r
    echo

    case $REPLY in
        1)
            if ! kill_process_on_port "$FRONTEND_PORT"; then
                log_error "Failed to kill process. Exiting."
                exit 1
            fi
            ;;
        2)
            FRONTEND_PORT=$((FRONTEND_PORT + 1))
            log_info "Using alternative port: $FRONTEND_PORT"
            ;;
        *)
            log_info "Exiting."
            exit 0
            ;;
    esac
fi

# 6. Detect project type and start command
log_section "Starting Development Server"

cd "$PROJECT_ROOT"

# Check for Electron project (this is Pane)
if grep -q '"electron"' "$PACKAGE_JSON" && grep -q '"electron-dev"' "$PACKAGE_JSON"; then
    log_info "Detected Electron application (Pane)"

    # Check if main process is built
    if [ ! -d "main/dist" ]; then
        log_warning "Main process not built. Building now..."
        if [ "$MONOREPO_TYPE" == "pnpm" ]; then
            pnpm run build:main
        else
            npm run build:main
        fi
    fi

    # Set environment variables for custom port
    export VITE_PORT="$FRONTEND_PORT"
    export PORT="$FRONTEND_PORT"

    log_success "Starting Pane with:"
    echo -e "  ${GREEN}Frontend URL:${NC} http://localhost:$FRONTEND_PORT"
    echo -e "  ${GREEN}Electron Inspect:${NC} chrome://inspect (port $INSPECT_PORT)"
    echo -e "  ${GREEN}Worktree:${NC} $WORKTREE_NAME"
    echo ""

    # Start the development server
    if [ "$MONOREPO_TYPE" == "pnpm" ]; then
        # Use custom command to skip build:main if already built
        pnpm run electron-dev:custom
    else
        npm run electron-dev
    fi

# Check for regular Vite project
elif grep -q '"vite"' "$PACKAGE_JSON"; then
    log_info "Detected Vite project"
    export VITE_PORT="$FRONTEND_PORT"

    log_success "Starting development server on http://localhost:$FRONTEND_PORT"

    if [ "$MONOREPO_TYPE" == "pnpm" ]; then
        pnpm run dev
    elif [ "$MONOREPO_TYPE" == "yarn" ]; then
        yarn dev
    else
        npm run dev
    fi

# Check for Next.js
elif grep -q '"next"' "$PACKAGE_JSON"; then
    log_info "Detected Next.js project"
    export PORT="$FRONTEND_PORT"

    log_success "Starting Next.js on http://localhost:$FRONTEND_PORT"

    if [ "$MONOREPO_TYPE" == "pnpm" ]; then
        pnpm run dev -- -p "$FRONTEND_PORT"
    elif [ "$MONOREPO_TYPE" == "yarn" ]; then
        yarn dev -p "$FRONTEND_PORT"
    else
        npm run dev -- -p "$FRONTEND_PORT"
    fi

# Check for Create React App
elif grep -q '"react-scripts"' "$PACKAGE_JSON"; then
    log_info "Detected Create React App project"
    export PORT="$FRONTEND_PORT"

    log_success "Starting CRA on http://localhost:$FRONTEND_PORT"

    if [ "$MONOREPO_TYPE" == "pnpm" ]; then
        pnpm start
    elif [ "$MONOREPO_TYPE" == "yarn" ]; then
        yarn start
    else
        npm start
    fi

# Generic Node.js project
elif [ -f "$PACKAGE_JSON" ]; then
    log_info "Detected Node.js project"

    # Check for common start scripts
    if grep -q '"dev"' "$PACKAGE_JSON"; then
        log_success "Starting with 'dev' script on port $FRONTEND_PORT"
        export PORT="$FRONTEND_PORT"

        if [ "$MONOREPO_TYPE" == "pnpm" ]; then
            pnpm run dev
        elif [ "$MONOREPO_TYPE" == "yarn" ]; then
            yarn dev
        else
            npm run dev
        fi
    elif grep -q '"start"' "$PACKAGE_JSON"; then
        log_success "Starting with 'start' script on port $FRONTEND_PORT"
        export PORT="$FRONTEND_PORT"

        if [ "$MONOREPO_TYPE" == "pnpm" ]; then
            pnpm start
        elif [ "$MONOREPO_TYPE" == "yarn" ]; then
            yarn start
        else
            npm start
        fi
    else
        log_error "No 'dev' or 'start' script found in package.json"
        log_info "Available scripts:"
        if command -v jq &> /dev/null; then
            jq -r '.scripts | keys[]' "$PACKAGE_JSON"
        else
            grep -A 20 '"scripts"' "$PACKAGE_JSON" | grep '".*":' | cut -d'"' -f2
        fi
        exit 1
    fi

else
    log_error "Unknown project type. Could not determine how to start the development server."
    exit 1
fi
