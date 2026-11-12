# GitHub Actions → AWS without stored credentials:
#   1. The workflow asks GitHub for a signed OIDC token describing the run (repo, ref, ...).
#   2. AWS STS verifies it against the account's GitHub identity provider and checks the
#      role's trust policy.
#   3. STS returns credentials valid for at most one hour (the workflow requests 15 minutes).
#
# The provider itself is created once by infra/bootstrap (an account holds one per URL) and
# shared by every role that trusts GitHub, so this stack only looks it up.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}
