#!/bin/bash
# foozol Cloud Setup — Interactive CLI
# Guides you through provisioning a secure GCP VM with IAP-only access.
#
# Prerequisites: gcloud CLI, terraform CLI, bash
# Usage: bash cloud/scripts/setup-cloud.sh

# Bail immediately if not running under bash
if [ -z "$BASH_VERSION" ]; then
  echo ""
  echo "ERROR: This script requires bash."
  echo ""
  echo "  On macOS/Linux:  bash cloud/scripts/setup-cloud.sh"
  echo "  On Windows:      Open Git Bash, then run the command above"
  echo ""
  echo "If you're using foozol's built-in terminal, set your shell to"
  echo "Git Bash in Settings > Preferred Shell."
  echo ""
  exit 1
fi

set -eo pipefail

# ============================================================
# Colors & helpers
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }
header()  { echo -e "\n${BOLD}${CYAN}=== $* ===${NC}\n"; }

prompt_input() {
  local varname="$1" prompt="$2" default="$3"
  if [ -n "$default" ]; then
    read -rp "$(echo -e "${BOLD}$prompt${NC} [${default}]: ")" value
    eval "$varname=\"${value:-$default}\""
  else
    read -rp "$(echo -e "${BOLD}$prompt${NC}: ")" value
    eval "$varname=\"$value\""
  fi
}

prompt_yes_no() {
  local prompt="$1" default="${2:-y}"
  local yn
  if [ "$default" = "y" ]; then
    read -rp "$(echo -e "${BOLD}$prompt${NC} [Y/n]: ")" yn
    yn="${yn:-y}"
  else
    read -rp "$(echo -e "${BOLD}$prompt${NC} [y/N]: ")" yn
    yn="${yn:-n}"
  fi
  [[ "$yn" =~ ^[Yy] ]]
}

# ============================================================
# Resolve script directory (works from any cwd)
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="${SCRIPT_DIR}/../terraform/gcp"

# ============================================================
# Step 0: Check prerequisites
# ============================================================
header "foozol Cloud Setup"
echo -e "This script will guide you through setting up a secure foozol Cloud VM"
echo -e "on Google Cloud Platform with IAP-only access (no public IP).\n"

info "Checking prerequisites..."

missing=0
for cmd in gcloud terraform; do
  if ! command -v "$cmd" &>/dev/null; then
    error "$cmd is not installed. Please install it first."
    missing=1
  else
    success "$cmd found: $(command -v "$cmd")"
  fi
done

if [ "$missing" -eq 1 ]; then
  echo ""
  error "Install missing tools and re-run this script."
  echo "  gcloud: https://cloud.google.com/sdk/docs/install"
  echo "  terraform: https://developer.hashicorp.com/terraform/install"
  exit 1
fi

