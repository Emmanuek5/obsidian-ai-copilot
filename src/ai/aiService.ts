import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { stepCountIs, streamText, tool } from 'ai';
import { z } from 'zod';
import type AICopilotPlugin from '../main';
import { TFile } from 'obsidian';
import { KanbanIntegration } from '../integrations/kanbanIntegration';
import { LatexIntegration } from '../integrations/latexIntegration';

export interface AIMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: number;
	attachments?: FileAttachment[];
	toolCalls?: ToolCall[];
}

export interface FileAttachment {
	type: 'file' | 'image' | 'note' | 'pdf' | 'audio';
	path: string;
	name: string;
	content?: string;
	base64?: string;
	mimeType?: string;
}

export interface ToolCall {
	id: string;
	name: string;
	args: Record<string, unknown>;
	status: 'pending' | 'running' | 'completed' | 'failed' | 'requires_approval';
	result?: unknown;
	error?: string;
}

export interface StreamResult {
	type: 'text' | 'tool-call' | 'tool-result' | 'done';
	content?: string;
	toolCall?: ToolCall;
}

// Message content types for multimodal (includes audio support)
type MessagePart = 
	| { type: 'text'; text: string }
	| { type: 'image'; image: string; mimeType?: string }
	| { type: 'file'; data: string; mimeType: string; filename?: string };

type MessageContent = string | MessagePart[];

interface SDKMessage {
	role: 'system' | 'user' | 'assistant';
	content: MessageContent;
}

export class AIService {
	private plugin: AICopilotPlugin;
	private kanbanIntegration: KanbanIntegration;
	private latexIntegration: LatexIntegration;

	constructor(plugin: AICopilotPlugin) {
		this.plugin = plugin;
		this.kanbanIntegration = new KanbanIntegration(plugin.app);
		this.latexIntegration = new LatexIntegration(plugin.app);
	}

	private getModel() {
		const apiKey = this.plugin.settings.apiKey;
		if (!apiKey) {
			throw new Error('Google Gemini API key not set. Please configure it in settings.');
		}

		// Create Google provider with API key
		const google = createGoogleGenerativeAI({
			apiKey: apiKey,
		});

		return google(this.plugin.settings.model);
	}

