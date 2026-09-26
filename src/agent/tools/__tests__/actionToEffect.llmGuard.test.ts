import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { actionToEffect } from "../actionToEffect";
import type { AgentAction, AgentEnv, AgentError, AgentState, Observation } from "../../core/types";
import { runExit } from "brass-runtime";
import type { Exit } from "brass-runtime";
import { asyncSucceed } from "brass-runtime";

/**
 * Property-based tests for LLM guard behavior in actionToEffect.
 * Feature: agent-host-llm-refactor
 *
 * Property 8: Tool-only actions succeed without LLM
 * Property 9: LLM guard produces correct error when unavailable
 *
 * **Validates: Requirements 8.2, 8.3, 8.4, 10.1**
 */

// --- Helpers ---

/**
 * Run an Async effect and return its Exit.
 *
 * This goes through the public runtime entrypoint rather than a direct
 * synchronous register, so the effect is interpreted exactly as it would be in
 * production: on the scheduler, through the fiber machinery.
 */
function runEffect<E, A>(
    effect: ReturnType<typeof actionToEffect>,
    env: AgentEnv,
): Promise<Exit<E, A>> {
    return runExit(effect as any, env) as Promise<Exit<E, A>>;
}

/** Create a minimal AgentState for testing. */
function makeState(cwd = "/workspace"): AgentState {
    return {
        goal: {
            id: "test-goal",
            cwd,
            text: "test",
            mode: "write",
        },
        phase: "planning",
        observations: [],
        errors: [],
        steps: 0,
    };
}

/** Create a mock AgentEnv with llm set to undefined but valid fs/shell/patch services. */
function makeMockEnvWithoutLLM(): AgentEnv {
    return {
        fs: {
            readFile: (_path: string) =>
                asyncSucceed("file content") as any,
            exists: (_path: string) =>
                asyncSucceed(true) as any,
            searchText: (_cwd: string, _query: string, _options?: any) =>
                asyncSucceed([{ path: "test.ts", line: 1, text: "match" }]) as any,
        },
        shell: {
            exec: (_command: readonly string[], _options: any) =>
                asyncSucceed({ exitCode: 0, stdout: "ok", stderr: "" }) as any,
        },
        llm: undefined,
        patch: {
            apply: (_cwd: string, _patch: string) =>
                asyncSucceed({ changedFiles: ["file.ts"] }) as any,
            rollback: (_cwd: string, _patch: string) =>
                asyncSucceed({ changedFiles: ["file.ts"] }) as any,
        },
        permissions: {
            check: (_action: any, _state: any) =>
                asyncSucceed({ type: "allow" }) as any,
        },
    };
}

// --- Arbitraries ---

/** Tool-only action types that should work without LLM. */
const TOOL_ONLY_ACTION_TYPES = [
    "fs.readFile",
    "fs.exists",
    "fs.searchText",
    "shell.exec",
    "patch.apply",
    "patch.rollback",
    "patch.propose",
] as const;

type ToolOnlyActionType = (typeof TOOL_ONLY_ACTION_TYPES)[number];

/** Generate a valid workspace-relative path (no absolute paths, no ..). */
const arbRelativePath: fc.Arbitrary<string> = fc
    .array(fc.stringMatching(/^[a-z][a-z0-9_-]{0,10}$/), { minLength: 1, maxLength: 3 })
    .map((parts) => parts.join("/") + ".ts");

/** Generate a tool-only action. */
const arbToolOnlyAction: fc.Arbitrary<AgentAction> = fc
    .constantFrom(...TOOL_ONLY_ACTION_TYPES)
    .chain((type): fc.Arbitrary<AgentAction> => {
        switch (type) {
            case "fs.readFile":
                return arbRelativePath.map((path) => ({ type: "fs.readFile", path }));
            case "fs.exists":
                return arbRelativePath.map((path) => ({ type: "fs.exists", path }));
            case "fs.searchText":
                return fc
                    .string({ minLength: 1, maxLength: 20 })
                    .map((query) => ({ type: "fs.searchText", query }));
            case "shell.exec":
                return fc
                    .array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 })
                    .map((command) => ({ type: "shell.exec", command }));
            case "patch.apply":
                return fc
                    .string({ minLength: 1, maxLength: 50 })
                    .map((patch) => ({ type: "patch.apply", patch }));
            case "patch.rollback":
                return fc
                    .string({ minLength: 1, maxLength: 50 })
                    .map((patch) => ({ type: "patch.rollback", patch }));
            case "patch.propose":
                return fc
                    .string({ minLength: 1, maxLength: 50 })
                    .map((patch) => ({ type: "patch.propose", patch }));
        }
    });