# ============================================================
# Check if already provisioned — enter connect mode
# ============================================================
if [ -f "${TERRAFORM_DIR}/terraform.tfstate" ] && terraform -chdir="$TERRAFORM_DIR" output -raw instance_name &>/dev/null 2>&1; then
  header "foozol Cloud — Connect Mode"
  info "Existing deployment detected. Entering connect mode."

  # Read terraform outputs
  INSTANCE_NAME=$(terraform -chdir="$TERRAFORM_DIR" output -raw instance_name 2>/dev/null)
  PROJECT_ID=$(terraform -chdir="$TERRAFORM_DIR" output -raw project_id 2>/dev/null)
  GCP_ZONE=$(terraform -chdir="$TERRAFORM_DIR" output -raw zone 2>/dev/null)
  TUNNEL_PORT=8080

  success "Instance: ${INSTANCE_NAME}"
  success "Project:  ${PROJECT_ID}"
  success "Zone:     ${GCP_ZONE}"

  # Refresh GCP token
  info "Refreshing GCP access token..."
  GCP_TOKEN=$(gcloud auth print-access-token 2>/dev/null || echo "")
  if [ -z "$GCP_TOKEN" ]; then
    warn "Could not get GCP token. Running gcloud auth login..."
    gcloud auth login --update-adc
    GCP_TOKEN=$(gcloud auth print-access-token 2>/dev/null || echo "")
  fi
  success "Token refreshed."

  # Retrieve VNC password
  VNC_PASSWORD=$(gcloud compute ssh "$INSTANCE_NAME" \
    --zone="$GCP_ZONE" \
    --project="$PROJECT_ID" \
    --tunnel-through-iap \
    --command="cat /home/foozol/.vnc_password 2>/dev/null" \
    2>/dev/null || echo "")

  # Update foozol config with fresh token
  FOOZOL_CONFIG="$HOME/.foozol/config.json"
  mkdir -p "$HOME/.foozol"

  if command -v jq &>/dev/null && [ -f "$FOOZOL_CONFIG" ]; then
    jq --arg provider "gcp" \
       --arg token "$GCP_TOKEN" \
       --arg serverId "$INSTANCE_NAME" \
       --arg vncPw "$VNC_PASSWORD" \
       --arg projectId "$PROJECT_ID" \
       --arg zone "$GCP_ZONE" \
       --argjson port "$TUNNEL_PORT" \
       '.cloud = {
          provider: $provider,
          apiToken: $token,
          serverId: $serverId,
          vncPassword: $vncPw,
          projectId: $projectId,
          zone: $zone,
          tunnelPort: $port
        }' "$FOOZOL_CONFIG" > "${FOOZOL_CONFIG}.tmp" \
      && mv "${FOOZOL_CONFIG}.tmp" "$FOOZOL_CONFIG"
  elif command -v jq &>/dev/null; then
    echo '{}' | jq --arg provider "gcp" \
       --arg token "$GCP_TOKEN" \
       --arg serverId "$INSTANCE_NAME" \
       --arg vncPw "$VNC_PASSWORD" \
       --arg projectId "$PROJECT_ID" \
       --arg zone "$GCP_ZONE" \
       --argjson port "$TUNNEL_PORT" \
       '.cloud = {
          provider: $provider,
          apiToken: $token,
          serverId: $serverId,
          vncPassword: $vncPw,
          projectId: $projectId,
          zone: $zone,
          tunnelPort: $port
        }' > "$FOOZOL_CONFIG"
  else
    warn "jq not found — skipping foozol config update. Install jq for auto-config."
  fi
  success "foozol config updated with fresh token."

  # Check if VM is running, start if not
  info "Checking VM status..."
  VM_STATUS=$(gcloud compute instances describe "$INSTANCE_NAME" \
    --zone="$GCP_ZONE" \
    --project="$PROJECT_ID" \
    --format="value(status)" 2>/dev/null || echo "UNKNOWN")

  if [ "$VM_STATUS" != "RUNNING" ]; then
    info "VM is ${VM_STATUS}. Starting..."
    gcloud compute instances start "$INSTANCE_NAME" \
      --zone="$GCP_ZONE" \
      --project="$PROJECT_ID"

    # Wait for running
    info "Waiting for VM to reach RUNNING state..."
    for i in $(seq 1 20); do
      sleep 3
      VM_STATUS=$(gcloud compute instances describe "$INSTANCE_NAME" \
        --zone="$GCP_ZONE" \
        --project="$PROJECT_ID" \
        --format="value(status)" 2>/dev/null || echo "UNKNOWN")
      if [ "$VM_STATUS" = "RUNNING" ]; then
        break
      fi
      echo -ne "\r  Waiting... (${i})"
    done
    echo ""

    if [ "$VM_STATUS" != "RUNNING" ]; then
      error "VM did not reach RUNNING state. Current status: ${VM_STATUS}"
      exit 1
    fi
    success "VM is running."
  else
    success "VM is already running."
  fi

  # Start IAP tunnel (foreground — Ctrl+C to stop)
  echo ""
  info "Starting IAP tunnel on localhost:${TUNNEL_PORT}..."
  info "Press Ctrl+C to disconnect."
  echo ""
  gcloud compute start-iap-tunnel "$INSTANCE_NAME" 80 \
    --local-host-port="localhost:${TUNNEL_PORT}" \
    --zone="$GCP_ZONE" \
    --project="$PROJECT_ID"

  exit 0
fi

# ============================================================
# Step 1: Google Cloud authentication
# ============================================================
header "Step 1: Google Cloud Authentication"

CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)

