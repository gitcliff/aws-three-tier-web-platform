variable "aws_region" {
  description = "AWS region for the ECR repositories. Must match the AWS_REGION GitHub variable."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix for resource names, e.g. ECR repositories become <project_name>/backend."
  type        = string
  default     = "task-platform"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}[a-z0-9]$", var.project_name))
    error_message = "project_name must be 3-32 lowercase letters, digits or hyphens."
  }
}

variable "github_repository" {
  description = "GitHub repository allowed to push images, as \"owner/name\"."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.github_repository))
    error_message = "github_repository must look like \"owner/name\"."
  }
}

variable "github_branch" {
  description = "The only branch whose workflow runs may assume the push role."
  type        = string
  default     = "main"

  validation {
    condition     = length(var.github_branch) > 0 && !strcontains(var.github_branch, "*")
    error_message = "github_branch must be an exact branch name; wildcards would widen the trust policy."
  }
}

variable "ecr_repositories" {
  description = "Component names that get an ECR repository each (<project_name>/<component>)."
  type        = set(string)
  default     = ["backend", "frontend"]
}

variable "image_retention_count" {
  description = "Number of most recent images to keep per repository; older ones are expired."
  type        = number
  default     = 30

  validation {
    condition     = var.image_retention_count >= 5 && var.image_retention_count <= 1000
    error_message = "image_retention_count must be between 5 and 1000."
  }
}

variable "permissions_boundary_arn" {
  description = <<-EOT
    Permissions boundary attached to the push role (output app_role_permissions_boundary_arn
    of infra/bootstrap). The Terraform apply role can only create roles that carry it.
  EOT
  type        = string

  validation {
    condition     = can(regex("^arn:aws[a-z-]*:iam::[0-9]{12}:policy/.+$", var.permissions_boundary_arn))
    error_message = "permissions_boundary_arn must be an IAM policy ARN."
  }
}
