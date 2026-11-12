terraform {
  required_version = "~> 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # No backend block: the first apply necessarily uses local state, because the bucket does
  # not exist yet. README.md shows how to migrate this state into the bucket afterwards.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      Stack     = "bootstrap"
      ManagedBy = "terraform"
      Source    = "github.com/${var.github_repository}"
    }
  }
}

data "aws_caller_identity" "current" {}
