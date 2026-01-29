import { FileView, TFile, WorkspaceLeaf, Notice, MarkdownRenderer, Menu } from 'obsidian';
import type AICopilotPlugin from '../main';
import { ConversationManager, type Conversation } from '../conversations/conversationManager';
import type { AIMessage } from '../ai/aiService';

export const VIEW_TYPE_AICON = 'aicon-viewer';

export class AiconViewerView extends FileView {
	private plugin: AICopilotPlugin;
	private conversationManager: ConversationManager;
	private conversation: Conversation | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: AICopilotPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.conversationManager = new ConversationManager(this.app, plugin);
	}

	override getViewType(): string {
		return VIEW_TYPE_AICON;
	}

	override getDisplayText(): string {
		return this.conversation?.title || 'AI Conversation';
	}

	async onLoadFile(file: TFile): Promise<void> {
		// Read the .aicon file
		const content = await this.app.vault.read(file);
		
		// Parse it
		this.conversation = this.parseAiconContent(content);

		// Render it
		this.renderConversation();
	}

	async onUnloadFile(file: TFile): Promise<void> {
		this.conversation = null;
	}

	private parseAiconContent(content: string): Conversation | null {
		try {
			const parts = content.split('---\n');
			
			if (parts.length < 3) {
				console.error('Invalid .aicon format');
				return null;
			}

			const frontmatterLines = parts[1].split('\n').filter(line => line.trim());
			const metadata: Record<string, unknown> = {};
			
			for (const line of frontmatterLines) {
				const colonIndex = line.indexOf(':');
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					let value: unknown = line.substring(colonIndex + 1).trim();
					
					if (typeof value === 'string') {
						value = value.replace(/^["']|["']$/g, '');
						
						if (!isNaN(Number(value))) {
							value = Number(value);
						}
					}
					
					metadata[key] = value;
				}
			}

			const messagesJson = parts.slice(2).join('---\n').trim();
			let messages: AIMessage[] = [];
			
			try {
				const parsed = JSON.parse(messagesJson);
				// Handle both formats: direct array or { messages: [...] }
				if (Array.isArray(parsed)) {
					messages = parsed;
				} else if (parsed && Array.isArray(parsed.messages)) {
					messages = parsed.messages;
				} else {
					console.error('Unexpected JSON format - neither array nor object with messages property');
					messages = [];
				}
			} catch (e) {
				console.error('Failed to parse messages JSON:', e);
				messages = [];
			}

			return {
				id: metadata.id as string || 'unknown',
				title: metadata.title as string || 'Untitled',
				messages,
				createdAt: metadata.createdAt as number || Date.now(),
				updatedAt: metadata.updatedAt as number || Date.now(),
				changes: [],
				metadata: {
					...metadata,
				},
			};
		} catch (error) {
			console.error('Error parsing .aicon file:', error);
			return null;
		}
	}

	private renderConversation() {
		const container = this.contentEl;
		container.empty();
		container.addClass('aicon-viewer');

		if (!this.conversation) {
			container.createEl('p', { text: 'Failed to load conversation' });
			return;
		}

		// Header
		const header = container.createDiv({ cls: 'aicon-viewer-header' });
		header.createEl('h1', { text: this.conversation.title });

		const meta = header.createDiv({ cls: 'aicon-viewer-meta' });
		meta.createEl('span', {
			text: `Created: ${new Date(this.conversation.createdAt).toLocaleString()}`,
		});
		meta.createEl('span', {
			text: `Updated: ${new Date(this.conversation.updatedAt).toLocaleString()}`,
		});
		meta.createEl('span', {
			text: `Messages: ${this.conversation.messages?.length || 0}`,
		});

		// Actions
		const actions = header.createDiv({ cls: 'aicon-viewer-actions' });
		
		const exportBtn = actions.createEl('button', {
			text: 'Export as Markdown',
			cls: 'ai-copilot-btn',
		});
		exportBtn.addEventListener('click', async () => {
			if (this.conversation) {
				const markdown = await this.conversationManager.exportConversationAsMarkdown(
					this.conversation
				);
				const fileName = `${this.conversation.title.replace(/[^a-zA-Z0-9]/g, '_')}_export.md`;
				await this.app.vault.create(fileName, markdown);
				new Notice(`Exported to ${fileName}`);
			}
		});

		const deleteBtn = actions.createEl('button', {
			text: 'Delete',
			cls: 'ai-copilot-btn ai-copilot-btn-danger',
		});
		deleteBtn.addEventListener('click', async () => {
			if (this.file) {
				await this.app.vault.delete(this.file);
				new Notice('Conversation deleted');
			}
		});

		// Messages
		const messagesContainer = container.createDiv({ cls: 'aicon-viewer-messages' });

		const messages = this.conversation.messages || [];
		
		if (messages.length === 0) {
			messagesContainer.createEl('p', { 
				text: 'No messages in this conversation',
				cls: 'aicon-viewer-empty'
			});
			return;
		}

		for (const message of messages) {
			const messageEl = messagesContainer.createDiv({
				cls: `aicon-viewer-message aicon-viewer-message-${message.role}`,
			});

			// Content
			const contentEl = messageEl.createDiv({ cls: 'aicon-viewer-message-content' });
			this.renderMarkdown(message.content, contentEl);

			// Right-click context menu for copying
			messageEl.addEventListener('contextmenu', (e: MouseEvent) => {
				e.preventDefault();
				
				const menu = new Menu();
				
				menu.addItem((item) => {
					item.setTitle('Copy message')
						.setIcon('copy')
						.onClick(async () => {
							await navigator.clipboard.writeText(message.content);
							new Notice('Message copied to clipboard');
						});
				});
				
				menu.showAtMouseEvent(e);
			});

			// Attachments
			if (message.attachments && message.attachments.length > 0) {
				const attachments = messageEl.createDiv({ cls: 'aicon-viewer-attachments' });
				
				for (const attachment of message.attachments) {
					const attachEl = attachments.createEl('span', {
						text: attachment.name,
						cls: 'aicon-viewer-attachment',
					});
					attachEl.addEventListener('click', () => {
						this.app.workspace.openLinkText(attachment.path, '', false);
					});
				}
			}
		}
	}

	private renderMarkdown(markdown: string, container: HTMLElement) {
		try {
			// Try Obsidian's MarkdownRenderer
			MarkdownRenderer.render(
				this.app,
				markdown,
				container,
				'',
				this
			);
			
			// Add click handler for internal links
			container.querySelectorAll('a.internal-link').forEach((link) => {
				link.addEventListener('click', (e) => {
					e.preventDefault();
					const href = link.getAttribute('href');
					if (href) {
						this.app.workspace.openLinkText(href, '', false);
					}
				});
			});
		} catch (error) {
			// Fallback to simple text rendering
			const lines = markdown.split('\n');
			for (const line of lines) {
				if (line.trim()) {
					container.createEl('p', { text: line });
				}
			}
		}
	}
}