if [ -n "$CURRENT_ACCOUNT" ] && [ "$CURRENT_ACCOUNT" != "(unset)" ]; then
  info "Currently authenticated as: ${BOLD}${CURRENT_ACCOUNT}${NC}"
  if ! prompt_yes_no "Use this account?"; then
    info "Launching Google Cloud login..."
    gcloud auth login --update-adc
    CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
  fi
else
  info "Not authenticated. Launching Google Cloud login..."
  gcloud auth login --update-adc
  CURRENT_ACCOUNT=$(gcloud config get-value account 2>/dev/null)
fi

success "Authenticated as: ${CURRENT_ACCOUNT}"

# Also ensure application-default credentials exist (needed for Terraform)
if ! gcloud auth application-default print-access-token &>/dev/null 2>&1; then
  info "Setting up application-default credentials for Terraform..."
  gcloud auth application-default login
fi

# ============================================================
# Step 2: Choose or create a GCP project
# ============================================================
header "Step 2: GCP Project"

echo -e "foozol Cloud will create an isolated GCP project for your VM.\n"

prompt_input USER_ID "Enter a unique user ID (used in resource names, e.g. your-name)" ""

while [ -z "$USER_ID" ]; do
  warn "User ID cannot be empty."
  prompt_input USER_ID "Enter a unique user ID" ""
done

