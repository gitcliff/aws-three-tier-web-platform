# Native tests for the bootstrap stack against a mocked AWS provider (nothing is created).
# They pin down the properties the Terraform pipeline's security depends on.

mock_provider "aws" {
  override_data {
    target = data.aws_caller_identity.current
    values = { account_id = "123456789012" }
  }
}

variables {
  github_repository = "acme/task-app"
}

run "state_bucket_is_private_encrypted_and_versioned" {
  command = apply

  assert {
    condition     = aws_s3_bucket.state.bucket == "task-platform-tfstate-123456789012-us-east-1"
    error_message = "Default bucket name must be <project>-tfstate-<account>-<region>."
  }

  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "State bucket must be versioned."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.state.block_public_acls,
      aws_s3_bucket_public_access_block.state.block_public_policy,
      aws_s3_bucket_public_access_block.state.ignore_public_acls,
      aws_s3_bucket_public_access_block.state.restrict_public_buckets,
    ])
    error_message = "All public access must be blocked."
  }

  assert {
    condition = alltrue([
      for r in aws_s3_bucket_server_side_encryption_configuration.state.rule :
      r.apply_server_side_encryption_by_default[0].sse_algorithm == "aws:kms" &&
      r.apply_server_side_encryption_by_default[0].kms_master_key_id == aws_kms_key.state.arn
    ])
    error_message = "State must be encrypted with the dedicated KMS key."
  }

  assert {
    condition     = aws_kms_key.state.enable_key_rotation
    error_message = "KMS key rotation must be enabled."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      s.Effect == "Deny" && s.Condition.Bool["aws:SecureTransport"] == "false"
    ])
    error_message = "Bucket policy must deny non-TLS access."
  }
}

run "plan_role_is_read_only_and_trusts_prs_and_main" {
  command = apply

  assert {
    condition = (
      toset(jsondecode(aws_iam_role.terraform_plan.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"])
      == toset(["repo:acme/task-app:pull_request", "repo:acme/task-app:ref:refs/heads/main"])
    )
    error_message = "Plan role must trust exactly PRs and pushes to main of this repository."
  }

  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_iam_role_policy.terraform_plan.policy).Statement : [
        for a in flatten([s.Action]) :
        # Match the verb right after the service prefix, e.g. ecr:TagResource but not
        # ecr:ListTagsForResource.
        s.Effect == "Allow" && !can(regex("^[a-z0-9-]+:(Put|Create|Delete|Update|Tag|Untag|Encrypt|GenerateDataKey|Attach|Detach|Pass)|\\*", a))
      ]
    ]))
    error_message = "Plan role may only hold read actions."
  }
}

run "apply_role_trusts_only_the_protected_environment" {
  command = apply

  assert {
    condition = (
      jsondecode(aws_iam_role.terraform_apply.assume_role_policy).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"]
      == ["repo:acme/task-app:environment:infrastructure"]
    )
    error_message = "Apply role must trust only jobs in the 'infrastructure' environment."
  }

  assert {
    condition     = !can(jsondecode(aws_iam_role.terraform_apply.assume_role_policy).Statement[0].Condition.StringLike)
    error_message = "No wildcard matching in trust policies."
  }
}

run "apply_role_cannot_escalate_privileges" {
  command = apply

  # Creating roles or granting them permissions requires the boundary.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.terraform_apply.policy).Statement :
      s.Condition.StringEquals["iam:PermissionsBoundary"] == aws_iam_policy.app_role_boundary.arn
      if s.Effect == "Allow" && length(setintersection(toset(flatten([s.Action])), toset(["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"]))) > 0
    ])
    error_message = "CreateRole/PutRolePolicy/PutRolePermissionsBoundary must require the boundary."
  }

  assert {
    condition = alltrue(flatten([
      for s in jsondecode(aws_iam_role_policy.terraform_apply.policy).Statement : [
        for a in flatten([s.Action]) : !contains(["iam:AttachRolePolicy", "iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:PassRole"], a)
      ] if s.Effect == "Allow"
    ]))
    error_message = "Apply role must not attach managed policies, create policies or pass roles."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.terraform_apply.policy).Statement :
      s.Effect == "Deny" && s.Action == "iam:DeleteRolePermissionsBoundary"
    ])
    error_message = "Removing a permissions boundary must be explicitly denied."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.terraform_apply.policy).Statement :
      s.Effect == "Deny" && s.Action == "iam:*" &&
      contains(s.Resource, aws_iam_policy.app_role_boundary.arn) &&
      contains(s.Resource, "arn:aws:iam::123456789012:role/task-platform-terraform-apply")
    ])
    error_message = "The pipeline must be denied any change to its own roles and the boundary."
  }

  # Only listing OIDC providers and ECR login-style calls may use Resource "*" in an Allow.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.terraform_apply.policy).Statement :
      s.Resource != "*" || s.Effect == "Deny" || s.Action == "iam:ListOpenIDConnectProviders"
    ])
    error_message = "No broad Resource \"*\" allows beyond iam:ListOpenIDConnectProviders."
  }
}

run "pipeline_state_access_is_limited_to_the_ecr_stack" {
  command = apply

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.terraform_apply.policy).Statement :
      toset(s.Resource) == toset([
        "arn:aws:s3:::task-platform-tfstate-123456789012-us-east-1/task-platform/ecr/terraform.tfstate",
        "arn:aws:s3:::task-platform-tfstate-123456789012-us-east-1/task-platform/ecr/terraform.tfstate.tflock",
      ])
      if contains(["ReadState", "WriteState"], s.Sid)
    ])
    error_message = "State permissions must cover only the ECR stack's state and lock file."
  }

  assert {
    condition     = !strcontains(aws_iam_role_policy.terraform_apply.policy, "bootstrap")
    error_message = "Pipeline roles must not reach the bootstrap stack's state."
  }
}

run "boundary_allows_only_ecr_push" {
  command = apply

  assert {
    condition = toset(flatten([for s in jsondecode(aws_iam_policy.app_role_boundary.policy).Statement : s.Action])) == toset([
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
      "ecr:PutImage",
      "ecr:DescribeImages",
    ])
    error_message = "The boundary must allow ECR push actions and nothing else."
  }
}

run "custom_names" {
  command = plan

  variables {
    state_bucket_name        = "my-state"
    github_apply_environment = "prod-infra"
  }

  assert {
    condition     = aws_s3_bucket.state.bucket == "my-state"
    error_message = "state_bucket_name must override the default."
  }

  assert {
    condition = strcontains(
      aws_iam_role.terraform_apply.description, "prod-infra"
    )
    error_message = "Apply role must follow the configured environment."
  }
}

run "rejects_wildcard_environment" {
  command = plan

  variables {
    github_apply_environment = "*"
  }

  expect_failures = [var.github_apply_environment]
}
