output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "vpc_cidr" {
  description = "VPC IPv4 CIDR."
  value       = aws_vpc.this.cidr_block
}

output "availability_zones" {
  description = "The three AZs used, in order."
  value       = local.azs
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB), ordered by AZ."
  value       = [for az in local.azs : aws_subnet.public[az].id]
}

output "app_subnet_ids" {
  description = "Private app subnet IDs (ECS tasks), ordered by AZ."
  value       = [for az in local.azs : aws_subnet.app[az].id]
}

output "app_subnet_cidrs" {
  description = "Private app subnet CIDRs, ordered by AZ."
  value       = [for az in local.azs : local.app_subnets[az]]
}

output "db_subnet_ids" {
  description = "Isolated database subnet IDs (RDS subnet group), ordered by AZ."
  value       = [for az in local.azs : aws_subnet.db[az].id]
}

output "nat_public_ips" {
  description = "Elastic IPs of the NAT gateways: the source addresses of outbound traffic (for allow-lists)."
  value       = [for az in sort(tolist(local.nat_azs)) : aws_eip.nat[az].public_ip]
}

output "vpc_endpoints_security_group_id" {
  description = "Security group of the interface endpoints (null when none are configured)."
  value       = one(aws_security_group.endpoints[*].id)
}

output "flow_log_group_name" {
  description = "CloudWatch log group receiving VPC flow logs."
  value       = aws_cloudwatch_log_group.flow_logs.name
}
