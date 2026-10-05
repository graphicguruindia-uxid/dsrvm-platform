export const HR_OPENAPI_SPEC = {
  openapi: "3.0.3",
  info: {
    title: "DSRVM HR Automation API",
    version: "0.2.0",
    description:
      "AI-powered candidate intake, screening, human-in-the-loop review, and audit trail for HR automation.",
  },
  servers: [{ url: "/", description: "Current server" }],
  paths: {
    "/health": {
      get: {
        operationId: "health",
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { status: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/roles": {
      get: {
        operationId: "listRoles",
        summary: "List all role profiles",
        responses: {
          "200": {
            description: "List of roles",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    roles: {
                      type: "array",
                      items: { $ref: "#/components/schemas/RoleProfile" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createRole",
        summary: "Create a new role profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateRoleInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Role created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RoleProfile" },
              },
            },
          },
          "400": { description: "Invalid role payload" },
        },
      },
    },
    "/api/roles/{id}": {
      put: {
        operationId: "updateRole",
        summary: "Update an existing role profile",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateRoleInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Role updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RoleProfile" },
              },
            },
          },
          "400": { description: "Invalid role payload" },
          "404": { description: "Role not found" },
        },
      },
    },
    "/api/scorecards/{id}": {
      patch: {
        operationId: "updateScorecard",
        summary: "Update a scorecard (reviewer name and/or answers)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateScorecardInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Scorecard updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Scorecard" },
              },
            },
          },
          "400": { description: "Invalid scorecard payload" },
          "404": { description: "Scorecard not found" },
        },
      },
    },
    "/api/candidates": {
      get: {
        operationId: "listCandidates",
        summary: "List all candidates",
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "List of candidates",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    candidates: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Candidate" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createCandidate",
        summary: "Create and screen a candidate",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCandidateInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Candidate created and screened",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Candidate" },
              },
            },
          },
        },
      },
    },
    "/api/candidates/{id}": {
      get: {
        operationId: "getCandidate",
        summary: "Get a candidate by ID",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Candidate details",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Candidate" },
              },
            },
          },
          "404": { description: "Candidate not found" },
        },
      },
    },
    "/api/candidates/{id}/notice": {
      post: {
        operationId: "discloseNotice",
        summary: "Disclose AI notice to a candidate",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Notice disclosed" },
          "409": { description: "Notice already disclosed" },
        },
      },
    },
    "/api/candidates/{id}/review": {
      post: {
        operationId: "reviewCandidate",
        summary: "Approve or reject a candidate",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ReviewInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Candidate reviewed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Candidate" },
              },
            },
          },
        },
      },
    },
    "/api/candidates/{id}/dispute": {
      post: {
        operationId: "raiseDispute",
        summary: "Raise a dispute for a candidate",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { note: { type: "string" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Dispute raised",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Candidate" },
              },
            },
          },
        },
      },
    },
    "/api/audit": {
      get: {
        operationId: "auditLog",
        summary: "Get the audit log",
        responses: {
          "200": {
            description: "Audit events",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    events: {
                      type: "array",
                      items: { $ref: "#/components/schemas/AuditEvent" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/retention/cleanup": {
      post: {
        operationId: "retentionCleanup",
        summary: "Run data retention cleanup",
        responses: {
          "200": {
            description: "Cleanup counts",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RetentionCleanupCounts" },
              },
            },
          },
        },
      },
    },
    "/api/telemetry": {
      get: {
        operationId: "telemetry",
        summary: "Get telemetry report",
        responses: {
          "200": {
            description: "Telemetry report",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/tenants/{id}/settings": {
      get: {
        operationId: "getTenantSettings",
        summary:
          "Get tenant settings (workflow stages, residency, AI compliance mode)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Tenant settings",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    settings: { $ref: "#/components/schemas/TenantSettings" },
                  },
                },
              },
            },
          },
          "404": { description: "Tenant not found" },
        },
      },
      put: {
        operationId: "updateTenantSettings",
        summary: "Update tenant settings",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateTenantSettingsInput",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated tenant",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Tenant" },
              },
            },
          },
          "400": { description: "Invalid settings payload" },
          "404": { description: "Tenant not found" },
        },
      },
    },
    "/api/user-access": {
      get: {
        operationId: "listUserAccess",
        summary: "List user access for the current tenant",
        responses: {
          "200": {
            description: "Users with access",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: { $ref: "#/components/schemas/UserAccess" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createUserAccess",
        summary: "Grant a user access to the current tenant",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateUserAccessInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Access granted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserAccess" },
              },
            },
          },
          "400": { description: "Invalid access payload" },
        },
      },
    },
    "/api/user-access/{id}": {
      put: {
        operationId: "updateUserAccess",
        summary: "Update a user's role",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateUserAccessInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated user",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UserAccess" },
              },
            },
          },
          "400": { description: "Invalid role" },
          "404": { description: "User not found" },
        },
      },
      delete: {
        operationId: "deleteUserAccess",
        summary: "Revoke a user's access",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": { description: "Access revoked" },
          "404": { description: "User not found" },
        },
      },
    },
    "/api/me/access": {
      get: {
        operationId: "getUserRole",
        summary: "Get the current user's role",
        responses: {
          "200": {
            description:
              "Current role (null when the tenant has no access rows)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    role: {
                      oneOf: [{ type: "string" }, { type: "null" }],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/policies": {
      get: {
        operationId: "listPolicies",
        summary: "List policies for the current tenant",
        responses: {
          "200": {
            description: "Policies",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    policies: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Policy" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createPolicy",
        summary: "Create a policy",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreatePolicyInput" },
            },
          },
        },
        responses: {
          "201": {
            description: "Policy created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Policy" },
              },
            },
          },
          "400": { description: "Invalid policy payload" },
        },
      },
    },
    "/api/policies/{id}": {
      put: {
        operationId: "updatePolicy",
        summary: "Update a policy (content changes bump the version)",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdatePolicyInput" },
            },
          },
        },
        responses: {
          "200": {
            description: "Updated policy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Policy" },
              },
            },
          },
          "400": { description: "Invalid policy payload" },
          "404": { description: "Policy not found" },
        },
      },
      delete: {
        operationId: "deletePolicy",
        summary: "Delete a policy",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": { description: "Policy deleted" },
          "404": { description: "Policy not found" },
        },
      },
    },
    "/api/compliance/dashboard": {
      get: {
        operationId: "complianceDashboard",
        summary: "Compliance dashboard for the current tenant",
        responses: {
          "200": {
            description: "Compliance summary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    compliance: {
                      $ref: "#/components/schemas/ComplianceCheck",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      DataResidency: {
        type: "string",
        enum: ["EU", "US", "UK", "GLOBAL"],
      },
      AiComplianceMode: {
        type: "string",
        enum: ["strict", "standard", "off"],
      },
      UserRole: {
        type: "string",
        enum: ["hr_admin", "recruiter", "executive"],
      },
      PolicyCategory: {
        type: "string",
        enum: [
          "ai_governance",
          "data_retention",
          "hiring",
          "compliance",
          "custom",
        ],
      },
      TenantSettings: {
        type: "object",
        required: [
          "workflowStages",
          "dataResidency",
          "aiComplianceMode",
          "updatedAt",
        ],
        properties: {
          workflowStages: { type: "array", items: { type: "string" } },
          dataResidency: { $ref: "#/components/schemas/DataResidency" },
          aiComplianceMode: { $ref: "#/components/schemas/AiComplianceMode" },
          updatedAt: { type: "string" },
        },
      },
      UpdateTenantSettingsInput: {
        type: "object",
        properties: {
          workflowStages: { type: "array", items: { type: "string" } },
          dataResidency: { $ref: "#/components/schemas/DataResidency" },
          aiComplianceMode: { $ref: "#/components/schemas/AiComplianceMode" },
        },
      },
      Tenant: {
        type: "object",
        required: ["id", "name", "createdAt"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          createdAt: { type: "string" },
          settings: { $ref: "#/components/schemas/TenantSettings" },
        },
      },
      UserAccess: {
        type: "object",
        required: ["id", "tenantId", "email", "role", "createdAt"],
        properties: {
          id: { type: "string" },
          tenantId: { type: "string" },
          email: { type: "string" },
          role: { $ref: "#/components/schemas/UserRole" },
          createdAt: { type: "string" },
        },
      },
      CreateUserAccessInput: {
        type: "object",
        required: ["email", "role"],
        properties: {
          email: { type: "string" },
          role: { $ref: "#/components/schemas/UserRole" },
        },
      },
      UpdateUserAccessInput: {
        type: "object",
        required: ["role"],
        properties: {
          role: { $ref: "#/components/schemas/UserRole" },
        },
      },
      Policy: {
        type: "object",
        required: [
          "id",
          "tenantId",
          "title",
          "category",
          "content",
          "version",
          "active",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string" },
          tenantId: { type: "string" },
          title: { type: "string" },
          category: { $ref: "#/components/schemas/PolicyCategory" },
          content: { type: "string" },
          version: { type: "integer" },
          active: { type: "boolean" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      CreatePolicyInput: {
        type: "object",
        required: ["title", "category", "content"],
        properties: {
          title: { type: "string" },
          category: { $ref: "#/components/schemas/PolicyCategory" },
          content: { type: "string" },
        },
      },
      UpdatePolicyInput: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { $ref: "#/components/schemas/PolicyCategory" },
          content: { type: "string" },
          active: { type: "boolean" },
        },
      },
      ComplianceCheck: {
        type: "object",
        required: [
          "policiesActive",
          "policiesTotal",
          "complianceMode",
          "dataResidency",
          "aiDisclosureRate",
          "disputesOpen",
          "disputesResolved",
          "workflowStages",
          "flags",
        ],
        properties: {
          policiesActive: { type: "integer" },
          policiesTotal: { type: "integer" },
          complianceMode: { $ref: "#/components/schemas/AiComplianceMode" },
          dataResidency: { $ref: "#/components/schemas/DataResidency" },
          aiDisclosureRate: { type: "number" },
          disputesOpen: { type: "integer" },
          disputesResolved: { type: "integer" },
          workflowStages: { type: "array", items: { type: "string" } },
          flags: { type: "array", items: { type: "string" } },
        },
      },
      RoleProfile: {
        type: "object",
        required: ["id", "title", "requirements", "niceToHave", "createdAt"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          niceToHave: { type: "array", items: { type: "string" } },
          createdAt: { type: "string" },
          skills: { type: "array", items: { type: "string" } },
          experienceMinYears: { type: "integer", minimum: 0, maximum: 60 },
          experienceMaxYears: { type: "integer", minimum: 0, maximum: 60 },
          budgetMin: { type: "number", minimum: 0 },
          budgetMax: { type: "number", minimum: 0 },
          budgetCurrency: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      CreateRoleInput: {
        type: "object",
        required: ["title", "requirements"],
        properties: {
          title: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          niceToHave: { type: "array", items: { type: "string" } },
          skills: {
            oneOf: [
              { type: "array", items: { type: "string" } },
              { type: "string" },
            ],
          },
          experienceMinYears: { type: "integer", minimum: 0, maximum: 60 },
          experienceMaxYears: { type: "integer", minimum: 0, maximum: 60 },
          budgetMin: { type: "number", minimum: 0 },
          budgetMax: { type: "number", minimum: 0 },
          budgetCurrency: { type: "string" },
        },
      },
      UpdateRoleInput: {
        type: "object",
        properties: {
          title: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          niceToHave: { type: "array", items: { type: "string" } },
          skills: {
            oneOf: [
              { type: "array", items: { type: "string" } },
              { type: "string" },
            ],
          },
          experienceMinYears: { type: "integer", minimum: 0, maximum: 60 },
          experienceMaxYears: { type: "integer", minimum: 0, maximum: 60 },
          budgetMin: { type: "number", minimum: 0 },
          budgetMax: { type: "number", minimum: 0 },
          budgetCurrency: { type: "string" },
        },
      },
      Scorecard: {
        type: "object",
        required: [
          "id",
          "candidateId",
          "reviewerId",
          "reviewerName",
          "answers",
          "overallScore",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string" },
          candidateId: { type: "string" },
          reviewerId: { type: "string" },
          reviewerName: { type: "string" },
          answers: {
            type: "array",
            items: { $ref: "#/components/schemas/ScorecardAnswer" },
          },
          overallScore: { type: "number" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      ScorecardAnswer: {
        type: "object",
        required: ["questionId", "score"],
        properties: {
          questionId: { type: "string" },
          score: { type: "integer", minimum: 1, maximum: 5 },
          comment: { type: "string" },
        },
      },
      UpdateScorecardInput: {
        type: "object",
        properties: {
          reviewerName: { type: "string" },
          answers: {
            type: "array",
            items: { $ref: "#/components/schemas/ScorecardAnswer" },
          },
        },
      },
      Candidate: {
        type: "object",
        required: [
          "id",
          "roleId",
          "name",
          "email",
          "resumeText",
          "status",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string" },
          roleId: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          resumeText: { type: "string" },
          status: { type: "string" },
          screening: { $ref: "#/components/schemas/ScreeningResult" },
          review: { $ref: "#/components/schemas/ReviewDecision" },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
      },
      CreateCandidateInput: {
        type: "object",
        required: ["roleId", "name", "email", "resumeText"],
        properties: {
          roleId: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          resumeText: { type: "string" },
        },
      },
      ScreeningResult: {
        type: "object",
        properties: {
          score: { type: "number" },
          recommendation: { type: "string" },
          summary: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          flags: { type: "array", items: { type: "string" } },
          provider: { type: "string" },
          model: { type: "string" },
          screenedAt: { type: "string" },
        },
      },
      ReviewDecision: {
        type: "object",
        properties: {
          approved: { type: "boolean" },
          reviewer: { type: "string" },
          note: { type: "string" },
          decidedAt: { type: "string" },
        },
      },
      ReviewInput: {
        type: "object",
        required: ["approved", "reviewer"],
        properties: {
          approved: { type: "boolean" },
          reviewer: { type: "string" },
          note: { type: "string" },
        },
      },
      AuditEvent: {
        type: "object",
        properties: {
          id: { type: "string" },
          candidateId: { type: "string" },
          action: { type: "string" },
          detail: { type: "object" },
          at: { type: "string" },
        },
      },
      RetentionCleanupCounts: {
        type: "object",
        properties: {
          candidatesDeleted: { type: "number" },
          candidatesHeld: { type: "number" },
          auditAnonymized: { type: "number" },
          outboxExpired: { type: "number" },
        },
      },
    },
  },
} as const;
