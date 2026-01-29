import { Notice } from 'obsidian';

export interface GeminiModel {
	name: string;
	version: string;
	displayName: string;
	description: string;
	inputTokenLimit: number;
	outputTokenLimit: number;
	supportedGenerationMethods: string[];
	temperature?: number;
	topP?: number;
}

export interface ModelInfo {
	id: string;
	displayName: string;
	description: string;
	contextWindow: number;
	maxOutput: number;
	supportsChat: boolean;
}

export class ModelFetcher {
	private apiKey: string;
	private cachedModels: ModelInfo[] | null = null;
	private cacheTimestamp: number = 0;
	private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async fetchAvailableModels(): Promise<ModelInfo[]> {
		// Return cached models if still valid
		if (this.cachedModels && Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
			return this.cachedModels;
		}

		try {
			const response = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
			);

			if (!response.ok) {
				throw new Error(`Failed to fetch models: ${response.statusText}`);
			}

			const data = await response.json();
			const models: ModelInfo[] = [];

			for (const model of data.models as GeminiModel[]) {
				// Only include models that support text generation
				if (model.supportedGenerationMethods.includes('generateContent')) {
					// Extract model ID (remove "models/" prefix)
					const modelId = model.name.replace('models/', '');

					models.push({
						id: modelId,
						displayName: model.displayName,
						description: model.description,
						contextWindow: model.inputTokenLimit,
						maxOutput: model.outputTokenLimit,
						supportsChat: true,
					});
				}
			}

			// Cache the results
			this.cachedModels = models;
			this.cacheTimestamp = Date.now();

			return models;
		} catch (error) {
			console.error('Error fetching models:', error);
			new Notice('Failed to fetch available models. Using defaults.');
			
			// Return default models as fallback
			return this.getDefaultModels();
		}
	}

	private getDefaultModels(): ModelInfo[] {
		return [
			{
				id: 'gemini-2.0-flash-exp',
				displayName: 'Gemini 2.0 Flash (Experimental)',
				description: 'Fast, efficient model for quick responses',
				contextWindow: 1048576,
				maxOutput: 8192,
				supportsChat: true,
			},
			{
				id: 'gemini-2.5-flash',
				displayName: 'Gemini 2.5 Flash',
				description: 'Stable version supporting up to 1M tokens',
				contextWindow: 1048576,
				maxOutput: 65536,
				supportsChat: true,
			},
			{
				id: 'gemini-2.5-pro',
				displayName: 'Gemini 2.5 Pro',
				description: 'Most capable model for complex tasks',
				contextWindow: 2097152,
				maxOutput: 65536,
				supportsChat: true,
			},
		];
	}

	updateApiKey(apiKey: string) {
		this.apiKey = apiKey;
		// Invalidate cache when API key changes
		this.cachedModels = null;
		this.cacheTimestamp = 0;
	}

	clearCache() {
		this.cachedModels = null;
		this.cacheTimestamp = 0;
	}
}
