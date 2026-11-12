# ECR stack: image repositories + push role

Everything the CI/CD workflow needs to publish images, and nothing else. Changes are
delivered by the **Terraform pipeline** (`.github/workflows/terraform.yml`), not applied by
hand. The prerequisites (state bucket, GitHub OIDC provider, pipeline roles, permissions
boundary) come from [`infra/bootstrap`](../bootstrap/README.md).

| Resource                                       | Purpose                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `aws_ecr_repository.app["backend"/"frontend"]` | `task-platform/backend`, `task-platform/frontend`: immutable tags, scan on push, AES-256 |
| `aws_ecr_lifecycle_policy.app[*]`              | expire untagged layers after 1 day; keep the newest 30 images                            |
| `aws_iam_role.github_ecr_push` + inline policy | assumable only by `repo:<owner>/<repo>:ref:refs/heads/main`; push-only on the two repos  |

## Security model

- **No access keys anywhere.** GitHub Actions exchanges a short-lived OIDC token for
  temporary credentials (≤ 1 hour; the workflow asks for 15 minutes).
- **Trust is pinned exactly** (`StringEquals`, no wildcards) to this repository's `main`
  branch. Pull requests, forks, other branches, tags and other repositories cannot assume it.
- **Least privilege, enforced twice.** The inline policy grants only ECR login, push and
  `DescribeImages`. The role also carries the bootstrap's permissions boundary, which caps it
  at exactly that even if the inline policy were ever widened.
- **Immutable tags.** An image tagged with a commit SHA can never be overwritten.

`tests/ecr_oidc.tftest.hcl` enforces these properties against a mocked AWS provider.

## How changes are delivered

1. Edit files here and open a pull request. The Terraform workflow formats, validates and
   tests both stacks, runs Trivy, and posts a **plan** (read-only role) in the job summary.
2. Merge. The workflow plans again on `main` and saves the plan.
3. The **apply** job waits for a reviewer to approve the `infrastructure` environment, then
   applies exactly that saved plan. If anything changed state in between, Terraform rejects
   the stale plan, and the next run plans afresh.

See [docs/terraform-pipeline.md](../../docs/terraform-pipeline.md) for details.

## Inputs

In CI these come from `TF_VAR_*` environment variables, set from repository variables.

| Variable                   | Source in CI                       | Default         |
| -------------------------- | ---------------------------------- | --------------- |
| `github_repository`        | `github.repository`                | required        |
| `aws_region`               | `vars.AWS_REGION`                  | `us-east-1`     |
| `permissions_boundary_arn` | `vars.TF_PERMISSIONS_BOUNDARY_ARN` | required        |
| `project_name`             | (default)                          | `task-platform` |
| `github_branch`            | (default)                          | `main`          |
| `image_retention_count`    | (default)                          | `30`            |

## Local checks (no AWS access needed)

```bash
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
terraform test        # mocked AWS: no credentials needed, nothing created
```

Running a real `plan` locally needs `backend.hcl` and `terraform.tfvars` (copy the
`.example` files) and credentials that can read the state bucket.

## Teardown

Delete the images first (repositories are not force-deleted, so images are never lost by
accident). Then, as an administrator, run `terraform plan -destroy -out=destroy.tfplan`,
review every resource listed, and `terraform apply destroy.tfplan`. The pipeline roles
deliberately cannot destroy the state they live in.