	// Get all available tools
	private getTools() {
		const app = this.plugin.app;
		const indexer = this.plugin.vaultIndexer;
		
		return {
			readFile: tool({
				description: 'Read the contents of a file in the vault',
				parameters: z.object({
					path: z.string().describe('Path to the file relative to vault root'),
				}),
				execute: async (input: any) => {
					console.log('readFile called with input:', input);
					const path = input.path || input.filepath || input.filePath || input.file_path || input.file;
					
					if (!path) {
						return { success: false, error: `No file path provided. Received: ${JSON.stringify(input)}` };
					}
					
					const file = app.vault.getAbstractFileByPath(path);
					if (!(file instanceof TFile)) {
						return { success: false, error: `File not found: ${path}` };
					}
					const content = await app.vault.read(file);
					return { success: true, path, content: content.substring(0, 5000) };
				},
			}),

			listFiles: tool({
				description: 'List all files in a directory or the entire vault',
				parameters: z.object({
					path: z.string().optional().describe('Directory path (empty for root)'),
					extension: z.string().optional().describe('Filter by extension (e.g., "md")'),
				}),
				execute: async (input: any) => {
					console.log('listFiles called with input:', input);
					const path = input.path || input.filepath || input.filePath || input.file_path || input.directory || input.dir;
					const extension = input.extension || input.ext || input.type;
					
					let files = app.vault.getFiles();
					if (path) files = files.filter(f => f.path.startsWith(path));
					if (extension) files = files.filter(f => f.extension === extension);
					return {
						success: true,
						files: files.slice(0, 50).map(f => ({ path: f.path, name: f.name })),
					};
				},
			}),

			searchFiles: tool({
				description: 'Search for files by name or content in the vault',
				parameters: z.object({
					query: z.string().describe('Search query'),
					searchContent: z.boolean().optional().describe('Also search in file content'),
				}),
				execute: async (input: any) => {
					console.log('searchFiles called with input:', input);
					const query = input.query || input.search || input.keyword || input.text;
					const searchContent = input.searchContent || input.search_content || input.content;
					
					if (!query) {
						return { success: false, error: 'No search query provided' };
					}
					
					const results = indexer.searchFiles(query);
					return {
						success: true,
						results: results.slice(0, 20).map((r: { path: string; name: string }) => ({ path: r.path, name: r.name })),
					};
				},
			}),

			createNote: tool({
				description: 'Create a new note in the vault (requires user approval)',
				parameters: z.object({
					path: z.string().describe('Path for the new file'),
					content: z.string().describe('Content for the new file'),
				}),
				execute: async (input: any) => {
					console.log('createNote called with input:', input);
					const path = input.path || input.filepath || input.filePath || input.file_path || input.file || input.filename || input.fileName;
					const content = input.content || input.text || input.body || input.data || '';
					
					if (!path) {
						return { success: false, error: `No file path provided. Received: ${JSON.stringify(input)}` };
					}
					
					// This will be intercepted for approval
					return {
						success: false,
						requiresApproval: true,
						action: 'create',
						path,
						content,
					};
				},
			}),

			modifyNote: tool({
				description: 'Modify an existing note in the vault (requires user approval)',
				parameters: z.object({
					path: z.string().describe('Path to the file'),
					newContent: z.string().describe('New content for the file'),
				}),
				execute: async (input: any) => {
					console.log('modifyNote called with input:', input);
					const path = input.path || input.filepath || input.filePath || input.file_path || input.file || input.filename || input.fileName;
					const newContent = input.newContent || input.content || input.text || input.body || input.data;
					
					if (!path) {
						return { success: false, error: `No file path provided. Received: ${JSON.stringify(input)}` };
					}
					
					return {
						success: false, // Wait for approval
						requiresApproval: true,
						action: 'modify',
						path,
						newContent: newContent || '', // Ensure it's not undefined
					};
				},
			}),

			deleteNote: tool({
				description: 'Delete a note from the vault (requires user approval)',
				parameters: z.object({
					path: z.string().describe('Path to the file to delete'),
				}),
				execute: async (input: any) => {
					console.log('deleteNote called with input:', input);
					const path = input.path || input.filepath || input.filePath || input.file_path || input.file || input.filename || input.fileName;
					
					if (!path) {
						return { success: false, error: `No file path provided. Received: ${JSON.stringify(input)}` };
					}
					
					return {
						success: false,
						requiresApproval: true,
						action: 'delete',
						path,
					};
				},
			}),

			getCurrentDate: tool({
				description: 'Get the current date and time',
				parameters: z.object({}),
				execute: async () => {
					return {
						success: true,
						date: new Date().toISOString(),
						formatted: new Date().toLocaleString(),
					};
				},
			}),

			addMemory: tool({
				description: 'Save important information to memory for future conversations',
				parameters: z.object({
					content: z.string().describe('Information to remember'),
					category: z.enum(['fact', 'preference', 'important']).describe('Category of memory'),
				}),
				execute: async ({ content, category }: { content: string; category: 'fact' | 'preference' | 'important' }) => {
					await this.plugin.memoryManager.addMemory(content, category);
					return { success: true, message: 'Memory saved!' };
				},
			}),

			openFile: tool({
				description: 'Open a file in a new Obsidian tab for the user to view',
				parameters: z.object({
					path: z.string().describe('Path to the file to open (e.g., "folder/note.md")'),
				}),
				execute: async (input: any) => {
					console.log('openFile called with input:', input);
					// Handle different parameter names the AI might use
					const path = input.path || input.filepath || input.filePath || input.file || input.fileName || input.filename;
					
					if (!path) {
						return { success: false, error: `No file path provided. Received: ${JSON.stringify(input)}` };
					}
					
					const file = app.vault.getAbstractFileByPath(path);
					if (!(file instanceof TFile)) {
						return { success: false, error: `File not found: ${path}` };
					}
					// Open the file in a new leaf (tab)
					await app.workspace.getLeaf('tab').openFile(file);
					return { success: true, message: `Opened ${file.name} in a new tab` };
				},
			}),

			// Kanban Integration Tools
			kanbanAddTask: tool({
				description: 'Add a task to a specific lane in a Kanban board',
				parameters: z.object({
					boardPath: z.string().describe('Path to the Kanban board file (e.g., "Project Board.md")'),
					laneTitle: z.string().describe('Title of the lane to add the task to (e.g., "To Do", "In Progress")'),
					taskTitle: z.string().describe('Title of the task to add'),
				}),
				execute: async ({ boardPath, laneTitle, taskTitle }) => {
					if (!this.kanbanIntegration.isAvailable()) {
						return { success: false, error: 'Kanban plugin is not installed or not enabled' };
					}
					
					const success = await this.kanbanIntegration.addTask(boardPath, laneTitle, taskTitle);
					return { success, message: success ? 'Task added successfully' : 'Failed to add task' };
				},
			}),

			kanbanAddLane: tool({
				description: 'Add a new lane to a Kanban board',
				parameters: z.object({
					boardPath: z.string().describe('Path to the Kanban board file'),
					laneTitle: z.string().describe('Title for the new lane'),
					position: z.enum(['first', 'last']).optional().describe('Position to add the lane (default: last)'),
				}),
				execute: async ({ boardPath, laneTitle, position }) => {
					if (!this.kanbanIntegration.isAvailable()) {
						return { success: false, error: 'Kanban plugin is not installed or not enabled' };
					}
					
					const success = await this.kanbanIntegration.addLane(boardPath, laneTitle, position);
					return { success, message: success ? 'Lane added successfully' : 'Failed to add lane' };
				},
			}),

			kanbanMoveTask: tool({
				description: 'Move a task from one lane to another in a Kanban board. The task will be automatically found if fromLane is not specified.',
				parameters: z.object({
					boardPath: z.string().describe('Path to the Kanban board file (e.g., "Project Board.md")'),
					taskTitle: z.string().describe('Exact title of the task to move'),
					toLane: z.string().describe('Title of the destination lane (e.g., "In Progress", "Done")'),
					fromLane: z.string().optional().describe('Title of the source lane (optional - will auto-detect if not provided)'),
				}),
				execute: async ({ boardPath, taskTitle, fromLane, toLane }) => {
					if (!this.kanbanIntegration.isAvailable()) {
						return { success: false, error: 'Kanban plugin is not installed or not enabled' };
					}
					
					const success = await this.kanbanIntegration.moveTask(boardPath, taskTitle, fromLane, toLane);
					return { success, message: success ? 'Task moved successfully' : 'Failed to move task' };
				},
			}),

			kanbanListLanes: tool({
				description: 'List all lanes in a Kanban board',
				parameters: z.object({
					boardPath: z.string().describe('Path to the Kanban board file'),
				}),
				execute: async ({ boardPath }) => {
					if (!this.kanbanIntegration.isAvailable()) {
						return { success: false, error: 'Kanban plugin is not installed or not enabled' };
					}
					
					const lanes = await this.kanbanIntegration.listLanes(boardPath);
					return { success: true, lanes };
				},
			}),

			kanbanListTasks: tool({
				description: 'List all tasks in a specific lane',
				parameters: z.object({
					boardPath: z.string().describe('Path to the Kanban board file'),
					laneTitle: z.string().describe('Title of the lane'),
				}),
				execute: async ({ boardPath, laneTitle }) => {
					if (!this.kanbanIntegration.isAvailable()) {
						return { success: false, error: 'Kanban plugin is not installed or not enabled' };
					}
					
					const tasks = await this.kanbanIntegration.listTasks(boardPath, laneTitle);
					return { success: true, tasks };
				},
			}),

			// LaTeX Integration Tools
			latexInsertFormula: tool({
				description: 'Insert a LaTeX formula into the active editor',
				parameters: z.object({
					formula: z.string().describe('LaTeX formula to insert'),
					displayMode: z.boolean().optional().describe('Use display mode (block) instead of inline'),
				}),
				execute: async ({ formula, displayMode }) => {
					if (!this.latexIntegration.isAvailable()) {
						return { success: false, error: 'LaTeX Suite plugin is not installed or not enabled' };
					}
					
					const success = await this.latexIntegration.insertFormula(formula, displayMode);
					return { success, message: success ? 'Formula inserted successfully' : 'Failed to insert formula' };
				},
			}),

			latexGetFormula: tool({
				description: 'Get a common LaTeX formula by name or keyword',
				parameters: z.object({
					name: z.string().describe('Name or keyword of the formula (e.g., "fraction", "integral", "kinetic_energy")'),
				}),
				execute: async ({ name }) => {
					if (!this.latexIntegration.isAvailable()) {
						return { success: false, error: 'LaTeX Suite plugin is not installed or not enabled' };
					}
					
					const formula = this.latexIntegration.getFormula(name);
					if (!formula) {
						return { success: false, error: `Formula "${name}" not found` };
					}
					
					return { success: true, formula };
				},
			}),

			latexGenerateMatrix: tool({
				description: 'Generate a LaTeX matrix',
				parameters: z.object({
					rows: z.number().describe('Number of rows'),
					cols: z.number().describe('Number of columns'),
					values: z.array(z.array(z.string())).optional().describe('Optional values for the matrix cells'),
				}),
				execute: async ({ rows, cols, values }) => {
					if (!this.latexIntegration.isAvailable()) {
						return { success: false, error: 'LaTeX Suite plugin is not installed or not enabled' };
					}
					
					const latex = this.latexIntegration.generateMatrix(rows, cols, values);
					return { success: true, latex };
				},
			}),

			latexGenerateEquation: tool({
				description: 'Generate a LaTeX equation',
				parameters: z.object({
					lhs: z.string().describe('Left-hand side of the equation'),
					rhs: z.string().describe('Right-hand side of the equation'),
				}),
				execute: async ({ lhs, rhs }) => {
					if (!this.latexIntegration.isAvailable()) {
						return { success: false, error: 'LaTeX Suite plugin is not installed or not enabled' };
					}
					
					const latex = this.latexIntegration.generateEquation(lhs, rhs);
					return { success: true, latex };
				},
			}),
		};
	}

