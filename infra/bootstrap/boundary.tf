# Permissions boundary for every role the pipeline creates.
#
# The apply role can create IAM roles, which on its own would let a malicious change grant
# itself or a new role administrator access. The apply role may only create or change a
# role's policies if this boundary is attached (see roles.tf), and a boundary caps a role's
# effective permissions at what it allows, whatever its own policies say. So the most any
# pipeline-created role can ever do is push images to this project's repositories.
resource "aws_iam_policy" "app_role_boundary" {
  name        = local.boundary_name
  description = "Maximum permissions for roles created by the ${var.project_name} Terraform pipeline"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "PushToProjectRepositories"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:DescribeImages",
        ]
        Resource = local.ecr_repository_arns
      },
    ]
  })
}
