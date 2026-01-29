import { App } from 'obsidian';
import type AICopilotPlugin from '../main';

export interface MemoryItem {
	id: string;
	content: string;
	category: 'fact' | 'preference' | 'context' | 'important';
	createdAt: number;
	source?: string; // conversation ID or context
}

export interface Memory {
	items: MemoryItem[];
	lastUpdated: number;
}

const MEMORY_FILE = '.ai-copilot-memory.json';

export class MemoryManager {
	private app: App;
	private plugin: AICopilotPlugin;
	private memory: Memory = { items: [], lastUpdated: Date.now() };

	constructor(app: App, plugin: AICopilotPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	async initialize() {
		await this.loadMemory();
	}

	private async loadMemory() {
		try {
			const file = this.app.vault.getAbstractFileByPath(MEMORY_FILE);
			if (file) {
				const content = await this.app.vault.read(file as any);
				this.memory = JSON.parse(content);
			}
		} catch (error) {
			console.log('No existing memory file, starting fresh');
			this.memory = { items: [], lastUpdated: Date.now() };
		}
	}

	private async saveMemory() {
		try {
			const content = JSON.stringify(this.memory, null, 2);
			const file = this.app.vault.getAbstractFileByPath(MEMORY_FILE);
			
			if (file) {
				await this.app.vault.modify(file as any, content);
			} else {
				await this.app.vault.create(MEMORY_FILE, content);
			}
		} catch (error) {
			console.error('Failed to save memory:', error);
		}
	}

	// Add a new memory item
	async addMemory(content: string, category: MemoryItem['category'] = 'fact', source?: string): Promise<MemoryItem> {
		const item: MemoryItem = {
			id: this.generateId(),
			content,
			category,
			createdAt: Date.now(),
			source,
		};

		this.memory.items.push(item);
		this.memory.lastUpdated = Date.now();
		await this.saveMemory();
		
		return item;
	}

	// Remove a memory item
	async removeMemory(id: string) {
		this.memory.items = this.memory.items.filter(item => item.id !== id);
		this.memory.lastUpdated = Date.now();
		await this.saveMemory();
	}

	// Get all memories
	getMemories(): MemoryItem[] {
		return this.memory.items;
	}

	// Get memories by category
	getMemoriesByCategory(category: MemoryItem['category']): MemoryItem[] {
		return this.memory.items.filter(item => item.category === category);
	}

	// Search memories
	searchMemories(query: string): MemoryItem[] {
		const lowerQuery = query.toLowerCase();
		return this.memory.items.filter(item => 
			item.content.toLowerCase().includes(lowerQuery)
		);
	}

	// Get memory context for AI (formatted string)
	getMemoryContext(): string {
		if (this.memory.items.length === 0) {
			return '';
		}

		let context = '\n\n**User Memory (Remembered Information):**\n';
		
		const categories = ['important', 'preference', 'fact', 'context'] as const;
		
		for (const category of categories) {
			const items = this.getMemoriesByCategory(category);
			if (items.length > 0) {
				context += `\n_${category.charAt(0).toUpperCase() + category.slice(1)}:_\n`;
				for (const item of items.slice(-10)) { // Last 10 per category
					context += `- ${item.content}\n`;
				}
			}
		}

		return context;
	}

	// Clear all memories
	async clearMemory() {
		this.memory = { items: [], lastUpdated: Date.now() };
		await this.saveMemory();
	}

	// Extract key information from a conversation for memory
	async extractAndSaveFromConversation(conversationId: string, assistantResponse: string) {
		// Look for patterns that indicate important information
		const patterns = [
			/(?:remember|note|important|key point)[:\s]+(.+?)(?:\.|$)/gi,
			/(?:your|the user's?)\s+(?:name|email|preference|favorite)\s+(?:is|are)\s+(.+?)(?:\.|$)/gi,
			/(?:you prefer|you like|you want)\s+(.+?)(?:\.|$)/gi,
		];

		for (const pattern of patterns) {
			let match;
			while ((match = pattern.exec(assistantResponse)) !== null) {
				const extracted = match[1]?.trim();
				if (extracted && extracted.length > 5 && extracted.length < 200) {
					await this.addMemory(extracted, 'fact', conversationId);
				}
			}
		}
	}

	private generateId(): string {
		return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}
}
