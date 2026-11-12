locals {
  account_id   = data.aws_caller_identity.current.account_id
  state_bucket = coalesce(var.state_bucket_name, "${var.project_name}-tfstate-${local.account_id}-${var.aws_region}")

  # The only state object the pipeline may touch: the ECR stack. Bootstrap state (if
  # migrated into the bucket) lives under a different key the pipeline roles cannot access.
  ecr_state_key       = "${var.project_name}/ecr/terraform.tfstate"
  ecr_state_arns      = ["arn:aws:s3:::${local.state_bucket}/${local.ecr_state_key}", "arn:aws:s3:::${local.state_bucket}/${local.ecr_state_key}.tflock"]
  bootstrap_state_key = "${var.project_name}/bootstrap/terraform.tfstate"

  # Everything the ECR stack manages, expressed as ARN patterns.
  ecr_repository_arns = "arn:aws:ecr:${var.aws_region}:${local.account_id}:repository/${var.project_name}/*"
  app_role_arns       = "arn:aws:iam::${local.account_id}:role/${var.project_name}-github-*"

  # OIDC `sub` claims (exact match):
  #   - plan:  pull requests from this repository, and pushes to the default branch
  #   - apply: only jobs running in the protected GitHub environment
  github_oidc_url    = "token.actions.githubusercontent.com"
  plan_subjects      = ["repo:${var.github_repository}:pull_request", "repo:${var.github_repository}:ref:refs/heads/${var.github_branch}"]
  apply_subjects     = ["repo:${var.github_repository}:environment:${var.github_apply_environment}"]
  plan_role_name     = "${var.project_name}-terraform-plan"
  apply_role_name    = "${var.project_name}-terraform-apply"
  boundary_name      = "${var.project_name}-app-role-boundary"
  boundary_arn       = "arn:aws:iam::${local.account_id}:policy/${local.boundary_name}"
  pipeline_role_arns = ["arn:aws:iam::${local.account_id}:role/${local.plan_role_name}", "arn:aws:iam::${local.account_id}:role/${local.apply_role_name}"]
}

# ─────────────────────────── GitHub OIDC identity provider ───────────────────────────
# Shared by the Terraform roles below and the ECR push role in the ECR stack. One per account.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_url}"
  client_id_list = ["sts.amazonaws.com"]
}
