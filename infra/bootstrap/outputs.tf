# Values to copy into GitHub repository variables (Settings → Secrets and variables →
# Actions → Variables). None of them are secrets.

output "tf_state_bucket" {
  description = "GitHub variable TF_STATE_BUCKET."
  value       = aws_s3_bucket.state.id
}

output "tf_plan_role_arn" {
  description = "GitHub variable TF_PLAN_ROLE_ARN."
  value       = aws_iam_role.terraform_plan.arn
}

output "tf_apply_role_arn" {
  description = "GitHub variable TF_APPLY_ROLE_ARN."
  value       = aws_iam_role.terraform_apply.arn
}

output "app_role_permissions_boundary_arn" {
  description = "GitHub variable TF_PERMISSIONS_BOUNDARY_ARN (input to the ECR stack)."
  value       = aws_iam_policy.app_role_boundary.arn
}

output "aws_region" {
  description = "GitHub variable AWS_REGION."
  value       = var.aws_region
}

output "ecr_state_key" {
  description = "State key of the ECR stack (fixed in the workflow)."
  value       = local.ecr_state_key
}

output "bootstrap_state_key" {
  description = "Key to use if you migrate this stack's own state into the bucket."
  value       = local.bootstrap_state_key
}

output "github_oidc_provider_arn" {
  description = "Shared GitHub OIDC provider."
  value       = aws_iam_openid_connect_provider.github.arn
}