	async *streamWithTools(messages: AIMessage[], onToolCall?: (toolCall: ToolCall) => void): AsyncGenerator<StreamResult> {
		const model = this.getModel();
		const tools = this.getTools();

		// Convert AI messages to SDK messages with multimodal support
		const coreMessages: any[] = await Promise.all(
			messages.map(async msg => this.convertToModelMessage(msg))
		);

		try {
			const result = streamText({
				model,
				messages: coreMessages,
				tools,
				temperature: this.plugin.settings.temperature,
				maxOutputTokens: this.plugin.settings.maxTokens,
				stopWhen: stepCountIs(50),
			});

			// Track tool calls
			const toolCalls = new Map<string, ToolCall>();

			for await (const part of result.fullStream) {
				console.log('Stream part:', part.type, part); // Debug logging
				
				if (part.type === 'text-delta') {
					yield { type: 'text', content: part.text };
				} else if (part.type === 'tool-call') {
					const toolCall: ToolCall = {
						id: part.toolCallId,
						name: part.toolName,
						args: (part as any).input as Record<string, unknown>,
						status: 'running',
					};
					toolCalls.set(part.toolCallId, toolCall);
					
					console.log('Tool call detected:', toolCall); // Debug
					if (onToolCall) onToolCall(toolCall);
					yield { type: 'tool-call', toolCall };
				} else if (part.type === 'tool-result') {
					const toolCall = toolCalls.get(part.toolCallId);
					if (toolCall) {
						// Check if requires approval
						const result = (part as any).output as { requiresApproval?: boolean; success?: boolean; error?: string };
						console.log('Tool result:', part.toolCallId, result); // Debug
						
						if (result?.requiresApproval) {
							toolCall.status = 'requires_approval';
							toolCall.result = result;
						} else if (result?.success === false && result?.error) {
							toolCall.status = 'failed';
							toolCall.error = result.error;
						} else {
							toolCall.status = 'completed';
							toolCall.result = result;
						}
						
						if (onToolCall) onToolCall(toolCall);
						yield { type: 'tool-result', toolCall };
					}
				} else if (part.type === 'error') {
					// Handle errors in the stream
					console.error('Stream error:', part);
					yield { type: 'text', content: `\n\n**Error**: ${(part as any).error?.message || 'An error occurred during streaming'}\n` };
				} else if (part.type === 'finish') {
					// Handle finish reasons including MALFORMED_FUNCTION_CALL
					const finishReason = (part as any).finishReason;
					console.log('Stream finished:', finishReason); // Debug
					
					if (finishReason === 'MALFORMED_FUNCTION_CALL') {
						console.error('Malformed function call detected');
						yield { 
							type: 'text', 
							content: '\n\n**Note**: The AI attempted to use a tool but the request was malformed. Continuing without tool use.\n' 
						};
					} else if (finishReason && finishReason !== 'STOP' && finishReason !== 'END_TURN') {
						console.warn('Unexpected finish reason:', finishReason);
					}
				}
			}

			yield { type: 'done' };
		} catch (error: any) {
			console.error('AI stream error:', error);
			
			// Check if it's a malformed function call error
			if (error?.message?.includes('MALFORMED_FUNCTION_CALL')) {
				yield { 
					type: 'text', 
					content: '\n\n**Error**: The AI tried to use a tool incorrectly. Please try rephrasing your request.\n' 
				};
			} else {
				yield { 
					type: 'text', 
					content: `\n\n**Error**: ${error?.message || 'An unexpected error occurred'}\n` 
				};
			}
			
			yield { type: 'done' };
		}
	}

