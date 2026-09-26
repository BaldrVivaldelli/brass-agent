import { async, asyncFail, asyncFlatMap, type Async } from "brass-runtime";
import { race } from "brass-runtime";
import type { Scope } from "brass-runtime";
import type { AgentError } from "../core/types";

export const sleep = (ms: number): Async<unknown, never, void> =>
    async((_env, cb) => {
        const id = setTimeout(() => cb({ _tag: "Success", value: undefined }), ms);
        return () => clearTimeout(id);
    });

export const timeout = <R, E, A>(effect: Async<R, E, A>, ms: number, scope: Scope<R>): Async<R, E | AgentError, A> =>
    race(
        effect as any,
        asyncFlatMap(sleep(ms), () => asyncFail({ _tag: "ToolTimeout", timeoutMs: ms } satisfies AgentError)) as any,
        scope
    ) as any;
