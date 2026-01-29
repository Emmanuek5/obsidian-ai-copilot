import { App, Notice } from 'obsidian';
import type AICopilotPlugin from '../main';
import { IndexedFile } from '../indexing/vaultIndexer';

export class MentionHandler {
	private app: App;
	private plugin: AICopilotPlugin;
	private suggestionContainer: HTMLElement | null = null;
	private currentSuggestions: IndexedFile[] = [];
	private selectedIndex: number = 0;

	constructor(app: App, plugin: AICopilotPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	handleInput(event: Event, inputEl: HTMLTextAreaElement) {
		const text = inputEl.value;
		const cursorPos = inputEl.selectionStart;

		// Find @ symbol before cursor
		const beforeCursor = text.substring(0, cursorPos);
		const atMatch = beforeCursor.match(/@(\w*)$/);

		if (atMatch) {
			const query = atMatch[1];
			this.showSuggestions(query, inputEl);
		} else {
			this.hideSuggestions();
		}
	}

	private showSuggestions(query: string, inputEl: HTMLTextAreaElement) {
		// Search for files matching the query
		const results = query
			? this.plugin.vaultIndexer.searchFiles(query)
			: this.plugin.vaultIndexer.getAllFiles().slice(0, 10);

		if (results.length === 0) {
			this.hideSuggestions();
			return;
		}

		this.currentSuggestions = results;
		this.selectedIndex = 0;

		// Create or update suggestion container
		if (!this.suggestionContainer) {
			this.suggestionContainer = document.body.createDiv({
				cls: 'ai-copilot-suggestions',
			});
		}

		this.suggestionContainer.empty();

		// Position near the textarea
		const rect = inputEl.getBoundingClientRect();
		this.suggestionContainer.style.position = 'absolute';
		this.suggestionContainer.style.left = `${rect.left}px`;
		this.suggestionContainer.style.top = `${rect.top - 200}px`;
		this.suggestionContainer.style.width = `${rect.width}px`;
		this.suggestionContainer.style.maxHeight = '200px';
		this.suggestionContainer.style.overflowY = 'auto';

		// Render suggestions
		for (let i = 0; i < results.length; i++) {
			const file = results[i];
			const item = this.suggestionContainer.createDiv({
				cls: `ai-copilot-suggestion-item ${i === this.selectedIndex ? 'selected' : ''}`,
			});

			// File icon
			const icon = this.getFileIcon(file.extension);
			item.createSpan({ text: `${icon} `, cls: 'ai-copilot-suggestion-icon' });

			// File name
			item.createSpan({ text: file.name, cls: 'ai-copilot-suggestion-name' });

			// File path (dimmed)
			item.createSpan({
				text: ` - ${file.path}`,
				cls: 'ai-copilot-suggestion-path',
			});

			// Click handler
			item.addEventListener('click', () => {
				this.insertMention(file, inputEl);
			});
		}

		// Keyboard navigation
		inputEl.addEventListener('keydown', this.handleKeyDown.bind(this, inputEl));
	}

	private handleKeyDown(inputEl: HTMLTextAreaElement, e: KeyboardEvent) {
		if (!this.suggestionContainer || this.currentSuggestions.length === 0) {
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				this.selectedIndex = (this.selectedIndex + 1) % this.currentSuggestions.length;
				this.updateSelection();
				break;

			case 'ArrowUp':
				e.preventDefault();
				this.selectedIndex =
					(this.selectedIndex - 1 + this.currentSuggestions.length) %
					this.currentSuggestions.length;
				this.updateSelection();
				break;

			case 'Enter':
				if (this.suggestionContainer.isShown()) {
					e.preventDefault();
					this.insertMention(this.currentSuggestions[this.selectedIndex], inputEl);
				}
				break;

			case 'Escape':
				e.preventDefault();
				this.hideSuggestions();
				break;
		}
	}

	private updateSelection() {
		if (!this.suggestionContainer) return;

		const items = this.suggestionContainer.querySelectorAll('.ai-copilot-suggestion-item');
		items.forEach((item, index) => {
			if (index === this.selectedIndex) {
				item.addClass('selected');
				item.scrollIntoView({ block: 'nearest' });
			} else {
				item.removeClass('selected');
			}
		});
	}

	private insertMention(file: IndexedFile, inputEl: HTMLTextAreaElement) {
		const text = inputEl.value;
		const cursorPos = inputEl.selectionStart;

		// Find the @ symbol to replace
		const beforeCursor = text.substring(0, cursorPos);
		const atMatch = beforeCursor.match(/@\w*$/);

		if (atMatch) {
			const atPos = cursorPos - atMatch[0].length;
			const mention = `@[[${file.path}]]`;
			const newText =
				text.substring(0, atPos) + mention + text.substring(cursorPos);

			inputEl.value = newText;
			inputEl.selectionStart = inputEl.selectionEnd = atPos + mention.length;
		}

		this.hideSuggestions();
		inputEl.focus();
	}

	private hideSuggestions() {
		if (this.suggestionContainer) {
			this.suggestionContainer.remove();
			this.suggestionContainer = null;
		}
		this.currentSuggestions = [];
		this.selectedIndex = 0;
	}

	private getFileIcon(extension: string): string {
		const iconMap: Record<string, string> = {
			md: '📝',
			txt: '📄',
			pdf: '📕',
			png: '🖼️',
			jpg: '🖼️',
			jpeg: '🖼️',
			gif: '🖼️',
			webp: '🖼️',
			mp4: '🎥',
			mp3: '🎵',
			wav: '🎵',
			ogg: '🎵',
			m4a: '🎵',
			aac: '🎵',
			flac: '🎵',
			aiff: '🎵',
			json: '📋',
			csv: '📊',
		};

		return iconMap[extension] || '📎';
	}

	/**
	 * Extract file paths from @ mentions in text
	 */
	extractMentions(text: string): string[] {
		const mentionRegex = /@\[\[([^\]]+)\]\]/g;
		const mentions: string[] = [];
		let match;

		while ((match = mentionRegex.exec(text)) !== null) {
			mentions.push(match[1]);
		}

		return mentions;
	}
}