# Sanitize: lowercase, alphanumeric + hyphens only
USER_ID=$(echo "$USER_ID" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
PROJECT_ID="foozol-cloud-${USER_ID}"

info "Project ID will be: ${BOLD}${PROJECT_ID}${NC}"

# Check if project already exists
if gcloud projects describe "$PROJECT_ID" &>/dev/null 2>&1; then
  success "Project ${PROJECT_ID} already exists."
  EXISTING_PROJECT=true
else
  EXISTING_PROJECT=false
  info "Creating project ${PROJECT_ID}..."
  if ! gcloud projects create "$PROJECT_ID" --name="foozol Cloud (${USER_ID})" 2>&1; then
    error "Failed to create project. You may need to check your organization policies."
    exit 1
  fi
  success "Project created: ${PROJECT_ID}"
fi

# Set as active project
gcloud config set project "$PROJECT_ID" 2>/dev/null

# ============================================================
# Step 3: Billing — requires manual step
# ============================================================
header "Step 3: Link Billing Account"

# Check if billing is already linked
BILLING_ENABLED=$(gcloud billing projects describe "$PROJECT_ID" --format="value(billingEnabled)" 2>/dev/null || echo "false")

if [ "$BILLING_ENABLED" = "True" ] || [ "$BILLING_ENABLED" = "true" ]; then
  success "Billing is already linked to ${PROJECT_ID}."
else
  echo -e "${YELLOW}${BOLD}ACTION REQUIRED:${NC} You need to link a billing account to your project.\n"
  echo -e "This cannot be done automatically via CLI in most configurations.\n"
  echo -e "Please open the following URL in your browser:\n"
  echo -e "  ${CYAN}${BOLD}https://console.cloud.google.com/billing/linkedaccount?project=${PROJECT_ID}${NC}\n"
  echo -e "Steps:"
  echo -e "  1. Click ${BOLD}'Link a billing account'${NC}"
  echo -e "  2. Select your billing account from the dropdown"
  echo -e "  3. Click ${BOLD}'Set account'${NC}"
  echo ""

  # Wait for user to link billing
  while true; do
    read -rp "$(echo -e "${BOLD}Press Enter once billing is linked...${NC}")" _
    BILLING_ENABLED=$(gcloud billing projects describe "$PROJECT_ID" --format="value(billingEnabled)" 2>/dev/null || echo "false")
    if [ "$BILLING_ENABLED" = "True" ] || [ "$BILLING_ENABLED" = "true" ]; then
      success "Billing verified — linked to ${PROJECT_ID}."
      break
    else
      warn "Billing not detected yet. Make sure you completed the steps above."
      if ! prompt_yes_no "Try again?"; then
        error "Billing must be linked to proceed. Exiting."
        exit 1
      fi
    fi
  done
fi

# ============================================================
# Step 4: Choose region and machine type
# ============================================================
header "Step 4: Configuration"

prompt_input GCP_ZONE "GCP zone" "us-central1-a"
GCP_REGION=$(echo "$GCP_ZONE" | sed 's/-[a-z]$//')

prompt_input MACHINE_TYPE "Machine type" "e2-highmem-2"
prompt_input DISK_SIZE "Boot disk size (GB)" "64"

echo ""
info "Configuration summary:"
echo "  Project:      ${PROJECT_ID}"
echo "  User ID:      ${USER_ID}"
echo "  Zone:         ${GCP_ZONE}"
echo "  Region:       ${GCP_REGION}"
echo "  Machine:      ${MACHINE_TYPE}"
echo "  Disk:         ${DISK_SIZE} GB"
echo "  Security:     IAP-only (no public IP)"
echo ""

if ! prompt_yes_no "Proceed with Terraform apply?"; then
  info "Aborted by user."
  exit 0
fi

# ============================================================
# Step 5: Terraform init & apply
# ============================================================
header "Step 5: Provisioning Infrastructure"

if [ ! -d "$TERRAFORM_DIR" ]; then
  error "Terraform directory not found at: ${TERRAFORM_DIR}"
  error "Make sure you're running this from the foozol repo root."
  exit 1
fi

cd "$TERRAFORM_DIR"

info "Running terraform init..."
terraform init -input=false

info "Running terraform apply..."
terraform apply \
  -var="project_id=${PROJECT_ID}" \
  -var="user_id=${USER_ID}" \
  -var="zone=${GCP_ZONE}" \
  -var="region=${GCP_REGION}" \
  -var="machine_type=${MACHINE_TYPE}" \
  -var="disk_size_gb=${DISK_SIZE}" \
  -auto-approve

success "Infrastructure provisioned!"

# Capture outputs
INSTANCE_NAME=$(terraform output -raw instance_name 2>/dev/null)
SSH_CMD=$(terraform output -raw ssh_command 2>/dev/null)
TUNNEL_CMD=$(terraform output -raw novnc_tunnel_command 2>/dev/null)
NOVNC_URL=$(terraform output -raw novnc_url 2>/dev/null)

# ============================================================
# Step 6: Wait for VM setup to complete
# ============================================================
header "Step 6: Waiting for VM Setup"

info "The VM is running the setup script (installs packages, Node.js, foozol, etc.)"
info "This typically takes 3-5 minutes on a fresh VM.\n"

# Poll for setup completion by checking if supervisor is running
MAX_WAIT=600  # 10 minutes max
ELAPSED=0
INTERVAL=15

while [ $ELAPSED -lt $MAX_WAIT ]; do
  echo -ne "\r  Waiting... (${ELAPSED}s / ${MAX_WAIT}s)"

  # Try to SSH in and check if setup is done (supervisor running = setup complete)
  SETUP_DONE=$(gcloud compute ssh "$INSTANCE_NAME" \
    --zone="$GCP_ZONE" \
    --project="$PROJECT_ID" \
    --tunnel-through-iap \
    --command="systemctl is-active supervisor 2>/dev/null || echo 'not-ready'" \
    2>/dev/null || echo "ssh-failed")

  if [ "$SETUP_DONE" = "active" ]; then
    echo ""
    success "VM setup complete! All services are running."
    break
  fi

  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo ""
  warn "Setup is taking longer than expected. You can check the logs manually:"
  echo "  ${SSH_CMD} --command='tail -50 /var/log/syslog | grep startup-script'"
fi

# ============================================================
# Step 7: Retrieve VNC password
# ============================================================
header "Step 7: VNC Password"

VNC_PASSWORD=$(gcloud compute ssh "$INSTANCE_NAME" \
  --zone="$GCP_ZONE" \
  --project="$PROJECT_ID" \
  --tunnel-through-iap \
  --command="cat /home/foozol/.vnc_password 2>/dev/null" \
  2>/dev/null || echo "")

if [ -n "$VNC_PASSWORD" ]; then
  success "VNC password retrieved."
  echo -e "\n  ${BOLD}VNC Password: ${YELLOW}${VNC_PASSWORD}${NC}\n"
  echo -e "  Save this password — you'll need it to connect to the noVNC display.\n"
else
  warn "Could not retrieve VNC password. The setup script may still be running."
  echo "  Retrieve it manually later with:"
  echo "  ${SSH_CMD} --command='cat /home/foozol/.vnc_password'"
fi

# ============================================================
# Step 8: Configure foozol
# ============================================================
header "Step 8: Configuring foozol"

FOOZOL_CONFIG="$HOME/.foozol/config.json"
mkdir -p "$HOME/.foozol"

# Get GCP access token for API calls
GCP_TOKEN=$(gcloud auth print-access-token 2>/dev/null || echo "")
TUNNEL_PORT=8080

if command -v jq &>/dev/null; then
  if [ -f "$FOOZOL_CONFIG" ]; then
    # Merge cloud settings into existing config
    jq --arg provider "gcp" \
       --arg token "$GCP_TOKEN" \
       --arg serverId "$INSTANCE_NAME" \
       --arg vncPw "$VNC_PASSWORD" \
       --arg projectId "$PROJECT_ID" \
       --arg zone "$GCP_ZONE" \
       --argjson port "$TUNNEL_PORT" \
       '.cloud = {
          provider: $provider,
          apiToken: $token,
          serverId: $serverId,
          vncPassword: $vncPw,
          projectId: $projectId,
          zone: $zone,
          tunnelPort: $port
        }' "$FOOZOL_CONFIG" > "${FOOZOL_CONFIG}.tmp" \
      && mv "${FOOZOL_CONFIG}.tmp" "$FOOZOL_CONFIG"
  else
    # Create new config with cloud settings
    echo '{}' | jq --arg provider "gcp" \
       --arg token "$GCP_TOKEN" \
       --arg serverId "$INSTANCE_NAME" \
       --arg vncPw "$VNC_PASSWORD" \
       --arg projectId "$PROJECT_ID" \
       --arg zone "$GCP_ZONE" \
       --argjson port "$TUNNEL_PORT" \
       '.cloud = {
          provider: $provider,
          apiToken: $token,
          serverId: $serverId,
          vncPassword: $vncPw,
          projectId: $projectId,
          zone: $zone,
          tunnelPort: $port
        }' > "$FOOZOL_CONFIG"
  fi
  success "foozol configured with cloud settings."
  info "Settings written to ${FOOZOL_CONFIG}"
  info "Note: The GCP access token expires in ~1 hour. foozol auto-refreshes it via gcloud."
