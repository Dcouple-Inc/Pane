# foozol Cloud - GCP Terraform Configuration
# Fully self-contained: provisions a complete foozol cloud VM from scratch.
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
resource "google_compute_firewall" "foozol_iap" {
  name     = "foozol-iap-${var.user_id}"
  network  = "default"
  priority = 900

  allow {
    protocol = "tcp"
    ports    = ["22", "80"]
  }

  # GCP Identity-Aware Proxy source range — NOT the public internet
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["foozol-cloud"]

  depends_on = [google_project_service.compute]
}

# Explicitly deny all other inbound traffic to foozol VMs
resource "google_compute_firewall" "foozol_deny_all" {
  name     = "foozol-deny-all-${var.user_id}"
  network  = "default"
  priority = 1000

  deny {
    protocol = "tcp"
  }

  deny {
    protocol = "udp"
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["foozol-cloud"]

  depends_on = [google_project_service.compute]
}

# ============================================================
# Cloud NAT — outbound internet for VM without a public IP
# Required for apt-get, npm install, downloading foozol, etc.
# ============================================================

resource "google_compute_router" "foozol" {
  name    = "foozol-router-${var.user_id}"
  network = "default"
  region  = var.region

  depends_on = [google_project_service.compute]
}

resource "google_compute_router_nat" "foozol" {
  name                               = "foozol-nat-${var.user_id}"
  router                             = google_compute_router.foozol.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = false
    filter = "ALL"
  }
}

# ============================================================
# Compute Instance — NO public IP
# ============================================================

resource "google_compute_instance" "foozol" {
  name         = "foozol-${var.user_id}"
  machine_type = var.machine_type
  zone         = var.zone

  tags = ["foozol-cloud"]

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

  metadata_startup_script = file("${path.module}/../../scripts/setup-vm.sh")

  labels = {
    purpose = "foozol-cloud"
    user_id = var.user_id
  }

  # Allow stopping for cost savings
  desired_status = "RUNNING"

  lifecycle {
    ignore_changes = [desired_status]
  }

  depends_on = [google_project_service.compute, google_project_service.iap, google_compute_router_nat.foozol]
}

# ============================================================
# Snapshot Schedule (Daily Backups)
# ============================================================

resource "google_compute_resource_policy" "daily_backup" {
  name   = "foozol-backup-${var.user_id}"
  region = var.region

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "04:00"
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
  disk = google_compute_instance.foozol.name
  zone = var.zone
}

# ============================================================
# Outputs
# ============================================================

output "instance_id" {
  value = google_compute_instance.foozol.instance_id
}

output "instance_name" {
  value = google_compute_instance.foozol.name
}

output "zone" {
  value = var.zone
}

output "ssh_command" {
  description = "SSH into the VM via IAP tunnel (requires gcloud auth)"
  value       = "gcloud compute ssh foozol-${var.user_id} --zone=${var.zone} --project=${var.project_id} --tunnel-through-iap"
}

output "novnc_tunnel_command" {
  description = "Start IAP tunnel to access noVNC on localhost:8080"
  value       = "gcloud compute start-iap-tunnel foozol-${var.user_id} 80 --local-host-port=localhost:8080 --zone=${var.zone} --project=${var.project_id}"
}

output "novnc_url" {
  description = "Open this in browser AFTER starting the IAP tunnel"
  value       = "http://localhost:8080/novnc/vnc.html?autoconnect=true&resize=scale"
}

output "setup_log_command" {
  value = "gcloud compute ssh foozol-${var.user_id} --zone=${var.zone} --project=${var.project_id} --tunnel-through-iap --command='tail -f /var/log/foozol-setup.log'"
}
