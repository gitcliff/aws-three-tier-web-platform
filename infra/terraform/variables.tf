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

variable "create_github_oidc_provider" {
  description = <<-EOT
    Create the GitHub Actions OIDC identity provider. An AWS account can hold only one
    provider per URL, so set to false when it already exists (it is then looked up).
  EOT
  type        = bool
  default     = true
}
