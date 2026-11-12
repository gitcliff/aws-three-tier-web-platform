locals {
  # The token's `sub` claim for a push to the branch, e.g. repo:acme/app:ref:refs/heads/main.
  # Matched exactly (StringEquals): pull requests, other branches, tags, forks and other
  # repositories all produce different subjects and are refused.
  github_subject = "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"

  # Policies are built with jsonencode rather than aws_iam_policy_document data sources so
  # their content is plain configuration that the native tests can assert on.
  ecr_push_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "GitHubActionsMainBranchOnly"
        Effect    = "Allow"
        Principal = { Federated = local.github_oidc_arn }
        Action    = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = local.github_subject
          }
        }
      },
    ]
  })

  ecr_push_permissions = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Registry-level login call; AWS does not support scoping it to a repository.
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        # Exactly what `docker push` needs, plus DescribeImages for the workflow's
        # "already published?" check. No pull, delete, tag-mutation or policy rights.
        Sid    = "PushToProjectRepositories"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:DescribeImages",
        ]
        Resource = sort([for repo in aws_ecr_repository.app : repo.arn])
      },
    ]
  })
}

resource "aws_iam_role" "github_ecr_push" {
  name                 = "${var.project_name}-github-ecr-push"
  description          = "Assumed by GitHub Actions (${var.github_repository}@${var.github_branch}) to push images to ECR"
  assume_role_policy   = local.ecr_push_trust_policy
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "github_ecr_push" {
  name   = "ecr-push"
  role   = aws_iam_role.github_ecr_push.id
  policy = local.ecr_push_permissions
}
