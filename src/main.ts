import { Plugin, Menu, Editor, Notice } from 'obsidian';
import { AICopilotView, VIEW_TYPE_AI_COPILOT } from './views/AICopilotView';
import type { AICopilotSettings } from './settings/settings';
import { DEFAULT_SETTINGS } from './settings/settings';
import { AICopilotSettingsTab } from './settings/settingsTab';
import { VaultIndexer } from './indexing/vaultIndexer';
import { AiconViewerView, VIEW_TYPE_AICON } from './views/AiconViewerView';
import { MemoryManager } from './memory/memoryManager';

export default class AICopilotPlugin extends Plugin {
	settings!: AICopilotSettings;
	vaultIndexer!: VaultIndexer;
	memoryManager!: MemoryManager;
	
	override async onload() {
		console.log('Loading AI Copilot Plugin');

		// Load settings
		await this.loadSettings();

		// Initialize vault indexer
		this.vaultIndexer = new VaultIndexer(this.app, this);

		// Initialize memory manager
		this.memoryManager = new MemoryManager(this.app, this);

		// Register the AI Copilot view
		this.registerView(
			VIEW_TYPE_AI_COPILOT,
			(leaf) => new AICopilotView(leaf, this)
		);

		// Register .aicon file viewer
		this.registerView(
			VIEW_TYPE_AICON,
			(leaf) => new AiconViewerView(leaf, this)
		);

		// Register .aicon file extension
		this.registerExtensions(['aicon'], VIEW_TYPE_AICON);

		// Add ribbon icon to activate view
		this.addRibbonIcon('bot', 'AI Copilot', () => {
			this.activateView();
		});

		// Add command to open AI Copilot (sidebar)
		this.addCommand({
			id: 'open-ai-copilot',
			name: 'Open AI Copilot (Sidebar)',
			callback: () => {
				this.activateView();
			}
		});

		// Add command to open AI Copilot in main page
		this.addCommand({
			id: 'open-ai-copilot-page',
			name: 'Open AI Copilot (Page View)',
			callback: () => {
				this.activatePageView();
			}
		});

		// Add command to add selected text to chat context
		this.addCommand({
			id: 'add-to-chat-context',
			name: 'Add Selection to Chat Context',
			editorCallback: (editor: Editor, ctx: any) => {
				const selection = editor.getSelection();
				if (selection) {
					this.addToContext(selection, ctx.file?.path || 'Unknown');
				} else {
					new Notice('No text selected');
				}
			}
		});

		// Add editor context menu (right-click menu)
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, info: any) => {
				const selection = editor.getSelection();
				if (selection) {
					menu.addItem((item) => {
						item
							.setTitle('Add to chat context')
							.setIcon('message-square-plus')
							.onClick(() => {
								this.addToContext(selection, info.file?.path || 'Unknown');
							});
					});
				}
			})
		);

		// Add settings tab
		this.addSettingTab(new AICopilotSettingsTab(this.app, this));

		// Start indexing vault and memory
		await this.vaultIndexer.initialize();
		await this.memoryManager.initialize();
	}

	// Add text to context - open copilot and add as attachment
	async addToContext(text: string, source: string) {
		// First, activate the view
		await this.activateView();
		
		// Get the active copilot view
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_AI_COPILOT);
		if (leaves.length > 0) {
			const view = leaves[0].view as AICopilotView;
			view.addTextContext(text, source);
			new Notice('Added to chat context');
		}
	}

	override async onunload() {
		console.log('Unloading AI Copilot Plugin');
		// Clean up
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_AI_COPILOT);
	}

	async activateView() {
		const { workspace } = this.app;

		// Check if view already exists
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_AI_COPILOT)[0];

		if (!leaf) {
			// Create new leaf in right sidebar
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({
					type: VIEW_TYPE_AI_COPILOT,
					active: true,
				});
				leaf = rightLeaf;
			}
		}

		// Reveal the leaf
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	async activatePageView() {
		const { workspace } = this.app;

		// Check if view already exists in main area
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_AI_COPILOT)[0];

		if (!leaf || leaf.getRoot() === workspace.rightSplit) {
			// Create new leaf in main area
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({
				type: VIEW_TYPE_AI_COPILOT,
				active: true,
			});
		}

		// Reveal the leaf
		workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
