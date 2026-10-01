// Generated from the operation contract.
import type { WireShape } from '../wire.js'
export const wire: Record<string, { method: string; input: WireShape; output: WireShape }> = {
  "snapshot": {
    "method": "snapshot",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "resumeCommands": {
          "kind": "value"
        },
        "externalAgentNames": {
          "kind": "value"
        },
        "projects": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "runnerEnabled": {
                "kind": "boolean"
              },
              "runnerLabels": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "gitRemote": {
                "kind": "string"
              },
              "taskHooks": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "id": {
                      "kind": "string"
                    },
                    "name": {
                      "kind": "string"
                    },
                    "enabled": {
                      "kind": "boolean"
                    },
                    "events": {
                      "kind": "array",
                      "items": {
                        "kind": "string",
                        "choices": [
                          "created",
                          "queued",
                          "held",
                          "started",
                          "stopped",
                          "review",
                          "failed",
                          "beforeComplete",
                          "completed",
                          "reopened",
                          "archived",
                          "restored",
                          "deleted"
                        ]
                      }
                    },
                    "kind": {
                      "kind": "string",
                      "choices": [
                        "agent",
                        "command"
                      ]
                    },
                    "targetKind": {
                      "kind": "string",
                      "choices": [
                        "agent",
                        "group"
                      ]
                    },
                    "targetId": {
                      "kind": "string"
                    },
                    "prompt": {
                      "kind": "string"
                    },
                    "command": {
                      "kind": "string"
                    },
                    "timeoutSeconds": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "id"
                  ]
                }
              },
              "worktreeMode": {
                "kind": "string",
                "choices": [
                  "inherit",
                  "on",
                  "off"
                ]
              },
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "priority": {
                "kind": "number"
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "maxConcurrent": {
                "kind": "number"
              },
              "enabled": {
                "kind": "boolean"
              },
              "deletedAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "importSince": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "source": {
                "kind": "string",
                "choices": [
                  "user",
                  "imported"
                ]
              },
              "builtIn": {
                "kind": "boolean"
              },
              "sortOrder": {
                "kind": "number"
              },
              "createdAt": {
                "kind": "string"
              },
              "updatedAt": {
                "kind": "string"
              },
              "path": {
                "kind": "string"
              },
              "color": {
                "kind": "string"
              },
              "commitIdentityMode": {
                "kind": "string",
                "choices": [
                  "inherit",
                  "off",
                  "custom"
                ]
              },
              "commitIdentity": {
                "kind": "object",
                "fields": {
                  "appSlug": {
                    "kind": "string"
                  },
                  "botUserId": {
                    "kind": "string"
                  },
                  "appId": {
                    "kind": "string"
                  },
                  "setupVersion": {
                    "kind": "number"
                  }
                },
                "required": [
                  "appSlug",
                  "botUserId"
                ]
              },
              "editorApp": {
                "kind": "string"
              },
              "reportEnabled": {
                "kind": "boolean"
              },
              "pullRequestPromptMode": {
                "kind": "string",
                "choices": [
                  "inherit",
                  "off",
                  "custom"
                ]
              },
              "pullRequestFailurePrompt": {
                "kind": "string"
              },
              "pullRequestPendingPrompt": {
                "kind": "string"
              },
              "pullRequestConflictPrompt": {
                "kind": "string"
              },
              "pullRequestFailureEnabled": {
                "kind": "boolean"
              },
              "pullRequestPendingEnabled": {
                "kind": "boolean"
              },
              "pullRequestConflictEnabled": {
                "kind": "boolean"
              }
            },
            "required": [
              "taskHooks",
              "worktreeMode",
              "id",
              "name",
              "priority",
              "targetKind",
              "targetId",
              "maxConcurrent",
              "enabled",
              "deletedAt",
              "importSince",
              "source",
              "builtIn",
              "sortOrder",
              "createdAt",
              "updatedAt",
              "path",
              "color",
              "commitIdentityMode",
              "commitIdentity",
              "editorApp",
              "reportEnabled",
              "pullRequestPromptMode",
              "pullRequestFailurePrompt",
              "pullRequestPendingPrompt",
              "pullRequestConflictPrompt",
              "pullRequestFailureEnabled",
              "pullRequestPendingEnabled",
              "pullRequestConflictEnabled"
            ]
          }
        },
        "projectRecentRunCounts": {
          "kind": "value"
        },
        "tasks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "projectId": {
                "kind": "string"
              },
              "title": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "status": {
                "kind": "string",
                "choices": [
                  "draft",
                  "held",
                  "queued",
                  "running",
                  "review",
                  "failed",
                  "done"
                ]
              },
              "priority": {
                "kind": "number",
                "choices": [
                  0,
                  1,
                  2,
                  3
                ]
              },
              "seq": {
                "kind": "number"
              },
              "scheduledAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "currentRunId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "sessionId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "agentOverrideId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "pendingMessage": {
                "kind": "string"
              },
              "reservedMessage": {
                "kind": "string"
              },
              "reviewNote": {
                "kind": "string"
              },
              "dependsOn": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "taskId": {
                      "kind": "string"
                    },
                    "mode": {
                      "kind": "string",
                      "choices": [
                        "done",
                        "finished"
                      ]
                    }
                  },
                  "required": [
                    "taskId",
                    "mode"
                  ]
                }
              },
              "source": {
                "kind": "string",
                "choices": [
                  "user",
                  "imported"
                ]
              },
              "ruleId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "externalKey": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "archived": {
                "kind": "boolean"
              },
              "createdAt": {
                "kind": "string"
              },
              "updatedAt": {
                "kind": "string"
              },
              "doneAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "projectId",
              "title",
              "prompt",
              "status",
              "priority",
              "seq",
              "scheduledAt",
              "currentRunId",
              "sessionId",
              "agentOverrideId",
              "pendingMessage",
              "reservedMessage",
              "reviewNote",
              "dependsOn",
              "source",
              "ruleId",
              "externalKey",
              "archived",
              "createdAt",
              "updatedAt",
              "doneAt"
            ]
          }
        },
        "rules": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "projectId": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "priority": {
                "kind": "number",
                "choices": [
                  0,
                  1,
                  2,
                  3
                ]
              },
              "agentOverrideId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "whenIdle": {
                "kind": "boolean"
              },
              "cron": {
                "kind": "string"
              },
              "frequency": {
                "kind": "string",
                "choices": [
                  "none",
                  "daily",
                  "weekly",
                  "weekdays",
                  "continuous"
                ]
              },
              "blockStatuses": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "draft",
                    "held",
                    "queued",
                    "running",
                    "review",
                    "failed",
                    "done"
                  ]
                }
              },
              "enabled": {
                "kind": "boolean"
              },
              "dueAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "lastEnqueuedAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "sortOrder": {
                "kind": "number"
              },
              "createdAt": {
                "kind": "string"
              },
              "updatedAt": {
                "kind": "string"
              }
            },
            "required": [
              "id",
              "projectId",
              "name",
              "prompt",
              "priority",
              "agentOverrideId",
              "whenIdle",
              "cron",
              "frequency",
              "blockStatuses",
              "enabled",
              "dueAt",
              "lastEnqueuedAt",
              "sortOrder",
              "createdAt",
              "updatedAt"
            ]
          }
        },
        "agents": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "description": {
                "kind": "string"
              },
              "concurrency": {
                "kind": "number"
              },
              "fallbackAgentId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "cooldownSeconds": {
                "kind": "number"
              },
              "timeoutSeconds": {
                "kind": "number"
              },
              "enabled": {
                "kind": "boolean"
              },
              "source": {
                "kind": "string",
                "choices": [
                  "user",
                  "imported"
                ]
              },
              "sortOrder": {
                "kind": "number"
              },
              "createdAt": {
                "kind": "string"
              },
              "updatedAt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "argsTemplate": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "resumeArgsTemplate": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "env": {
                "kind": "value"
              },
              "limitPatterns": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "logAdapter": {
                "kind": "string",
                "choices": [
                  "claude",
                  "codex",
                  "cursor",
                  "grok",
                  "copilot",
                  "agy",
                  "opencode",
                  "stdout"
                ]
              }
            },
            "required": [
              "id",
              "name",
              "description",
              "concurrency",
              "fallbackAgentId",
              "cooldownSeconds",
              "timeoutSeconds",
              "enabled",
              "source",
              "sortOrder",
              "createdAt",
              "updatedAt",
              "command",
              "argsTemplate",
              "resumeArgsTemplate",
              "env",
              "limitPatterns",
              "logAdapter"
            ]
          }
        },
        "groups": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "description": {
                "kind": "string"
              },
              "strategy": {
                "kind": "string",
                "choices": [
                  "priority",
                  "round-robin",
                  "least-busy"
                ]
              },
              "memberIds": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "isDefault": {
                "kind": "boolean"
              },
              "sortOrder": {
                "kind": "number"
              },
              "createdAt": {
                "kind": "string"
              },
              "updatedAt": {
                "kind": "string"
              }
            },
            "required": [
              "id",
              "name",
              "description",
              "strategy",
              "memberIds",
              "isDefault",
              "sortOrder",
              "createdAt",
              "updatedAt"
            ]
          }
        },
        "runs": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "runnerId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "id": {
                "kind": "string"
              },
              "taskId": {
                "kind": "string"
              },
              "agentId": {
                "kind": "string"
              },
              "resolvedFromGroupId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "sessionId": {
                "kind": "string"
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "initial",
                  "followup"
                ]
              },
              "status": {
                "kind": "string",
                "choices": [
                  "starting",
                  "running",
                  "succeeded",
                  "failed",
                  "limited",
                  "canceled",
                  "timeout"
                ]
              },
              "attempt": {
                "kind": "number"
              },
              "fallbackFromRunId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "promptPreview": {
                "kind": "string"
              },
              "errorKind": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string",
                    "choices": [
                      "limit",
                      "auth",
                      "timeout",
                      "spawn",
                      "nonzero-exit",
                      "orphaned",
                      "canceled",
                      "no-agent"
                    ]
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "errorMessage": {
                "kind": "string"
              },
              "source": {
                "kind": "string",
                "choices": [
                  "user",
                  "imported"
                ]
              },
              "externalKey": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "startedAt": {
                "kind": "string"
              },
              "endedAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "pid": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "number"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "cwd": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "args": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "exitCode": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "number"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "sessionLogPath": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "stdoutLogPath": {
                "kind": "string"
              }
            },
            "required": [
              "id",
              "taskId",
              "agentId",
              "resolvedFromGroupId",
              "sessionId",
              "kind",
              "status",
              "attempt",
              "fallbackFromRunId",
              "promptPreview",
              "errorKind",
              "errorMessage",
              "source",
              "externalKey",
              "startedAt",
              "endedAt",
              "pid",
              "cwd",
              "command",
              "args",
              "exitCode",
              "sessionLogPath",
              "stdoutLogPath"
            ]
          }
        },
        "scheduler": {
          "kind": "object",
          "fields": {
            "running": {
              "kind": "boolean"
            },
            "activeRuns": {
              "kind": "number"
            },
            "totalSlots": {
              "kind": "number"
            },
            "queued": {
              "kind": "number"
            },
            "review": {
              "kind": "number"
            },
            "failed": {
              "kind": "number"
            },
            "agents": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "agentId": {
                    "kind": "string"
                  },
                  "agentName": {
                    "kind": "string"
                  },
                  "concurrency": {
                    "kind": "number"
                  },
                  "active": {
                    "kind": "number"
                  },
                  "reserved": {
                    "kind": "number"
                  },
                  "cooldownUntil": {
                    "kind": "union",
                    "variants": [
                      {
                        "kind": "string"
                      },
                      {
                        "kind": "null"
                      }
                    ]
                  },
                  "cooldownReason": {
                    "kind": "string"
                  },
                  "enabled": {
                    "kind": "boolean"
                  }
                },
                "required": [
                  "agentId",
                  "agentName",
                  "concurrency",
                  "active",
                  "reserved",
                  "cooldownUntil",
                  "cooldownReason",
                  "enabled"
                ]
              }
            },
            "holds": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "taskId": {
                    "kind": "string"
                  },
                  "taskTitle": {
                    "kind": "string"
                  },
                  "projectName": {
                    "kind": "string"
                  },
                  "agentName": {
                    "kind": "union",
                    "variants": [
                      {
                        "kind": "string"
                      },
                      {
                        "kind": "null"
                      }
                    ]
                  }
                },
                "required": [
                  "taskId",
                  "taskTitle",
                  "projectName",
                  "agentName"
                ]
              }
            },
            "warnings": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "lastTickAt": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            }
          },
          "required": [
            "running",
            "activeRuns",
            "totalSlots",
            "queued",
            "review",
            "failed",
            "agents",
            "holds",
            "warnings",
            "lastTickAt"
          ]
        }
      },
      "required": [
        "projects",
        "tasks",
        "rules",
        "agents",
        "groups",
        "runs",
        "scheduler"
      ]
    }
  },
  "runners.status": {
    "method": "runnersStatus",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "enabled": {
          "kind": "boolean"
        },
        "port": {
          "kind": "number"
        },
        "listening": {
          "kind": "boolean"
        },
        "fingerprint": {
          "kind": "string"
        },
        "error": {
          "kind": "string"
        },
        "urls": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "credentials": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "agent": {
                "kind": "string",
                "choices": [
                  "claude",
                  "cursor-agent"
                ]
              },
              "variable": {
                "kind": "string"
              },
              "configured": {
                "kind": "boolean"
              }
            },
            "required": [
              "agent",
              "variable",
              "configured"
            ]
          }
        },
        "runners": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "agents": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "name": {
                      "kind": "string"
                    },
                    "command": {
                      "kind": "string"
                    },
                    "version": {
                      "kind": "string"
                    },
                    "auth": {
                      "kind": "string",
                      "choices": [
                        "quuu",
                        "runner",
                        "missing",
                        "unknown"
                      ]
                    }
                  },
                  "required": [
                    "name",
                    "command",
                    "version",
                    "auth"
                  ]
                }
              },
              "login": {
                "kind": "object",
                "fields": {
                  "agent": {
                    "kind": "string",
                    "choices": [
                      "codex"
                    ]
                  },
                  "state": {
                    "kind": "string",
                    "choices": [
                      "waiting",
                      "delivering",
                      "failed"
                    ]
                  },
                  "url": {
                    "kind": "string"
                  },
                  "error": {
                    "kind": "string"
                  }
                },
                "required": [
                  "agent",
                  "state",
                  "url",
                  "error"
                ]
              },
              "labels": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "capacity": {
                "kind": "number"
              },
              "root": {
                "kind": "string"
              },
              "lastSeen": {
                "kind": "string"
              },
              "revoked": {
                "kind": "boolean"
              },
              "online": {
                "kind": "boolean"
              },
              "active": {
                "kind": "number"
              }
            },
            "required": [
              "id",
              "name",
              "agents",
              "capacity",
              "root",
              "lastSeen",
              "revoked",
              "online",
              "active"
            ]
          }
        }
      },
      "required": [
        "enabled",
        "port",
        "listening",
        "fingerprint",
        "error",
        "urls",
        "credentials",
        "runners"
      ]
    }
  },
  "runners.configure": {
    "method": "runnersConfigure",
    "input": {
      "kind": "object",
      "fields": {
        "enabled": {
          "kind": "boolean"
        },
        "port": {
          "kind": "number"
        }
      },
      "required": [
        "enabled",
        "port"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "enabled": {
          "kind": "boolean"
        },
        "port": {
          "kind": "number"
        },
        "listening": {
          "kind": "boolean"
        },
        "fingerprint": {
          "kind": "string"
        },
        "error": {
          "kind": "string"
        },
        "urls": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "credentials": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "agent": {
                "kind": "string",
                "choices": [
                  "claude",
                  "cursor-agent"
                ]
              },
              "variable": {
                "kind": "string"
              },
              "configured": {
                "kind": "boolean"
              }
            },
            "required": [
              "agent",
              "variable",
              "configured"
            ]
          }
        },
        "runners": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "agents": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "name": {
                      "kind": "string"
                    },
                    "command": {
                      "kind": "string"
                    },
                    "version": {
                      "kind": "string"
                    },
                    "auth": {
                      "kind": "string",
                      "choices": [
                        "quuu",
                        "runner",
                        "missing",
                        "unknown"
                      ]
                    }
                  },
                  "required": [
                    "name",
                    "command",
                    "version",
                    "auth"
                  ]
                }
              },
              "login": {
                "kind": "object",
                "fields": {
                  "agent": {
                    "kind": "string",
                    "choices": [
                      "codex"
                    ]
                  },
                  "state": {
                    "kind": "string",
                    "choices": [
                      "waiting",
                      "delivering",
                      "failed"
                    ]
                  },
                  "url": {
                    "kind": "string"
                  },
                  "error": {
                    "kind": "string"
                  }
                },
                "required": [
                  "agent",
                  "state",
                  "url",
                  "error"
                ]
              },
              "labels": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "capacity": {
                "kind": "number"
              },
              "root": {
                "kind": "string"
              },
              "lastSeen": {
                "kind": "string"
              },
              "revoked": {
                "kind": "boolean"
              },
              "online": {
                "kind": "boolean"
              },
              "active": {
                "kind": "number"
              }
            },
            "required": [
              "id",
              "name",
              "agents",
              "capacity",
              "root",
              "lastSeen",
              "revoked",
              "online",
              "active"
            ]
          }
        }
      },
      "required": [
        "enabled",
        "port",
        "listening",
        "fingerprint",
        "error",
        "urls",
        "credentials",
        "runners"
      ]
    }
  },
  "runners.pairing": {
    "method": "runnersPairing",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "pin": {
          "kind": "string"
        },
        "expiresAt": {
          "kind": "string"
        },
        "fingerprint": {
          "kind": "string"
        },
        "urls": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "command": {
          "kind": "string"
        }
      },
      "required": [
        "pin",
        "expiresAt",
        "fingerprint",
        "urls",
        "command"
      ]
    }
  },
  "runners.revoke": {
    "method": "runnersRevoke",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "runners.setCredential": {
    "method": "runnersSetCredential",
    "input": {
      "kind": "object",
      "fields": {
        "agent": {
          "kind": "string",
          "choices": [
            "claude",
            "cursor-agent"
          ]
        },
        "value": {
          "kind": "string"
        }
      },
      "required": [
        "agent",
        "value"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "enabled": {
          "kind": "boolean"
        },
        "port": {
          "kind": "number"
        },
        "listening": {
          "kind": "boolean"
        },
        "fingerprint": {
          "kind": "string"
        },
        "error": {
          "kind": "string"
        },
        "urls": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "credentials": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "agent": {
                "kind": "string",
                "choices": [
                  "claude",
                  "cursor-agent"
                ]
              },
              "variable": {
                "kind": "string"
              },
              "configured": {
                "kind": "boolean"
              }
            },
            "required": [
              "agent",
              "variable",
              "configured"
            ]
          }
        },
        "runners": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "agents": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "name": {
                      "kind": "string"
                    },
                    "command": {
                      "kind": "string"
                    },
                    "version": {
                      "kind": "string"
                    },
                    "auth": {
                      "kind": "string",
                      "choices": [
                        "quuu",
                        "runner",
                        "missing",
                        "unknown"
                      ]
                    }
                  },
                  "required": [
                    "name",
                    "command",
                    "version",
                    "auth"
                  ]
                }
              },
              "login": {
                "kind": "object",
                "fields": {
                  "agent": {
                    "kind": "string",
                    "choices": [
                      "codex"
                    ]
                  },
                  "state": {
                    "kind": "string",
                    "choices": [
                      "waiting",
                      "delivering",
                      "failed"
                    ]
                  },
                  "url": {
                    "kind": "string"
                  },
                  "error": {
                    "kind": "string"
                  }
                },
                "required": [
                  "agent",
                  "state",
                  "url",
                  "error"
                ]
              },
              "labels": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "capacity": {
                "kind": "number"
              },
              "root": {
                "kind": "string"
              },
              "lastSeen": {
                "kind": "string"
              },
              "revoked": {
                "kind": "boolean"
              },
              "online": {
                "kind": "boolean"
              },
              "active": {
                "kind": "number"
              }
            },
            "required": [
              "id",
              "name",
              "agents",
              "capacity",
              "root",
              "lastSeen",
              "revoked",
              "online",
              "active"
            ]
          }
        }
      },
      "required": [
        "enabled",
        "port",
        "listening",
        "fingerprint",
        "error",
        "urls",
        "credentials",
        "runners"
      ]
    }
  },
  "runners.signIn": {
    "method": "runnersSignIn",
    "input": {
      "kind": "object",
      "fields": {
        "runnerId": {
          "kind": "string"
        },
        "agent": {
          "kind": "string",
          "choices": [
            "codex"
          ]
        }
      },
      "required": [
        "runnerId",
        "agent"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "enabled": {
          "kind": "boolean"
        },
        "port": {
          "kind": "number"
        },
        "listening": {
          "kind": "boolean"
        },
        "fingerprint": {
          "kind": "string"
        },
        "error": {
          "kind": "string"
        },
        "urls": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "credentials": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "agent": {
                "kind": "string",
                "choices": [
                  "claude",
                  "cursor-agent"
                ]
              },
              "variable": {
                "kind": "string"
              },
              "configured": {
                "kind": "boolean"
              }
            },
            "required": [
              "agent",
              "variable",
              "configured"
            ]
          }
        },
        "runners": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "agents": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "name": {
                      "kind": "string"
                    },
                    "command": {
                      "kind": "string"
                    },
                    "version": {
                      "kind": "string"
                    },
                    "auth": {
                      "kind": "string",
                      "choices": [
                        "quuu",
                        "runner",
                        "missing",
                        "unknown"
                      ]
                    }
                  },
                  "required": [
                    "name",
                    "command",
                    "version",
                    "auth"
                  ]
                }
              },
              "login": {
                "kind": "object",
                "fields": {
                  "agent": {
                    "kind": "string",
                    "choices": [
                      "codex"
                    ]
                  },
                  "state": {
                    "kind": "string",
                    "choices": [
                      "waiting",
                      "delivering",
                      "failed"
                    ]
                  },
                  "url": {
                    "kind": "string"
                  },
                  "error": {
                    "kind": "string"
                  }
                },
                "required": [
                  "agent",
                  "state",
                  "url",
                  "error"
                ]
              },
              "labels": {
                "kind": "array",
                "items": {
                  "kind": "string"
                }
              },
              "capacity": {
                "kind": "number"
              },
              "root": {
                "kind": "string"
              },
              "lastSeen": {
                "kind": "string"
              },
              "revoked": {
                "kind": "boolean"
              },
              "online": {
                "kind": "boolean"
              },
              "active": {
                "kind": "number"
              }
            },
            "required": [
              "id",
              "name",
              "agents",
              "capacity",
              "root",
              "lastSeen",
              "revoked",
              "online",
              "active"
            ]
          }
        }
      },
      "required": [
        "enabled",
        "port",
        "listening",
        "fingerprint",
        "error",
        "urls",
        "credentials",
        "runners"
      ]
    }
  },
  "documents.list": {
    "method": "documentsList",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "branch": {
          "kind": "string"
        },
        "revision": {
          "kind": "string"
        },
        "files": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "format": {
                "kind": "string",
                "choices": [
                  "markdown",
                  "text"
                ]
              }
            },
            "required": [
              "path",
              "format"
            ]
          }
        },
        "websites": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "title": {
                "kind": "string"
              },
              "url": {
                "kind": "string"
              }
            },
            "required": [
              "title",
              "url"
            ]
          }
        }
      },
      "required": [
        "branch",
        "revision",
        "files",
        "websites"
      ]
    }
  },
  "documents.read": {
    "method": "documentsRead",
    "input": {
      "kind": "object",
      "fields": {
        "projectId": {
          "kind": "string"
        },
        "path": {
          "kind": "string"
        },
        "revision": {
          "kind": "string"
        }
      },
      "required": [
        "projectId",
        "path",
        "revision"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "content": {
          "kind": "string"
        },
        "format": {
          "kind": "string",
          "choices": [
            "markdown",
            "text"
          ]
        },
        "baseUrl": {
          "kind": "string"
        }
      },
      "required": [
        "content",
        "format",
        "baseUrl"
      ]
    }
  },
  "documents.show": {
    "method": "documentsShow",
    "input": {
      "kind": "object",
      "fields": {
        "projectId": {
          "kind": "string"
        },
        "url": {
          "kind": "string"
        },
        "bounds": {
          "kind": "object",
          "fields": {
            "x": {
              "kind": "number"
            },
            "y": {
              "kind": "number"
            },
            "width": {
              "kind": "number"
            },
            "height": {
              "kind": "number"
            }
          },
          "required": [
            "x",
            "y",
            "width",
            "height"
          ]
        }
      },
      "required": [
        "projectId",
        "url",
        "bounds"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "documents.hide": {
    "method": "documentsHide",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "documents.navigate": {
    "method": "documentsNavigate",
    "input": {
      "kind": "string",
      "choices": [
        "back",
        "forward",
        "reload"
      ]
    },
    "output": {
      "kind": "void"
    }
  },
  "hooks.resolve": {
    "method": "hooksResolve",
    "input": {
      "kind": "object",
      "fields": {
        "projectId": {
          "kind": "string"
        }
      },
      "required": []
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "string"
          },
          "name": {
            "kind": "string"
          },
          "enabled": {
            "kind": "boolean"
          },
          "events": {
            "kind": "array",
            "items": {
              "kind": "string",
              "choices": [
                "created",
                "queued",
                "held",
                "started",
                "stopped",
                "review",
                "failed",
                "beforeComplete",
                "completed",
                "reopened",
                "archived",
                "restored",
                "deleted"
              ]
            }
          },
          "kind": {
            "kind": "string",
            "choices": [
              "agent",
              "command"
            ]
          },
          "targetKind": {
            "kind": "string",
            "choices": [
              "agent",
              "group"
            ]
          },
          "targetId": {
            "kind": "string"
          },
          "prompt": {
            "kind": "string"
          },
          "command": {
            "kind": "string"
          },
          "timeoutSeconds": {
            "kind": "number"
          }
        },
        "required": [
          "id",
          "name",
          "enabled",
          "events",
          "kind",
          "targetKind",
          "targetId",
          "prompt",
          "command",
          "timeoutSeconds"
        ]
      }
    }
  },
  "hooks.list": {
    "method": "hooksList",
    "input": {
      "kind": "object",
      "fields": {
        "taskId": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "limit": {
          "kind": "number"
        }
      },
      "required": []
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "string"
          },
          "taskId": {
            "kind": "string"
          },
          "taskTitle": {
            "kind": "string"
          },
          "projectId": {
            "kind": "string"
          },
          "hookId": {
            "kind": "string"
          },
          "name": {
            "kind": "string"
          },
          "event": {
            "kind": "string",
            "choices": [
              "created",
              "queued",
              "held",
              "started",
              "stopped",
              "review",
              "failed",
              "beforeComplete",
              "completed",
              "reopened",
              "archived",
              "restored",
              "deleted"
            ]
          },
          "kind": {
            "kind": "string",
            "choices": [
              "agent",
              "command"
            ]
          },
          "status": {
            "kind": "string",
            "choices": [
              "queued",
              "starting",
              "running",
              "succeeded",
              "failed",
              "canceled"
            ]
          },
          "cwd": {
            "kind": "string"
          },
          "input": {
            "kind": "string"
          },
          "agentId": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "createdAt": {
            "kind": "string"
          },
          "startedAt": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "endedAt": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "exitCode": {
            "kind": "union",
            "variants": [
              {
                "kind": "number"
              },
              {
                "kind": "null"
              }
            ]
          },
          "error": {
            "kind": "string"
          },
          "logPath": {
            "kind": "string"
          }
        },
        "required": [
          "id",
          "taskId",
          "taskTitle",
          "projectId",
          "hookId",
          "name",
          "event",
          "kind",
          "status",
          "cwd",
          "input",
          "agentId",
          "createdAt",
          "startedAt",
          "endedAt",
          "exitCode",
          "error",
          "logPath"
        ]
      }
    }
  },
  "hooks.log": {
    "method": "hooksLog",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "run": {
          "kind": "object",
          "fields": {
            "id": {
              "kind": "string"
            },
            "taskId": {
              "kind": "string"
            },
            "taskTitle": {
              "kind": "string"
            },
            "projectId": {
              "kind": "string"
            },
            "hookId": {
              "kind": "string"
            },
            "name": {
              "kind": "string"
            },
            "event": {
              "kind": "string",
              "choices": [
                "created",
                "queued",
                "held",
                "started",
                "stopped",
                "review",
                "failed",
                "beforeComplete",
                "completed",
                "reopened",
                "archived",
                "restored",
                "deleted"
              ]
            },
            "kind": {
              "kind": "string",
              "choices": [
                "agent",
                "command"
              ]
            },
            "status": {
              "kind": "string",
              "choices": [
                "queued",
                "starting",
                "running",
                "succeeded",
                "failed",
                "canceled"
              ]
            },
            "cwd": {
              "kind": "string"
            },
            "input": {
              "kind": "string"
            },
            "agentId": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "createdAt": {
              "kind": "string"
            },
            "startedAt": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "endedAt": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "exitCode": {
              "kind": "union",
              "variants": [
                {
                  "kind": "number"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "error": {
              "kind": "string"
            },
            "logPath": {
              "kind": "string"
            }
          },
          "required": [
            "id",
            "taskId",
            "taskTitle",
            "projectId",
            "hookId",
            "name",
            "event",
            "kind",
            "status",
            "cwd",
            "input",
            "agentId",
            "createdAt",
            "startedAt",
            "endedAt",
            "exitCode",
            "error",
            "logPath"
          ]
        },
        "output": {
          "kind": "string"
        },
        "messages": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "role": {
                "kind": "string",
                "choices": [
                  "user",
                  "assistant",
                  "system"
                ]
              },
              "isSidechain": {
                "kind": "boolean"
              },
              "timestamp": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "blocks": {
                "kind": "array",
                "items": {
                  "kind": "union",
                  "variants": [
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "text"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "thinking"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "tool"
                          ]
                        },
                        "tool": {
                          "kind": "object",
                          "fields": {
                            "plan": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "text": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "string"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "status": {
                                    "kind": "string"
                                  }
                                },
                                "required": [
                                  "text",
                                  "status"
                                ]
                              }
                            },
                            "id": {
                              "kind": "string"
                            },
                            "name": {
                              "kind": "string"
                            },
                            "input": {
                              "kind": "value"
                            },
                            "target": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "result": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "isError": {
                              "kind": "boolean"
                            },
                            "images": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "id": {
                                    "kind": "string"
                                  },
                                  "mediaType": {
                                    "kind": "string"
                                  },
                                  "byteSize": {
                                    "kind": "number"
                                  },
                                  "width": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "height": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  }
                                },
                                "required": [
                                  "id",
                                  "mediaType",
                                  "byteSize",
                                  "width",
                                  "height"
                                ]
                              }
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "input",
                            "target",
                            "result",
                            "isError",
                            "images"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "tool"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "image"
                          ]
                        },
                        "image": {
                          "kind": "object",
                          "fields": {
                            "id": {
                              "kind": "string"
                            },
                            "mediaType": {
                              "kind": "string"
                            },
                            "byteSize": {
                              "kind": "number"
                            },
                            "width": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "height": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            }
                          },
                          "required": [
                            "id",
                            "mediaType",
                            "byteSize",
                            "width",
                            "height"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "image"
                      ]
                    }
                  ]
                }
              },
              "model": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "role",
              "isSidechain",
              "timestamp",
              "blocks",
              "model"
            ]
          }
        }
      },
      "required": [
        "run",
        "output",
        "messages"
      ]
    }
  },
  "hooks.conversation": {
    "method": "hooksConversation",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "before": {
          "kind": "number"
        },
        "after": {
          "kind": "number"
        },
        "generation": {
          "kind": "string"
        }
      },
      "required": [
        "id"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "first": {
          "kind": "number"
        },
        "last": {
          "kind": "number"
        },
        "generation": {
          "kind": "string"
        },
        "hasNewer": {
          "kind": "boolean"
        },
        "indexing": {
          "kind": "boolean"
        },
        "sessionId": {
          "kind": "string"
        },
        "logPath": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "exists": {
          "kind": "boolean"
        },
        "title": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "messages": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "role": {
                "kind": "string",
                "choices": [
                  "user",
                  "assistant",
                  "system"
                ]
              },
              "isSidechain": {
                "kind": "boolean"
              },
              "timestamp": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "blocks": {
                "kind": "array",
                "items": {
                  "kind": "union",
                  "variants": [
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "text"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "thinking"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "tool"
                          ]
                        },
                        "tool": {
                          "kind": "object",
                          "fields": {
                            "plan": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "text": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "string"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "status": {
                                    "kind": "string"
                                  }
                                },
                                "required": [
                                  "text",
                                  "status"
                                ]
                              }
                            },
                            "id": {
                              "kind": "string"
                            },
                            "name": {
                              "kind": "string"
                            },
                            "input": {
                              "kind": "value"
                            },
                            "target": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "result": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "isError": {
                              "kind": "boolean"
                            },
                            "images": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "id": {
                                    "kind": "string"
                                  },
                                  "mediaType": {
                                    "kind": "string"
                                  },
                                  "byteSize": {
                                    "kind": "number"
                                  },
                                  "width": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "height": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  }
                                },
                                "required": [
                                  "id",
                                  "mediaType",
                                  "byteSize",
                                  "width",
                                  "height"
                                ]
                              }
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "input",
                            "target",
                            "result",
                            "isError",
                            "images"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "tool"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "image"
                          ]
                        },
                        "image": {
                          "kind": "object",
                          "fields": {
                            "id": {
                              "kind": "string"
                            },
                            "mediaType": {
                              "kind": "string"
                            },
                            "byteSize": {
                              "kind": "number"
                            },
                            "width": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "height": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            }
                          },
                          "required": [
                            "id",
                            "mediaType",
                            "byteSize",
                            "width",
                            "height"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "image"
                      ]
                    }
                  ]
                }
              },
              "model": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "role",
              "isSidechain",
              "timestamp",
              "blocks",
              "model"
            ]
          }
        },
        "hasMore": {
          "kind": "boolean"
        },
        "totalMessages": {
          "kind": "number"
        },
        "prunedAt": {
          "kind": "string"
        },
        "cwd": {
          "kind": "string"
        },
        "input": {
          "kind": "string"
        },
        "structured": {
          "kind": "boolean"
        }
      },
      "required": [
        "sessionId",
        "logPath",
        "exists",
        "title",
        "messages",
        "hasMore",
        "totalMessages",
        "cwd",
        "input",
        "structured"
      ]
    }
  },
  "hooks.image": {
    "method": "hooksImage",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "imageId": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "imageId"
      ]
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "string"
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "hooks.cancel": {
    "method": "hooksCancel",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "hooks.retry": {
    "method": "hooksRetry",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "taskId": {
          "kind": "string"
        },
        "taskTitle": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "hookId": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "event": {
          "kind": "string",
          "choices": [
            "created",
            "queued",
            "held",
            "started",
            "stopped",
            "review",
            "failed",
            "beforeComplete",
            "completed",
            "reopened",
            "archived",
            "restored",
            "deleted"
          ]
        },
        "kind": {
          "kind": "string",
          "choices": [
            "agent",
            "command"
          ]
        },
        "status": {
          "kind": "string",
          "choices": [
            "queued",
            "starting",
            "running",
            "succeeded",
            "failed",
            "canceled"
          ]
        },
        "cwd": {
          "kind": "string"
        },
        "input": {
          "kind": "string"
        },
        "agentId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "createdAt": {
          "kind": "string"
        },
        "startedAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "endedAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "exitCode": {
          "kind": "union",
          "variants": [
            {
              "kind": "number"
            },
            {
              "kind": "null"
            }
          ]
        },
        "error": {
          "kind": "string"
        },
        "logPath": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "taskId",
        "taskTitle",
        "projectId",
        "hookId",
        "name",
        "event",
        "kind",
        "status",
        "cwd",
        "input",
        "agentId",
        "createdAt",
        "startedAt",
        "endedAt",
        "exitCode",
        "error",
        "logPath"
      ]
    }
  },
  "projects.list": {
    "method": "projectsList",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "runnerEnabled": {
            "kind": "boolean"
          },
          "runnerLabels": {
            "kind": "array",
            "items": {
              "kind": "string"
            }
          },
          "gitRemote": {
            "kind": "string"
          },
          "taskHooks": {
            "kind": "array",
            "items": {
              "kind": "object",
              "fields": {
                "id": {
                  "kind": "string"
                },
                "name": {
                  "kind": "string"
                },
                "enabled": {
                  "kind": "boolean"
                },
                "events": {
                  "kind": "array",
                  "items": {
                    "kind": "string",
                    "choices": [
                      "created",
                      "queued",
                      "held",
                      "started",
                      "stopped",
                      "review",
                      "failed",
                      "beforeComplete",
                      "completed",
                      "reopened",
                      "archived",
                      "restored",
                      "deleted"
                    ]
                  }
                },
                "kind": {
                  "kind": "string",
                  "choices": [
                    "agent",
                    "command"
                  ]
                },
                "targetKind": {
                  "kind": "string",
                  "choices": [
                    "agent",
                    "group"
                  ]
                },
                "targetId": {
                  "kind": "string"
                },
                "prompt": {
                  "kind": "string"
                },
                "command": {
                  "kind": "string"
                },
                "timeoutSeconds": {
                  "kind": "number"
                }
              },
              "required": [
                "id"
              ]
            }
          },
          "worktreeMode": {
            "kind": "string",
            "choices": [
              "inherit",
              "on",
              "off"
            ]
          },
          "id": {
            "kind": "string"
          },
          "name": {
            "kind": "string"
          },
          "priority": {
            "kind": "number"
          },
          "targetKind": {
            "kind": "string",
            "choices": [
              "agent",
              "group"
            ]
          },
          "targetId": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "maxConcurrent": {
            "kind": "number"
          },
          "enabled": {
            "kind": "boolean"
          },
          "deletedAt": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "importSince": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "source": {
            "kind": "string",
            "choices": [
              "user",
              "imported"
            ]
          },
          "builtIn": {
            "kind": "boolean"
          },
          "sortOrder": {
            "kind": "number"
          },
          "createdAt": {
            "kind": "string"
          },
          "updatedAt": {
            "kind": "string"
          },
          "path": {
            "kind": "string"
          },
          "color": {
            "kind": "string"
          },
          "commitIdentityMode": {
            "kind": "string",
            "choices": [
              "inherit",
              "off",
              "custom"
            ]
          },
          "commitIdentity": {
            "kind": "object",
            "fields": {
              "appSlug": {
                "kind": "string"
              },
              "botUserId": {
                "kind": "string"
              },
              "appId": {
                "kind": "string"
              },
              "setupVersion": {
                "kind": "number"
              }
            },
            "required": [
              "appSlug",
              "botUserId"
            ]
          },
          "editorApp": {
            "kind": "string"
          },
          "reportEnabled": {
            "kind": "boolean"
          },
          "pullRequestPromptMode": {
            "kind": "string",
            "choices": [
              "inherit",
              "off",
              "custom"
            ]
          },
          "pullRequestFailurePrompt": {
            "kind": "string"
          },
          "pullRequestPendingPrompt": {
            "kind": "string"
          },
          "pullRequestConflictPrompt": {
            "kind": "string"
          },
          "pullRequestFailureEnabled": {
            "kind": "boolean"
          },
          "pullRequestPendingEnabled": {
            "kind": "boolean"
          },
          "pullRequestConflictEnabled": {
            "kind": "boolean"
          }
        },
        "required": [
          "taskHooks",
          "worktreeMode",
          "id",
          "name",
          "priority",
          "targetKind",
          "targetId",
          "maxConcurrent",
          "enabled",
          "deletedAt",
          "importSince",
          "source",
          "builtIn",
          "sortOrder",
          "createdAt",
          "updatedAt",
          "path",
          "color",
          "commitIdentityMode",
          "commitIdentity",
          "editorApp",
          "reportEnabled",
          "pullRequestPromptMode",
          "pullRequestFailurePrompt",
          "pullRequestPendingPrompt",
          "pullRequestConflictPrompt",
          "pullRequestFailureEnabled",
          "pullRequestPendingEnabled",
          "pullRequestConflictEnabled"
        ]
      }
    }
  },
  "projects.create": {
    "method": "projectsCreate",
    "input": {
      "kind": "object",
      "fields": {
        "runnerEnabled": {
          "kind": "boolean"
        },
        "runnerLabels": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "gitRemote": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "priority": {
          "kind": "number"
        },
        "targetKind": {
          "kind": "string",
          "choices": [
            "agent",
            "group"
          ]
        },
        "targetId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "maxConcurrent": {
          "kind": "number"
        },
        "enabled": {
          "kind": "boolean"
        },
        "sortOrder": {
          "kind": "number"
        },
        "path": {
          "kind": "string"
        },
        "color": {
          "kind": "string"
        },
        "taskHooks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              },
              "events": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "created",
                    "queued",
                    "held",
                    "started",
                    "stopped",
                    "review",
                    "failed",
                    "beforeComplete",
                    "completed",
                    "reopened",
                    "archived",
                    "restored",
                    "deleted"
                  ]
                }
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "command"
                ]
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "timeoutSeconds": {
                "kind": "number"
              }
            },
            "required": [
              "id"
            ]
          }
        },
        "worktreeMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "on",
            "off"
          ]
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "commitIdentityMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "off",
            "custom"
          ]
        },
        "commitIdentity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "editorApp": {
          "kind": "string"
        },
        "reportEnabled": {
          "kind": "boolean"
        },
        "pullRequestPromptMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "off",
            "custom"
          ]
        },
        "pullRequestFailurePrompt": {
          "kind": "string"
        },
        "pullRequestPendingPrompt": {
          "kind": "string"
        },
        "pullRequestConflictPrompt": {
          "kind": "string"
        },
        "pullRequestFailureEnabled": {
          "kind": "boolean"
        },
        "pullRequestPendingEnabled": {
          "kind": "boolean"
        },
        "pullRequestConflictEnabled": {
          "kind": "boolean"
        }
      },
      "required": [
        "name",
        "path"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "runnerEnabled": {
          "kind": "boolean"
        },
        "runnerLabels": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "gitRemote": {
          "kind": "string"
        },
        "taskHooks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              },
              "events": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "created",
                    "queued",
                    "held",
                    "started",
                    "stopped",
                    "review",
                    "failed",
                    "beforeComplete",
                    "completed",
                    "reopened",
                    "archived",
                    "restored",
                    "deleted"
                  ]
                }
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "command"
                ]
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "timeoutSeconds": {
                "kind": "number"
              }
            },
            "required": [
              "id"
            ]
          }
        },
        "worktreeMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "on",
            "off"
          ]
        },
        "id": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "priority": {
          "kind": "number"
        },
        "targetKind": {
          "kind": "string",
          "choices": [
            "agent",
            "group"
          ]
        },
        "targetId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "maxConcurrent": {
          "kind": "number"
        },
        "enabled": {
          "kind": "boolean"
        },
        "deletedAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "importSince": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "builtIn": {
          "kind": "boolean"
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "path": {
          "kind": "string"
        },
        "color": {
          "kind": "string"
        },
        "commitIdentityMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "off",
            "custom"
          ]
        },
        "commitIdentity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "editorApp": {
          "kind": "string"
        },
        "reportEnabled": {
          "kind": "boolean"
        },
        "pullRequestPromptMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "off",
            "custom"
          ]
        },
        "pullRequestFailurePrompt": {
          "kind": "string"
        },
        "pullRequestPendingPrompt": {
          "kind": "string"
        },
        "pullRequestConflictPrompt": {
          "kind": "string"
        },
        "pullRequestFailureEnabled": {
          "kind": "boolean"
        },
        "pullRequestPendingEnabled": {
          "kind": "boolean"
        },
        "pullRequestConflictEnabled": {
          "kind": "boolean"
        }
      },
      "required": [
        "taskHooks",
        "worktreeMode",
        "id",
        "name",
        "priority",
        "targetKind",
        "targetId",
        "maxConcurrent",
        "enabled",
        "deletedAt",
        "importSince",
        "source",
        "builtIn",
        "sortOrder",
        "createdAt",
        "updatedAt",
        "path",
        "color",
        "commitIdentityMode",
        "commitIdentity",
        "editorApp",
        "reportEnabled",
        "pullRequestPromptMode",
        "pullRequestFailurePrompt",
        "pullRequestPendingPrompt",
        "pullRequestConflictPrompt",
        "pullRequestFailureEnabled",
        "pullRequestPendingEnabled",
        "pullRequestConflictEnabled"
      ]
    }
  },
  "projects.update": {
    "method": "projectsUpdate",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "patch": {
          "kind": "object",
          "fields": {
            "runnerEnabled": {
              "kind": "boolean"
            },
            "runnerLabels": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "gitRemote": {
              "kind": "string"
            },
            "name": {
              "kind": "string"
            },
            "priority": {
              "kind": "number"
            },
            "targetKind": {
              "kind": "string",
              "choices": [
                "agent",
                "group"
              ]
            },
            "targetId": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "maxConcurrent": {
              "kind": "number"
            },
            "enabled": {
              "kind": "boolean"
            },
            "sortOrder": {
              "kind": "number"
            },
            "path": {
              "kind": "string"
            },
            "color": {
              "kind": "string"
            },
            "taskHooks": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "enabled": {
                    "kind": "boolean"
                  },
                  "events": {
                    "kind": "array",
                    "items": {
                      "kind": "string",
                      "choices": [
                        "created",
                        "queued",
                        "held",
                        "started",
                        "stopped",
                        "review",
                        "failed",
                        "beforeComplete",
                        "completed",
                        "reopened",
                        "archived",
                        "restored",
                        "deleted"
                      ]
                    }
                  },
                  "kind": {
                    "kind": "string",
                    "choices": [
                      "agent",
                      "command"
                    ]
                  },
                  "targetKind": {
                    "kind": "string",
                    "choices": [
                      "agent",
                      "group"
                    ]
                  },
                  "targetId": {
                    "kind": "string"
                  },
                  "prompt": {
                    "kind": "string"
                  },
                  "command": {
                    "kind": "string"
                  },
                  "timeoutSeconds": {
                    "kind": "number"
                  }
                },
                "required": [
                  "id"
                ]
              }
            },
            "worktreeMode": {
              "kind": "string",
              "choices": [
                "inherit",
                "on",
                "off"
              ]
            },
            "source": {
              "kind": "string",
              "choices": [
                "user",
                "imported"
              ]
            },
            "commitIdentityMode": {
              "kind": "string",
              "choices": [
                "inherit",
                "off",
                "custom"
              ]
            },
            "commitIdentity": {
              "kind": "object",
              "fields": {
                "appSlug": {
                  "kind": "string"
                },
                "botUserId": {
                  "kind": "string"
                },
                "appId": {
                  "kind": "string"
                },
                "setupVersion": {
                  "kind": "number"
                }
              },
              "required": [
                "appSlug",
                "botUserId"
              ]
            },
            "editorApp": {
              "kind": "string"
            },
            "reportEnabled": {
              "kind": "boolean"
            },
            "pullRequestPromptMode": {
              "kind": "string",
              "choices": [
                "inherit",
                "off",
                "custom"
              ]
            },
            "pullRequestFailurePrompt": {
              "kind": "string"
            },
            "pullRequestPendingPrompt": {
              "kind": "string"
            },
            "pullRequestConflictPrompt": {
              "kind": "string"
            },
            "pullRequestFailureEnabled": {
              "kind": "boolean"
            },
            "pullRequestPendingEnabled": {
              "kind": "boolean"
            },
            "pullRequestConflictEnabled": {
              "kind": "boolean"
            }
          },
          "required": []
        }
      },
      "required": [
        "id",
        "patch"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "runnerEnabled": {
          "kind": "boolean"
        },
        "runnerLabels": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "gitRemote": {
          "kind": "string"
        },
        "taskHooks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              },
              "events": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "created",
                    "queued",
                    "held",
                    "started",
                    "stopped",
                    "review",
                    "failed",
                    "beforeComplete",
                    "completed",
                    "reopened",
                    "archived",
                    "restored",
                    "deleted"
                  ]
                }
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "command"
                ]
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "timeoutSeconds": {
                "kind": "number"
              }
            },
            "required": [
              "id"
            ]
          }
        },
        "worktreeMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "on",
            "off"
          ]
        },
        "id": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "priority": {
          "kind": "number"
        },
        "targetKind": {
          "kind": "string",
          "choices": [
            "agent",
            "group"
          ]
        },
        "targetId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "maxConcurrent": {
          "kind": "number"
        },
        "enabled": {
          "kind": "boolean"
        },
        "deletedAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "importSince": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "builtIn": {
          "kind": "boolean"
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "path": {
          "kind": "string"
        },
        "color": {
          "kind": "string"
        },
        "commitIdentityMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "off",
            "custom"
          ]
        },
        "commitIdentity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "editorApp": {
          "kind": "string"
        },
        "reportEnabled": {
          "kind": "boolean"
        },
        "pullRequestPromptMode": {
          "kind": "string",
          "choices": [
            "inherit",
            "off",
            "custom"
          ]
        },
        "pullRequestFailurePrompt": {
          "kind": "string"
        },
        "pullRequestPendingPrompt": {
          "kind": "string"
        },
        "pullRequestConflictPrompt": {
          "kind": "string"
        },
        "pullRequestFailureEnabled": {
          "kind": "boolean"
        },
        "pullRequestPendingEnabled": {
          "kind": "boolean"
        },
        "pullRequestConflictEnabled": {
          "kind": "boolean"
        }
      },
      "required": [
        "taskHooks",
        "worktreeMode",
        "id",
        "name",
        "priority",
        "targetKind",
        "targetId",
        "maxConcurrent",
        "enabled",
        "deletedAt",
        "importSince",
        "source",
        "builtIn",
        "sortOrder",
        "createdAt",
        "updatedAt",
        "path",
        "color",
        "commitIdentityMode",
        "commitIdentity",
        "editorApp",
        "reportEnabled",
        "pullRequestPromptMode",
        "pullRequestFailurePrompt",
        "pullRequestPendingPrompt",
        "pullRequestConflictPrompt",
        "pullRequestFailureEnabled",
        "pullRequestPendingEnabled",
        "pullRequestConflictEnabled"
      ]
    }
  },
  "projects.remove": {
    "method": "projectsRemove",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "tasks.list": {
    "method": "tasksList",
    "input": {
      "kind": "object",
      "fields": {
        "projectId": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "archived": {
          "kind": "string",
          "choices": [
            "exclude",
            "include",
            "only"
          ]
        },
        "after": {
          "kind": "number"
        },
        "limit": {
          "kind": "number"
        }
      },
      "required": []
    },
    "output": {
      "kind": "object",
      "fields": {
        "tasks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "projectId": {
                "kind": "string"
              },
              "title": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "status": {
                "kind": "string",
                "choices": [
                  "draft",
                  "held",
                  "queued",
                  "running",
                  "review",
                  "failed",
                  "done"
                ]
              },
              "priority": {
                "kind": "number",
                "choices": [
                  0,
                  1,
                  2,
                  3
                ]
              },
              "seq": {
                "kind": "number"
              },
              "scheduledAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "currentRunId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "sessionId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "agentOverrideId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "pendingMessage": {
                "kind": "string"
              },
              "reservedMessage": {
                "kind": "string"
              },
              "reviewNote": {
                "kind": "string"
              },
              "dependsOn": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "taskId": {
                      "kind": "string"
                    },
                    "mode": {
                      "kind": "string",
                      "choices": [
                        "done",
                        "finished"
                      ]
                    }
                  },
                  "required": [
                    "taskId",
                    "mode"
                  ]
                }
              },
              "source": {
                "kind": "string",
                "choices": [
                  "user",
                  "imported"
                ]
              },
              "ruleId": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "externalKey": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "archived": {
                "kind": "boolean"
              },
              "createdAt": {
                "kind": "string"
              },
              "updatedAt": {
                "kind": "string"
              },
              "doneAt": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "projectId",
              "title",
              "prompt",
              "status",
              "priority",
              "seq",
              "scheduledAt",
              "currentRunId",
              "sessionId",
              "agentOverrideId",
              "pendingMessage",
              "reservedMessage",
              "reviewNote",
              "dependsOn",
              "source",
              "ruleId",
              "externalKey",
              "archived",
              "createdAt",
              "updatedAt",
              "doneAt"
            ]
          }
        },
        "next": {
          "kind": "union",
          "variants": [
            {
              "kind": "number"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "tasks",
        "next"
      ]
    }
  },
  "tasks.get": {
    "method": "tasksGet",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.create": {
    "method": "tasksCreate",
    "input": {
      "kind": "object",
      "fields": {
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued"
          ]
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        }
      },
      "required": [
        "projectId",
        "title"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.update": {
    "method": "tasksUpdate",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "patch": {
          "kind": "object",
          "fields": {
            "title": {
              "kind": "string"
            },
            "prompt": {
              "kind": "string"
            },
            "pendingMessage": {
              "kind": "string"
            },
            "priority": {
              "kind": "number",
              "choices": [
                0,
                1,
                2,
                3
              ]
            },
            "projectId": {
              "kind": "string"
            },
            "scheduledAt": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "reviewNote": {
              "kind": "string"
            },
            "agentOverrideId": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "dependsOn": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "taskId": {
                    "kind": "string"
                  },
                  "mode": {
                    "kind": "string",
                    "choices": [
                      "done",
                      "finished"
                    ]
                  }
                },
                "required": [
                  "taskId",
                  "mode"
                ]
              }
            }
          },
          "required": []
        }
      },
      "required": [
        "id",
        "patch"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.enqueue": {
    "method": "tasksEnqueue",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.unqueue": {
    "method": "tasksUnqueue",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.hold": {
    "method": "tasksHold",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.runNow": {
    "method": "tasksRunNow",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        },
        "reserved": {
          "kind": "boolean"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "tasks.markDone": {
    "method": "tasksMarkDone",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.reopen": {
    "method": "tasksReopen",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.sendBack": {
    "method": "tasksSendBack",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "note": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "note"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.cancel": {
    "method": "tasksCancel",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.remove": {
    "method": "tasksRemove",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "tasks.archive": {
    "method": "tasksArchive",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "archived": {
          "kind": "boolean"
        }
      },
      "required": [
        "id",
        "archived"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "tasks.send": {
    "method": "tasksSend",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "message": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "message"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        },
        "reserved": {
          "kind": "boolean"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "tasks.clearReserved": {
    "method": "tasksClearReserved",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "rules.list": {
    "method": "rulesList",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "string"
          },
          "projectId": {
            "kind": "string"
          },
          "name": {
            "kind": "string"
          },
          "prompt": {
            "kind": "string"
          },
          "priority": {
            "kind": "number",
            "choices": [
              0,
              1,
              2,
              3
            ]
          },
          "agentOverrideId": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "whenIdle": {
            "kind": "boolean"
          },
          "cron": {
            "kind": "string"
          },
          "frequency": {
            "kind": "string",
            "choices": [
              "none",
              "daily",
              "weekly",
              "weekdays",
              "continuous"
            ]
          },
          "blockStatuses": {
            "kind": "array",
            "items": {
              "kind": "string",
              "choices": [
                "draft",
                "held",
                "queued",
                "running",
                "review",
                "failed",
                "done"
              ]
            }
          },
          "enabled": {
            "kind": "boolean"
          },
          "dueAt": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "lastEnqueuedAt": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "sortOrder": {
            "kind": "number"
          },
          "createdAt": {
            "kind": "string"
          },
          "updatedAt": {
            "kind": "string"
          }
        },
        "required": [
          "id",
          "projectId",
          "name",
          "prompt",
          "priority",
          "agentOverrideId",
          "whenIdle",
          "cron",
          "frequency",
          "blockStatuses",
          "enabled",
          "dueAt",
          "lastEnqueuedAt",
          "sortOrder",
          "createdAt",
          "updatedAt"
        ]
      }
    }
  },
  "rules.preview": {
    "method": "rulesPreview",
    "input": {
      "kind": "object",
      "fields": {
        "whenIdle": {
          "kind": "boolean"
        },
        "cron": {
          "kind": "string"
        },
        "frequency": {
          "kind": "string",
          "choices": [
            "none",
            "daily",
            "weekly",
            "weekdays",
            "continuous"
          ]
        },
        "blockStatuses": {
          "kind": "array",
          "items": {
            "kind": "string",
            "choices": [
              "draft",
              "held",
              "queued",
              "running",
              "review",
              "failed",
              "done"
            ]
          }
        }
      },
      "required": [
        "whenIdle",
        "cron",
        "blockStatuses"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "nextAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "valid": {
          "kind": "boolean"
        },
        "hasCondition": {
          "kind": "boolean"
        }
      },
      "required": [
        "nextAt",
        "valid",
        "hasCondition"
      ]
    }
  },
  "rules.create": {
    "method": "rulesCreate",
    "input": {
      "kind": "object",
      "fields": {
        "projectId": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "whenIdle": {
          "kind": "boolean"
        },
        "cron": {
          "kind": "string"
        },
        "frequency": {
          "kind": "string",
          "choices": [
            "none",
            "daily",
            "weekly",
            "weekdays",
            "continuous"
          ]
        },
        "blockStatuses": {
          "kind": "array",
          "items": {
            "kind": "string",
            "choices": [
              "draft",
              "held",
              "queued",
              "running",
              "review",
              "failed",
              "done"
            ]
          }
        },
        "enabled": {
          "kind": "boolean"
        },
        "sortOrder": {
          "kind": "number"
        }
      },
      "required": [
        "projectId",
        "name",
        "prompt",
        "priority",
        "agentOverrideId",
        "whenIdle",
        "cron",
        "blockStatuses",
        "enabled",
        "sortOrder"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "whenIdle": {
          "kind": "boolean"
        },
        "cron": {
          "kind": "string"
        },
        "frequency": {
          "kind": "string",
          "choices": [
            "none",
            "daily",
            "weekly",
            "weekdays",
            "continuous"
          ]
        },
        "blockStatuses": {
          "kind": "array",
          "items": {
            "kind": "string",
            "choices": [
              "draft",
              "held",
              "queued",
              "running",
              "review",
              "failed",
              "done"
            ]
          }
        },
        "enabled": {
          "kind": "boolean"
        },
        "dueAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "lastEnqueuedAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "projectId",
        "name",
        "prompt",
        "priority",
        "agentOverrideId",
        "whenIdle",
        "cron",
        "frequency",
        "blockStatuses",
        "enabled",
        "dueAt",
        "lastEnqueuedAt",
        "sortOrder",
        "createdAt",
        "updatedAt"
      ]
    }
  },
  "rules.update": {
    "method": "rulesUpdate",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "patch": {
          "kind": "object",
          "fields": {
            "projectId": {
              "kind": "string"
            },
            "name": {
              "kind": "string"
            },
            "prompt": {
              "kind": "string"
            },
            "priority": {
              "kind": "number",
              "choices": [
                0,
                1,
                2,
                3
              ]
            },
            "agentOverrideId": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "whenIdle": {
              "kind": "boolean"
            },
            "cron": {
              "kind": "string"
            },
            "frequency": {
              "kind": "string",
              "choices": [
                "none",
                "daily",
                "weekly",
                "weekdays",
                "continuous"
              ]
            },
            "blockStatuses": {
              "kind": "array",
              "items": {
                "kind": "string",
                "choices": [
                  "draft",
                  "held",
                  "queued",
                  "running",
                  "review",
                  "failed",
                  "done"
                ]
              }
            },
            "enabled": {
              "kind": "boolean"
            },
            "sortOrder": {
              "kind": "number"
            }
          },
          "required": []
        }
      },
      "required": [
        "id",
        "patch"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "whenIdle": {
          "kind": "boolean"
        },
        "cron": {
          "kind": "string"
        },
        "frequency": {
          "kind": "string",
          "choices": [
            "none",
            "daily",
            "weekly",
            "weekdays",
            "continuous"
          ]
        },
        "blockStatuses": {
          "kind": "array",
          "items": {
            "kind": "string",
            "choices": [
              "draft",
              "held",
              "queued",
              "running",
              "review",
              "failed",
              "done"
            ]
          }
        },
        "enabled": {
          "kind": "boolean"
        },
        "dueAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "lastEnqueuedAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "projectId",
        "name",
        "prompt",
        "priority",
        "agentOverrideId",
        "whenIdle",
        "cron",
        "frequency",
        "blockStatuses",
        "enabled",
        "dueAt",
        "lastEnqueuedAt",
        "sortOrder",
        "createdAt",
        "updatedAt"
      ]
    }
  },
  "rules.remove": {
    "method": "rulesRemove",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "rules.enqueue": {
    "method": "rulesEnqueue",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "projectId": {
          "kind": "string"
        },
        "title": {
          "kind": "string"
        },
        "prompt": {
          "kind": "string"
        },
        "status": {
          "kind": "string",
          "choices": [
            "draft",
            "held",
            "queued",
            "running",
            "review",
            "failed",
            "done"
          ]
        },
        "priority": {
          "kind": "number",
          "choices": [
            0,
            1,
            2,
            3
          ]
        },
        "seq": {
          "kind": "number"
        },
        "scheduledAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "currentRunId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "sessionId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "agentOverrideId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "pendingMessage": {
          "kind": "string"
        },
        "reservedMessage": {
          "kind": "string"
        },
        "reviewNote": {
          "kind": "string"
        },
        "dependsOn": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "mode": {
                "kind": "string",
                "choices": [
                  "done",
                  "finished"
                ]
              }
            },
            "required": [
              "taskId",
              "mode"
            ]
          }
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "ruleId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "externalKey": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "archived": {
          "kind": "boolean"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "doneAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "id",
        "projectId",
        "title",
        "prompt",
        "status",
        "priority",
        "seq",
        "scheduledAt",
        "currentRunId",
        "sessionId",
        "agentOverrideId",
        "pendingMessage",
        "reservedMessage",
        "reviewNote",
        "dependsOn",
        "source",
        "ruleId",
        "externalKey",
        "archived",
        "createdAt",
        "updatedAt",
        "doneAt"
      ]
    }
  },
  "agents.list": {
    "method": "agentsList",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "string"
          },
          "name": {
            "kind": "string"
          },
          "description": {
            "kind": "string"
          },
          "concurrency": {
            "kind": "number"
          },
          "fallbackAgentId": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "cooldownSeconds": {
            "kind": "number"
          },
          "timeoutSeconds": {
            "kind": "number"
          },
          "enabled": {
            "kind": "boolean"
          },
          "source": {
            "kind": "string",
            "choices": [
              "user",
              "imported"
            ]
          },
          "sortOrder": {
            "kind": "number"
          },
          "createdAt": {
            "kind": "string"
          },
          "updatedAt": {
            "kind": "string"
          },
          "command": {
            "kind": "string"
          },
          "argsTemplate": {
            "kind": "array",
            "items": {
              "kind": "string"
            }
          },
          "resumeArgsTemplate": {
            "kind": "array",
            "items": {
              "kind": "string"
            }
          },
          "env": {
            "kind": "value"
          },
          "limitPatterns": {
            "kind": "array",
            "items": {
              "kind": "string"
            }
          },
          "logAdapter": {
            "kind": "string",
            "choices": [
              "claude",
              "codex",
              "cursor",
              "grok",
              "copilot",
              "agy",
              "opencode",
              "stdout"
            ]
          }
        },
        "required": [
          "id",
          "name",
          "description",
          "concurrency",
          "fallbackAgentId",
          "cooldownSeconds",
          "timeoutSeconds",
          "enabled",
          "source",
          "sortOrder",
          "createdAt",
          "updatedAt",
          "command",
          "argsTemplate",
          "resumeArgsTemplate",
          "env",
          "limitPatterns",
          "logAdapter"
        ]
      }
    }
  },
  "agents.defaults": {
    "method": "agentsDefaults",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "limitPatterns": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        }
      },
      "required": [
        "limitPatterns"
      ]
    }
  },
  "agents.create": {
    "method": "agentsCreate",
    "input": {
      "kind": "object",
      "fields": {
        "name": {
          "kind": "string"
        },
        "description": {
          "kind": "string"
        },
        "concurrency": {
          "kind": "number"
        },
        "fallbackAgentId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "cooldownSeconds": {
          "kind": "number"
        },
        "timeoutSeconds": {
          "kind": "number"
        },
        "enabled": {
          "kind": "boolean"
        },
        "sortOrder": {
          "kind": "number"
        },
        "command": {
          "kind": "string"
        },
        "argsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "resumeArgsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "env": {
          "kind": "value"
        },
        "limitPatterns": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "logAdapter": {
          "kind": "string",
          "choices": [
            "claude",
            "codex",
            "cursor",
            "grok",
            "copilot",
            "agy",
            "opencode",
            "stdout"
          ]
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        }
      },
      "required": [
        "name",
        "description",
        "concurrency",
        "fallbackAgentId",
        "cooldownSeconds",
        "timeoutSeconds",
        "enabled",
        "sortOrder",
        "command",
        "argsTemplate",
        "resumeArgsTemplate",
        "env",
        "limitPatterns",
        "logAdapter"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "description": {
          "kind": "string"
        },
        "concurrency": {
          "kind": "number"
        },
        "fallbackAgentId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "cooldownSeconds": {
          "kind": "number"
        },
        "timeoutSeconds": {
          "kind": "number"
        },
        "enabled": {
          "kind": "boolean"
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "command": {
          "kind": "string"
        },
        "argsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "resumeArgsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "env": {
          "kind": "value"
        },
        "limitPatterns": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "logAdapter": {
          "kind": "string",
          "choices": [
            "claude",
            "codex",
            "cursor",
            "grok",
            "copilot",
            "agy",
            "opencode",
            "stdout"
          ]
        }
      },
      "required": [
        "id",
        "name",
        "description",
        "concurrency",
        "fallbackAgentId",
        "cooldownSeconds",
        "timeoutSeconds",
        "enabled",
        "source",
        "sortOrder",
        "createdAt",
        "updatedAt",
        "command",
        "argsTemplate",
        "resumeArgsTemplate",
        "env",
        "limitPatterns",
        "logAdapter"
      ]
    }
  },
  "agents.update": {
    "method": "agentsUpdate",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "patch": {
          "kind": "object",
          "fields": {
            "name": {
              "kind": "string"
            },
            "description": {
              "kind": "string"
            },
            "concurrency": {
              "kind": "number"
            },
            "fallbackAgentId": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "cooldownSeconds": {
              "kind": "number"
            },
            "timeoutSeconds": {
              "kind": "number"
            },
            "enabled": {
              "kind": "boolean"
            },
            "sortOrder": {
              "kind": "number"
            },
            "command": {
              "kind": "string"
            },
            "argsTemplate": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "resumeArgsTemplate": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "env": {
              "kind": "value"
            },
            "limitPatterns": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "logAdapter": {
              "kind": "string",
              "choices": [
                "claude",
                "codex",
                "cursor",
                "grok",
                "copilot",
                "agy",
                "opencode",
                "stdout"
              ]
            },
            "source": {
              "kind": "string",
              "choices": [
                "user",
                "imported"
              ]
            }
          },
          "required": []
        }
      },
      "required": [
        "id",
        "patch"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "description": {
          "kind": "string"
        },
        "concurrency": {
          "kind": "number"
        },
        "fallbackAgentId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "cooldownSeconds": {
          "kind": "number"
        },
        "timeoutSeconds": {
          "kind": "number"
        },
        "enabled": {
          "kind": "boolean"
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "command": {
          "kind": "string"
        },
        "argsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "resumeArgsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "env": {
          "kind": "value"
        },
        "limitPatterns": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "logAdapter": {
          "kind": "string",
          "choices": [
            "claude",
            "codex",
            "cursor",
            "grok",
            "copilot",
            "agy",
            "opencode",
            "stdout"
          ]
        }
      },
      "required": [
        "id",
        "name",
        "description",
        "concurrency",
        "fallbackAgentId",
        "cooldownSeconds",
        "timeoutSeconds",
        "enabled",
        "source",
        "sortOrder",
        "createdAt",
        "updatedAt",
        "command",
        "argsTemplate",
        "resumeArgsTemplate",
        "env",
        "limitPatterns",
        "logAdapter"
      ]
    }
  },
  "agents.duplicate": {
    "method": "agentsDuplicate",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "description": {
          "kind": "string"
        },
        "concurrency": {
          "kind": "number"
        },
        "fallbackAgentId": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "cooldownSeconds": {
          "kind": "number"
        },
        "timeoutSeconds": {
          "kind": "number"
        },
        "enabled": {
          "kind": "boolean"
        },
        "source": {
          "kind": "string",
          "choices": [
            "user",
            "imported"
          ]
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        },
        "command": {
          "kind": "string"
        },
        "argsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "resumeArgsTemplate": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "env": {
          "kind": "value"
        },
        "limitPatterns": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "logAdapter": {
          "kind": "string",
          "choices": [
            "claude",
            "codex",
            "cursor",
            "grok",
            "copilot",
            "agy",
            "opencode",
            "stdout"
          ]
        }
      },
      "required": [
        "id",
        "name",
        "description",
        "concurrency",
        "fallbackAgentId",
        "cooldownSeconds",
        "timeoutSeconds",
        "enabled",
        "source",
        "sortOrder",
        "createdAt",
        "updatedAt",
        "command",
        "argsTemplate",
        "resumeArgsTemplate",
        "env",
        "limitPatterns",
        "logAdapter"
      ]
    }
  },
  "agents.resetLimit": {
    "method": "agentsResetLimit",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "agents.remove": {
    "method": "agentsRemove",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "groups.list": {
    "method": "groupsList",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "string"
          },
          "name": {
            "kind": "string"
          },
          "description": {
            "kind": "string"
          },
          "strategy": {
            "kind": "string",
            "choices": [
              "priority",
              "round-robin",
              "least-busy"
            ]
          },
          "memberIds": {
            "kind": "array",
            "items": {
              "kind": "string"
            }
          },
          "isDefault": {
            "kind": "boolean"
          },
          "sortOrder": {
            "kind": "number"
          },
          "createdAt": {
            "kind": "string"
          },
          "updatedAt": {
            "kind": "string"
          }
        },
        "required": [
          "id",
          "name",
          "description",
          "strategy",
          "memberIds",
          "isDefault",
          "sortOrder",
          "createdAt",
          "updatedAt"
        ]
      }
    }
  },
  "groups.create": {
    "method": "groupsCreate",
    "input": {
      "kind": "object",
      "fields": {
        "name": {
          "kind": "string"
        },
        "description": {
          "kind": "string"
        },
        "strategy": {
          "kind": "string",
          "choices": [
            "priority",
            "round-robin",
            "least-busy"
          ]
        },
        "memberIds": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "sortOrder": {
          "kind": "number"
        },
        "isDefault": {
          "kind": "boolean"
        }
      },
      "required": [
        "name",
        "description",
        "strategy",
        "memberIds",
        "sortOrder"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "description": {
          "kind": "string"
        },
        "strategy": {
          "kind": "string",
          "choices": [
            "priority",
            "round-robin",
            "least-busy"
          ]
        },
        "memberIds": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "isDefault": {
          "kind": "boolean"
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "name",
        "description",
        "strategy",
        "memberIds",
        "isDefault",
        "sortOrder",
        "createdAt",
        "updatedAt"
      ]
    }
  },
  "groups.update": {
    "method": "groupsUpdate",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "patch": {
          "kind": "object",
          "fields": {
            "name": {
              "kind": "string"
            },
            "description": {
              "kind": "string"
            },
            "strategy": {
              "kind": "string",
              "choices": [
                "priority",
                "round-robin",
                "least-busy"
              ]
            },
            "memberIds": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "sortOrder": {
              "kind": "number"
            },
            "isDefault": {
              "kind": "boolean"
            }
          },
          "required": []
        }
      },
      "required": [
        "id",
        "patch"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "name": {
          "kind": "string"
        },
        "description": {
          "kind": "string"
        },
        "strategy": {
          "kind": "string",
          "choices": [
            "priority",
            "round-robin",
            "least-busy"
          ]
        },
        "memberIds": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "isDefault": {
          "kind": "boolean"
        },
        "sortOrder": {
          "kind": "number"
        },
        "createdAt": {
          "kind": "string"
        },
        "updatedAt": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "name",
        "description",
        "strategy",
        "memberIds",
        "isDefault",
        "sortOrder",
        "createdAt",
        "updatedAt"
      ]
    }
  },
  "groups.remove": {
    "method": "groupsRemove",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "runs.byTask": {
    "method": "runsByTask",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "runnerId": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "id": {
            "kind": "string"
          },
          "taskId": {
            "kind": "string"
          },
          "agentId": {
            "kind": "string"
          },
          "resolvedFromGroupId": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "sessionId": {
            "kind": "string"
          },
          "kind": {
            "kind": "string",
            "choices": [
              "initial",
              "followup"
            ]
          },
          "status": {
            "kind": "string",
            "choices": [
              "starting",
              "running",
              "succeeded",
              "failed",
              "limited",
              "canceled",
              "timeout"
            ]
          },
          "attempt": {
            "kind": "number"
          },
          "fallbackFromRunId": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "promptPreview": {
            "kind": "string"
          },
          "errorKind": {
            "kind": "union",
            "variants": [
              {
                "kind": "string",
                "choices": [
                  "limit",
                  "auth",
                  "timeout",
                  "spawn",
                  "nonzero-exit",
                  "orphaned",
                  "canceled",
                  "no-agent"
                ]
              },
              {
                "kind": "null"
              }
            ]
          },
          "errorMessage": {
            "kind": "string"
          },
          "source": {
            "kind": "string",
            "choices": [
              "user",
              "imported"
            ]
          },
          "externalKey": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "startedAt": {
            "kind": "string"
          },
          "endedAt": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "pid": {
            "kind": "union",
            "variants": [
              {
                "kind": "number"
              },
              {
                "kind": "null"
              }
            ]
          },
          "cwd": {
            "kind": "string"
          },
          "command": {
            "kind": "string"
          },
          "args": {
            "kind": "array",
            "items": {
              "kind": "string"
            }
          },
          "exitCode": {
            "kind": "union",
            "variants": [
              {
                "kind": "number"
              },
              {
                "kind": "null"
              }
            ]
          },
          "sessionLogPath": {
            "kind": "union",
            "variants": [
              {
                "kind": "string"
              },
              {
                "kind": "null"
              }
            ]
          },
          "stdoutLogPath": {
            "kind": "string"
          }
        },
        "required": [
          "id",
          "taskId",
          "agentId",
          "resolvedFromGroupId",
          "sessionId",
          "kind",
          "status",
          "attempt",
          "fallbackFromRunId",
          "promptPreview",
          "errorKind",
          "errorMessage",
          "source",
          "externalKey",
          "startedAt",
          "endedAt",
          "pid",
          "cwd",
          "command",
          "args",
          "exitCode",
          "sessionLogPath",
          "stdoutLogPath"
        ]
      }
    }
  },
  "runs.cancel": {
    "method": "runsCancel",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "logs.page": {
    "method": "logsPage",
    "input": {
      "kind": "object",
      "fields": {
        "runId": {
          "kind": "string"
        },
        "offset": {
          "kind": "number"
        },
        "generation": {
          "kind": "string"
        },
        "limit": {
          "kind": "number"
        },
        "search": {
          "kind": "string"
        }
      },
      "required": [
        "runId"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "runId": {
          "kind": "string"
        },
        "sessionId": {
          "kind": "string"
        },
        "exists": {
          "kind": "boolean"
        },
        "generation": {
          "kind": "string"
        },
        "messages": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "role": {
                "kind": "string",
                "choices": [
                  "user",
                  "assistant",
                  "system"
                ]
              },
              "isSidechain": {
                "kind": "boolean"
              },
              "timestamp": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "blocks": {
                "kind": "array",
                "items": {
                  "kind": "union",
                  "variants": [
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "text"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "thinking"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "tool"
                          ]
                        },
                        "tool": {
                          "kind": "object",
                          "fields": {
                            "plan": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "text": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "string"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "status": {
                                    "kind": "string"
                                  }
                                },
                                "required": [
                                  "text",
                                  "status"
                                ]
                              }
                            },
                            "id": {
                              "kind": "string"
                            },
                            "name": {
                              "kind": "string"
                            },
                            "input": {
                              "kind": "value"
                            },
                            "target": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "result": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "isError": {
                              "kind": "boolean"
                            },
                            "images": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "id": {
                                    "kind": "string"
                                  },
                                  "mediaType": {
                                    "kind": "string"
                                  },
                                  "byteSize": {
                                    "kind": "number"
                                  },
                                  "width": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "height": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  }
                                },
                                "required": [
                                  "id",
                                  "mediaType",
                                  "byteSize",
                                  "width",
                                  "height"
                                ]
                              }
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "input",
                            "target",
                            "result",
                            "isError",
                            "images"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "tool"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "image"
                          ]
                        },
                        "image": {
                          "kind": "object",
                          "fields": {
                            "id": {
                              "kind": "string"
                            },
                            "mediaType": {
                              "kind": "string"
                            },
                            "byteSize": {
                              "kind": "number"
                            },
                            "width": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "height": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            }
                          },
                          "required": [
                            "id",
                            "mediaType",
                            "byteSize",
                            "width",
                            "height"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "image"
                      ]
                    }
                  ]
                }
              },
              "model": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "role",
              "isSidechain",
              "timestamp",
              "blocks",
              "model"
            ]
          }
        },
        "next": {
          "kind": "union",
          "variants": [
            {
              "kind": "number"
            },
            {
              "kind": "null"
            }
          ]
        },
        "total": {
          "kind": "number"
        }
      },
      "required": [
        "runId",
        "sessionId",
        "exists",
        "generation",
        "messages",
        "next",
        "total"
      ]
    }
  },
  "session.close": {
    "method": "sessionClose",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "void"
    }
  },
  "session.load": {
    "method": "sessionLoad",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "first": {
          "kind": "number"
        },
        "last": {
          "kind": "number"
        },
        "generation": {
          "kind": "string"
        },
        "hasNewer": {
          "kind": "boolean"
        },
        "indexing": {
          "kind": "boolean"
        },
        "sessionId": {
          "kind": "string"
        },
        "logPath": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "exists": {
          "kind": "boolean"
        },
        "title": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "messages": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "role": {
                "kind": "string",
                "choices": [
                  "user",
                  "assistant",
                  "system"
                ]
              },
              "isSidechain": {
                "kind": "boolean"
              },
              "timestamp": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "blocks": {
                "kind": "array",
                "items": {
                  "kind": "union",
                  "variants": [
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "text"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "thinking"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "tool"
                          ]
                        },
                        "tool": {
                          "kind": "object",
                          "fields": {
                            "plan": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "text": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "string"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "status": {
                                    "kind": "string"
                                  }
                                },
                                "required": [
                                  "text",
                                  "status"
                                ]
                              }
                            },
                            "id": {
                              "kind": "string"
                            },
                            "name": {
                              "kind": "string"
                            },
                            "input": {
                              "kind": "value"
                            },
                            "target": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "result": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "isError": {
                              "kind": "boolean"
                            },
                            "images": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "id": {
                                    "kind": "string"
                                  },
                                  "mediaType": {
                                    "kind": "string"
                                  },
                                  "byteSize": {
                                    "kind": "number"
                                  },
                                  "width": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "height": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  }
                                },
                                "required": [
                                  "id",
                                  "mediaType",
                                  "byteSize",
                                  "width",
                                  "height"
                                ]
                              }
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "input",
                            "target",
                            "result",
                            "isError",
                            "images"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "tool"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "image"
                          ]
                        },
                        "image": {
                          "kind": "object",
                          "fields": {
                            "id": {
                              "kind": "string"
                            },
                            "mediaType": {
                              "kind": "string"
                            },
                            "byteSize": {
                              "kind": "number"
                            },
                            "width": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "height": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            }
                          },
                          "required": [
                            "id",
                            "mediaType",
                            "byteSize",
                            "width",
                            "height"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "image"
                      ]
                    }
                  ]
                }
              },
              "model": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "role",
              "isSidechain",
              "timestamp",
              "blocks",
              "model"
            ]
          }
        },
        "hasMore": {
          "kind": "boolean"
        },
        "totalMessages": {
          "kind": "number"
        },
        "prunedAt": {
          "kind": "string"
        }
      },
      "required": [
        "sessionId",
        "logPath",
        "exists",
        "title",
        "messages",
        "hasMore",
        "totalMessages"
      ]
    }
  },
  "session.loadMore": {
    "method": "sessionLoadMore",
    "input": {
      "kind": "object",
      "fields": {
        "runId": {
          "kind": "string"
        },
        "direction": {
          "kind": "string",
          "choices": [
            "older",
            "newer",
            "latest"
          ]
        }
      },
      "required": [
        "runId",
        "direction"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "first": {
          "kind": "number"
        },
        "last": {
          "kind": "number"
        },
        "generation": {
          "kind": "string"
        },
        "hasNewer": {
          "kind": "boolean"
        },
        "indexing": {
          "kind": "boolean"
        },
        "sessionId": {
          "kind": "string"
        },
        "logPath": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "exists": {
          "kind": "boolean"
        },
        "title": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "messages": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "role": {
                "kind": "string",
                "choices": [
                  "user",
                  "assistant",
                  "system"
                ]
              },
              "isSidechain": {
                "kind": "boolean"
              },
              "timestamp": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "blocks": {
                "kind": "array",
                "items": {
                  "kind": "union",
                  "variants": [
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "text"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "thinking"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "tool"
                          ]
                        },
                        "tool": {
                          "kind": "object",
                          "fields": {
                            "plan": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "text": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "string"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "status": {
                                    "kind": "string"
                                  }
                                },
                                "required": [
                                  "text",
                                  "status"
                                ]
                              }
                            },
                            "id": {
                              "kind": "string"
                            },
                            "name": {
                              "kind": "string"
                            },
                            "input": {
                              "kind": "value"
                            },
                            "target": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "result": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "isError": {
                              "kind": "boolean"
                            },
                            "images": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "id": {
                                    "kind": "string"
                                  },
                                  "mediaType": {
                                    "kind": "string"
                                  },
                                  "byteSize": {
                                    "kind": "number"
                                  },
                                  "width": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "height": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  }
                                },
                                "required": [
                                  "id",
                                  "mediaType",
                                  "byteSize",
                                  "width",
                                  "height"
                                ]
                              }
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "input",
                            "target",
                            "result",
                            "isError",
                            "images"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "tool"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "image"
                          ]
                        },
                        "image": {
                          "kind": "object",
                          "fields": {
                            "id": {
                              "kind": "string"
                            },
                            "mediaType": {
                              "kind": "string"
                            },
                            "byteSize": {
                              "kind": "number"
                            },
                            "width": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "height": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            }
                          },
                          "required": [
                            "id",
                            "mediaType",
                            "byteSize",
                            "width",
                            "height"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "image"
                      ]
                    }
                  ]
                }
              },
              "model": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "role",
              "isSidechain",
              "timestamp",
              "blocks",
              "model"
            ]
          }
        },
        "hasMore": {
          "kind": "boolean"
        },
        "totalMessages": {
          "kind": "number"
        },
        "prunedAt": {
          "kind": "string"
        }
      },
      "required": [
        "sessionId",
        "logPath",
        "exists",
        "title",
        "messages",
        "hasMore",
        "totalMessages"
      ]
    }
  },
  "session.image": {
    "method": "sessionImage",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "string"
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "scheduler.status": {
    "method": "schedulerStatus",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "running": {
          "kind": "boolean"
        },
        "activeRuns": {
          "kind": "number"
        },
        "totalSlots": {
          "kind": "number"
        },
        "queued": {
          "kind": "number"
        },
        "review": {
          "kind": "number"
        },
        "failed": {
          "kind": "number"
        },
        "agents": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "agentId": {
                "kind": "string"
              },
              "agentName": {
                "kind": "string"
              },
              "concurrency": {
                "kind": "number"
              },
              "active": {
                "kind": "number"
              },
              "reserved": {
                "kind": "number"
              },
              "cooldownUntil": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "cooldownReason": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              }
            },
            "required": [
              "agentId",
              "agentName",
              "concurrency",
              "active",
              "reserved",
              "cooldownUntil",
              "cooldownReason",
              "enabled"
            ]
          }
        },
        "holds": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "taskTitle": {
                "kind": "string"
              },
              "projectName": {
                "kind": "string"
              },
              "agentName": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "taskId",
              "taskTitle",
              "projectName",
              "agentName"
            ]
          }
        },
        "warnings": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "lastTickAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "running",
        "activeRuns",
        "totalSlots",
        "queued",
        "review",
        "failed",
        "agents",
        "holds",
        "warnings",
        "lastTickAt"
      ]
    }
  },
  "scheduler.pause": {
    "method": "schedulerPause",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "running": {
          "kind": "boolean"
        },
        "activeRuns": {
          "kind": "number"
        },
        "totalSlots": {
          "kind": "number"
        },
        "queued": {
          "kind": "number"
        },
        "review": {
          "kind": "number"
        },
        "failed": {
          "kind": "number"
        },
        "agents": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "agentId": {
                "kind": "string"
              },
              "agentName": {
                "kind": "string"
              },
              "concurrency": {
                "kind": "number"
              },
              "active": {
                "kind": "number"
              },
              "reserved": {
                "kind": "number"
              },
              "cooldownUntil": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "cooldownReason": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              }
            },
            "required": [
              "agentId",
              "agentName",
              "concurrency",
              "active",
              "reserved",
              "cooldownUntil",
              "cooldownReason",
              "enabled"
            ]
          }
        },
        "holds": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "taskTitle": {
                "kind": "string"
              },
              "projectName": {
                "kind": "string"
              },
              "agentName": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "taskId",
              "taskTitle",
              "projectName",
              "agentName"
            ]
          }
        },
        "warnings": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "lastTickAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "running",
        "activeRuns",
        "totalSlots",
        "queued",
        "review",
        "failed",
        "agents",
        "holds",
        "warnings",
        "lastTickAt"
      ]
    }
  },
  "scheduler.resume": {
    "method": "schedulerResume",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "running": {
          "kind": "boolean"
        },
        "activeRuns": {
          "kind": "number"
        },
        "totalSlots": {
          "kind": "number"
        },
        "queued": {
          "kind": "number"
        },
        "review": {
          "kind": "number"
        },
        "failed": {
          "kind": "number"
        },
        "agents": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "agentId": {
                "kind": "string"
              },
              "agentName": {
                "kind": "string"
              },
              "concurrency": {
                "kind": "number"
              },
              "active": {
                "kind": "number"
              },
              "reserved": {
                "kind": "number"
              },
              "cooldownUntil": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "cooldownReason": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              }
            },
            "required": [
              "agentId",
              "agentName",
              "concurrency",
              "active",
              "reserved",
              "cooldownUntil",
              "cooldownReason",
              "enabled"
            ]
          }
        },
        "holds": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "taskId": {
                "kind": "string"
              },
              "taskTitle": {
                "kind": "string"
              },
              "projectName": {
                "kind": "string"
              },
              "agentName": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "taskId",
              "taskTitle",
              "projectName",
              "agentName"
            ]
          }
        },
        "warnings": {
          "kind": "array",
          "items": {
            "kind": "string"
          }
        },
        "lastTickAt": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "running",
        "activeRuns",
        "totalSlots",
        "queued",
        "review",
        "failed",
        "agents",
        "holds",
        "warnings",
        "lastTickAt"
      ]
    }
  },
  "servers.status": {
    "method": "serversStatus",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "http": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "url": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            }
          },
          "required": [
            "enabled",
            "url",
            "error"
          ]
        },
        "mcp": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "url": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            }
          },
          "required": [
            "enabled",
            "url",
            "error"
          ]
        },
        "connectionFile": {
          "kind": "string"
        }
      },
      "required": [
        "http",
        "mcp",
        "connectionFile"
      ]
    }
  },
  "network.status": {
    "method": "networkStatus",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "host": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "port": {
              "kind": "number"
            },
            "name": {
              "kind": "string"
            },
            "addresses": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "pairing": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "code": {
                      "kind": "string"
                    },
                    "expiresAt": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "code",
                    "expiresAt"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "devices": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "pairedAt": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "pairedAt"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "port",
            "name",
            "addresses",
            "error",
            "pairing",
            "devices"
          ]
        },
        "satellite": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "host": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "id": {
                      "kind": "string"
                    },
                    "name": {
                      "kind": "string"
                    },
                    "address": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "id",
                    "name",
                    "address"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "state": {
              "kind": "string",
              "choices": [
                "off",
                "unpaired",
                "searching",
                "connected"
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "discovered": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "address": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "address"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "host",
            "state",
            "error",
            "discovered"
          ]
        }
      },
      "required": [
        "host",
        "satellite"
      ]
    }
  },
  "network.configure": {
    "method": "networkConfigure",
    "input": {
      "kind": "object",
      "fields": {
        "hostEnabled": {
          "kind": "boolean"
        },
        "hostPort": {
          "kind": "number"
        },
        "satelliteEnabled": {
          "kind": "boolean"
        }
      },
      "required": []
    },
    "output": {
      "kind": "object",
      "fields": {
        "host": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "port": {
              "kind": "number"
            },
            "name": {
              "kind": "string"
            },
            "addresses": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "pairing": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "code": {
                      "kind": "string"
                    },
                    "expiresAt": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "code",
                    "expiresAt"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "devices": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "pairedAt": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "pairedAt"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "port",
            "name",
            "addresses",
            "error",
            "pairing",
            "devices"
          ]
        },
        "satellite": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "host": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "id": {
                      "kind": "string"
                    },
                    "name": {
                      "kind": "string"
                    },
                    "address": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "id",
                    "name",
                    "address"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "state": {
              "kind": "string",
              "choices": [
                "off",
                "unpaired",
                "searching",
                "connected"
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "discovered": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "address": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "address"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "host",
            "state",
            "error",
            "discovered"
          ]
        }
      },
      "required": [
        "host",
        "satellite"
      ]
    }
  },
  "network.openPairing": {
    "method": "networkOpenPairing",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "host": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "port": {
              "kind": "number"
            },
            "name": {
              "kind": "string"
            },
            "addresses": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "pairing": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "code": {
                      "kind": "string"
                    },
                    "expiresAt": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "code",
                    "expiresAt"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "devices": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "pairedAt": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "pairedAt"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "port",
            "name",
            "addresses",
            "error",
            "pairing",
            "devices"
          ]
        },
        "satellite": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "host": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "id": {
                      "kind": "string"
                    },
                    "name": {
                      "kind": "string"
                    },
                    "address": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "id",
                    "name",
                    "address"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "state": {
              "kind": "string",
              "choices": [
                "off",
                "unpaired",
                "searching",
                "connected"
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "discovered": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "address": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "address"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "host",
            "state",
            "error",
            "discovered"
          ]
        }
      },
      "required": [
        "host",
        "satellite"
      ]
    }
  },
  "network.removeDevice": {
    "method": "networkRemoveDevice",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "host": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "port": {
              "kind": "number"
            },
            "name": {
              "kind": "string"
            },
            "addresses": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "pairing": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "code": {
                      "kind": "string"
                    },
                    "expiresAt": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "code",
                    "expiresAt"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "devices": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "pairedAt": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "pairedAt"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "port",
            "name",
            "addresses",
            "error",
            "pairing",
            "devices"
          ]
        },
        "satellite": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "host": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "id": {
                      "kind": "string"
                    },
                    "name": {
                      "kind": "string"
                    },
                    "address": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "id",
                    "name",
                    "address"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "state": {
              "kind": "string",
              "choices": [
                "off",
                "unpaired",
                "searching",
                "connected"
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "discovered": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "address": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "address"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "host",
            "state",
            "error",
            "discovered"
          ]
        }
      },
      "required": [
        "host",
        "satellite"
      ]
    }
  },
  "network.pair": {
    "method": "networkPair",
    "input": {
      "kind": "object",
      "fields": {
        "address": {
          "kind": "string"
        },
        "code": {
          "kind": "string"
        }
      },
      "required": [
        "address",
        "code"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "host": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "port": {
              "kind": "number"
            },
            "name": {
              "kind": "string"
            },
            "addresses": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "pairing": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "code": {
                      "kind": "string"
                    },
                    "expiresAt": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "code",
                    "expiresAt"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "devices": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "pairedAt": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "pairedAt"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "port",
            "name",
            "addresses",
            "error",
            "pairing",
            "devices"
          ]
        },
        "satellite": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "host": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "id": {
                      "kind": "string"
                    },
                    "name": {
                      "kind": "string"
                    },
                    "address": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "id",
                    "name",
                    "address"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "state": {
              "kind": "string",
              "choices": [
                "off",
                "unpaired",
                "searching",
                "connected"
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "discovered": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "address": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "address"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "host",
            "state",
            "error",
            "discovered"
          ]
        }
      },
      "required": [
        "host",
        "satellite"
      ]
    }
  },
  "network.unpair": {
    "method": "networkUnpair",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "host": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "port": {
              "kind": "number"
            },
            "name": {
              "kind": "string"
            },
            "addresses": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "pairing": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "code": {
                      "kind": "string"
                    },
                    "expiresAt": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "code",
                    "expiresAt"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "devices": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "pairedAt": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "pairedAt"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "port",
            "name",
            "addresses",
            "error",
            "pairing",
            "devices"
          ]
        },
        "satellite": {
          "kind": "object",
          "fields": {
            "enabled": {
              "kind": "boolean"
            },
            "host": {
              "kind": "union",
              "variants": [
                {
                  "kind": "object",
                  "fields": {
                    "id": {
                      "kind": "string"
                    },
                    "name": {
                      "kind": "string"
                    },
                    "address": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "id",
                    "name",
                    "address"
                  ]
                },
                {
                  "kind": "null"
                }
              ]
            },
            "state": {
              "kind": "string",
              "choices": [
                "off",
                "unpaired",
                "searching",
                "connected"
              ]
            },
            "error": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "discovered": {
              "kind": "array",
              "items": {
                "kind": "object",
                "fields": {
                  "id": {
                    "kind": "string"
                  },
                  "name": {
                    "kind": "string"
                  },
                  "address": {
                    "kind": "string"
                  }
                },
                "required": [
                  "id",
                  "name",
                  "address"
                ]
              }
            }
          },
          "required": [
            "enabled",
            "host",
            "state",
            "error",
            "discovered"
          ]
        }
      },
      "required": [
        "host",
        "satellite"
      ]
    }
  },
  "settings.previewIdentity": {
    "method": "settingsPreviewIdentity",
    "input": {
      "kind": "object",
      "fields": {
        "identity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "projectId": {
          "kind": "string"
        }
      },
      "required": [
        "identity"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "slug": {
          "kind": "string"
        },
        "login": {
          "kind": "string"
        },
        "email": {
          "kind": "string"
        },
        "complete": {
          "kind": "boolean"
        },
        "current": {
          "kind": "boolean"
        },
        "url": {
          "kind": "string"
        },
        "resolved": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "appSlug": {
                  "kind": "string"
                },
                "botUserId": {
                  "kind": "string"
                },
                "appId": {
                  "kind": "string"
                },
                "setupVersion": {
                  "kind": "number"
                }
              },
              "required": [
                "appSlug",
                "botUserId"
              ]
            },
            {
              "kind": "null"
            }
          ]
        }
      },
      "required": [
        "slug",
        "login",
        "email",
        "complete",
        "current",
        "url",
        "resolved"
      ]
    }
  },
  "settings.setIdentity": {
    "method": "settingsSetIdentity",
    "input": {
      "kind": "object",
      "fields": {
        "appSlug": {
          "kind": "string"
        },
        "botUserId": {
          "kind": "string"
        },
        "appId": {
          "kind": "string"
        },
        "setupVersion": {
          "kind": "number"
        }
      },
      "required": [
        "appSlug",
        "botUserId"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "taskHooks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              },
              "events": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "created",
                    "queued",
                    "held",
                    "started",
                    "stopped",
                    "review",
                    "failed",
                    "beforeComplete",
                    "completed",
                    "reopened",
                    "archived",
                    "restored",
                    "deleted"
                  ]
                }
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "command"
                ]
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "timeoutSeconds": {
                "kind": "number"
              }
            },
            "required": [
              "id"
            ]
          }
        },
        "worktreeEnabled": {
          "kind": "boolean"
        },
        "httpEnabled": {
          "kind": "boolean"
        },
        "httpPort": {
          "kind": "number"
        },
        "mcpEnabled": {
          "kind": "boolean"
        },
        "mcpPort": {
          "kind": "number"
        },
        "autoStartScheduler": {
          "kind": "boolean"
        },
        "keepRunningInBackground": {
          "kind": "boolean"
        },
        "notifyOnReview": {
          "kind": "boolean"
        },
        "notifyOnFailure": {
          "kind": "boolean"
        },
        "nativeNotifications": {
          "kind": "boolean"
        },
        "sstpEnabled": {
          "kind": "boolean"
        },
        "sstpHost": {
          "kind": "string"
        },
        "sstpPort": {
          "kind": "number"
        },
        "sstpScripts": {
          "kind": "object",
          "fields": {
            "review": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "failure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "followUp": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "reportFailure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "pullRequest": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "syncConflict": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            }
          },
          "required": [
            "review",
            "failure",
            "followUp",
            "reportFailure",
            "pullRequest",
            "syncConflict"
          ]
        },
        "tickIntervalMs": {
          "kind": "number"
        },
        "importExternalSessions": {
          "kind": "boolean"
        },
        "importHistoryDays": {
          "kind": "number"
        },
        "importCreateProjects": {
          "kind": "boolean"
        },
        "retentionDays": {
          "kind": "number"
        },
        "commitIdentityEnabled": {
          "kind": "boolean"
        },
        "commitIdentity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "editorApp": {
          "kind": "string"
        },
        "mobileSyncEnabled": {
          "kind": "boolean"
        },
        "reportEnabled": {
          "kind": "boolean"
        },
        "reportTargetKind": {
          "kind": "string",
          "choices": [
            "agent",
            "group"
          ]
        },
        "reportTargetId": {
          "kind": "string"
        },
        "reportInstructions": {
          "kind": "string"
        },
        "projectReportInstructions": {
          "kind": "string"
        },
        "pullRequestFailurePrompt": {
          "kind": "string"
        },
        "pullRequestPendingPrompt": {
          "kind": "string"
        },
        "pullRequestConflictPrompt": {
          "kind": "string"
        },
        "pullRequestFailureEnabled": {
          "kind": "boolean"
        },
        "pullRequestPendingEnabled": {
          "kind": "boolean"
        },
        "pullRequestConflictEnabled": {
          "kind": "boolean"
        },
        "theme": {
          "kind": "string",
          "choices": [
            "dark",
            "light",
            "system"
          ]
        }
      },
      "required": [
        "taskHooks",
        "worktreeEnabled",
        "httpEnabled",
        "httpPort",
        "mcpEnabled",
        "mcpPort",
        "autoStartScheduler",
        "keepRunningInBackground",
        "notifyOnReview",
        "notifyOnFailure",
        "nativeNotifications",
        "sstpEnabled",
        "sstpHost",
        "sstpPort",
        "sstpScripts",
        "tickIntervalMs",
        "importExternalSessions",
        "importHistoryDays",
        "importCreateProjects",
        "retentionDays",
        "commitIdentityEnabled",
        "commitIdentity",
        "editorApp",
        "mobileSyncEnabled",
        "reportEnabled",
        "reportTargetKind",
        "reportTargetId",
        "reportInstructions",
        "projectReportInstructions",
        "pullRequestFailurePrompt",
        "pullRequestPendingPrompt",
        "pullRequestConflictPrompt",
        "pullRequestFailureEnabled",
        "pullRequestPendingEnabled",
        "pullRequestConflictEnabled",
        "theme"
      ]
    }
  },
  "settings.get": {
    "method": "settingsGet",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "taskHooks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              },
              "events": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "created",
                    "queued",
                    "held",
                    "started",
                    "stopped",
                    "review",
                    "failed",
                    "beforeComplete",
                    "completed",
                    "reopened",
                    "archived",
                    "restored",
                    "deleted"
                  ]
                }
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "command"
                ]
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "timeoutSeconds": {
                "kind": "number"
              }
            },
            "required": [
              "id"
            ]
          }
        },
        "worktreeEnabled": {
          "kind": "boolean"
        },
        "httpEnabled": {
          "kind": "boolean"
        },
        "httpPort": {
          "kind": "number"
        },
        "mcpEnabled": {
          "kind": "boolean"
        },
        "mcpPort": {
          "kind": "number"
        },
        "autoStartScheduler": {
          "kind": "boolean"
        },
        "keepRunningInBackground": {
          "kind": "boolean"
        },
        "notifyOnReview": {
          "kind": "boolean"
        },
        "notifyOnFailure": {
          "kind": "boolean"
        },
        "nativeNotifications": {
          "kind": "boolean"
        },
        "sstpEnabled": {
          "kind": "boolean"
        },
        "sstpHost": {
          "kind": "string"
        },
        "sstpPort": {
          "kind": "number"
        },
        "sstpScripts": {
          "kind": "object",
          "fields": {
            "review": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "failure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "followUp": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "reportFailure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "pullRequest": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "syncConflict": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            }
          },
          "required": [
            "review",
            "failure",
            "followUp",
            "reportFailure",
            "pullRequest",
            "syncConflict"
          ]
        },
        "tickIntervalMs": {
          "kind": "number"
        },
        "importExternalSessions": {
          "kind": "boolean"
        },
        "importHistoryDays": {
          "kind": "number"
        },
        "importCreateProjects": {
          "kind": "boolean"
        },
        "retentionDays": {
          "kind": "number"
        },
        "commitIdentityEnabled": {
          "kind": "boolean"
        },
        "commitIdentity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "editorApp": {
          "kind": "string"
        },
        "mobileSyncEnabled": {
          "kind": "boolean"
        },
        "reportEnabled": {
          "kind": "boolean"
        },
        "reportTargetKind": {
          "kind": "string",
          "choices": [
            "agent",
            "group"
          ]
        },
        "reportTargetId": {
          "kind": "string"
        },
        "reportInstructions": {
          "kind": "string"
        },
        "projectReportInstructions": {
          "kind": "string"
        },
        "pullRequestFailurePrompt": {
          "kind": "string"
        },
        "pullRequestPendingPrompt": {
          "kind": "string"
        },
        "pullRequestConflictPrompt": {
          "kind": "string"
        },
        "pullRequestFailureEnabled": {
          "kind": "boolean"
        },
        "pullRequestPendingEnabled": {
          "kind": "boolean"
        },
        "pullRequestConflictEnabled": {
          "kind": "boolean"
        },
        "theme": {
          "kind": "string",
          "choices": [
            "dark",
            "light",
            "system"
          ]
        }
      },
      "required": [
        "taskHooks",
        "worktreeEnabled",
        "httpEnabled",
        "httpPort",
        "mcpEnabled",
        "mcpPort",
        "autoStartScheduler",
        "keepRunningInBackground",
        "notifyOnReview",
        "notifyOnFailure",
        "nativeNotifications",
        "sstpEnabled",
        "sstpHost",
        "sstpPort",
        "sstpScripts",
        "tickIntervalMs",
        "importExternalSessions",
        "importHistoryDays",
        "importCreateProjects",
        "retentionDays",
        "commitIdentityEnabled",
        "commitIdentity",
        "editorApp",
        "mobileSyncEnabled",
        "reportEnabled",
        "reportTargetKind",
        "reportTargetId",
        "reportInstructions",
        "projectReportInstructions",
        "pullRequestFailurePrompt",
        "pullRequestPendingPrompt",
        "pullRequestConflictPrompt",
        "pullRequestFailureEnabled",
        "pullRequestPendingEnabled",
        "pullRequestConflictEnabled",
        "theme"
      ]
    }
  },
  "settings.set": {
    "method": "settingsSet",
    "input": {
      "kind": "object",
      "fields": {
        "taskHooks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              },
              "events": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "created",
                    "queued",
                    "held",
                    "started",
                    "stopped",
                    "review",
                    "failed",
                    "beforeComplete",
                    "completed",
                    "reopened",
                    "archived",
                    "restored",
                    "deleted"
                  ]
                }
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "command"
                ]
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "timeoutSeconds": {
                "kind": "number"
              }
            },
            "required": [
              "id"
            ]
          }
        },
        "worktreeEnabled": {
          "kind": "boolean"
        },
        "httpEnabled": {
          "kind": "boolean"
        },
        "httpPort": {
          "kind": "number"
        },
        "mcpEnabled": {
          "kind": "boolean"
        },
        "mcpPort": {
          "kind": "number"
        },
        "autoStartScheduler": {
          "kind": "boolean"
        },
        "keepRunningInBackground": {
          "kind": "boolean"
        },
        "notifyOnReview": {
          "kind": "boolean"
        },
        "notifyOnFailure": {
          "kind": "boolean"
        },
        "nativeNotifications": {
          "kind": "boolean"
        },
        "sstpEnabled": {
          "kind": "boolean"
        },
        "sstpHost": {
          "kind": "string"
        },
        "sstpPort": {
          "kind": "number"
        },
        "sstpScripts": {
          "kind": "object",
          "fields": {
            "review": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "failure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "followUp": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "reportFailure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "pullRequest": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "syncConflict": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            }
          },
          "required": [
            "review",
            "failure",
            "followUp",
            "reportFailure",
            "pullRequest",
            "syncConflict"
          ]
        },
        "tickIntervalMs": {
          "kind": "number"
        },
        "importExternalSessions": {
          "kind": "boolean"
        },
        "importHistoryDays": {
          "kind": "number"
        },
        "importCreateProjects": {
          "kind": "boolean"
        },
        "retentionDays": {
          "kind": "number"
        },
        "commitIdentityEnabled": {
          "kind": "boolean"
        },
        "commitIdentity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "editorApp": {
          "kind": "string"
        },
        "mobileSyncEnabled": {
          "kind": "boolean"
        },
        "reportEnabled": {
          "kind": "boolean"
        },
        "reportTargetKind": {
          "kind": "string",
          "choices": [
            "agent",
            "group"
          ]
        },
        "reportTargetId": {
          "kind": "string"
        },
        "reportInstructions": {
          "kind": "string"
        },
        "projectReportInstructions": {
          "kind": "string"
        },
        "pullRequestFailurePrompt": {
          "kind": "string"
        },
        "pullRequestPendingPrompt": {
          "kind": "string"
        },
        "pullRequestConflictPrompt": {
          "kind": "string"
        },
        "pullRequestFailureEnabled": {
          "kind": "boolean"
        },
        "pullRequestPendingEnabled": {
          "kind": "boolean"
        },
        "pullRequestConflictEnabled": {
          "kind": "boolean"
        },
        "theme": {
          "kind": "string",
          "choices": [
            "dark",
            "light",
            "system"
          ]
        }
      },
      "required": []
    },
    "output": {
      "kind": "object",
      "fields": {
        "taskHooks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "name": {
                "kind": "string"
              },
              "enabled": {
                "kind": "boolean"
              },
              "events": {
                "kind": "array",
                "items": {
                  "kind": "string",
                  "choices": [
                    "created",
                    "queued",
                    "held",
                    "started",
                    "stopped",
                    "review",
                    "failed",
                    "beforeComplete",
                    "completed",
                    "reopened",
                    "archived",
                    "restored",
                    "deleted"
                  ]
                }
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "command"
                ]
              },
              "targetKind": {
                "kind": "string",
                "choices": [
                  "agent",
                  "group"
                ]
              },
              "targetId": {
                "kind": "string"
              },
              "prompt": {
                "kind": "string"
              },
              "command": {
                "kind": "string"
              },
              "timeoutSeconds": {
                "kind": "number"
              }
            },
            "required": [
              "id"
            ]
          }
        },
        "worktreeEnabled": {
          "kind": "boolean"
        },
        "httpEnabled": {
          "kind": "boolean"
        },
        "httpPort": {
          "kind": "number"
        },
        "mcpEnabled": {
          "kind": "boolean"
        },
        "mcpPort": {
          "kind": "number"
        },
        "autoStartScheduler": {
          "kind": "boolean"
        },
        "keepRunningInBackground": {
          "kind": "boolean"
        },
        "notifyOnReview": {
          "kind": "boolean"
        },
        "notifyOnFailure": {
          "kind": "boolean"
        },
        "nativeNotifications": {
          "kind": "boolean"
        },
        "sstpEnabled": {
          "kind": "boolean"
        },
        "sstpHost": {
          "kind": "string"
        },
        "sstpPort": {
          "kind": "number"
        },
        "sstpScripts": {
          "kind": "object",
          "fields": {
            "review": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "failure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "followUp": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "reportFailure": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "pullRequest": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            },
            "syncConflict": {
              "kind": "array",
              "items": {
                "kind": "string"
              }
            }
          },
          "required": [
            "review",
            "failure",
            "followUp",
            "reportFailure",
            "pullRequest",
            "syncConflict"
          ]
        },
        "tickIntervalMs": {
          "kind": "number"
        },
        "importExternalSessions": {
          "kind": "boolean"
        },
        "importHistoryDays": {
          "kind": "number"
        },
        "importCreateProjects": {
          "kind": "boolean"
        },
        "retentionDays": {
          "kind": "number"
        },
        "commitIdentityEnabled": {
          "kind": "boolean"
        },
        "commitIdentity": {
          "kind": "object",
          "fields": {
            "appSlug": {
              "kind": "string"
            },
            "botUserId": {
              "kind": "string"
            },
            "appId": {
              "kind": "string"
            },
            "setupVersion": {
              "kind": "number"
            }
          },
          "required": [
            "appSlug",
            "botUserId"
          ]
        },
        "editorApp": {
          "kind": "string"
        },
        "mobileSyncEnabled": {
          "kind": "boolean"
        },
        "reportEnabled": {
          "kind": "boolean"
        },
        "reportTargetKind": {
          "kind": "string",
          "choices": [
            "agent",
            "group"
          ]
        },
        "reportTargetId": {
          "kind": "string"
        },
        "reportInstructions": {
          "kind": "string"
        },
        "projectReportInstructions": {
          "kind": "string"
        },
        "pullRequestFailurePrompt": {
          "kind": "string"
        },
        "pullRequestPendingPrompt": {
          "kind": "string"
        },
        "pullRequestConflictPrompt": {
          "kind": "string"
        },
        "pullRequestFailureEnabled": {
          "kind": "boolean"
        },
        "pullRequestPendingEnabled": {
          "kind": "boolean"
        },
        "pullRequestConflictEnabled": {
          "kind": "boolean"
        },
        "theme": {
          "kind": "string",
          "choices": [
            "dark",
            "light",
            "system"
          ]
        }
      },
      "required": [
        "taskHooks",
        "worktreeEnabled",
        "httpEnabled",
        "httpPort",
        "mcpEnabled",
        "mcpPort",
        "autoStartScheduler",
        "keepRunningInBackground",
        "notifyOnReview",
        "notifyOnFailure",
        "nativeNotifications",
        "sstpEnabled",
        "sstpHost",
        "sstpPort",
        "sstpScripts",
        "tickIntervalMs",
        "importExternalSessions",
        "importHistoryDays",
        "importCreateProjects",
        "retentionDays",
        "commitIdentityEnabled",
        "commitIdentity",
        "editorApp",
        "mobileSyncEnabled",
        "reportEnabled",
        "reportTargetKind",
        "reportTargetId",
        "reportInstructions",
        "projectReportInstructions",
        "pullRequestFailurePrompt",
        "pullRequestPendingPrompt",
        "pullRequestConflictPrompt",
        "pullRequestFailureEnabled",
        "pullRequestPendingEnabled",
        "pullRequestConflictEnabled",
        "theme"
      ]
    }
  },
  "settings.lookupBotUser": {
    "method": "settingsLookupBotUser",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "object",
          "fields": {
            "ok": {
              "kind": "boolean",
              "choices": [
                true
              ]
            },
            "botUserId": {
              "kind": "string"
            }
          },
          "required": [
            "ok",
            "botUserId"
          ]
        },
        {
          "kind": "object",
          "fields": {
            "ok": {
              "kind": "boolean",
              "choices": [
                false
              ]
            },
            "reason": {
              "kind": "string"
            }
          },
          "required": [
            "ok",
            "reason"
          ]
        }
      ]
    }
  },
  "settings.createGitHubApp": {
    "method": "settingsCreateGitHubApp",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "object",
          "fields": {
            "ok": {
              "kind": "boolean",
              "choices": [
                true
              ]
            },
            "identity": {
              "kind": "object",
              "fields": {
                "appSlug": {
                  "kind": "string"
                },
                "botUserId": {
                  "kind": "string"
                },
                "appId": {
                  "kind": "string"
                },
                "setupVersion": {
                  "kind": "number"
                }
              },
              "required": [
                "appSlug",
                "botUserId"
              ]
            }
          },
          "required": [
            "ok",
            "identity"
          ]
        },
        {
          "kind": "object",
          "fields": {
            "ok": {
              "kind": "boolean",
              "choices": [
                false
              ]
            },
            "reason": {
              "kind": "string"
            },
            "canceled": {
              "kind": "boolean"
            }
          },
          "required": [
            "ok",
            "reason"
          ]
        }
      ]
    }
  },
  "settings.cancelGitHubApp": {
    "method": "settingsCancelGitHubApp",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "void"
    }
  },
  "mobile.status": {
    "method": "mobileStatus",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "enabled": {
          "kind": "boolean"
        },
        "reachable": {
          "kind": "boolean"
        },
        "lastExportAt": {
          "kind": "string"
        },
        "lastImportAt": {
          "kind": "string"
        },
        "conflicts": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "intentId": {
                "kind": "string"
              },
              "device": {
                "kind": "string"
              },
              "seq": {
                "kind": "number"
              },
              "taskId": {
                "kind": "string"
              },
              "at": {
                "kind": "string"
              },
              "outcome": {
                "kind": "string",
                "choices": [
                  "applied",
                  "skipped",
                  "deferred",
                  "conflict"
                ]
              },
              "reason": {
                "kind": "string"
              }
            },
            "required": [
              "intentId",
              "device",
              "seq",
              "taskId",
              "at",
              "outcome",
              "reason"
            ]
          }
        },
        "error": {
          "kind": "string"
        }
      },
      "required": [
        "enabled",
        "reachable",
        "lastExportAt",
        "lastImportAt",
        "conflicts",
        "error"
      ]
    }
  },
  "mobile.syncNow": {
    "method": "mobileSyncNow",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "enabled": {
          "kind": "boolean"
        },
        "reachable": {
          "kind": "boolean"
        },
        "lastExportAt": {
          "kind": "string"
        },
        "lastImportAt": {
          "kind": "string"
        },
        "conflicts": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "intentId": {
                "kind": "string"
              },
              "device": {
                "kind": "string"
              },
              "seq": {
                "kind": "number"
              },
              "taskId": {
                "kind": "string"
              },
              "at": {
                "kind": "string"
              },
              "outcome": {
                "kind": "string",
                "choices": [
                  "applied",
                  "skipped",
                  "deferred",
                  "conflict"
                ]
              },
              "reason": {
                "kind": "string"
              }
            },
            "required": [
              "intentId",
              "device",
              "seq",
              "taskId",
              "at",
              "outcome",
              "reason"
            ]
          }
        },
        "error": {
          "kind": "string"
        }
      },
      "required": [
        "enabled",
        "reachable",
        "lastExportAt",
        "lastImportAt",
        "conflicts",
        "error"
      ]
    }
  },
  "importer.sync": {
    "method": "importerSync",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "scanned": {
          "kind": "number"
        },
        "createdTasks": {
          "kind": "number"
        },
        "createdProjects": {
          "kind": "number"
        },
        "updated": {
          "kind": "number"
        },
        "running": {
          "kind": "number"
        }
      },
      "required": [
        "scanned",
        "createdTasks",
        "createdProjects",
        "updated",
        "running"
      ]
    }
  },
  "open.terminal": {
    "method": "openTerminal",
    "input": {
      "kind": "object",
      "fields": {
        "kind": {
          "kind": "string",
          "choices": [
            "task",
            "run",
            "project"
          ]
        },
        "id": {
          "kind": "string"
        }
      },
      "required": [
        "kind",
        "id"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "open.resume": {
    "method": "openResume",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "open.editor": {
    "method": "openEditor",
    "input": {
      "kind": "object",
      "fields": {
        "target": {
          "kind": "object",
          "fields": {
            "kind": {
              "kind": "string",
              "choices": [
                "task",
                "run",
                "project"
              ]
            },
            "id": {
              "kind": "string"
            }
          },
          "required": [
            "kind",
            "id"
          ]
        },
        "appPath": {
          "kind": "string"
        }
      },
      "required": [
        "target"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "open.reveal": {
    "method": "openReveal",
    "input": {
      "kind": "object",
      "fields": {
        "kind": {
          "kind": "string",
          "choices": [
            "task",
            "run",
            "project"
          ]
        },
        "id": {
          "kind": "string"
        }
      },
      "required": [
        "kind",
        "id"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "open.workingDir": {
    "method": "openWorkingDir",
    "input": {
      "kind": "object",
      "fields": {
        "kind": {
          "kind": "string",
          "choices": [
            "task",
            "run",
            "project"
          ]
        },
        "id": {
          "kind": "string"
        }
      },
      "required": [
        "kind",
        "id"
      ]
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "string"
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "open.editors": {
    "method": "openEditors",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "path": {
            "kind": "string"
          },
          "name": {
            "kind": "string"
          }
        },
        "required": [
          "path",
          "name"
        ]
      }
    }
  },
  "review.snapshot": {
    "method": "reviewSnapshot",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "preparing": {
          "kind": "boolean"
        },
        "error": {
          "kind": "string"
        },
        "cwd": {
          "kind": "string"
        },
        "branch": {
          "kind": "string"
        },
        "repository": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "tree": {
          "kind": "array",
          "items": {
            "kind": "value"
          }
        },
        "changes": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "localChanges": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "stagedChanges": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "revision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "localRevision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "stagedRevision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "commits": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "sha": {
                "kind": "string"
              },
              "shortSha": {
                "kind": "string"
              },
              "subject": {
                "kind": "string"
              },
              "author": {
                "kind": "string"
              },
              "committedAt": {
                "kind": "string"
              },
              "files": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "path": {
                      "kind": "string"
                    },
                    "change": {
                      "kind": "string",
                      "choices": [
                        "added",
                        "modified",
                        "deleted",
                        "renamed",
                        "copied",
                        "untracked",
                        "conflicted"
                      ]
                    },
                    "previousPath": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "path",
                    "change"
                  ]
                }
              }
            },
            "required": [
              "sha",
              "shortSha",
              "subject",
              "author",
              "committedAt",
              "files"
            ]
          }
        },
        "pullRequests": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "number": {
                "kind": "number"
              },
              "title": {
                "kind": "string"
              },
              "url": {
                "kind": "string"
              },
              "headRefName": {
                "kind": "string"
              },
              "baseRefName": {
                "kind": "string"
              },
              "headSha": {
                "kind": "string"
              },
              "draft": {
                "kind": "boolean"
              },
              "updatedAt": {
                "kind": "string"
              },
              "check": {
                "kind": "string",
                "choices": [
                  "success",
                  "failure",
                  "pending",
                  "neutral"
                ]
              },
              "mergeState": {
                "kind": "string",
                "choices": [
                  "clean",
                  "conflicting",
                  "unknown"
                ]
              },
              "state": {
                "kind": "string",
                "choices": [
                  "open",
                  "merged",
                  "closed"
                ]
              },
              "files": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "path": {
                      "kind": "string"
                    },
                    "change": {
                      "kind": "string",
                      "choices": [
                        "added",
                        "modified",
                        "deleted",
                        "renamed",
                        "copied",
                        "untracked",
                        "conflicted"
                      ]
                    },
                    "previousPath": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "path",
                    "change"
                  ]
                }
              }
            },
            "required": [
              "number",
              "title",
              "url",
              "headRefName",
              "baseRefName",
              "headSha",
              "draft",
              "updatedAt",
              "check",
              "mergeState",
              "state",
              "files"
            ]
          }
        },
        "coverage": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "source": {
                  "kind": "string"
                },
                "lines": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "functions": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "branches": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "statements": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "files": {
                  "kind": "array",
                  "items": {
                    "kind": "object",
                    "fields": {
                      "path": {
                        "kind": "string"
                      },
                      "lines": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "functions": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "branches": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "statements": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "uncoveredLines": {
                        "kind": "array",
                        "items": {
                          "kind": "number"
                        }
                      }
                    },
                    "required": [
                      "path",
                      "uncoveredLines"
                    ]
                  }
                }
              },
              "required": [
                "source",
                "files"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "projectTasks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "label": {
                "kind": "string"
              },
              "source": {
                "kind": "string",
                "choices": [
                  "package",
                  "composer",
                  "make"
                ]
              },
              "command": {
                "kind": "string"
              }
            },
            "required": [
              "id",
              "label",
              "source",
              "command"
            ]
          }
        },
        "pullRequestNotice": {
          "kind": "string"
        }
      },
      "required": [
        "cwd",
        "branch",
        "repository",
        "tree",
        "changes",
        "localChanges",
        "stagedChanges",
        "revision",
        "localRevision",
        "stagedRevision",
        "commits",
        "pullRequests",
        "coverage",
        "projectTasks"
      ]
    }
  },
  "review.refresh": {
    "method": "reviewRefresh",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "preparing": {
          "kind": "boolean"
        },
        "error": {
          "kind": "string"
        },
        "cwd": {
          "kind": "string"
        },
        "branch": {
          "kind": "string"
        },
        "repository": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "tree": {
          "kind": "array",
          "items": {
            "kind": "value"
          }
        },
        "changes": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "localChanges": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "stagedChanges": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "revision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "localRevision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "stagedRevision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "commits": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "sha": {
                "kind": "string"
              },
              "shortSha": {
                "kind": "string"
              },
              "subject": {
                "kind": "string"
              },
              "author": {
                "kind": "string"
              },
              "committedAt": {
                "kind": "string"
              },
              "files": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "path": {
                      "kind": "string"
                    },
                    "change": {
                      "kind": "string",
                      "choices": [
                        "added",
                        "modified",
                        "deleted",
                        "renamed",
                        "copied",
                        "untracked",
                        "conflicted"
                      ]
                    },
                    "previousPath": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "path",
                    "change"
                  ]
                }
              }
            },
            "required": [
              "sha",
              "shortSha",
              "subject",
              "author",
              "committedAt",
              "files"
            ]
          }
        },
        "pullRequests": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "number": {
                "kind": "number"
              },
              "title": {
                "kind": "string"
              },
              "url": {
                "kind": "string"
              },
              "headRefName": {
                "kind": "string"
              },
              "baseRefName": {
                "kind": "string"
              },
              "headSha": {
                "kind": "string"
              },
              "draft": {
                "kind": "boolean"
              },
              "updatedAt": {
                "kind": "string"
              },
              "check": {
                "kind": "string",
                "choices": [
                  "success",
                  "failure",
                  "pending",
                  "neutral"
                ]
              },
              "mergeState": {
                "kind": "string",
                "choices": [
                  "clean",
                  "conflicting",
                  "unknown"
                ]
              },
              "state": {
                "kind": "string",
                "choices": [
                  "open",
                  "merged",
                  "closed"
                ]
              },
              "files": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "path": {
                      "kind": "string"
                    },
                    "change": {
                      "kind": "string",
                      "choices": [
                        "added",
                        "modified",
                        "deleted",
                        "renamed",
                        "copied",
                        "untracked",
                        "conflicted"
                      ]
                    },
                    "previousPath": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "path",
                    "change"
                  ]
                }
              }
            },
            "required": [
              "number",
              "title",
              "url",
              "headRefName",
              "baseRefName",
              "headSha",
              "draft",
              "updatedAt",
              "check",
              "mergeState",
              "state",
              "files"
            ]
          }
        },
        "coverage": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "source": {
                  "kind": "string"
                },
                "lines": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "functions": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "branches": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "statements": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "files": {
                  "kind": "array",
                  "items": {
                    "kind": "object",
                    "fields": {
                      "path": {
                        "kind": "string"
                      },
                      "lines": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "functions": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "branches": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "statements": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "uncoveredLines": {
                        "kind": "array",
                        "items": {
                          "kind": "number"
                        }
                      }
                    },
                    "required": [
                      "path",
                      "uncoveredLines"
                    ]
                  }
                }
              },
              "required": [
                "source",
                "files"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "projectTasks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "label": {
                "kind": "string"
              },
              "source": {
                "kind": "string",
                "choices": [
                  "package",
                  "composer",
                  "make"
                ]
              },
              "command": {
                "kind": "string"
              }
            },
            "required": [
              "id",
              "label",
              "source",
              "command"
            ]
          }
        },
        "pullRequestNotice": {
          "kind": "string"
        }
      },
      "required": [
        "cwd",
        "branch",
        "repository",
        "tree",
        "changes",
        "localChanges",
        "stagedChanges",
        "revision",
        "localRevision",
        "stagedRevision",
        "commits",
        "pullRequests",
        "coverage",
        "projectTasks"
      ]
    }
  },
  "review.history": {
    "method": "reviewHistory",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "runId": {
            "kind": "string"
          },
          "endedAt": {
            "kind": "string"
          },
          "recordedAt": {
            "kind": "string"
          }
        },
        "required": [
          "runId",
          "endedAt",
          "recordedAt"
        ]
      }
    }
  },
  "review.historySnapshot": {
    "method": "reviewHistorySnapshot",
    "input": {
      "kind": "object",
      "fields": {
        "taskId": {
          "kind": "string"
        },
        "runId": {
          "kind": "string"
        }
      },
      "required": [
        "taskId",
        "runId"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "preparing": {
          "kind": "boolean"
        },
        "error": {
          "kind": "string"
        },
        "cwd": {
          "kind": "string"
        },
        "branch": {
          "kind": "string"
        },
        "repository": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "tree": {
          "kind": "array",
          "items": {
            "kind": "value"
          }
        },
        "changes": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "localChanges": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "stagedChanges": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "path": {
                "kind": "string"
              },
              "change": {
                "kind": "string",
                "choices": [
                  "added",
                  "modified",
                  "deleted",
                  "renamed",
                  "copied",
                  "untracked",
                  "conflicted"
                ]
              },
              "previousPath": {
                "kind": "string"
              }
            },
            "required": [
              "path",
              "change"
            ]
          }
        },
        "revision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "localRevision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "stagedRevision": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "base": {
                  "kind": "string"
                },
                "head": {
                  "kind": "string"
                }
              },
              "required": [
                "base",
                "head"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "commits": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "sha": {
                "kind": "string"
              },
              "shortSha": {
                "kind": "string"
              },
              "subject": {
                "kind": "string"
              },
              "author": {
                "kind": "string"
              },
              "committedAt": {
                "kind": "string"
              },
              "files": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "path": {
                      "kind": "string"
                    },
                    "change": {
                      "kind": "string",
                      "choices": [
                        "added",
                        "modified",
                        "deleted",
                        "renamed",
                        "copied",
                        "untracked",
                        "conflicted"
                      ]
                    },
                    "previousPath": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "path",
                    "change"
                  ]
                }
              }
            },
            "required": [
              "sha",
              "shortSha",
              "subject",
              "author",
              "committedAt",
              "files"
            ]
          }
        },
        "pullRequests": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "number": {
                "kind": "number"
              },
              "title": {
                "kind": "string"
              },
              "url": {
                "kind": "string"
              },
              "headRefName": {
                "kind": "string"
              },
              "baseRefName": {
                "kind": "string"
              },
              "headSha": {
                "kind": "string"
              },
              "draft": {
                "kind": "boolean"
              },
              "updatedAt": {
                "kind": "string"
              },
              "check": {
                "kind": "string",
                "choices": [
                  "success",
                  "failure",
                  "pending",
                  "neutral"
                ]
              },
              "mergeState": {
                "kind": "string",
                "choices": [
                  "clean",
                  "conflicting",
                  "unknown"
                ]
              },
              "state": {
                "kind": "string",
                "choices": [
                  "open",
                  "merged",
                  "closed"
                ]
              },
              "files": {
                "kind": "array",
                "items": {
                  "kind": "object",
                  "fields": {
                    "path": {
                      "kind": "string"
                    },
                    "change": {
                      "kind": "string",
                      "choices": [
                        "added",
                        "modified",
                        "deleted",
                        "renamed",
                        "copied",
                        "untracked",
                        "conflicted"
                      ]
                    },
                    "previousPath": {
                      "kind": "string"
                    }
                  },
                  "required": [
                    "path",
                    "change"
                  ]
                }
              }
            },
            "required": [
              "number",
              "title",
              "url",
              "headRefName",
              "baseRefName",
              "headSha",
              "draft",
              "updatedAt",
              "check",
              "mergeState",
              "state",
              "files"
            ]
          }
        },
        "coverage": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "source": {
                  "kind": "string"
                },
                "lines": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "functions": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "branches": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "statements": {
                  "kind": "object",
                  "fields": {
                    "covered": {
                      "kind": "number"
                    },
                    "total": {
                      "kind": "number"
                    },
                    "percent": {
                      "kind": "number"
                    }
                  },
                  "required": [
                    "covered",
                    "total",
                    "percent"
                  ]
                },
                "files": {
                  "kind": "array",
                  "items": {
                    "kind": "object",
                    "fields": {
                      "path": {
                        "kind": "string"
                      },
                      "lines": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "functions": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "branches": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "statements": {
                        "kind": "object",
                        "fields": {
                          "covered": {
                            "kind": "number"
                          },
                          "total": {
                            "kind": "number"
                          },
                          "percent": {
                            "kind": "number"
                          }
                        },
                        "required": [
                          "covered",
                          "total",
                          "percent"
                        ]
                      },
                      "uncoveredLines": {
                        "kind": "array",
                        "items": {
                          "kind": "number"
                        }
                      }
                    },
                    "required": [
                      "path",
                      "uncoveredLines"
                    ]
                  }
                }
              },
              "required": [
                "source",
                "files"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "projectTasks": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "label": {
                "kind": "string"
              },
              "source": {
                "kind": "string",
                "choices": [
                  "package",
                  "composer",
                  "make"
                ]
              },
              "command": {
                "kind": "string"
              }
            },
            "required": [
              "id",
              "label",
              "source",
              "command"
            ]
          }
        },
        "pullRequestNotice": {
          "kind": "string"
        }
      },
      "required": [
        "cwd",
        "branch",
        "repository",
        "tree",
        "changes",
        "localChanges",
        "stagedChanges",
        "revision",
        "localRevision",
        "stagedRevision",
        "commits",
        "pullRequests",
        "coverage",
        "projectTasks"
      ]
    }
  },
  "review.file": {
    "method": "reviewFile",
    "input": {
      "kind": "object",
      "fields": {
        "taskId": {
          "kind": "string"
        },
        "request": {
          "kind": "value"
        }
      },
      "required": [
        "taskId",
        "request"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "source": {
          "kind": "string",
          "choices": [
            "working",
            "task",
            "commit",
            "pull-request"
          ]
        },
        "path": {
          "kind": "string"
        },
        "language": {
          "kind": "string"
        },
        "content": {
          "kind": "string"
        },
        "diff": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "kind": {
                "kind": "string",
                "choices": [
                  "context",
                  "added",
                  "deleted",
                  "hunk"
                ]
              },
              "oldLine": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "number"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "newLine": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "number"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "text": {
                "kind": "string"
              }
            },
            "required": [
              "kind",
              "oldLine",
              "newLine",
              "text"
            ]
          }
        },
        "symbols": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "name": {
                "kind": "string"
              },
              "kind": {
                "kind": "string",
                "choices": [
                  "class",
                  "interface",
                  "function",
                  "method",
                  "type",
                  "variable",
                  "heading"
                ]
              },
              "line": {
                "kind": "number"
              },
              "depth": {
                "kind": "number"
              }
            },
            "required": [
              "name",
              "kind",
              "line",
              "depth"
            ]
          }
        },
        "pullRequest": {
          "kind": "union",
          "variants": [
            {
              "kind": "object",
              "fields": {
                "url": {
                  "kind": "string"
                },
                "number": {
                  "kind": "number"
                },
                "headSha": {
                  "kind": "string"
                }
              },
              "required": [
                "number",
                "headSha"
              ]
            },
            {
              "kind": "null"
            }
          ]
        },
        "binary": {
          "kind": "boolean"
        }
      },
      "required": [
        "source",
        "path",
        "language",
        "content",
        "diff",
        "symbols",
        "binary"
      ]
    }
  },
  "review.comment": {
    "method": "reviewComment",
    "input": {
      "kind": "object",
      "fields": {
        "taskId": {
          "kind": "string"
        },
        "input": {
          "kind": "object",
          "fields": {
            "pullRequestUrl": {
              "kind": "string"
            },
            "pullRequest": {
              "kind": "number"
            },
            "path": {
              "kind": "string"
            },
            "line": {
              "kind": "number"
            },
            "body": {
              "kind": "string"
            },
            "headSha": {
              "kind": "string"
            }
          },
          "required": [
            "pullRequest",
            "path",
            "line",
            "body",
            "headSha"
          ]
        }
      },
      "required": [
        "taskId",
        "input"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "review.openPullRequest": {
    "method": "reviewOpenPullRequest",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "url": {
          "kind": "string"
        },
        "bounds": {
          "kind": "object",
          "fields": {
            "x": {
              "kind": "number"
            },
            "y": {
              "kind": "number"
            },
            "width": {
              "kind": "number"
            },
            "height": {
              "kind": "number"
            }
          },
          "required": [
            "x",
            "y",
            "width",
            "height"
          ]
        }
      },
      "required": [
        "id",
        "url",
        "bounds"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "review.hidePullRequest": {
    "method": "reviewHidePullRequest",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "review.closePullRequest": {
    "method": "reviewClosePullRequest",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "report.conversation": {
    "method": "reportConversation",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "before": {
          "kind": "number"
        },
        "after": {
          "kind": "number"
        },
        "generation": {
          "kind": "string"
        }
      },
      "required": [
        "id"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "first": {
          "kind": "number"
        },
        "last": {
          "kind": "number"
        },
        "generation": {
          "kind": "string"
        },
        "hasNewer": {
          "kind": "boolean"
        },
        "indexing": {
          "kind": "boolean"
        },
        "sessionId": {
          "kind": "string"
        },
        "logPath": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "exists": {
          "kind": "boolean"
        },
        "title": {
          "kind": "union",
          "variants": [
            {
              "kind": "string"
            },
            {
              "kind": "null"
            }
          ]
        },
        "messages": {
          "kind": "array",
          "items": {
            "kind": "object",
            "fields": {
              "id": {
                "kind": "string"
              },
              "role": {
                "kind": "string",
                "choices": [
                  "user",
                  "assistant",
                  "system"
                ]
              },
              "isSidechain": {
                "kind": "boolean"
              },
              "timestamp": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              },
              "blocks": {
                "kind": "array",
                "items": {
                  "kind": "union",
                  "variants": [
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "text"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "thinking"
                          ]
                        },
                        "text": {
                          "kind": "string"
                        }
                      },
                      "required": [
                        "kind",
                        "text"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "tool"
                          ]
                        },
                        "tool": {
                          "kind": "object",
                          "fields": {
                            "plan": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "text": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "string"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "status": {
                                    "kind": "string"
                                  }
                                },
                                "required": [
                                  "text",
                                  "status"
                                ]
                              }
                            },
                            "id": {
                              "kind": "string"
                            },
                            "name": {
                              "kind": "string"
                            },
                            "input": {
                              "kind": "value"
                            },
                            "target": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "result": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "string"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "isError": {
                              "kind": "boolean"
                            },
                            "images": {
                              "kind": "array",
                              "items": {
                                "kind": "object",
                                "fields": {
                                  "id": {
                                    "kind": "string"
                                  },
                                  "mediaType": {
                                    "kind": "string"
                                  },
                                  "byteSize": {
                                    "kind": "number"
                                  },
                                  "width": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  },
                                  "height": {
                                    "kind": "union",
                                    "variants": [
                                      {
                                        "kind": "number"
                                      },
                                      {
                                        "kind": "null"
                                      }
                                    ]
                                  }
                                },
                                "required": [
                                  "id",
                                  "mediaType",
                                  "byteSize",
                                  "width",
                                  "height"
                                ]
                              }
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "input",
                            "target",
                            "result",
                            "isError",
                            "images"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "tool"
                      ]
                    },
                    {
                      "kind": "object",
                      "fields": {
                        "kind": {
                          "kind": "string",
                          "choices": [
                            "image"
                          ]
                        },
                        "image": {
                          "kind": "object",
                          "fields": {
                            "id": {
                              "kind": "string"
                            },
                            "mediaType": {
                              "kind": "string"
                            },
                            "byteSize": {
                              "kind": "number"
                            },
                            "width": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            },
                            "height": {
                              "kind": "union",
                              "variants": [
                                {
                                  "kind": "number"
                                },
                                {
                                  "kind": "null"
                                }
                              ]
                            }
                          },
                          "required": [
                            "id",
                            "mediaType",
                            "byteSize",
                            "width",
                            "height"
                          ]
                        }
                      },
                      "required": [
                        "kind",
                        "image"
                      ]
                    }
                  ]
                }
              },
              "model": {
                "kind": "union",
                "variants": [
                  {
                    "kind": "string"
                  },
                  {
                    "kind": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "role",
              "isSidechain",
              "timestamp",
              "blocks",
              "model"
            ]
          }
        },
        "hasMore": {
          "kind": "boolean"
        },
        "totalMessages": {
          "kind": "number"
        },
        "prunedAt": {
          "kind": "string"
        },
        "cwd": {
          "kind": "string"
        },
        "input": {
          "kind": "string"
        },
        "structured": {
          "kind": "boolean"
        }
      },
      "required": [
        "sessionId",
        "logPath",
        "exists",
        "title",
        "messages",
        "hasMore",
        "totalMessages",
        "cwd",
        "input",
        "structured"
      ]
    }
  },
  "report.image": {
    "method": "reportImage",
    "input": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "imageId": {
          "kind": "string"
        }
      },
      "required": [
        "id",
        "imageId"
      ]
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "string"
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "report.projectGet": {
    "method": "reportProjectGet",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "object",
          "fields": {
            "status": {
              "kind": "string",
              "choices": [
                "generating",
                "ready",
                "failed"
              ]
            },
            "revision": {
              "kind": "string"
            },
            "path": {
              "kind": "string"
            },
            "logPath": {
              "kind": "string"
            },
            "error": {
              "kind": "string"
            },
            "startedAt": {
              "kind": "string"
            },
            "endedAt": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            },
            "projectId": {
              "kind": "string"
            }
          },
          "required": [
            "status",
            "revision",
            "path",
            "logPath",
            "error",
            "startedAt",
            "endedAt",
            "projectId"
          ]
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "report.projectGenerate": {
    "method": "reportProjectGenerate",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "report.projectShow": {
    "method": "reportProjectShow",
    "input": {
      "kind": "object",
      "fields": {
        "projectId": {
          "kind": "string"
        },
        "bounds": {
          "kind": "object",
          "fields": {
            "x": {
              "kind": "number"
            },
            "y": {
              "kind": "number"
            },
            "width": {
              "kind": "number"
            },
            "height": {
              "kind": "number"
            }
          },
          "required": [
            "x",
            "y",
            "width",
            "height"
          ]
        },
        "historyId": {
          "kind": "string"
        }
      },
      "required": [
        "projectId",
        "bounds"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "report.projectHistory": {
    "method": "reportProjectHistory",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "string"
          },
          "path": {
            "kind": "string"
          },
          "revision": {
            "kind": "string"
          },
          "generatedAt": {
            "kind": "string"
          },
          "current": {
            "kind": "boolean"
          }
        },
        "required": [
          "id",
          "path",
          "revision",
          "generatedAt",
          "current"
        ]
      }
    }
  },
  "report.get": {
    "method": "reportGet",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "object",
          "fields": {
            "taskId": {
              "kind": "string"
            },
            "status": {
              "kind": "string",
              "choices": [
                "generating",
                "ready",
                "failed"
              ]
            },
            "revision": {
              "kind": "string"
            },
            "path": {
              "kind": "string"
            },
            "logPath": {
              "kind": "string"
            },
            "error": {
              "kind": "string"
            },
            "startedAt": {
              "kind": "string"
            },
            "endedAt": {
              "kind": "union",
              "variants": [
                {
                  "kind": "string"
                },
                {
                  "kind": "null"
                }
              ]
            }
          },
          "required": [
            "taskId",
            "status",
            "revision",
            "path",
            "logPath",
            "error",
            "startedAt",
            "endedAt"
          ]
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "report.generate": {
    "method": "reportGenerate",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "report.show": {
    "method": "reportShow",
    "input": {
      "kind": "object",
      "fields": {
        "taskId": {
          "kind": "string"
        },
        "bounds": {
          "kind": "object",
          "fields": {
            "x": {
              "kind": "number"
            },
            "y": {
              "kind": "number"
            },
            "width": {
              "kind": "number"
            },
            "height": {
              "kind": "number"
            }
          },
          "required": [
            "x",
            "y",
            "width",
            "height"
          ]
        },
        "historyId": {
          "kind": "string"
        }
      },
      "required": [
        "taskId",
        "bounds"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "report.history": {
    "method": "reportHistory",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "id": {
            "kind": "string"
          },
          "path": {
            "kind": "string"
          },
          "revision": {
            "kind": "string"
          },
          "generatedAt": {
            "kind": "string"
          },
          "current": {
            "kind": "boolean"
          }
        },
        "required": [
          "id",
          "path",
          "revision",
          "generatedAt",
          "current"
        ]
      }
    }
  },
  "report.hide": {
    "method": "reportHide",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "terminal.open": {
    "method": "terminalOpen",
    "input": {
      "kind": "object",
      "fields": {
        "taskId": {
          "kind": "string"
        },
        "columns": {
          "kind": "number"
        },
        "rows": {
          "kind": "number"
        }
      },
      "required": [
        "taskId",
        "columns",
        "rows"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "id": {
          "kind": "string"
        },
        "cwd": {
          "kind": "string"
        },
        "shell": {
          "kind": "string"
        },
        "columns": {
          "kind": "number"
        },
        "rows": {
          "kind": "number"
        }
      },
      "required": [
        "id",
        "cwd",
        "shell",
        "columns",
        "rows"
      ]
    }
  },
  "terminal.input": {
    "method": "terminalInput",
    "input": {
      "kind": "object",
      "fields": {
        "sessionId": {
          "kind": "string"
        },
        "input": {
          "kind": "string"
        }
      },
      "required": [
        "sessionId",
        "input"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "terminal.resize": {
    "method": "terminalResize",
    "input": {
      "kind": "object",
      "fields": {
        "sessionId": {
          "kind": "string"
        },
        "columns": {
          "kind": "number"
        },
        "rows": {
          "kind": "number"
        }
      },
      "required": [
        "sessionId",
        "columns",
        "rows"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "terminal.runProjectTask": {
    "method": "terminalRunProjectTask",
    "input": {
      "kind": "object",
      "fields": {
        "taskId": {
          "kind": "string"
        },
        "sessionId": {
          "kind": "string"
        },
        "projectTaskId": {
          "kind": "string"
        }
      },
      "required": [
        "taskId",
        "sessionId",
        "projectTaskId"
      ]
    },
    "output": {
      "kind": "object",
      "fields": {
        "ok": {
          "kind": "boolean"
        },
        "reason": {
          "kind": "string"
        }
      },
      "required": [
        "ok"
      ]
    }
  },
  "terminal.close": {
    "method": "terminalClose",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "system.savePromptFiles": {
    "method": "systemSavePromptFiles",
    "input": {
      "kind": "array",
      "items": {
        "kind": "object",
        "fields": {
          "name": {
            "kind": "string"
          },
          "data": {
            "kind": "string"
          }
        },
        "required": [
          "name",
          "data"
        ]
      }
    },
    "output": {
      "kind": "array",
      "items": {
        "kind": "string"
      }
    }
  },
  "system.windowLayout": {
    "method": "systemWindowLayout",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "leftInset": {
          "kind": "number"
        },
        "collapsedRailWidth": {
          "kind": "number"
        },
        "overhang": {
          "kind": "number"
        }
      },
      "required": [
        "leftInset",
        "collapsedRailWidth",
        "overhang"
      ]
    }
  },
  "system.scrollSwipes": {
    "method": "systemScrollSwipes",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "boolean"
    }
  },
  "system.pickDirectory": {
    "method": "systemPickDirectory",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "string"
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "system.pickApplication": {
    "method": "systemPickApplication",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "string"
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "system.confirm": {
    "method": "systemConfirm",
    "input": {
      "kind": "object",
      "fields": {
        "message": {
          "kind": "string"
        },
        "detail": {
          "kind": "string"
        },
        "confirmLabel": {
          "kind": "string"
        }
      },
      "required": [
        "message",
        "confirmLabel"
      ]
    },
    "output": {
      "kind": "boolean"
    }
  },
  "system.popupMenu": {
    "method": "systemPopupMenu",
    "input": {
      "kind": "object",
      "fields": {
        "items": {
          "kind": "array",
          "items": {
            "kind": "value"
          }
        },
        "x": {
          "kind": "number"
        },
        "y": {
          "kind": "number"
        }
      },
      "required": [
        "items"
      ]
    },
    "output": {
      "kind": "union",
      "variants": [
        {
          "kind": "string"
        },
        {
          "kind": "null"
        }
      ]
    }
  },
  "system.reveal": {
    "method": "systemReveal",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "system.openExternal": {
    "method": "systemOpenExternal",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "system.copy": {
    "method": "systemCopy",
    "input": {
      "kind": "string"
    },
    "output": {
      "kind": "void"
    }
  },
  "app.info": {
    "method": "appInfo",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "version": {
          "kind": "string"
        },
        "dataDirectory": {
          "kind": "string"
        },
        "updates": {
          "kind": "string",
          "choices": [
            "local",
            "starting",
            "unsigned",
            "idle",
            "checking",
            "downloading",
            "ready"
          ]
        }
      },
      "required": [
        "version",
        "dataDirectory",
        "updates"
      ]
    }
  },
  "app.checkForUpdates": {
    "method": "appCheckForUpdates",
    "input": {
      "kind": "void"
    },
    "output": {
      "kind": "object",
      "fields": {
        "version": {
          "kind": "string"
        },
        "dataDirectory": {
          "kind": "string"
        },
        "updates": {
          "kind": "string",
          "choices": [
            "local",
            "starting",
            "unsigned",
            "idle",
            "checking",
            "downloading",
            "ready"
          ]
        }
      },
      "required": [
        "version",
        "dataDirectory",
        "updates"
      ]
    }
  }
}
