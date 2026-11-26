variable "name" {
  description = "Name prefix for every resource, e.g. \"task-platform-prod\"."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,40}[a-z0-9]$", var.name))
    error_message = "name must be 3-42 lowercase letters, digits or hyphens."
  }
}

variable "vpc_cidr" {
  description = "IPv4 CIDR of the VPC. Must be a /16; subnets are carved from it deterministically."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr)) && endswith(var.vpc_cidr, "/16")
    error_message = "vpc_cidr must be a valid /16 IPv4 CIDR block."
  }
}

variable "availability_zones" {
  description = "Exactly three AZ names. Defaults to the first three available AZs of the region."
  type        = list(string)
  default     = null

  validation {
    condition     = var.availability_zones == null || length(distinct(coalesce(var.availability_zones, []))) == 3
    error_message = "availability_zones must list exactly three distinct AZs."
  }
}

variable "nat_gateway_mode" {
  description = <<-EOT
    "per_az": one NAT gateway per AZ; an AZ failure only affects that AZ (production).
    "single": one NAT gateway shared by all AZs; about a third of the cost, but a single
    point of failure for outbound traffic (non-production).
  EOT
  type        = string
  default     = "per_az"

  validation {
    condition     = contains(["per_az", "single"], var.nat_gateway_mode)
    error_message = "nat_gateway_mode must be \"per_az\" or \"single\"."
  }
}

variable "interface_endpoints" {
  description = <<-EOT
    AWS services reached through interface VPC endpoints from the app subnets, so the traffic
    never leaves the AWS network and keeps working if NAT is impaired. Each costs roughly
    USD 22/month across three AZs. Set to [] to rely on NAT only.
  EOT
  type        = set(string)
  default     = ["ecr.api", "ecr.dkr", "logs", "secretsmanager"]
}

variable "flow_logs_traffic_type" {
  description = "VPC flow log capture: REJECT (blocked traffic, cheap), ACCEPT or ALL."
  type        = string
  default     = "REJECT"

  validation {
    condition     = contains(["ACCEPT", "REJECT", "ALL"], var.flow_logs_traffic_type)
    error_message = "flow_logs_traffic_type must be ACCEPT, REJECT or ALL."
  }
}

variable "flow_logs_retention_days" {
  description = "Retention of the flow log group, in days."
  type        = number
  default     = 90

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.flow_logs_retention_days)
    error_message = "flow_logs_retention_days must be a CloudWatch Logs retention value (e.g. 30, 90, 365)."
  }
}

variable "logs_kms_key_arn" {
  description = "KMS key used to encrypt the flow log group. Null uses CloudWatch's default encryption."
  type        = string
  default     = null
}

variable "iam_permissions_boundary_arn" {
  description = "Permissions boundary for the flow-logs IAM role (required when created by the pipeline)."
  type        = string
  default     = null
}

variable "tags" {
  description = "Extra tags for every resource (provider default_tags are applied as well)."
  type        = map(string)
  default     = {}
}
