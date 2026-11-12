# Native tests (terraform test) against a mocked AWS provider: no credentials, no cost,
# nothing created. `command = apply` runs against the mock so computed values (ARNs) exist
# and the rendered IAM policies can be decoded and checked.

mock_provider "aws" {}

variables {
  github_repository = "acme/task-app"
}

run "creates_hardened_ecr_repositories" {
  command = apply

  assert {
    condition     = toset(keys(aws_ecr_repository.app)) == toset(["backend", "frontend"])
    error_message = "Expected one repository each for backend and frontend."
  }

  assert {
    condition     = aws_ecr_repository.app["backend"].name == "task-platform/backend"
    error_message = "Repository names must be <project_name>/<component>."
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.app : r.image_tag_mutability == "IMMUTABLE"])
    error_message = "All repositories must use immutable tags."
  }

  assert {
    condition     = alltrue([for r in aws_ecr_repository.app : r.image_scanning_configuration[0].scan_on_push])
    error_message = "All repositories must scan images on push."
  }

  assert {
    condition = alltrue([
      for p in aws_ecr_lifecycle_policy.app :
      jsondecode(p.policy).rules[1].selection.countNumber == 30
    ])
    error_message = "Lifecycle policy must keep the configured number of images (default 30)."
  }
}

run "trust_policy_admits_only_main_branch_of_this_repo" {
  command = apply

  assert {
    condition = (
      jsondecode(aws_iam_role.github_ecr_push.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"]
      == "repo:acme/task-app:ref:refs/heads/main"
    )
    error_message = "Trust policy must pin the exact repository and branch subject."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.github_ecr_push.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"]
      == "sts.amazonaws.com"
    )
    error_message = "Trust policy must require the STS audience."
  }

  assert {
    condition     = !can(jsondecode(aws_iam_role.github_ecr_push.assume_role_policy).Statement[0].Condition.StringLike)
    error_message = "Trust policy must not use wildcard (StringLike) matching."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.github_ecr_push.assume_role_policy).Statement[0].Principal.Federated
      == aws_iam_openid_connect_provider.github[0].arn
    )
    error_message = "Role must trust the GitHub OIDC provider created by this configuration."
  }

  assert {
    condition     = length(jsondecode(aws_iam_role.github_ecr_push.assume_role_policy).Statement) == 1
    error_message = "Trust policy must contain exactly one statement."
  }

  assert {
    condition     = aws_iam_openid_connect_provider.github[0].client_id_list == toset(["sts.amazonaws.com"])
    error_message = "OIDC provider must only accept the sts.amazonaws.com audience."
  }
}

run "permissions_are_push_only_and_scoped" {
  command = apply

  # Only the login call may use Resource "*".
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.github_ecr_push.policy).Statement :
      s.Resource != "*" || s.Action == "ecr:GetAuthorizationToken"
    ])
    error_message = "Only ecr:GetAuthorizationToken may target Resource \"*\"."
  }

  assert {
    condition = (
      toset(jsondecode(aws_iam_role_policy.github_ecr_push.policy).Statement[1].Resource)
      == toset([for r in aws_ecr_repository.app : r.arn])
    )
    error_message = "Push permissions must be scoped to exactly this project's repositories."
  }

  assert {
    condition = toset(jsondecode(aws_iam_role_policy.github_ecr_push.policy).Statement[1].Action) == toset([
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:DescribeImages",
    ])
    error_message = "Push statement must grant exactly the push actions, nothing more."
  }

  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_iam_role_policy.github_ecr_push.policy).Statement :
      [for a in flatten([s.Action]) : !strcontains(a, "*") && !can(regex("Delete|SetRepositoryPolicy|PutImageTagMutability|PutLifecyclePolicy", a))]
    ]))
    error_message = "No wildcard, delete or policy-changing ECR actions are allowed."
  }

  assert {
    condition     = aws_iam_role.github_ecr_push.max_session_duration == 3600
    error_message = "Role sessions must be capped at one hour."
  }
}

run "reuses_an_existing_oidc_provider" {
  command = apply

  variables {
    create_github_oidc_provider = false
  }

  override_data {
    target = data.aws_iam_openid_connect_provider.github[0]
    values = {
      arn = "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    }
  }

  assert {
    condition     = length(aws_iam_openid_connect_provider.github) == 0
    error_message = "No provider may be created when reusing an existing one."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.github_ecr_push.assume_role_policy).Statement[0].Principal.Federated
      == "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    )
    error_message = "Role must trust the existing provider."
  }
}

run "custom_branch_and_retention" {
  command = plan

  variables {
    github_branch         = "release"
    image_retention_count = 10
  }

  assert {
    condition     = output.github_oidc_subject == "repo:acme/task-app:ref:refs/heads/release"
    error_message = "Subject must follow the configured branch."
  }

  assert {
    condition = alltrue([
      for p in aws_ecr_lifecycle_policy.app : jsondecode(p.policy).rules[1].selection.countNumber == 10
    ])
    error_message = "Retention count must follow the variable."
  }
}

run "rejects_malformed_repository" {
  command = plan

  variables {
    github_repository = "not-a-repository"
  }

  expect_failures = [var.github_repository]
}

run "rejects_wildcard_branch" {
  command = plan

  variables {
    github_branch = "*"
  }

  expect_failures = [var.github_branch]
}

run "rejects_tiny_retention" {
  command = plan

  variables {
    image_retention_count = 1
  }

  expect_failures = [var.image_retention_count]
}
