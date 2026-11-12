# Two roles for the Terraform pipeline (.github/workflows/terraform.yml):
#
#   plan  - read-only; pull requests and pushes to the default branch
#   apply - can change the ECR stack, but only from jobs in the protected GitHub
#           environment, i.e. after a human approved the reviewed plan
#
# Both are scoped to the ECR stack's resources (repositories <project>/*, roles
# <project>-github-*) and its single state object. Neither can touch this bootstrap stack.

locals {
  trust_policy = {
    for name, subjects in { plan = local.plan_subjects, apply = local.apply_subjects } :
    name => jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect    = "Allow"
          Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
          Action    = "sts:AssumeRoleWithWebIdentity"
          Condition = {
            StringEquals = {
              "${local.github_oidc_url}:aud" = "sts.amazonaws.com"
              "${local.github_oidc_url}:sub" = subjects
            }
          }
        },
      ]
    })
  }

  # Reads needed to refresh the ECR stack's state and plan against it.
  read_statements = [
    {
      Sid      = "ReadState"
      Effect   = "Allow"
      Action   = "s3:GetObject"
      Resource = local.ecr_state_arns
    },
    {
      Sid      = "ListStateBucket"
      Effect   = "Allow"
      Action   = "s3:ListBucket"
      Resource = aws_s3_bucket.state.arn
    },
    {
      Sid      = "DecryptState"
      Effect   = "Allow"
      Action   = "kms:Decrypt"
      Resource = aws_kms_key.state.arn
    },
    {
      Sid      = "ReadEcrRepositories"
      Effect   = "Allow"
      Action   = ["ecr:DescribeRepositories", "ecr:ListTagsForResource", "ecr:GetLifecyclePolicy"]
      Resource = local.ecr_repository_arns
    },
    {
      Sid      = "ReadAppRoles"
      Effect   = "Allow"
      Action   = ["iam:GetRole", "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies"]
      Resource = local.app_role_arns
    },
    {
      Sid      = "ReadGitHubOidcProvider"
      Effect   = "Allow"
      Action   = "iam:GetOpenIDConnectProvider"
      Resource = aws_iam_openid_connect_provider.github.arn
    },
    {
      # Needed by the aws_iam_openid_connect_provider data source; not resource-scopable.
      Sid      = "ListOidcProviders"
      Effect   = "Allow"
      Action   = "iam:ListOpenIDConnectProviders"
      Resource = "*"
    },
  ]

  plan_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.read_statements
  })

  apply_policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(local.read_statements, [
      {
        # Write the state object and its S3-native lock file; nothing else in the bucket.
        Sid      = "WriteState"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = local.ecr_state_arns
      },
      {
        Sid      = "EncryptState"
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:GenerateDataKey"]
        Resource = aws_kms_key.state.arn
      },
      {
        Sid    = "ManageEcrRepositories"
        Effect = "Allow"
        Action = [
          "ecr:CreateRepository",
          "ecr:DeleteRepository",
          "ecr:TagResource",
          "ecr:UntagResource",
          "ecr:PutImageTagMutability",
          "ecr:PutImageScanningConfiguration",
          "ecr:PutLifecyclePolicy",
          "ecr:DeleteLifecyclePolicy",
        ]
        Resource = local.ecr_repository_arns
      },
      {
        Sid    = "ManageAppRoles"
        Effect = "Allow"
        Action = [
          "iam:UpdateRole",
          "iam:UpdateRoleDescription",
          "iam:UpdateAssumeRolePolicy",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:DeleteRole",
          "iam:DeleteRolePolicy",
          "iam:ListInstanceProfilesForRole",
        ]
        Resource = local.app_role_arns
      },
      {
        # Creating a role or granting it permissions requires the boundary.
        Sid      = "CreateAndGrantOnlyWithBoundary"
        Effect   = "Allow"
        Action   = ["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"]
        Resource = local.app_role_arns
        Condition = {
          StringEquals = { "iam:PermissionsBoundary" = aws_iam_policy.app_role_boundary.arn }
        }
      },
      {
        Sid      = "NeverRemoveBoundary"
        Effect   = "Deny"
        Action   = "iam:DeleteRolePermissionsBoundary"
        Resource = "*"
      },
      {
        # Belt and braces: the pipeline can never modify its own roles or the boundary.
        Sid      = "ProtectPipelineIdentity"
        Effect   = "Deny"
        Action   = "iam:*"
        Resource = concat(local.pipeline_role_arns, [aws_iam_policy.app_role_boundary.arn])
      },
    ])
  })
}

resource "aws_iam_role" "terraform_plan" {
  name                 = local.plan_role_name
  description          = "Read-only Terraform plan for ${var.github_repository} (PRs and ${var.github_branch})"
  assume_role_policy   = local.trust_policy["plan"]
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "terraform_plan" {
  name   = "terraform-plan"
  role   = aws_iam_role.terraform_plan.id
  policy = local.plan_policy
}

resource "aws_iam_role" "terraform_apply" {
  name                 = local.apply_role_name
  description          = "Terraform apply for ${var.github_repository}, environment ${var.github_apply_environment} only"
  assume_role_policy   = local.trust_policy["apply"]
  max_session_duration = 3600
}

resource "aws_iam_role_policy" "terraform_apply" {
  name   = "terraform-apply"
  role   = aws_iam_role.terraform_apply.id
  policy = local.apply_policy
}
