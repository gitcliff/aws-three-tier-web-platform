# Native tests against a mocked AWS provider (nothing is created). `command = apply` makes
# computed IDs available so routing between resources can be checked.

mock_provider "aws" {
  override_data {
    target = data.aws_availability_zones.available
    values = { names = ["us-east-1c", "us-east-1a", "us-east-1b", "us-east-1d"] }
  }
  override_data {
    target = data.aws_region.current
    values = { region = "us-east-1" }
  }
  override_data {
    target = data.aws_caller_identity.current
    values = { account_id = "123456789012" }
  }
  # The provider validates ARN syntax; mocked values must look like ARNs.
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:/aws/vpc/task-platform-test/flow-logs" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/task-platform-test-vpc-flow-logs" }
  }
}

variables {
  name = "task-platform-test"
}

run "nine_subnets_across_three_azs" {
  command = apply

  assert {
    # tolist(): a list never equals a tuple literal in Terraform, even with equal elements.
    condition     = output.availability_zones == tolist(["us-east-1a", "us-east-1b", "us-east-1c"])
    error_message = "Should use the first three available AZs (sorted)."
  }

  assert {
    condition = (
      length(aws_subnet.public) == 3 && length(aws_subnet.app) == 3 && length(aws_subnet.db) == 3 &&
      length(distinct([for s in aws_subnet.public : s.availability_zone])) == 3 &&
      length(distinct([for s in aws_subnet.app : s.availability_zone])) == 3 &&
      length(distinct([for s in aws_subnet.db : s.availability_zone])) == 3
    )
    error_message = "Each tier needs one subnet in each of three distinct AZs."
  }

  assert {
    condition = (
      [for az in output.availability_zones : aws_subnet.public[az].cidr_block] == ["10.0.0.0/24", "10.0.1.0/24", "10.0.2.0/24"] &&
      [for az in output.availability_zones : aws_subnet.app[az].cidr_block] == ["10.0.16.0/20", "10.0.32.0/20", "10.0.48.0/20"] &&
      [for az in output.availability_zones : aws_subnet.db[az].cidr_block] == ["10.0.64.0/24", "10.0.65.0/24", "10.0.66.0/24"]
    )
    error_message = "Subnet CIDRs must follow the documented layout."
  }

  assert {
    condition = alltrue(concat(
      [for s in aws_subnet.public : !s.map_public_ip_on_launch],
      [for s in aws_subnet.app : !s.map_public_ip_on_launch],
      [for s in aws_subnet.db : !s.map_public_ip_on_launch],
    ))
    error_message = "No subnet may auto-assign public IPs."
  }
}

run "routing_per_tier" {
  command = apply

  assert {
    condition     = aws_route.public_internet.gateway_id == aws_internet_gateway.this.id && aws_route.public_internet.destination_cidr_block == "0.0.0.0/0"
    error_message = "Public subnets must route to the internet gateway."
  }

  assert {
    condition = alltrue([
      for az, r in aws_route.app_outbound :
      r.nat_gateway_id == aws_nat_gateway.this[az].id && r.gateway_id == null
    ])
    error_message = "Each app subnet must route outbound through the NAT in its own AZ, never the IGW."
  }

  assert {
    condition = alltrue([
      for az, a in aws_route_table_association.app : a.route_table_id == aws_route_table.app[az].id
    ])
    error_message = "Each app subnet must use its own AZ's route table."
  }

  # Isolated DB tier: no explicit route anywhere targets the DB route table.
  assert {
    condition = alltrue(concat(
      [aws_route.public_internet.route_table_id != aws_route_table.db.id],
      [for r in aws_route.app_outbound : r.route_table_id != aws_route_table.db.id],
    ))
    error_message = "The DB route table must have no routes beyond the VPC."
  }

  assert {
    condition     = toset([for a in aws_route_table_association.db : a.route_table_id]) == toset([aws_route_table.db.id])
    error_message = "All DB subnets must use the isolated route table."
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 3 && alltrue([for az, n in aws_nat_gateway.this : n.subnet_id == aws_subnet.public[az].id])
    error_message = "per_az mode needs one NAT gateway in each public subnet."
  }
}

