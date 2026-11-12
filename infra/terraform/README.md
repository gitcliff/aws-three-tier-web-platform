# AWS infrastructure: ECR + GitHub OIDC

Creates everything the CI/CD pipeline needs to publish images, and nothing else:

| Resource                                       | Purpose                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `aws_ecr_repository.app["backend"/"frontend"]` | `task-platform/backend`, `task-platform/frontend`: immutable tags, scan on push, AES-256 |
| `aws_ecr_lifecycle_policy.app[*]`              | expire untagged layers after 1 day; keep the newest 30 images                            |
| `aws_iam_openid_connect_provider.github`       | trusts GitHub's OIDC issuer for the `sts.amazonaws.com` audience                         |
| `aws_iam_role.github_ecr_push` + inline policy | assumable only by `repo:<owner>/<repo>:ref:refs/heads/main`; push-only on the two repos  |

## Security model

- **No access keys anywhere.** GitHub Actions exchanges a short-lived OIDC token for
  temporary credentials (≤ 1 hour; the workflow asks for 15 minutes).
- **Trust is pinned exactly** (`StringEquals`, no wildcards) to this repository's `main`
  branch. Pull requests, forks, other branches, tags and other repositories produce a
  different `sub` claim and cannot assume the role.
- **Least privilege.** The role may log in to ECR (`GetAuthorizationToken`, which AWS does
  not allow scoping) and push to the two repositories, plus `DescribeImages` for the
  workflow's idempotency check. It cannot pull, delete, change tag mutability or edit
  repository or lifecycle policies.
- **Immutable tags.** An image tagged with a commit SHA can never be overwritten.

These properties are enforced by tests (`tests/ecr_oidc.tftest.hcl`) that run in CI against a
mocked AWS provider.

## Prerequisites

- Terraform `~> 1.10` (CI uses 1.15.7) and AWS provider `~> 6.0` (locked in `.terraform.lock.hcl`).
- AWS credentials for an **IAM administrator user or role, not the account root user**.
- An S3 bucket for remote state (one-time bootstrap below).

## One-time state bucket bootstrap

```bash
export AWS_REGION=us-east-1
BUCKET="tfstate-$(aws sts get-caller-identity --query Account --output text)-$AWS_REGION"
aws s3api create-bucket --bucket "$BUCKET" --region "$AWS_REGION"   # outside us-east-1 add: --create-bucket-configuration LocationConstraint=$AWS_REGION
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

Versioning lets you recover earlier state; locking uses S3's native lock file (`use_lockfile`),
so no DynamoDB table is needed.

## Deploy

```bash
cd infra/terraform
cp backend.hcl.example backend.hcl          # set bucket (and region)
cp terraform.tfvars.example terraform.tfvars # set github_repository
terraform init -backend-config=backend.hcl
terraform plan -out=tfplan                   # review: expect 7 to add on first run
terraform apply tfplan
```

If the account already has a `token.actions.githubusercontent.com` provider, set
`create_github_oidc_provider = false`; the existing provider is then looked up and reused.

Then copy the outputs into GitHub (Settings → Secrets and variables → Actions → **Variables**):

| Output                    | GitHub variable                                                                 |
| ------------------------- | ------------------------------------------------------------------------------- |
| `github_actions_role_arn` | `AWS_ROLE_ARN`                                                                  |
| `aws_region`              | `AWS_REGION`                                                                    |
| `ecr_repository_names`    | `ECR_REPOSITORY_BACKEND` / `ECR_REPOSITORY_FRONTEND` (only if not the defaults) |

The next push to `main` publishes both images as `<registry>/task-platform/<tier>:<git-sha>`.

## Local checks

```bash
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform test        # mocked AWS: no credentials needed, nothing created
```

## Rollback / teardown

- Changes: revert the commit, then `plan` and `apply`. State versions in S3 let you inspect
  what was applied before.
- Teardown: delete the images first (repositories are not force-deleted, so images are never
  lost by accident). Then run `terraform plan -destroy -out=destroy.tfplan`, review every
  resource listed, and `terraform apply destroy.tfplan`. Removing the OIDC provider affects
  any other role in the account that trusts it; set `create_github_oidc_provider = false`
  first if it is shared.
