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
  },
  components: {
    schemas: {
      RoleProfile: {
        type: "object",
        required: ["id", "title", "requirements", "niceToHave", "createdAt"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          niceToHave: { type: "array", items: { type: "string" } },
          createdAt: { type: "string" },
        },
      },
      CreateRoleInput: {
        type: "object",
        required: ["title", "requirements"],
        properties: {
          title: { type: "string" },
          requirements: { type: "array", items: { type: "string" } },
          niceToHave: { type: "array", items: { type: "string" } },
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
