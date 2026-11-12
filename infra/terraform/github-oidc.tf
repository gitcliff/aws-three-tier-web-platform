# GitHub Actions → AWS without stored credentials:
#   1. The workflow asks GitHub for a signed OIDC token describing the run (repo, ref, ...).
#   2. AWS STS verifies it against this identity provider and checks the role's trust policy.
#   3. STS returns credentials valid for at most one hour (the workflow requests 15 minutes).

locals {
  github_oidc_url = "https://token.actions.githubusercontent.com"
  github_oidc_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  )
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = local.github_oidc_url
  client_id_list = ["sts.amazonaws.com"]
  # No thumbprint_list: AWS validates GitHub's certificate against its own trusted CAs.
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1

  url = local.github_oidc_url
}
