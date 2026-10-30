export type AiProviderName = "openai" | "anthropic";

export type GenerateTextInput = {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
};

export type GenerateTextResult = {
  text: string;
  provider: AiProviderName;
  model: string;
};

export interface AiProvider {
  readonly name: AiProviderName;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
}

export function configuredProviderName(): AiProviderName {
  if (process.env.AI_PROVIDER === "openai" || process.env.AI_PROVIDER === "anthropic") return process.env.AI_PROVIDER;
  return process.env.OPENAI_API_KEY ? "openai" : "anthropic";
}

export function isAiConfigured(): boolean {
  return Boolean(configuredProviderName() === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY);
}

class OpenAiProvider implements AiProvider {
  readonly name = "openai" as const;
  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for the OpenAI provider");
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, temperature: input.temperature ?? 0.4, max_tokens: input.maxTokens ?? 800, messages: [{ role: "system", content: input.system ?? "You write concise, helpful business email copy." }, { role: "user", content: input.prompt }] }) });
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("OpenAI returned an empty response");
    return { text, provider: this.name, model };
  }
}

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic" as const;
  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for the Anthropic provider");
    const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest";
    const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal: AbortSignal.timeout(30_000), headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model, max_tokens: input.maxTokens ?? 800, temperature: input.temperature ?? 0.4, system: input.system ?? "You write concise, helpful business email copy.", messages: [{ role: "user", content: input.prompt }] }) });
    if (!response.ok) throw new Error(`Anthropic request failed with status ${response.status}`);
    const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
    const text = data.content?.find((block) => block.type === "text")?.text?.trim();
    if (!text) throw new Error("Anthropic returned an empty response");
    return { text, provider: this.name, model };
  }
}

export function createAiProvider(name: AiProviderName = configuredProviderName()): AiProvider {
  return name === "openai" ? new OpenAiProvider() : new AnthropicProvider();
}
