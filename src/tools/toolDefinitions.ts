import { tool } from 'ai';
import { z } from 'zod';
import { App, TFile, Notice } from 'obsidian';

export interface ToolResult {
	success: boolean;
	data?: unknown;
	error?: string;
	requiresApproval?: boolean;
	changeLog?: FileChange;
}

export interface FileChange {
	type: 'create' | 'modify' | 'delete' | 'rename';
	path: string;
	oldPath?: string;
	oldContent?: string;
	newContent?: string;
	timestamp: number;
}

export class VaultTools {
	private app: App;
	private pendingApprovals: Map<string, () => Promise<ToolResult>> = new Map();

	constructor(app: App) {
		this.app = app;
	}

	// READ TOOLS (Auto-approved)

	readFile = tool({
		description: 'Read the contents of a file in the vault',
		parameters: z.object({
			path: z.string().describe('Path to the file relative to vault root'),
		}),
		execute: async ({ path }) => {
			try {
				const file = this.app.vault.getAbstractFileByPath(path);
				
				if (!(file instanceof TFile)) {
					return {
						success: false,
						error: `File not found: ${path}`,
					};
				}

				const content = await this.app.vault.read(file);
				
				return {
					success: true,
					data: {
						path,
						content,
						stat: await this.app.vault.adapter.stat(path),
					},
				};
			} catch (error) {
				return {
					success: false,
					error: (error as Error).message,
				};
			}
		},
	});

	listFiles = tool({
		description: 'List all files in a directory or the entire vault',
		parameters: z.object({
			path: z.string().optional().describe('Directory path (empty for root)'),
			extension: z.string().optional().describe('Filter by extension (e.g., "md")'),
		}),
		execute: async ({ path, extension }) => {
			try {
				let files = this.app.vault.getFiles();

				if (path) {
					files = files.filter(f => f.path.startsWith(path));
				}

				if (extension) {
					files = files.filter(f => f.extension === extension);
				}

				return {
					success: true,
					data: files.map(f => ({
						path: f.path,
						name: f.name,
						extension: f.extension,
					})),
				};
			} catch (error) {
				return {
					success: false,
					error: (error as Error).message,
				};
			}
		},
	});

	searchFiles = tool({
		description: 'Search for files by name or content',
		parameters: z.object({
			query: z.string().describe('Search query'),
			searchContent: z.boolean().optional().describe('Search in file content'),
		}),
		execute: async ({ query, searchContent }) => {
			try {
				const files = this.app.vault.getMarkdownFiles();
				const results: Array<{ path: string; name: string; matches?: number }> = [];

				for (const file of files) {
					// Search by name
					if (file.name.toLowerCase().includes(query.toLowerCase())) {
						results.push({ path: file.path, name: file.name });
						continue;
					}

					// Search by content
					if (searchContent) {
						const content = await this.app.vault.read(file);
						const matches = (content.match(new RegExp(query, 'gi')) || []).length;
						
						if (matches > 0) {
							results.push({ path: file.path, name: file.name, matches });
						}
					}
				}

				return {
					success: true,
					data: results.slice(0, 20), // Limit to 20 results
				};
			} catch (error) {
				return {
					success: false,
					error: (error as Error).message,
				};
			}
		},
	});

	// WRITE TOOLS (Require approval)

	async createFile(path: string, content: string): Promise<ToolResult> {
		const approvalId = `create_${Date.now()}`;
		
		return new Promise((resolve) => {
			this.pendingApprovals.set(approvalId, async () => {
				try {
					const file = await this.app.vault.create(path, content);
					
					return {
						success: true,
						data: { path: file.path },
						changeLog: {
							type: 'create',
							path,
							newContent: content,
							timestamp: Date.now(),
						},
					};
				} catch (error) {
					return {
						success: false,
						error: (error as Error).message,
					};
				}
			});

			resolve({
				success: false,
				requiresApproval: true,
				data: { approvalId, path, content },
			});
		});
	}

	async modifyFile(path: string, newContent: string): Promise<ToolResult> {
		const approvalId = `modify_${Date.now()}`;
		
		return new Promise(async (resolve) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			
			if (!(file instanceof TFile)) {
				resolve({
					success: false,
					error: `File not found: ${path}`,
				});
				return;
			}

			const oldContent = await this.app.vault.read(file);

			this.pendingApprovals.set(approvalId, async () => {
				try {
					await this.app.vault.modify(file, newContent);
					
					return {
						success: true,
						data: { path },
						changeLog: {
							type: 'modify',
							path,
							oldContent,
							newContent,
							timestamp: Date.now(),
						},
					};
				} catch (error) {
					return {
						success: false,
						error: (error as Error).message,
					};
				}
			});

			resolve({
				success: false,
				requiresApproval: true,
				data: { approvalId, path, oldContent, newContent },
			});
		});
	}

	async deleteFile(path: string): Promise<ToolResult> {
		const approvalId = `delete_${Date.now()}`;
		
		return new Promise(async (resolve) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			
			if (!(file instanceof TFile)) {
				resolve({
					success: false,
					error: `File not found: ${path}`,
				});
				return;
			}

			const oldContent = await this.app.vault.read(file);

			this.pendingApprovals.set(approvalId, async () => {
				try {
					await this.app.vault.delete(file);
					
					return {
						success: true,
						data: { path },
						changeLog: {
							type: 'delete',
							path,
							oldContent,
							timestamp: Date.now(),
						},
					};
				} catch (error) {
					return {
						success: false,
						error: (error as Error).message,
					};
				}
			});

			resolve({
				success: false,
				requiresApproval: true,
				data: { approvalId, path, content: oldContent },
			});
		});
	}

	async approveAction(approvalId: string): Promise<ToolResult> {
		const action = this.pendingApprovals.get(approvalId);
		
		if (!action) {
			return {
				success: false,
				error: 'Approval not found or already processed',
			};
		}

		this.pendingApprovals.delete(approvalId);
		return await action();
	}

	async rejectAction(approvalId: string): Promise<ToolResult> {
		const existed = this.pendingApprovals.delete(approvalId);
		
		return {
			success: existed,
			error: existed ? undefined : 'Approval not found',
		};
	}
}
