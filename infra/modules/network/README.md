# Module: network

Three-tier VPC across three Availability Zones. Design rationale and costs:
[docs/aws-architecture.md](../../../docs/aws-architecture.md).

| Tier   | Subnets (default CIDRs)                        | Default route                  | Used by           |
| ------ | ---------------------------------------------- | ------------------------------ | ----------------- |
| public | `10.0.0.0/24`, `10.0.1.0/24`, `10.0.2.0/24`    | internet gateway               | ALB, NAT gateways |
| app    | `10.0.16.0/20`, `10.0.32.0/20`, `10.0.48.0/20` | NAT gateway **in the same AZ** | ECS Fargate tasks |
| db     | `10.0.64.0/24`, `10.0.65.0/24`, `10.0.66.0/24` | **none** (VPC-local only)      | RDS               |

Also created:

- **Internet gateway** and NAT gateways with Elastic IPs: one per AZ, or one in `single` mode.
- **S3 gateway endpoint** (free) on the app route tables.
- **Interface endpoints**, by default for ECR API, ECR Docker, CloudWatch Logs and Secrets
  Manager. They use private DNS, sit in the app subnets and accept HTTPS only from the app
  subnets.
- **The default security group with no rules.**
- **VPC flow logs** into a CloudWatch log group (optionally KMS-encrypted), through a role
  that only flow logs from this account can assume.

No subnet assigns public IPs automatically.

## Usage

```hcl
module "network" {
  source = "../../modules/network"

  name                         = "task-platform-prod"
  vpc_cidr                     = "10.0.0.0/16"
  nat_gateway_mode             = "per_az"   # "single" for non-production
  logs_kms_key_arn             = module.cloudwatch.kms_key_arn
  iam_permissions_boundary_arn = var.permissions_boundary_arn
}
```

## Inputs

| Name                           | Default                                        | Description                         |
| ------------------------------ | ---------------------------------------------- | ----------------------------------- |
| `name`                         | required                                       | Name prefix                         |
| `vpc_cidr`                     | `10.0.0.0/16`                                  | Must be a `/16`                     |
| `availability_zones`           | first 3 available                              | Exactly three AZ names              |
| `nat_gateway_mode`             | `per_az`                                       | `per_az` (HA) or `single` (≈⅓ cost) |
| `interface_endpoints`          | `ecr.api`, `ecr.dkr`, `logs`, `secretsmanager` | `[]` disables interface endpoints   |
| `flow_logs_traffic_type`       | `REJECT`                                       | `ACCEPT`, `REJECT` or `ALL`         |
| `flow_logs_retention_days`     | `90`                                           | CloudWatch retention value          |
| `logs_kms_key_arn`             | `null`                                         | KMS key for the flow log group      |
| `iam_permissions_boundary_arn` | `null`                                         | Boundary for the flow-logs role     |
| `tags`                         | `{}`                                           | Extra tags                          |

## Outputs

`vpc_id`, `vpc_cidr`, `availability_zones`, `public_subnet_ids`, `app_subnet_ids`,
`app_subnet_cidrs`, `db_subnet_ids`, `nat_public_ips`, `vpc_endpoints_security_group_id`,
`flow_log_group_name`. Subnet lists are ordered by AZ.

## Tests

```bash
terraform init -backend=false && terraform test   # mocked AWS; nothing is created
```

The tests check:

- 9 subnets across 3 distinct AZs, with the documented CIDRs and no public IPs
- each app subnet uses the NAT in its own AZ (or the shared one in `single` mode)
- the DB tier has no route out
- endpoint placement and access
- flow logs and the default security group's lockdown
- input validation