	// Convert our message format to the AI SDK format with multimodal support
	private async convertToModelMessage(message: AIMessage): Promise<SDKMessage> {
		if (message.role === 'system') {
			return { role: 'system', content: message.content };
		}

		// For user messages, build multimodal content
		if (message.role === 'user') {
			const parts: MessageContent = [];

			// Add text content
			if (typeof parts !== 'string') {
				parts.push({ type: 'text', text: message.content });

				// Add attachments as multimodal parts
				if (message.attachments && message.attachments.length > 0) {
					for (const attachment of message.attachments) {
						if (attachment.type === 'image' && attachment.base64) {
							// Image attachment
							parts.push({
								type: 'image',
								image: attachment.base64,
								mimeType: attachment.mimeType || 'image/png',
							});
						} else if (attachment.type === 'audio' && attachment.base64) {
							// Audio attachment - sent as file with audio mime type
							parts.push({
								type: 'file',
								data: attachment.base64,
								mimeType: attachment.mimeType || 'audio/mp3',
								filename: attachment.name,
							});
						} else if (attachment.type === 'pdf' && attachment.base64) {
							// PDF attachment
							parts.push({
								type: 'file',
								data: attachment.base64,
								mimeType: 'application/pdf',
								filename: attachment.name,
							});
						} else if (attachment.content) {
							// Text-based files (md, txt, etc.)
							parts.push({
								type: 'text',
								text: `\n\n--- File: ${attachment.name} ---\n${attachment.content}\n--- End of ${attachment.name} ---\n`,
							});
						}
					}
				}
			}

			return { role: 'user', content: parts };
		}

		// Assistant messages
		return { role: 'assistant', content: message.content };
	}