run "endpoints_flow_logs_and_default_sg" {
  command = apply

  assert {
    condition     = toset(keys(aws_vpc_endpoint.interface)) == toset(["ecr.api", "ecr.dkr", "logs", "secretsmanager"])
    error_message = "Default interface endpoints: ECR API, ECR Docker, Logs, Secrets Manager."
  }

  assert {
    condition = alltrue([
      for e in aws_vpc_endpoint.interface :
      e.private_dns_enabled && toset(e.subnet_ids) == toset([for s in aws_subnet.app : s.id])
    ])
    error_message = "Interface endpoints must use private DNS and live in the app subnets."
  }

  assert {
    condition     = aws_vpc_endpoint.s3.vpc_endpoint_type == "Gateway" && toset(aws_vpc_endpoint.s3.route_table_ids) == toset([for rt in aws_route_table.app : rt.id])
    error_message = "S3 gateway endpoint must be attached to the app route tables."
  }

  assert {
    condition = (
      toset([for r in aws_vpc_security_group_ingress_rule.endpoints_https : r.cidr_ipv4]) == toset(["10.0.16.0/20", "10.0.32.0/20", "10.0.48.0/20"]) &&
      alltrue([for r in aws_vpc_security_group_ingress_rule.endpoints_https : r.from_port == 443 && r.to_port == 443])
    )
    error_message = "Endpoints may only accept HTTPS from the app subnets."
  }

  assert {
    condition     = length(aws_default_security_group.this.ingress) == 0 && length(aws_default_security_group.this.egress) == 0
    error_message = "The default security group must have no rules."
  }

  assert {
    condition     = aws_flow_log.this.traffic_type == "REJECT" && aws_flow_log.this.log_destination == aws_cloudwatch_log_group.flow_logs.arn
    error_message = "Flow logs must capture rejected traffic into the module's log group."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.flow_logs.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "123456789012"
    )
    error_message = "Flow-logs role trust must be restricted to this account (confused deputy)."
  }
}

run "single_nat_for_non_production" {
  command = apply

  variables {
    nat_gateway_mode    = "single"
    interface_endpoints = []
  }

  assert {
    condition     = length(aws_nat_gateway.this) == 1
    error_message = "single mode creates exactly one NAT gateway."
  }

  assert {
    condition     = length(distinct([for r in aws_route.app_outbound : r.nat_gateway_id])) == 1
    error_message = "All app subnets must share the single NAT gateway."
  }

  assert {
    condition     = length(aws_vpc_endpoint.interface) == 0 && length(aws_security_group.endpoints) == 0
    error_message = "No interface endpoints (or their security group) when none are requested."
  }

  assert {
    condition     = output.vpc_endpoints_security_group_id == null
    error_message = "Endpoint SG output must be null without endpoints."
  }
}

run "explicit_azs_and_custom_cidr" {
  command = plan

  variables {
    vpc_cidr           = "172.20.0.0/16"
    availability_zones = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
  }

  assert {
    condition     = aws_subnet.app["eu-west-1b"].cidr_block == "172.20.32.0/20" && aws_subnet.db["eu-west-1c"].cidr_block == "172.20.66.0/24"
    error_message = "Subnets must be carved from the configured CIDR in the given AZs."
  }
}

run "rejects_non_16_cidr" {
  command = plan
  variables {
    vpc_cidr = "10.0.0.0/20"
  }
  expect_failures = [var.vpc_cidr]
}

run "rejects_two_azs" {
  command = plan
  variables {
    availability_zones = ["us-east-1a", "us-east-1b"]
  }
  expect_failures = [var.availability_zones]
}

run "rejects_unknown_nat_mode" {
  command = plan
  variables {
    nat_gateway_mode = "none"
  }
  expect_failures = [var.nat_gateway_mode]
}