/** Generate an llm.complete action with arbitrary purpose and prompt. */
const arbLlmAction: fc.Arbitrary<AgentAction> = fc
    .tuple(
        fc.constantFrom("plan" as const, "patch" as const, "explain" as const),
        fc.string({ minLength: 1, maxLength: 100 }),
    )
    .map(([purpose, prompt]) => ({ type: "llm.complete", purpose, prompt }));

// --- Property 8: Tool-only actions succeed without LLM ---

describe("Property 8: Tool-only actions succeed without LLM", () => {
    /**
     * Feature: agent-host-llm-refactor, Property 8: Tool-only actions succeed without LLM
     *
     * For any tool-only action (fs.readFile, fs.exists, fs.searchText, shell.exec,
     * patch.apply, patch.rollback, patch.propose) dispatched through actionToEffect
     * with AgentEnv.llm set to undefined, the action SHALL execute and produce an
     * Observation (or a non-LLM AgentError) without returning an error with
     * _tag: "LLMError".
     *
     * **Validates: Requirements 8.2**
     */
    it("tool-only actions produce Observation without LLMError when llm is undefined", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(arbToolOnlyAction, async (action) => {
                const effect = actionToEffect(action, state);
                const exit = await runEffect<AgentError, Observation>(effect, env);

                if (exit._tag === "Success") {
                    // Success: produced an Observation — this is the expected path
                    expect(exit.value).toBeDefined();
                    expect(exit.value.type).toBeDefined();
                } else {
                    // If it failed, the error must NOT be an LLMError
                    const cause = exit.cause;
                    if ("_tag" in cause && cause._tag === "Fail") {
                        const error = (cause as any).error as AgentError;
                        expect(error._tag).not.toBe("LLMError");
                    }
                }
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Each specific tool-only action type succeeds with the expected observation type.
     *
     * **Validates: Requirements 8.2**
     */
    it("fs.readFile succeeds without LLM and produces fs.fileRead observation", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(arbRelativePath, async (path) => {
                const action: AgentAction = { type: "fs.readFile", path };
                const exit = await runEffect<AgentError, Observation>(actionToEffect(action, state), env);

                expect(exit._tag).toBe("Success");
                if (exit._tag === "Success") {
                    expect(exit.value.type).toBe("fs.fileRead");
                }
            }),
            { numRuns: 100 },
        );
    });

    it("fs.exists succeeds without LLM and produces fs.exists observation", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(arbRelativePath, async (path) => {
                const action: AgentAction = { type: "fs.exists", path };
                const exit = await runEffect<AgentError, Observation>(actionToEffect(action, state), env);

                expect(exit._tag).toBe("Success");
                if (exit._tag === "Success") {
                    expect(exit.value.type).toBe("fs.exists");
                }
            }),
            { numRuns: 100 },
        );
    });

    it("fs.searchText succeeds without LLM and produces fs.searchResult observation", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1, maxLength: 20 }), async (query) => {
                const action: AgentAction = { type: "fs.searchText", query };
                const exit = await runEffect<AgentError, Observation>(actionToEffect(action, state), env);

                expect(exit._tag).toBe("Success");
                if (exit._tag === "Success") {
                    expect(exit.value.type).toBe("fs.searchResult");
                }
            }),
            { numRuns: 100 },
        );
    });

    it("shell.exec succeeds without LLM and produces shell.result observation", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(
                fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 }),
                async (command) => {
                    const action: AgentAction = { type: "shell.exec", command };
                    const exit = await runEffect<AgentError, Observation>(actionToEffect(action, state), env);

                    expect(exit._tag).toBe("Success");
                    if (exit._tag === "Success") {
                        expect(exit.value.type).toBe("shell.result");
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    it("patch.apply succeeds without LLM and produces patch.applied observation", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (patch) => {
                const action: AgentAction = { type: "patch.apply", patch };
                const exit = await runEffect<AgentError, Observation>(actionToEffect(action, state), env);

                expect(exit._tag).toBe("Success");
                if (exit._tag === "Success") {
                    expect(exit.value.type).toBe("patch.applied");
                }
            }),
            { numRuns: 100 },
        );
    });

    it("patch.rollback succeeds without LLM and produces patch.rolledBack observation", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (patch) => {
                const action: AgentAction = { type: "patch.rollback", patch };
                const exit = await runEffect<AgentError, Observation>(actionToEffect(action, state), env);

                expect(exit._tag).toBe("Success");
                if (exit._tag === "Success") {
                    expect(exit.value.type).toBe("patch.rolledBack");
                }
            }),
            { numRuns: 100 },
        );
    });

    it("patch.propose succeeds without LLM and produces patch.proposed observation", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(fc.string({ minLength: 1, maxLength: 50 }), async (patch) => {
                const action: AgentAction = { type: "patch.propose", patch };
                const exit = await runEffect<AgentError, Observation>(actionToEffect(action, state), env);

                expect(exit._tag).toBe("Success");
                if (exit._tag === "Success") {
                    expect(exit.value.type).toBe("patch.proposed");
                }
            }),
            { numRuns: 100 },
        );
    });
});

