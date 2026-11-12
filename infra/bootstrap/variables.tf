variable "aws_region" {
  description = "Region for the state bucket and the managed infrastructure."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix shared with the ECR stack; scopes every permission granted here."
  type        = string
  default     = "task-platform"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-32 lowercase letters, digits or hyphens."
  }
}

variable "github_repository" {
  description = "GitHub repository whose workflows may assume the Terraform roles, as \"owner/name\"."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "github_repository must look like \"owner/name\"."
  }
}

variable "github_branch" {
  description = "Default branch; pushes to it may run a (read-only) plan."
  type        = string
  default     = "main"

  validation {
    condition     = length(var.github_branch) > 0 && !strcontains(var.github_branch, "*")
    error_message = "github_branch must be an exact branch name."
  }
}

variable "github_apply_environment" {
  description = <<-EOT
    GitHub environment whose jobs may assume the apply role. Protect it in GitHub with
    required reviewers and a "main only" deployment branch rule.
  EOT
  type        = string
  default     = "infrastructure"

  validation {
    condition     = length(var.github_apply_environment) > 0 && !strcontains(var.github_apply_environment, "*")
    error_message = "github_apply_environment must be an exact environment name."
  }
}

variable "state_bucket_name" {
  description = "Name of the Terraform state bucket. Defaults to <project>-tfstate-<account>-<region>."
  type        = string
  default     = null
}

variable "noncurrent_state_retention_days" {
  description = "How long previous versions of state files are kept for recovery."
  type        = number
  default     = 90

  validation {
    condition     = var.noncurrent_state_retention_days >= 7
    error_message = "Keep at least 7 days of state history."
  }
}
