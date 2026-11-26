# Three-tier VPC across two Availability Zones:
#
#   public  /24 ×2  ALB and NAT gateways; route 0.0.0.0/0 → internet gateway
#   app     /20 ×2  ECS Fargate tasks (no public IPs); route 0.0.0.0/0 → NAT in the same AZ
#   db      /24 ×2  RDS only; no route beyond the VPC at all
#
# Subnet CIDRs are derived from the VPC CIDR with cidrsubnet(), so they are deterministic
# and never overlap:  public 10.0.0-1.0/24 · app 10.0.16.0/20-10.0.32.0/20 · db 10.0.64-65.0/24

data "aws_availability_zones" "available" {
  count = var.availability_zones == null ? 1 : 0

  state = "available"
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

locals {
  azs = var.availability_zones != null ? var.availability_zones : slice(sort(data.aws_availability_zones.available[0].names), 0, 2)

  public_subnets = { for i, az in local.azs : az => cidrsubnet(var.vpc_cidr, 8, i) }
  app_subnets    = { for i, az in local.azs : az => cidrsubnet(var.vpc_cidr, 4, i + 1) }
  db_subnets     = { for i, az in local.azs : az => cidrsubnet(var.vpc_cidr, 8, 64 + i) }

  # Which AZs host a NAT gateway, and which NAT each app subnet's traffic uses.
  nat_azs        = var.nat_gateway_mode == "per_az" ? toset(local.azs) : toset([local.azs[0]])
  nat_for_app_az = { for az in local.azs : az => var.nat_gateway_mode == "per_az" ? az : local.azs[0] }
  region         = data.aws_region.current.region
  account_id     = data.aws_caller_identity.current.account_id
  flow_log_group = "/aws/vpc/${var.name}/flow-logs"
}

# ─────────────────────────────── VPC ───────────────────────────────
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true # required for private DNS on interface endpoints

  tags = merge(var.tags, { Name = var.name })
}

# Take over the default security group and leave it with no rules, so nothing can
# accidentally rely on its permissive defaults.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-default-deny" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = var.name })
}

# ─────────────────────────────── Subnets ───────────────────────────────
resource "aws_subnet" "public" {
  for_each = local.public_subnets

  vpc_id            = aws_vpc.this.id
  availability_zone = each.key
  cidr_block        = each.value
  # Nothing launched here should get a public IP implicitly: the ALB and NAT gateways
  # have their own managed addresses.
  map_public_ip_on_launch = false

  tags = merge(var.tags, { Name = "${var.name}-public-${each.key}", Tier = "public" })
}

resource "aws_subnet" "app" {
  for_each = local.app_subnets

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = each.value
  map_public_ip_on_launch = false

  tags = merge(var.tags, { Name = "${var.name}-app-${each.key}", Tier = "app" })
}

resource "aws_subnet" "db" {
  for_each = local.db_subnets

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.key
  cidr_block              = each.value
  map_public_ip_on_launch = false

  tags = merge(var.tags, { Name = "${var.name}-db-${each.key}", Tier = "db" })
}

# ─────────────────────────────── NAT ───────────────────────────────
resource "aws_eip" "nat" {
  for_each = local.nat_azs

  domain = "vpc"

  tags = merge(var.tags, { Name = "${var.name}-nat-${each.key}" })
}

resource "aws_nat_gateway" "this" {
  for_each = local.nat_azs

  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.public[each.key].id

  tags = merge(var.tags, { Name = "${var.name}-${each.key}" })

  depends_on = [aws_internet_gateway.this]
}

# ─────────────────────────────── Routing ───────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-public", Tier = "public" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

# One route table per AZ, so each AZ's outbound traffic uses its own NAT (per_az mode).
resource "aws_route_table" "app" {
  for_each = aws_subnet.app

  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-app-${each.key}", Tier = "app" })
}

resource "aws_route" "app_outbound" {
  for_each = aws_route_table.app

  route_table_id         = each.value.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[local.nat_for_app_az[each.key]].id
}

resource "aws_route_table_association" "app" {
  for_each = aws_subnet.app

  subnet_id      = each.value.id
  route_table_id = aws_route_table.app[each.key].id
}

# Isolated: only the implicit local route. No internet gateway, no NAT.
resource "aws_route_table" "db" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-db", Tier = "db" })
}

resource "aws_route_table_association" "db" {
  for_each = aws_subnet.db

  subnet_id      = each.value.id
  route_table_id = aws_route_table.db.id
}

# ─────────────────────────────── VPC endpoints ───────────────────────────────
# S3 gateway endpoint: free, and ECR stores image layers in S3, so image pulls bypass NAT.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${local.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [for rt in aws_route_table.app : rt.id]

  tags = merge(var.tags, { Name = "${var.name}-s3" })
}

resource "aws_security_group" "endpoints" {
  count = length(var.interface_endpoints) > 0 ? 1 : 0

  name        = "${var.name}-vpc-endpoints"
  description = "HTTPS from the app subnets to interface VPC endpoints"
  vpc_id      = aws_vpc.this.id

  tags = merge(var.tags, { Name = "${var.name}-vpc-endpoints" })
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_https" {
  for_each = length(var.interface_endpoints) > 0 ? local.app_subnets : {}

  security_group_id = aws_security_group.endpoints[0].id
  description       = "HTTPS from app subnet ${each.key}"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = each.value
}

resource "aws_vpc_endpoint" "interface" {
  for_each = var.interface_endpoints

  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${local.region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  subnet_ids          = [for s in aws_subnet.app : s.id]
  security_group_ids  = [aws_security_group.endpoints[0].id]

  tags = merge(var.tags, { Name = "${var.name}-${replace(each.key, ".", "-")}" })
}

# ─────────────────────────────── Flow logs ───────────────────────────────
resource "aws_cloudwatch_log_group" "flow_logs" {
  name              = local.flow_log_group
  retention_in_days = var.flow_logs_retention_days
  kms_key_id        = var.logs_kms_key_arn

  tags = var.tags
}

resource "aws_iam_role" "flow_logs" {
  name                 = "${var.name}-vpc-flow-logs"
  description          = "Lets VPC Flow Logs write to ${local.flow_log_group}"
  permissions_boundary = var.iam_permissions_boundary_arn
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "vpc-flow-logs.amazonaws.com" }
        Action    = "sts:AssumeRole"
        # Confused-deputy protection: only flow logs in this account may use the role.
        Condition = {
          StringEquals = { "aws:SourceAccount" = local.account_id }
          ArnLike      = { "aws:SourceArn" = "arn:aws:ec2:${local.region}:${local.account_id}:vpc-flow-log/*" }
        }
      },
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "flow_logs" {
  name = "write-flow-logs"
  role = aws_iam_role.flow_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
        Resource = ["${aws_cloudwatch_log_group.flow_logs.arn}:*"]
      },
    ]
  })
}

resource "aws_flow_log" "this" {
  vpc_id                   = aws_vpc.this.id
  traffic_type             = var.flow_logs_traffic_type
  log_destination_type     = "cloud-watch-logs"
  log_destination          = aws_cloudwatch_log_group.flow_logs.arn
  iam_role_arn             = aws_iam_role.flow_logs.arn
  max_aggregation_interval = 60

  tags = merge(var.tags, { Name = var.name })
}
