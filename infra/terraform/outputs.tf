output "github_actions_role_arn" {
  description = "Set as the AWS_ROLE_ARN repository variable in GitHub."
  value       = aws_iam_role.github_ecr_push.arn
}

output "aws_region" {
  description = "Set as the AWS_REGION repository variable in GitHub."
  value       = var.aws_region
}

output "ecr_repository_names" {
  description = "ECR repository names by component (ECR_REPOSITORY_BACKEND / _FRONTEND)."
  value       = { for component, repo in aws_ecr_repository.app : component => repo.name }
}

output "ecr_repository_urls" {
  description = "Full repository URLs by component, for pulling images."
  value       = { for component, repo in aws_ecr_repository.app : component => repo.repository_url }
}

output "github_oidc_subject" {
  description = "The only OIDC subject the role trusts."
  value       = local.github_subject
}
