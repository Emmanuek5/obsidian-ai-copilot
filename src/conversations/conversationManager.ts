import { App, TFile, Notice } from 'obsidian';
import type AICopilotPlugin from '../main';
import type { AIMessage } from '../ai/aiService';
import type { FileChange } from '../tools/toolDefinitions';

export interface Conversation {
	id: string;
	title: string;
	messages: AIMessage[];
	createdAt: number;
	updatedAt: number;
	changes: FileChange[]; // Track all file changes
	metadata?: {
		tags?: string[];
		summary?: string;
		[key: string]: unknown;
	};
}

export class ConversationManager {
	private app: App;
	private plugin: AICopilotPlugin;

	constructor(app: App, plugin: AICopilotPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	private getConversationsFolder(): string {
		return this.plugin.settings.conversationsFolder;
	}

	async ensureConversationsFolderExists(): Promise<void> {
		const folderPath = this.getConversationsFolder();
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		
		if (!folder) {
			await this.app.vault.createFolder(folderPath);
		}
	}

	async saveConversation(conversation: Conversation): Promise<void> {
		await this.ensureConversationsFolderExists();

		const fileName = `${conversation.id}.aicon`;
		const filePath = `${this.getConversationsFolder()}/${fileName}`;

		// Convert conversation to .aicon format (JSON with YAML frontmatter)
		const content = this.conversationToAicon(conversation);

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, content);
		} else {
			await this.app.vault.create(filePath, content);
		}
	}

	async loadConversation(id: string): Promise<Conversation | null> {
		const fileName = `${id}.aicon`;
		const filePath = `${this.getConversationsFolder()}/${fileName}`;
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (!(file instanceof TFile)) {
			return null;
		}

		const content = await this.app.vault.read(file);
		return this.aiconToConversation(content);
	}

	async listConversations(): Promise<Conversation[]> {
		const folderPath = this.getConversationsFolder();
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		
		if (!folder) {
			return [];
		}

		const files = this.app.vault.getFiles().filter(
			(file) => file.path.startsWith(folderPath) && file.extension === 'aicon'
		);

		const conversations: Conversation[] = [];

		for (const file of files) {
			const content = await this.app.vault.read(file);
			const conversation = this.aiconToConversation(content);
			if (conversation) {
				conversations.push(conversation);
			}
		}

		// Sort by updatedAt descending
		return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	async deleteConversation(id: string): Promise<void> {
		const fileName = `${id}.aicon`;
		const filePath = `${this.getConversationsFolder()}/${fileName}`;
		
		const file = this.app.vault.getAbstractFileByPath(filePath);
		
		if (file instanceof TFile) {
			await this.app.vault.delete(file);
			new Notice('Conversation deleted');
		}
	}

	createNewConversation(title: string = 'New Conversation'): Conversation {
		return {
			id: this.generateId(),
			title,
			messages: [],
			changes: [],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			metadata: {},
		};
	}

	private generateId(): string {
		return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Convert conversation to .aicon format
	 * Format: YAML frontmatter + JSON body (with messages and changes)
	 */
	private conversationToAicon(conversation: Conversation): string {
		const frontmatter = {
			id: conversation.id,
			title: conversation.title,
			createdAt: conversation.createdAt,
			updatedAt: conversation.updatedAt,
			...conversation.metadata,
		};

		const yamlLines = [
			'---',
			...Object.entries(frontmatter).map(([key, value]) => {
				if (typeof value === 'string') {
					return `${key}: "${value}"`;
				}
				if (Array.isArray(value)) {
					return `${key}: [${value.map(v => `"${v}"`).join(', ')}]`;
				}
				return `${key}: ${value}`;
			}),
			'---',
			'',
		];

		const yaml = yamlLines.join('\n');
		
		// Save both messages and changes in a structured format
		const body = {
			messages: conversation.messages,
			changes: conversation.changes,
		};
		const bodyJson = JSON.stringify(body, null, 2);

		return `${yaml}\n${bodyJson}`;
	}

	/**
	 * Parse .aicon format back to conversation
	 */
	private aiconToConversation(content: string): Conversation | null {
		try {
			// Split frontmatter and body
			const parts = content.split('---\n');
			
			if (parts.length < 3) {
				console.error('Invalid .aicon format');
				return null;
			}

			// Parse frontmatter (simple YAML parser)
			const frontmatterLines = parts[1].split('\n').filter(line => line.trim());
			const metadata: Record<string, unknown> = {};
			
			for (const line of frontmatterLines) {
				const colonIndex = line.indexOf(':');
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					let value: unknown = line.substring(colonIndex + 1).trim();
					
					// Remove quotes
					if (typeof value === 'string') {
						value = value.replace(/^["']|["']$/g, '');
						
						// Try to parse numbers
						if (!isNaN(Number(value))) {
							value = Number(value);
						}
					}
					
					metadata[key] = value;
				}
			}

			// Parse messages (JSON)
			const messagesJson = parts.slice(2).join('---\n').trim();
			const parsed = JSON.parse(messagesJson);
			
			// Handle both old format (just messages) and new format (with changes)
			const messages = Array.isArray(parsed) ? parsed : (parsed.messages || []);
			const changes = Array.isArray(parsed) ? [] : (parsed.changes || []);

			return {
				id: metadata.id as string,
				title: metadata.title as string,
				messages,
				changes,
				createdAt: metadata.createdAt as number,
				updatedAt: metadata.updatedAt as number,
				metadata: {
					...metadata,
				},
			};
		} catch (error) {
			console.error('Error parsing .aicon file:', error);
			return null;
		}
	}

	async exportConversationAsMarkdown(conversation: Conversation): Promise<string> {
		let markdown = `# ${conversation.title}\n\n`;
		markdown += `Created: ${new Date(conversation.createdAt).toLocaleString()}\n`;
		markdown += `Updated: ${new Date(conversation.updatedAt).toLocaleString()}\n\n`;
		markdown += '---\n\n';

		for (const message of conversation.messages) {
			const role = message.role === 'user' ? '👤 User' : '🤖 AI Assistant';
			const time = new Date(message.timestamp).toLocaleTimeString();
			
			markdown += `## ${role} (${time})\n\n`;
			markdown += `${message.content}\n\n`;

			if (message.attachments && message.attachments.length > 0) {
				markdown += '**Attached Files:**\n';
				for (const attachment of message.attachments) {
					markdown += `- [[${attachment.path}]]\n`;
				}
				markdown += '\n';
			}
		}

		return markdown;
	}
}