else
  warn "jq not installed — skipping automatic foozol config."
  warn "You can install jq and re-run this script, or configure cloud settings manually in foozol Settings."
fi

# ============================================================
# Done!
# ============================================================
header "Setup Complete!"

echo -e "${GREEN}${BOLD}Your foozol Cloud VM is ready!${NC}\n"

echo -e "${BOLD}Connect to your VM:${NC}"
echo ""
echo -e "  ${CYAN}1. Start the IAP tunnel (run in a separate terminal):${NC}"
echo -e "     ${BOLD}${TUNNEL_CMD}${NC}"
echo ""
echo -e "  ${CYAN}2. Open noVNC in your browser:${NC}"
echo -e "     ${BOLD}${NOVNC_URL}${NC}"
echo ""
echo -e "  ${CYAN}3. Enter the VNC password when prompted${NC}"
echo ""

echo -e "${BOLD}SSH access:${NC}"
echo -e "  ${BOLD}${SSH_CMD}${NC}"
echo ""

echo -e "${BOLD}First-time setup inside the VM:${NC}"
echo -e "  1. ${BOLD}gh auth login${NC}    — Authenticate GitHub"
echo -e "  2. ${BOLD}claude login${NC}     — Authenticate Claude Code"
echo -e "  3. Set API keys in foozol Settings"
echo ""

echo -e "${BOLD}Cost management:${NC}"
echo -e "  Stop VM:   gcloud compute instances stop ${INSTANCE_NAME} --zone=${GCP_ZONE} --project=${PROJECT_ID}"
echo -e "  Start VM:  gcloud compute instances start ${INSTANCE_NAME} --zone=${GCP_ZONE} --project=${PROJECT_ID}"
echo -e "  Delete VM: cd ${TERRAFORM_DIR} && terraform destroy -var=\"project_id=${PROJECT_ID}\" -var=\"user_id=${USER_ID}\""
echo ""

echo -e "${BOLD}Security:${NC}"
echo -e "  - No public IP — VM is only accessible via GCP IAP tunnel"
echo -e "  - All traffic authenticated through your Google account"
echo -e "  - Daily snapshots with 7-day retention for backups"
echo ""
