/**
 * Model Config Types — provider configuration for AI model calls.
 *
 * Design: OpenAI-compatible API format (works with GLM/Zhipu, DeepSeek,
 * Moonshot, and any provider that follows the chat/completions spec).
 *
 * Fallback: When no API key is configured, system falls back to demo mode.
 */

export interface ProviderConfig {
	/** API endpoint URL (OpenAI-compatible chat/completions) */
	endpoint: string;
	/** API key — empty string = demo fallback */
	apiKey: string;
	/** Default model name for this provider */
	defaultModel: string;
	/** Max response tokens */
	maxTokens: number;
	/** Temperature for response generation */
	temperature: number;
}

export interface ModelConfig {
	/** Provider configs keyed by clientId (matches dog-config.json clientId) */
	providers: Record<string, ProviderConfig>;
	/** If true, fall back to demo mode when API key is missing or call fails */
	fallbackToDemo: boolean;
	/** Max depth for auto-invoke chains (prevents infinite recursion) */
	maxInvokeChainDepth: number;
}
