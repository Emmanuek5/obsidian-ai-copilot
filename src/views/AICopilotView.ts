import { ItemView, WorkspaceLeaf, Notice, Menu } from 'obsidian';
import type AICopilotPlugin from '../main';
import { AIService, type AIMessage } from '../ai/aiService';
import { ConversationManager, type Conversation } from '../conversations/conversationManager';
import { MentionHandler } from './mentionHandler';

export const VIEW_TYPE_AI_COPILOT = 'ai-copilot-view';

export class AICopilotView extends ItemView {
	private plugin: AICopilotPlugin;
	private aiService: AIService;
	private conversationManager: ConversationManager;
	private mentionHandler: MentionHandler;
	private currentConversation: Conversation;
	private conversations: Conversation[] = [];
	
	private messagesEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private sendButton!: HTMLButtonElement;
	private conversationSelect!: HTMLSelectElement;
	private attachmentsEl!: HTMLElement;
	private isStreaming: boolean = false;
	private pendingAttachments: import('../ai/aiService').FileAttachment[] = [];

	constructor(leaf: WorkspaceLeaf, plugin: AICopilotPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.aiService = new AIService(plugin);
		this.conversationManager = new ConversationManager(this.app, plugin);
		this.mentionHandler = new MentionHandler(this.app, plugin);
		this.currentConversation = this.conversationManager.createNewConversation();
	}

	override getViewType(): string {
		return VIEW_TYPE_AI_COPILOT;
	}

	override getDisplayText(): string {
		return 'AI Copilot';
	}

	override getIcon(): string {
		return 'bot';
	}

	override async onOpen() {
		const container = this.contentEl;
		container.empty();
		container.addClass('ai-copilot-view');

		// Load existing conversations
		await this.loadConversations();
		this.renderView();
	}

	override async onClose() {
		// Auto-save current conversation if it has messages
		if (this.currentConversation.messages.length > 0) {
			await this.autoSaveConversation();
		}
	}

	private async loadConversations() {
		this.conversations = await this.conversationManager.listConversations();
	}

	private renderView() {
		const container = this.contentEl;
		container.empty();

		// Header - minimal with conversation selector and new button
		const header = container.createDiv({ cls: 'ai-copilot-header' });
		
		// Conversation selector (dropdown)
		this.conversationSelect = header.createEl('select', { cls: 'ai-copilot-conversation-select' });
		this.updateConversationSelect();
		this.conversationSelect.addEventListener('change', async () => {
			const selectedId = this.conversationSelect.value;
			if (selectedId === 'new') {
				await this.startNewConversation();
			} else {
				const selected = this.conversations.find(c => c.id === selectedId);
				if (selected) {
					this.currentConversation = selected;
					this.renderMessages();
				}
			}
		});
		
		// New conversation button (+ icon)
		const newBtn = header.createEl('button', { 
			cls: 'ai-copilot-new-btn',
			text: '+',
			attr: { 'aria-label': 'New conversation' }
		});
		newBtn.addEventListener('click', () => this.startNewConversation());

		// Messages container
		this.messagesEl = container.createDiv({ cls: 'ai-copilot-messages' });
		
		// Render existing messages
		this.renderMessages();

		// Input area - flush with messages
		const inputWrapper = container.createDiv({ cls: 'ai-copilot-input-wrapper' });
		
		// Pending attachments display (above input)
		this.attachmentsEl = inputWrapper.createDiv({ cls: 'ai-copilot-pending-attachments' });
		
		// Input container - relative positioning for absolute buttons
		const inputContainer = inputWrapper.createDiv({ cls: 'ai-copilot-input-container' });
		
		// Textarea fills the container
		this.inputEl = inputContainer.createEl('textarea', {
			cls: 'ai-copilot-input',
			attr: {
				placeholder: 'Message AI Copilot • @ to add context • / for custom prompts',
				rows: '3',
			},
		});

		// Auto-resize textarea
		this.inputEl.addEventListener('input', () => {
			this.inputEl.style.height = 'auto';
			this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 200) + 'px';
			this.mentionHandler.handleInput(new Event('input'), this.inputEl);
		});