	// Legacy stream response (without tools) for backward compatibility
	async *streamResponse(messages: AIMessage[]): AsyncGenerator<string> {
		for await (const result of this.streamWithTools(messages)) {
			if (result.type === 'text' && result.content) {
				yield result.content;
			}
		}
	}

	// Helper to create system message with vault context
	createSystemMessage(): AIMessage {
		// Get vault structure from indexer
		const vaultStructure = this.plugin.vaultIndexer.getVaultStructure();
		const indexStats = this.plugin.vaultIndexer.getIndexStats();
		const folders = this.plugin.vaultIndexer.getAllFolders();
		
		// Get memory context
		const memoryContext = this.plugin.memoryManager.getMemoryContext();
		
		// Check plugin availability
		const kanbanAvailable = this.kanbanIntegration.isAvailable();
		const latexAvailable = this.latexIntegration.isAvailable();
		
		let systemContent = `You are an AI assistant integrated into Obsidian, a note-taking application.

You have access to tools to interact with the vault:
- readFile: Read contents of any file
- listFiles: List files in directories
- searchFiles: Search for files by name or content
- createNote: Create new notes (requires approval)
- modifyNote: Modify existing notes (requires approval)
- deleteNote: Delete notes (requires approval)
- getCurrentDate: Get current date/time
- addMemory: Save important info to remember across conversations
- openFile: Open a file in a new Obsidian tab for the user

${kanbanAvailable ? `**Kanban Integration Available:**
- kanbanAddTask: Add tasks to Kanban board lanes
- kanbanAddLane: Create new lanes in Kanban boards
- kanbanMoveTask: Move tasks between lanes
- kanbanListLanes: List all lanes in a board
- kanbanListTasks: List tasks in a specific lane` : ''}

${latexAvailable ? `**LaTeX Integration Available:**
- latexInsertFormula: Insert LaTeX formulas into the editor
- latexGetFormula: Get common LaTeX formulas by name
- latexGenerateMatrix: Generate LaTeX matrices
- latexGenerateEquation: Generate LaTeX equations

You can help users with:
- Mathematical formulas (fractions, integrals, derivatives, etc.)
- Physics equations (force, energy, relativity, etc.)
- Statistical expressions
- Matrix operations
- Any LaTeX mathematical notation` : ''}

When the user shares audio files (mp3, wav, ogg, m4a, aac, flac, aiff), you can transcribe and analyze their content.

When referencing files, use the [[filename]] format for internal links.

**Current Vault Overview:**
- Total files indexed: ${indexStats.totalFiles}
- Folders: ${folders.join(', ') || 'Root only'}

${vaultStructure}${memoryContext}`;

		return {
			role: 'system',
			content: systemContent,
			timestamp: Date.now(),
		};
	}

