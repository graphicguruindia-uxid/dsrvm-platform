import type { CompletionRequest, CompletionResponse } from "./types.js";

export interface LlmProvider {
  readonly name: string;
  complete(
    request: CompletionRequest,
    signal?: AbortSignal,
  ): Promise<CompletionResponse>;
}
