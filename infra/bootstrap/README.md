# Bootstrap stack (applied once, by an administrator)

Creates what the Terraform pipeline itself depends on. CI validates and tests this stack
but **never plans or applies it**, because it defines the pipeline's own permissions and a
pipeline must not be able to widen those.

| Resource                                 | Purpose                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| S3 bucket + KMS key                      | Remote state: versioned, KMS-encrypted (key rotation on), private, TLS-only          |
| `aws_iam_openid_connect_provider.github` | GitHub OIDC provider, shared with the ECR stack's image push role                    |
| `task-platform-terraform-plan` role      | **Read-only.** Trusted for PRs from this repo and pushes to `main`                   |
| `task-platform-terraform-apply` role     | Changes the ECR stack. Trusted **only** for jobs in the `infrastructure` environment |
| `task-platform-app-role-boundary` policy | Permissions boundary every pipeline-created role must carry                          |

## Why the apply role cannot escalate privileges

The apply role must be able to create the image push role. Unrestricted, "can create IAM
roles" amounts to "can become administrator", so it is constrained in layers:

1. `iam:CreateRole`, `iam:PutRolePolicy` and `iam:PutRolePermissionsBoundary` are allowed
   only when the request attaches `task-platform-app-role-boundary`.
2. A boundary caps a role's effective permissions. The boundary allows only ECR push to
   `task-platform/*`, so even a role given `"Action": "*"` can do nothing more.
3. Removing a boundary, attaching managed policies, creating policy versions and
   `iam:PassRole` are not allowed (the first is explicitly denied).
4. Any IAM action on the two pipeline roles or the boundary policy is explicitly denied.
5. Only roles named `task-platform-github-*`, repositories `task-platform/*` and the ECR
   stack's own state object are in scope. The bootstrap state is unreachable.

The tests in `tests/bootstrap.tftest.hcl` check the policy structure, and the decisions were
confirmed with the AWS IAM policy simulator. For example, `CreateRole` with no boundary or
with `AdministratorAccess` as the boundary is denied, and an `"Action": "*"` policy under the
boundary can still only push images.

## Apply

Use an IAM administrator, not the account root user.

```bash
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # set github_repository
terraform init
terraform plan -out=bootstrap.tfplan           # expect 15 to add
terraform apply bootstrap.tfplan
terraform output
```

### Move this stack's own state into the bucket (recommended)

The first apply has to use local state. Afterwards:

```bash
cat > backend.tf <<'EOF'
terraform {
  backend "s3" {}
}
EOF
terraform init -migrate-state \
  -backend-config="bucket=$(terraform output -raw tf_state_bucket)" \
  -backend-config="key=$(terraform output -raw bootstrap_state_key)" \
  -backend-config="region=$(terraform output -raw aws_region)" \
  -backend-config="use_lockfile=true"
rm terraform.tfstate terraform.tfstate.backup   # only after the migration succeeded
```

Commit `backend.tf`, but not the values; keep them in a git-ignored `backend.hcl` if you prefer.

## Wire up GitHub

1. **Repository variables** (Settings → Secrets and variables → Actions → Variables). These
   are identifiers, not secrets:

   | Variable                      | From output                         |
   | ----------------------------- | ----------------------------------- |
   | `AWS_REGION`                  | `aws_region`                        |
   | `TF_STATE_BUCKET`             | `tf_state_bucket`                   |
   | `TF_PLAN_ROLE_ARN`            | `tf_plan_role_arn`                  |
   | `TF_APPLY_ROLE_ARN`           | `tf_apply_role_arn`                 |
   | `TF_PERMISSIONS_BOUNDARY_ARN` | `app_role_permissions_boundary_arn` |

2. **Environment** (Settings → Environments → New environment → `infrastructure`):
   - **Required reviewers**: at least one person other than the usual author.
   - **Deployment branches and tags**: selected branches → `main` only.
   - Optionally **prevent self-review**.

   The apply role trusts only tokens issued to jobs in this environment, so these
   protection rules are what gate every infrastructure change.

3. Push a change under `infra/` (or run the **Terraform** workflow manually). The first apply
   creates the ECR repositories and the image push role; set `AWS_ROLE_ARN` to the
   `github_actions_role_arn` output shown in the apply job's summary to enable image
   publishing in the CI/CD workflow.

## Changing this stack later

Edit, open a PR (CI runs the tests), merge, then as an administrator:
`terraform plan -out=bootstrap.tfplan`, review, `terraform apply bootstrap.tfplan`.
