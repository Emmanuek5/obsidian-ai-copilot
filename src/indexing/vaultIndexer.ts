import { App, TFile, TFolder, Notice } from 'obsidian';
import type AICopilotPlugin from '../main';

export interface IndexedFile {
	path: string;
	name: string;
	extension: string;
	content?: string;
	tags?: string[];
	links?: string[];
	lastModified: number;
	size: number;
}

export class VaultIndexer {
	private app: App;
	private plugin: AICopilotPlugin;
	private index: Map<string, IndexedFile> = new Map();
	private isIndexing: boolean = false;

	constructor(app: App, plugin: AICopilotPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	async initialize() {
		if (this.plugin.settings.indexOnStartup && this.plugin.settings.enableIndexing) {
			setTimeout(async () => {
				await this.rebuildIndex();
			}, 3000);
		}

		// Watch for file changes
		this.registerVaultEvents();
	}

	private registerVaultEvents() {
		// File created
		this.plugin.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile) {
					this.indexFile(file);
				}
			})
		);

		// File modified
		this.plugin.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile) {
					this.indexFile(file);
				}
			})
		);

		// File deleted
		this.plugin.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.index.delete(file.path);
				}
			})
		);

		// File renamed
		this.plugin.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile) {
					this.index.delete(oldPath);
					this.indexFile(file);
				}
			})
		);
	}

	async rebuildIndex() {
		if (this.isIndexing) {
			new Notice('Index rebuild already in progress');
			return;
		}

		this.isIndexing = true;
		this.index.clear();
		
		new Notice('Rebuilding vault index...');
		
		const files = this.app.vault.getFiles();
		let indexed = 0;

		for (const file of files) {
			await this.indexFile(file);
			indexed++;
		}

		this.isIndexing = false;
		new Notice(`Index rebuilt: ${indexed} files indexed`);
	}

	private async indexFile(file: TFile) {
		if (!this.plugin.settings.enableIndexing) return;

		try {
			const stat = await this.app.vault.adapter.stat(file.path);
			if (!stat) return;

			const indexedFile: IndexedFile = {
				path: file.path,
				name: file.name,
				extension: file.extension,
				lastModified: stat.mtime,
				size: stat.size,
			};

			// Only read content for text files (markdown, txt, etc.)
			if (this.isTextFile(file)) {
				const content = await this.app.vault.read(file);
				indexedFile.content = content;
				indexedFile.tags = this.extractTags(content);
				indexedFile.links = this.extractLinks(content);
			}

			this.index.set(file.path, indexedFile);
		} catch (error) {
			console.error(`Error indexing file ${file.path}:`, error);
		}
	}

	private isTextFile(file: TFile): boolean {
		const textExtensions = ['md', 'txt', 'json', 'yml', 'yaml', 'xml', 'csv'];
		return textExtensions.includes(file.extension);
	}

	private extractTags(content: string): string[] {
		const tagRegex = /#[\w\-\/]+/g;
		const matches = content.match(tagRegex);
		return matches ? [...new Set(matches)] : [];
	}

	private extractLinks(content: string): string[] {
		const linkRegex = /\[\[([^\]]+)\]\]/g;
		const matches: string[] = [];
		let match;
		
		while ((match = linkRegex.exec(content)) !== null) {
			matches.push(match[1]);
		}
		
		return [...new Set(matches)];
	}

	// Search methods for @ mentions
	searchFiles(query: string): IndexedFile[] {
		const results: IndexedFile[] = [];
		const lowerQuery = query.toLowerCase();

		for (const [path, file] of this.index) {
			if (
				file.name.toLowerCase().includes(lowerQuery) ||
				file.path.toLowerCase().includes(lowerQuery)
			) {
				results.push(file);
			}
		}

		return results.slice(0, 10); // Limit to 10 results
	}

	getFile(path: string): IndexedFile | undefined {
		return this.index.get(path);
	}

	getAllFiles(): IndexedFile[] {
		return Array.from(this.index.values());
	}

	getFilesByTag(tag: string): IndexedFile[] {
		const results: IndexedFile[] = [];
		
		for (const file of this.index.values()) {
			if (file.tags?.includes(tag)) {
				results.push(file);
			}
		}
		
		return results;
	}

	getFilesByExtension(extension: string): IndexedFile[] {
		const results: IndexedFile[] = [];
		
		for (const file of this.index.values()) {
			if (file.extension === extension) {
				results.push(file);
			}
		}
		
		return results;
	}

	getIndexStats() {
		return {
			totalFiles: this.index.size,
			isIndexing: this.isIndexing,
		};
	}

	// Get vault structure for AI context
	getVaultStructure(): string {
		const folders = new Map<string, string[]>();
		
		// Group files by folder
		for (const file of this.index.values()) {
			const folderPath = file.path.includes('/') 
				? file.path.substring(0, file.path.lastIndexOf('/'))
				: '/';
			
			if (!folders.has(folderPath)) {
				folders.set(folderPath, []);
			}
			folders.get(folderPath)!.push(file.name);
		}

		// Build structure string
		let structure = `**Vault Structure** (${this.index.size} files)\n\n`;
		
		// Sort folders
		const sortedFolders = Array.from(folders.keys()).sort();
		
		for (const folder of sortedFolders) {
			const files = folders.get(folder)!;
			const displayFolder = folder === '/' ? 'Root' : folder;
			structure += `📁 ${displayFolder}/ (${files.length} files)\n`;
			
			// Show first few files in each folder
			const previewFiles = files.slice(0, 5);
			for (const file of previewFiles) {
				structure += `   - ${file}\n`;
			}
			if (files.length > 5) {
				structure += `   - ... and ${files.length - 5} more\n`;
			}
		}

		return structure;
	}

	// Get files by folder path
	getFilesByFolder(folderPath: string): IndexedFile[] {
		const results: IndexedFile[] = [];
		
		for (const file of this.index.values()) {
			if (file.path.startsWith(folderPath)) {
				results.push(file);
			}
		}
		
		return results;
	}

	// Get all folder paths
	getAllFolders(): string[] {
		const folders = new Set<string>();
		
		for (const file of this.index.values()) {
			if (file.path.includes('/')) {
				const folderPath = file.path.substring(0, file.path.lastIndexOf('/'));
				folders.add(folderPath);
				
				// Also add parent folders
				const parts = folderPath.split('/');
				let current = '';
				for (const part of parts) {
					current = current ? `${current}/${part}` : part;
					folders.add(current);
				}
			}
		}
		
		return Array.from(folders).sort();
	}
}
