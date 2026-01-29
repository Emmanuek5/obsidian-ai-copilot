export interface AICopilotSettings {
	apiKey: string;
	model: string;
	temperature: number;
	maxTokens: number;
	conversationsFolder: string;
	enableIndexing: boolean;
	indexOnStartup: boolean;
}

export const DEFAULT_SETTINGS: AICopilotSettings = {
	apiKey: '',
	model: 'gemini-2.0-flash-exp',
	temperature: 0.7,
	maxTokens: 8000,
	conversationsFolder: 'conversations',
	enableIndexing: true,
	indexOnStartup: true,
};