// --- Property 9: LLM guard produces correct error when unavailable ---

describe("Property 9: LLM guard produces correct error when unavailable", () => {
    /**
     * Feature: agent-host-llm-refactor, Property 9: LLM guard produces correct error when unavailable
     *
     * For any llm.complete action dispatched through actionToEffect with AgentEnv.llm
     * set to undefined, the result SHALL be an AgentError with _tag equal to "LLMError"
     * and cause containing the substring "llm_unavailable". The result SHALL NOT be a
     * successful Observation containing fabricated content.
     *
     * **Validates: Requirements 8.3, 8.4, 10.1**
     */
    it("llm.complete produces LLMError with llm_unavailable when llm is undefined", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(arbLlmAction, async (action) => {
                const effect = actionToEffect(action, state);
                const exit = await runEffect<AgentError, Observation>(effect, env);

                // Must be a failure
                expect(exit._tag).toBe("Failure");

                if (exit._tag === "Failure") {
                    // Extract the error from the Cause
                    const cause = exit.cause as any;
                    // The cause should be a Fail with an AgentError
                    expect(cause._tag).toBe("Fail");
                    const error: AgentError = cause.error;
                    expect(error._tag).toBe("LLMError");
                    expect(String(error.cause)).toContain("llm_unavailable");
                }
            }),
            { numRuns: 100 },
        );
    });

    /**
     * The result SHALL NOT be a successful Observation containing fabricated content.
     *
     * **Validates: Requirements 8.4**
     */
    it("llm.complete never produces a successful Observation when llm is undefined", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();

        await fc.assert(
            fc.asyncProperty(arbLlmAction, async (action) => {
                const effect = actionToEffect(action, state);
                const exit = await runEffect<AgentError, Observation>(effect, env);

                // Must NOT be a success (no fabricated content)
                expect(exit._tag).not.toBe("Success");
            }),
            { numRuns: 100 },
        );
    });

    /**
     * The error cause contains the exact substring "llm_unavailable" for all
     * LLM purposes (plan, patch, explain).
     *
     * **Validates: Requirements 8.3, 10.1**
     */
    it("error cause contains 'llm_unavailable' for all LLM purposes", async () => {
        const env = makeMockEnvWithoutLLM();
        const state = makeState();
        const purposes = ["plan", "patch", "explain"] as const;

        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...purposes),
                fc.string({ minLength: 1, maxLength: 100 }),
                async (purpose, prompt) => {
                    const action: AgentAction = { type: "llm.complete", purpose, prompt };
                    const effect = actionToEffect(action, state);
                    const exit = await runEffect<AgentError, Observation>(effect, env);

                    expect(exit._tag).toBe("Failure");
                    if (exit._tag === "Failure") {
                        const cause = exit.cause as any;
                        const error: AgentError = cause.error;
                        expect(error._tag).toBe("LLMError");
                        expect(String(error.cause)).toContain("llm_unavailable");
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
