# Pane Cloud - GCP Terraform Configuration
# Fully self-contained: provisions a complete Pane cloud VM from scratch.
# No external dependencies — everything is inlined.
#
# Usage:
#   terraform init
#   terraform plan -var="project_id=YOUR_PROJECT" -var="user_id=user123"
#   terraform apply -var="project_id=YOUR_PROJECT" -var="user_id=user123"

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# ============================================================
# Variables
# ============================================================

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "user_id" {
  description = "Unique user identifier"
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.user_id)) && length(var.user_id) >= 2 && length(var.user_id) <= 30
    error_message = "user_id must be 2-30 characters, lowercase alphanumeric and hyphens only."
  }
}

variable "machine_type" {
  description = "GCP machine type (e2-highmem-2 = 2 vCPU, 16GB RAM)"
  type        = string
  default     = "e2-highmem-2"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 64
  validation {
    condition     = var.disk_size_gb >= 32 && var.disk_size_gb <= 2048
    error_message = "disk_size_gb must be between 32 and 2048."
  }
}

variable "vnc_password" {
  description = "Pre-generated VNC password (passed to VM startup script)"
  type        = string
  sensitive   = true
}

variable "snapshot_start_time" {
  description = "Daily snapshot start time (HH:MM format, UTC)"
  type        = string
  default     = "04:00"
}

# ============================================================
# Provider
# ============================================================

provider "google" {
  project = var.project_id
  region  = var.region
}

# ============================================================
# Enable Required GCP APIs
# ============================================================

resource "google_project_service" "compute" {
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iap" {
  service            = "iap.googleapis.com"
  disable_on_destroy = false
}

# ============================================================
# Firewall Rules — IAP-only, NO public access
# ============================================================

# Allow SSH and noVNC ONLY from GCP IAP tunnel IP range (35.235.240.0/20)
# This means: no one can reach the VM unless authenticated via gcloud IAP
resource "google_compute_firewall" "pane_iap" {
  name     = "pane-iap-${var.user_id}"
  network  = "default"
  priority = 900

  allow {
    protocol = "tcp"
    ports    = ["22", "80"]
  }

  # GCP Identity-Aware Proxy source range — NOT the public internet
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["pane-cloud"]

  depends_on = [google_project_service.compute]
}

# Explicitly deny all other inbound traffic to Pane VMs
resource "google_compute_firewall" "pane_deny_all" {
  name     = "pane-deny-all-${var.user_id}"
  network  = "default"
  priority = 1000

  deny {
    protocol = "tcp"
  }

  deny {
    protocol = "udp"
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["pane-cloud"]

  depends_on = [google_project_service.compute]
}

# ============================================================
# Cloud NAT — outbound internet for VM without a public IP
# Required for apt-get, npm install, downloading Pane, etc.
# ============================================================

resource "google_compute_router" "pane" {
  name    = "pane-router-${var.user_id}"
  network = "default"
  region  = var.region

  depends_on = [google_project_service.compute]
}

resource "google_compute_router_nat" "pane" {
  name                               = "pane-nat-${var.user_id}"
  router                             = google_compute_router.pane.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = false
    filter = "ALL"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ============================================================
# Compute Instance — NO public IP
# ============================================================

resource "google_compute_instance" "pane" {
  name         = "pane-${var.user_id}"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["pane-cloud"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"
    # NO access_config = NO public IP
    # VM is only reachable via IAP tunnel
  }

  # Pass VNC password via instance metadata so we have it immediately
  metadata = {
    vnc-password = var.vnc_password
  }

  metadata_startup_script = file("${path.module}/../../scripts/setup-vm.sh")

  labels = {
    purpose = "pane-cloud"
    user_id = var.user_id
  }

  # Allow stopping for cost savings
  desired_status = "RUNNING"

  lifecycle {
    ignore_changes = [desired_status]
  }

  depends_on = [google_project_service.compute, google_project_service.iap, google_compute_router_nat.pane]
}

# ============================================================
# Snapshot Schedule (Daily Backups)
# ============================================================

resource "google_compute_resource_policy" "daily_backup" {
  name   = "pane-backup-${var.user_id}"
  region = var.region

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = var.snapshot_start_time
      }
    }
    retention_policy {
      max_retention_days    = 7
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
  }

  depends_on = [google_project_service.compute]
}

resource "google_compute_disk_resource_policy_attachment" "backup" {
  name = google_compute_resource_policy.daily_backup.name
  disk = google_compute_instance.pane.name
  zone = var.zone
}

# ============================================================
# Outputs
# ============================================================

output "instance_id" {
  value = google_compute_instance.pane.instance_id
}

output "instance_name" {
  value = google_compute_instance.pane.name
}

output "project_id" {
  value = var.project_id
}

output "zone" {
  value = var.zone
}

output "vnc_password" {
  value     = var.vnc_password
  sensitive = true
}

output "ssh_command" {
  description = "SSH into the VM via IAP tunnel (requires gcloud auth)"
  value       = "gcloud compute ssh pane-${var.user_id} --zone=${var.zone} --project=${var.project_id} --tunnel-through-iap"
}

output "novnc_tunnel_command" {
  description = "Start IAP tunnel to access noVNC on localhost:8080"
  value       = "gcloud compute start-iap-tunnel pane-${var.user_id} 80 --local-host-port=localhost:8080 --zone=${var.zone} --project=${var.project_id}"
}

output "novnc_url" {
  description = "Open this in browser AFTER starting the IAP tunnel"
  value       = "http://localhost:8080/novnc/vnc.html?autoconnect=true&resize=scale"
}

output "setup_log_command" {
  value = "gcloud compute ssh pane-${var.user_id} --zone=${var.zone} --project=${var.project_id} --tunnel-through-iap --command='tail -f /var/log/pane-setup.log'"
}
