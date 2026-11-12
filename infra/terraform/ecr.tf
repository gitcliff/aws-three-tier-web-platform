# One private repository per tier, so each can be scanned, retained and (later) pulled
# with separate permissions.
#
# Encryption at rest uses AWS-managed AES-256. A customer-managed KMS key (Trivy AWS-0033,
# LOW) adds per-key cost and a key policy to maintain, and buys little for images that
# contain no secrets. Revisit if compliance requires customer-controlled keys.
#trivy:ignore:AVD-AWS-0033
resource "aws_ecr_repository" "app" {
  for_each = var.ecr_repositories

  name = "${var.project_name}/${each.key}"

  # A tag (the git commit SHA) can never be re-pointed to different image content, so
  # what was scanned in CI is what runs, and every deployment is traceable to a commit.
  image_tag_mutability = "IMMUTABLE"

  # Basic scanning on every push, as a second opinion after the pipeline's Trivy gate.
  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Component = each.key
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each = aws_ecr_repository.app

  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Remove untagged layers left by interrupted pushes"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep the ${var.image_retention_count} most recent images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.image_retention_count
        }
        action = { type = "expire" }
      },
    ]
  })
}
