terraform {
  # 1.10+: S3 native state locking (use_lockfile). 1.7+: mock providers in tests.
  required_version = "~> 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Partial configuration: bucket, key and region come from backend.hcl at init time
  # (see backend.hcl.example), so no account-specific values are committed.
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
      Source    = "github.com/${var.github_repository}"
    }
  }
}
