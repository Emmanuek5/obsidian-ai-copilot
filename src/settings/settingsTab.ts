import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type AICopilotPlugin from '../main';
import { ModelFetcher, type ModelInfo } from '../api/modelFetcher';

export class AICopilotSettingsTab extends PluginSettingTab {
	plugin: AICopilotPlugin;
	private modelFetcher: ModelFetcher | null = null;
	private modelDropdown: Setting | null = null;

	constructor(app: App, plugin: AICopilotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'AI Copilot Settings' });

		// API Key setting
		new Setting(containerEl)
			.setName('Google Gemini API Key')
			.setDesc('Enter your Google Gemini API key to enable model selection')
			.addText((text) => {
				text
					.setPlaceholder('Enter your API key')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value;
						await this.plugin.saveSettings();
						
						// Fetch models when API key is entered
						if (value.trim()) {
							await this.fetchAndUpdateModels(value);
						} else {
							// Disable model dropdown if key is removed
							this.updateModelDropdown([]);
						}
					});
				
				// Make input type password for security
				text.inputEl.type = 'password';
				
				return text;
			})
			.addExtraButton((button) => {
				button
					.setIcon('eye')
					.setTooltip('Toggle visibility')
					.onClick(() => {
						const input = button.extraSettingsEl.parentElement?.querySelector('input');
						if (input) {
							input.type = input.type === 'password' ? 'text' : 'password';
							button.setIcon(input.type === 'password' ? 'eye' : 'eye-off');
						}
					});
			});

		// Model selection (initially disabled)
		this.modelDropdown = new Setting(containerEl)
			.setName('Model')
			.setDesc('Select the Gemini model to use (enter API key first)');

		// Initialize model dropdown
		if (this.plugin.settings.apiKey) {
			// Fetch models if API key already exists
			this.fetchAndUpdateModels(this.plugin.settings.apiKey);
		} else {
			// Show disabled state
			this.updateModelDropdown([]);
		}

		// Temperature setting
		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Controls randomness (0-1). Higher values = more creative')
			.addSlider((slider) =>
				slider
					.setLimits(0, 1, 0.1)
					.setValue(this.plugin.settings.temperature)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.temperature = value;
						await this.plugin.saveSettings();
					})
			);

		// Max tokens setting
		new Setting(containerEl)
			.setName('Max Tokens')
			.setDesc('Maximum number of tokens in the response')
			.addText((text) =>
				text
					.setPlaceholder('8000')
					.setValue(String(this.plugin.settings.maxTokens))
					.onChange(async (value) => {
						const numValue = parseInt(value);
						if (!isNaN(numValue) && numValue > 0) {
							this.plugin.settings.maxTokens = numValue;
							await this.plugin.saveSettings();
						}
					})
			);

		// Conversations folder setting
		new Setting(containerEl)
			.setName('Conversations Folder')
			.setDesc('Folder where AI conversations will be saved')
			.addText((text) =>
				text
					.setPlaceholder('conversations')
					.setValue(this.plugin.settings.conversationsFolder)
					.onChange(async (value) => {
						this.plugin.settings.conversationsFolder = value;
						await this.plugin.saveSettings();
					})
			);

		// Indexing settings
		containerEl.createEl('h3', { text: 'Indexing Settings' });

		new Setting(containerEl)
			.setName('Enable Indexing')
			.setDesc('Index vault files for better @ mentions and context')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableIndexing)
					.onChange(async (value) => {
						this.plugin.settings.enableIndexing = value;
						await this.plugin.saveSettings();
						if (value) {
							await this.plugin.vaultIndexer.rebuildIndex();
						}
					})
			);

		new Setting(containerEl)
			.setName('Index on Startup')
			.setDesc('Automatically index vault when Obsidian starts')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.indexOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.indexOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		// Manual reindex button
		new Setting(containerEl)
			.setName('Rebuild Index')
			.setDesc('Manually rebuild the vault index')
			.addButton((button) =>
				button
					.setButtonText('Rebuild Index')
					.onClick(async () => {
						button.setButtonText('Rebuilding...');
						button.setDisabled(true);
						await this.plugin.vaultIndexer.rebuildIndex();
						button.setButtonText('Rebuild Index');
						button.setDisabled(false);
					})
			);
	}

	private async fetchAndUpdateModels(apiKey: string) {
		if (!this.modelDropdown) return;

		// Show loading state
		this.modelDropdown.setDesc('Loading available models...');

		try {
			// Create or update model fetcher
			if (!this.modelFetcher) {
				this.modelFetcher = new ModelFetcher(apiKey);
			} else {
				this.modelFetcher.updateApiKey(apiKey);
			}

			// Fetch models
			const models = await this.modelFetcher.fetchAvailableModels();

			// Update dropdown with fetched models
			this.updateModelDropdown(models);

			new Notice(`Loaded ${models.length} available models`);
		} catch (error) {
			console.error('Error fetching models:', error);
			new Notice('Failed to fetch models. Check your API key.');
			this.modelDropdown.setDesc('Failed to load models. Check your API key.');
			this.updateModelDropdown([]);
		}
	}

	private updateModelDropdown(models: ModelInfo[]) {
		if (!this.modelDropdown) return;

		// Clear existing dropdown
		this.modelDropdown.clear();

		if (models.length === 0) {
			// Show disabled state
			this.modelDropdown
				.setDesc('Enter your API key above to load available models')
				.addDropdown((dropdown) => {
					dropdown
						.addOption('', 'No models available')
						.setValue('')
						.setDisabled(true);
				});
		} else {
			// Show models with descriptions
			this.modelDropdown
				.setDesc(`Available models: ${models.length}`)
				.addDropdown((dropdown) => {
					// Add all fetched models
					models.forEach(model => {
						dropdown.addOption(
							model.id,
							`${model.displayName} (${(model.contextWindow / 1000).toFixed(0)}K tokens)`
						);
					});

					// Set current value or first model
					const currentModel = this.plugin.settings.model;
					const modelExists = models.some(m => m.id === currentModel);
					
					dropdown
						.setValue(modelExists ? currentModel : models[0]?.id || '')
						.onChange(async (value) => {
							this.plugin.settings.model = value;
							await this.plugin.saveSettings();
							
							// Show selected model info
							const selectedModel = models.find(m => m.id === value);
							if (selectedModel) {
								new Notice(
									`Selected: ${selectedModel.displayName}\n` +
									`Context: ${(selectedModel.contextWindow / 1000).toFixed(0)}K tokens`
								);
							}
						});
				});
		}
	}
}