		// Handle enter key (send message)
		this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this.sendMessage();
			}
		});

		// Left side controls - positioned absolutely inside textarea
		const leftControls = inputContainer.createDiv({ cls: 'ai-copilot-input-controls-left' });
		
		// @ mention button
		const mentionBtn = leftControls.createEl('button', {
			cls: 'ai-copilot-input-icon-btn',
			attr: { 'aria-label': 'Add context', 'title': 'Add context (@)' }
		});
		mentionBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z"></path><path d="M16 12v1a2 2 0 0 0 4 0v-1a10 10 0 1 0-3.92 7.94"></path></svg>';
		mentionBtn.addEventListener('click', () => {
			this.inputEl.value += '@';
			this.inputEl.focus();
			this.inputEl.dispatchEvent(new Event('input'));
		});
		
		// Attachment button
		const attachBtn = leftControls.createEl('button', {
			cls: 'ai-copilot-input-icon-btn',
			attr: { 'aria-label': 'Attach file', 'title': 'Attach file' }
		});
		attachBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>';
		attachBtn.addEventListener('click', () => {
			this.inputEl.value += '@';
			this.inputEl.focus();
			this.inputEl.dispatchEvent(new Event('input'));
		});

		// Right side controls - positioned absolutely inside textarea
		const rightControls = inputContainer.createDiv({ cls: 'ai-copilot-input-controls-right' });
		
		// Send button
		this.sendButton = rightControls.createEl('button', {
			cls: 'ai-copilot-send-btn',
			attr: { 'aria-label': 'Send message', 'title': 'Send message' }
		});
		this.sendButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>';
		this.sendButton.addEventListener('click', () => this.sendMessage());
	}

	private updateConversationSelect() {
		this.conversationSelect.empty();
		
		// Current conversation option
		const currentOpt = this.conversationSelect.createEl('option', {
			value: this.currentConversation.id,
			text: this.currentConversation.title || 'New Chat'
		});
		currentOpt.selected = true;
		
		// Separator
		if (this.conversations.length > 0) {
			this.conversationSelect.createEl('option', { 
				text: '───────────', 
				attr: { disabled: 'true' } 
			});
		}
		
		// Other conversations
		for (const conv of this.conversations) {
			if (conv.id !== this.currentConversation.id) {
				this.conversationSelect.createEl('option', {
					value: conv.id,
					text: conv.title || 'Untitled Chat'
				});
			}
		}
		
		// New chat option
		this.conversationSelect.createEl('option', { 
			text: '───────────', 
			attr: { disabled: 'true' } 
		});
		this.conversationSelect.createEl('option', {
			value: 'new',
			text: '+ New Chat'
		});
	}

	private scrollToBottom() {
		if (this.messagesEl) {
			setTimeout(() => {
				this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
			}, 50);
		}
	}

	private renderMessages() {
		this.messagesEl.empty();

		if (this.currentConversation.messages.length === 0) {
			// Show empty state
			const emptyState = this.messagesEl.createDiv({ cls: 'ai-copilot-empty-state' });
			emptyState.createDiv({ cls: 'ai-copilot-empty-state-title', text: 'Start a conversation' });
			emptyState.createDiv({ cls: 'ai-copilot-empty-state-message', text: 'Ask me anything about your vault or type @ to mention a file.' });
			return;
		}

		for (const message of this.currentConversation.messages) {
			this.renderMessage(message);
		}

		// Auto-scroll to bottom after rendering
		this.scrollToBottom();
	}

	private renderMessage(message: AIMessage) {
		const messageEl = this.messagesEl.createDiv({
			cls: `ai-copilot-message ai-copilot-message-${message.role}`,
		});

		// Message content
		const contentEl = messageEl.createDiv({ cls: 'ai-copilot-message-content' });
		
		// Render markdown
		this.renderMarkdown(message.content, contentEl);

		// Show attachments
		if (message.attachments && message.attachments.length > 0) {
			const attachmentsEl = messageEl.createDiv({ cls: 'ai-copilot-attachments' });
			
			for (const attachment of message.attachments) {
				const attachEl = attachmentsEl.createEl('span', {
					cls: 'ai-copilot-attachment',
					text: attachment.name,
				});
				
				attachEl.addEventListener('click', () => {
					this.app.workspace.openLinkText(attachment.path, '', false);
				});
			}
		}

		// Add copy button for existing assistant messages (not streamed)
		if (message.role === 'assistant' && !this.isStreaming) {
			this.addContextMenu(messageEl, message.content);
		}
	}

	private renderMarkdown(markdown: string, container: HTMLElement) {
		try {
			// Use Obsidian's MarkdownRenderer
			const { MarkdownRenderer } = require('obsidian');
			MarkdownRenderer.render(
				this.app,
				markdown,
				container,
				'',
				this
			);
			
			// Add click handler for internal links [[...]]
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
			// Fallback to simple text rendering with link detection
			const lines = markdown.split('\n');
			container.empty();
			for (const line of lines) {
				if (line.trim()) {
					const p = container.createEl('p');
					// Convert [[links]] to clickable spans
					const linkPattern = /\[\[([^\]]+)\]\]/g;
					let lastIndex = 0;
					let match;
					
					while ((match = linkPattern.exec(line)) !== null) {
						// Add text before the link
						if (match.index > lastIndex) {
							p.appendText(line.substring(lastIndex, match.index));
						}
						
						// Create clickable link
						const linkName = match[1];
						const linkEl = p.createEl('a', {
							text: linkName,
							cls: 'internal-link',
							attr: { href: linkName }
						});
						linkEl.addEventListener('click', (e) => {
							e.preventDefault();
							this.app.workspace.openLinkText(linkName, '', false);
						});
						
						lastIndex = match.index + match[0].length;
					}
					
					// Add remaining text
					if (lastIndex < line.length) {
						p.appendText(line.substring(lastIndex));
					}
				}
			}
		}
	}

	private async sendMessage() {
		if (this.isStreaming) {
			new Notice('Please wait for the current response to complete');
			return;
		}

		const userInput = this.inputEl.value.trim();
		if (!userInput && this.pendingAttachments.length === 0) return;

		// Check if API key is set
		if (!this.plugin.settings.apiKey) {
			new Notice('Please set your Google Gemini API key in settings');
			return;
		}

		// Extract mentions and attach files
		const mentions = this.mentionHandler.extractMentions(userInput);
		
		let userMessage: AIMessage = {
			role: 'user',
			content: userInput,
			timestamp: Date.now(),
			attachments: [...this.pendingAttachments], // Include pending attachments
		};

		// Attach mentioned files
		if (mentions.length > 0) {
			userMessage = await this.aiService.attachFilesToMessage(userMessage, mentions);
		}

		// Add user message to conversation
		this.currentConversation.messages.push(userMessage);
		this.renderMessage(userMessage);
		this.scrollToBottom();
		
		// Clear input and reset height
		this.inputEl.value = '';
		this.inputEl.style.height = 'auto';
		this.pendingAttachments = [];
		this.renderPendingAttachments();

		// Generate response
		await this.generateResponse();
	}

	private async generateResponse() {
		// Disable input while streaming
		this.isStreaming = true;
		this.inputEl.disabled = true;
		this.sendButton.disabled = true;

		// Create assistant message container
		const assistantMessage: AIMessage = {
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			toolCalls: [],
		};

		const messageEl = this.messagesEl.createDiv({
			cls: 'ai-copilot-message ai-copilot-message-assistant',
		});

		// Tool calls container
		const toolCallsEl = messageEl.createDiv({ cls: 'ai-copilot-tool-calls' });
		
		// Content container
		const contentEl = messageEl.createDiv({ cls: 'ai-copilot-message-content' });
		
		// Show thinking indicator
		contentEl.setText('Thinking...');
		contentEl.addClass('ai-copilot-thinking');

		// Map to track tool call UI elements
		const toolCallElements = new Map<string, HTMLElement>();

		try {
			// Add system message
			const messages = [
				this.aiService.createSystemMessage(),
				...this.currentConversation.messages,
			];

			// Stream response with tools
			let isFirstText = true;
			
			for await (const result of this.aiService.streamWithTools(messages, (toolCall) => {
				// Update tool call UI
				this.updateToolCallUI(toolCallsEl, toolCallElements, toolCall);
			})) {
				if (result.type === 'text' && result.content) {
					if (isFirstText) {
						contentEl.removeClass('ai-copilot-thinking');
						contentEl.empty();
						isFirstText = false;
					}
					assistantMessage.content += result.content;
					contentEl.empty();
					this.renderMarkdown(assistantMessage.content, contentEl);
					
					// Auto-scroll
					this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
				} else if (result.type === 'tool-call' && result.toolCall) {
					assistantMessage.toolCalls = assistantMessage.toolCalls || [];
					const existing = assistantMessage.toolCalls.find(t => t.id === result.toolCall!.id);
					if (!existing) {
						assistantMessage.toolCalls.push(result.toolCall);
					}
				} else if (result.type === 'tool-result' && result.toolCall) {
					// Update tool call in message
					if (assistantMessage.toolCalls) {
						const idx = assistantMessage.toolCalls.findIndex(t => t.id === result.toolCall!.id);
						if (idx >= 0) {
							assistantMessage.toolCalls[idx] = result.toolCall;
						}
					}
				}
			}

			// If no text was generated but thinking is still shown
			if (isFirstText) {
				contentEl.removeClass('ai-copilot-thinking');
				contentEl.empty();
				// Show a message if there's no content
				if (!assistantMessage.content) {
					assistantMessage.content = '*The AI did not generate a response. This may be due to a tool error or API issue. Try rephrasing your request.*';
					this.renderMarkdown(assistantMessage.content, contentEl);
					contentEl.addClass('ai-copilot-error-message');
				}
			}

			// Add assistant message to conversation
			this.currentConversation.messages.push(assistantMessage);
			this.currentConversation.updatedAt = Date.now();

			// Extract and save memories from response
			await this.extractMemories(assistantMessage.content);

			// Add copy button after streaming completes
			if (assistantMessage.content) {
				this.addContextMenu(messageEl, assistantMessage.content);
			}

			// Auto-save after each message
			await this.autoSaveConversation();

		} catch (error) {
			console.error('Error generating response:', error);
			contentEl.removeClass('ai-copilot-thinking');
			contentEl.empty();
			
			const errorMessage = (error as Error).message || 'Unknown error occurred';
			contentEl.createDiv({ cls: 'ai-copilot-error-message', text: `Error: ${errorMessage}` });
			
			// Add retry context menu to the failed message
			this.addContextMenu(messageEl, '', () => {
				messageEl.remove();
				this.generateResponse();
			});

			new Notice('Failed to generate response. Check console for details.');
		} finally {
			// Re-enable input
			this.isStreaming = false;
			this.inputEl.disabled = false;
			this.sendButton.disabled = false;
			this.inputEl.focus();
		}
	}

	private updateToolCallUI(
		container: HTMLElement, 
		elements: Map<string, HTMLElement>, 
		toolCall: { id: string; name: string; status: string; args?: Record<string, unknown>; result?: unknown; error?: string }
	) {
		let el = elements.get(toolCall.id);
		
		if (!el) {
			el = container.createDiv({ cls: 'ai-copilot-tool-call' });
			elements.set(toolCall.id, el);
		}

		el.empty();
		
		// Status icon
		let statusIcon = '⏳';
		let statusClass = 'running';
		
		if (toolCall.status === 'completed') {
			statusIcon = '✅';
			statusClass = 'completed';
		} else if (toolCall.status === 'failed') {
			statusIcon = '❌';
			statusClass = 'failed';
		} else if (toolCall.status === 'requires_approval') {
			statusIcon = '⚠️';
			statusClass = 'approval';
		}
		
		el.className = `ai-copilot-tool-call ai-copilot-tool-call-${statusClass}`;
		
		// Tool info
		const infoEl = el.createDiv({ cls: 'ai-copilot-tool-call-info' });
		infoEl.createSpan({ text: statusIcon, cls: 'ai-copilot-tool-call-icon' });
		infoEl.createSpan({ text: this.formatToolName(toolCall.name), cls: 'ai-copilot-tool-call-name' });
		
		// Show args summary for some tools
		if (toolCall.args) {
			const argsStr = this.formatToolArgs(toolCall.name, toolCall.args);
			if (argsStr) {
				infoEl.createSpan({ text: argsStr, cls: 'ai-copilot-tool-call-args' });
			}
		}

		// Approval buttons
		if (toolCall.status === 'requires_approval') {
			const actionsEl = el.createDiv({ cls: 'ai-copilot-tool-call-actions' });
			
			const approveBtn = actionsEl.createEl('button', { 
				text: 'Approve', 
				cls: 'ai-copilot-btn ai-copilot-btn-approve' 
			});
			approveBtn.addEventListener('click', async () => {
				await this.executeApprovedAction(toolCall);
				el!.className = 'ai-copilot-tool-call ai-copilot-tool-call-completed';
				actionsEl.remove();
				infoEl.querySelector('.ai-copilot-tool-call-icon')!.textContent = '✅';
			});
			
			const rejectBtn = actionsEl.createEl('button', { 
				text: 'Reject', 
				cls: 'ai-copilot-btn ai-copilot-btn-reject' 
			});
			rejectBtn.addEventListener('click', () => {
				el!.className = 'ai-copilot-tool-call ai-copilot-tool-call-failed';
				actionsEl.remove();
				infoEl.querySelector('.ai-copilot-tool-call-icon')!.textContent = '🚫';
				new Notice('Action rejected');
			});
		}

		// Error message
		if (toolCall.status === 'failed' && toolCall.error) {
			el.createDiv({ text: toolCall.error, cls: 'ai-copilot-tool-call-error' });
		}
	}

	private formatToolName(name: string): string {
		const names: Record<string, string> = {
			readFile: 'Reading file',
			listFiles: 'Listing files',
			searchFiles: 'Searching files',
			createNote: 'Creating note',
			modifyNote: 'Modifying note',
			deleteNote: 'Deleting note',
			getCurrentDate: 'Getting date',
			addMemory: 'Saving memory',
		};
		return names[name] || name;
	}

	private formatToolArgs(name: string, args: Record<string, unknown>): string {
		if (args.path) return `"${args.path}"`;
		if (args.query) return `"${args.query}"`;
		if (args.content && typeof args.content === 'string') {
			return `"${args.content.substring(0, 30)}..."`;
		}
		return '';
	}

	private async executeApprovedAction(toolCall: { name: string; args?: Record<string, unknown>; result?: unknown }) {
		const result = toolCall.result as { action?: string; path?: string; content?: string; newContent?: string };
		const app = this.plugin.app;

		try {
			if (result?.action === 'create' && result.path && result.content) {
				await app.vault.create(result.path, result.content);
				new Notice(`Created: ${result.path}`);
			} else if (result?.action === 'modify' && result.path && result.newContent) {
				const file = app.vault.getAbstractFileByPath(result.path);
				if (file) {
					await app.vault.modify(file as any, result.newContent);
					new Notice(`Modified: ${result.path}`);
				}
			} else if (result?.action === 'delete' && result.path) {
				const file = app.vault.getAbstractFileByPath(result.path);
				if (file) {
					await app.vault.delete(file);
					new Notice(`Deleted: ${result.path}`);
				}
			}
		} catch (error) {
			new Notice(`Failed: ${(error as Error).message}`);
		}
	}

	private addContextMenu(messageEl: HTMLElement, content: string, onRetry?: () => void) {
		messageEl.addEventListener('contextmenu', (e: MouseEvent) => {
			e.preventDefault();
			
			const menu = new Menu();
			
			menu.addItem((item) => {
				item.setTitle('Copy message')
					.setIcon('copy')
					.onClick(async () => {
						await navigator.clipboard.writeText(content);
						new Notice('Message copied to clipboard');
					});
			});

			if (onRetry) {
				menu.addItem((item) => {
					item.setTitle('Retry request')
						.setIcon('refresh-cw')
						.onClick(onRetry);
				});
			}
			
			menu.showAtMouseEvent(e);
		});
	}

	private async extractMemories(response: string) {
		// Look for [REMEMBER: ...] pattern in the response
		const rememberPattern = /\[REMEMBER:\s*([^\]]+)\]/gi;
		let match;
		
		while ((match = rememberPattern.exec(response)) !== null) {
			const memoryContent = match[1]?.trim();
			if (memoryContent && memoryContent.length > 3) {
				await this.plugin.memoryManager.addMemory(
					memoryContent, 
					'important',
					this.currentConversation.id
				);
				new Notice('Memory saved!');
			}
		}
	}

	private async startNewConversation() {
		// Save current conversation first
		if (this.currentConversation.messages.length > 0) {
			await this.autoSaveConversation();
		}

		// Create new conversation
		this.currentConversation = this.conversationManager.createNewConversation();
		
		// Reload conversations list and re-render
		await this.loadConversations();
		this.renderView();
	}

	private async autoSaveConversation() {
		if (this.currentConversation.messages.length === 0) return;

		// Generate title from first message if still default
		if (this.currentConversation.title === 'New Conversation' && this.currentConversation.messages.length > 0) {
			const firstMessage = this.currentConversation.messages[0].content;
			this.currentConversation.title = firstMessage.substring(0, 40) + (firstMessage.length > 40 ? '...' : '');
		}

		await this.conversationManager.saveConversation(this.currentConversation);
		
		// Update select if needed
		await this.loadConversations();
		this.updateConversationSelect();
	}

	// Keep for backwards compatibility but mark deprecated
	private async saveCurrentConversation() {
		await this.autoSaveConversation();
	}

	private async exportConversation() {
		if (this.currentConversation.messages.length === 0) {
			new Notice('No messages to export');
			return;
		}

		const markdown = await this.conversationManager.exportConversationAsMarkdown(
			this.currentConversation
		);

		const fileName = `${this.currentConversation.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
		
		await this.app.vault.create(fileName, markdown);
		new Notice(`Exported to ${fileName}`);
	}

	// Public method to add text context from context menu
	addTextContext(text: string, source: string) {
		// Create a "note" type attachment with the selected text
		const attachment: import('../ai/aiService').FileAttachment = {
			type: 'note',
			path: source,
			name: `Selection from ${source.split('/').pop() || 'document'}`,
			content: text,
		};
		
		this.pendingAttachments.push(attachment);
		this.renderPendingAttachments();
		this.inputEl.focus();
	}

	private renderPendingAttachments() {
		this.attachmentsEl.empty();
		
		if (this.pendingAttachments.length === 0) {
			this.attachmentsEl.hide();
			return;
		}
		
		this.attachmentsEl.show();
		
		for (let i = 0; i < this.pendingAttachments.length; i++) {
			const attachment = this.pendingAttachments[i];
			const attachEl = this.attachmentsEl.createDiv({ cls: 'ai-copilot-pending-attachment' });
			
			// Attachment name
			attachEl.createSpan({ text: attachment.name, cls: 'ai-copilot-pending-attachment-name' });
			
			// Remove button
			const removeBtn = attachEl.createEl('button', {
				cls: 'ai-copilot-pending-attachment-remove',
				text: '×',
				attr: { 'aria-label': 'Remove attachment' }
			});
			removeBtn.addEventListener('click', () => this.removePendingAttachment(i));
		}
	}

	private removePendingAttachment(index: number) {
		this.pendingAttachments.splice(index, 1);
		this.renderPendingAttachments();
	}
}