	// Helper to attach files to a message with proper multimodal support
	async attachFilesToMessage(
		message: AIMessage,
		filePaths: string[]
	): Promise<AIMessage> {
		const attachments: FileAttachment[] = [];
		const app = this.plugin.app;

		for (const path of filePaths) {
			const file = app.vault.getAbstractFileByPath(path);
			
			if (file instanceof TFile) {
				const extension = file.extension.toLowerCase();
				
				if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension)) {
					// Image file - read as base64
					try {
						const arrayBuffer = await app.vault.readBinary(file);
						const base64 = this.arrayBufferToBase64(arrayBuffer);
						attachments.push({
							type: 'image',
							path: file.path,
							name: file.name,
							base64,
							mimeType: `image/${extension === 'jpg' ? 'jpeg' : extension}`,
						});
					} catch (e) {
						console.error('Failed to read image:', e);
					}
				} else if (extension === 'pdf') {
					// PDF file - read as base64
					try {
						const arrayBuffer = await app.vault.readBinary(file);
						const base64 = this.arrayBufferToBase64(arrayBuffer);
						attachments.push({
							type: 'pdf',
							path: file.path,
							name: file.name,
							base64,
							mimeType: 'application/pdf',
						});
					} catch (e) {
						console.error('Failed to read PDF:', e);
					}
				} else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'aiff'].includes(extension)) {
					// Audio file - read as base64
					try {
						const arrayBuffer = await app.vault.readBinary(file);
						const base64 = this.arrayBufferToBase64(arrayBuffer);
						
						// Map extensions to MIME types
						const mimeTypes: Record<string, string> = {
							mp3: 'audio/mp3',
							wav: 'audio/wav',
							ogg: 'audio/ogg',
							m4a: 'audio/m4a',
							aac: 'audio/aac',
							flac: 'audio/flac',
							aiff: 'audio/aiff',
						};
						
						attachments.push({
							type: 'audio',
							path: file.path,
							name: file.name,
							base64,
							mimeType: mimeTypes[extension] || 'audio/mp3',
						});
					} catch (e) {
						console.error('Failed to read audio file:', e);
					}
				} else {
					// Text-based file
					try {
						const content = await app.vault.read(file);
						attachments.push({
							type: extension === 'md' ? 'note' : 'file',
							path: file.path,
							name: file.name,
							content: content.substring(0, 10000), // Limit content size
						});
					} catch (e) {
						console.error('Failed to read file:', e);
					}
				}
			}
		}

		return {
			...message,
			attachments,
		};
	}

	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		let binary = '';
		const bytes = new Uint8Array(buffer);
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}
}
