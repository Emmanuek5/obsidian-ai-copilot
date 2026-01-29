import { App, TFile, Notice } from 'obsidian';

export interface KanbanLane {
	title: string;
	children?: KanbanItem[];
}

export interface KanbanItem {
	titleRaw: string;
	title: string;
	data?: {
		[metadata: string]: unknown;
	};
}

export interface KanbanBoard {
	lanes: KanbanLane[];
	archive?: {
		lanes: KanbanLane[];
	};
}

export class KanbanIntegration {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	isAvailable(): boolean {
		return !!(this.app as any).plugins?.plugins['obsidian-kanban'];
	}

	getPlugin(): any {
		return (this.app as any).plugins?.plugins['obsidian-kanban'];
	}

	/**
	 * Find or create a Kanban board file
	 */
	async findOrCreateBoard(boardPath: string): Promise<TFile | null> {
		const file = this.app.vault.getAbstractFileByPath(boardPath);
		
		if (file instanceof TFile) {
			return file;
		}

		// Create new board with default structure
		const defaultBoard = this.createDefaultBoard();
		const content = this.boardToMarkdown(defaultBoard);
		
		try {
			const newFile = await this.app.vault.create(boardPath, content);
			new Notice(`Created Kanban board: ${boardPath}`);
			return newFile;
		} catch (error) {
			console.error('Failed to create Kanban board:', error);
			return null;
		}
	}

	/**
	 * Create a default Kanban board structure
	 */
	private createDefaultBoard(): KanbanBoard {
		return {
			lanes: [
				{
					title: 'To Do',
					children: [],
				},
				{
					title: 'In Progress',
					children: [],
				},
				{
					title: 'Done',
					children: [],
				},
			],
		};
	}

	/**
	 * Convert board object to markdown format
	 */
	private boardToMarkdown(board: KanbanBoard): string {
		let markdown = '---\n';
		markdown += 'kanban-plugin: basic\n';
		markdown += '---\n\n';

		for (const lane of board.lanes) {
			markdown += `## ${lane.title}\n\n`;
			if (lane.children && lane.children.length > 0) {
				for (const item of lane.children) {
					markdown += `- [ ] ${item.titleRaw || item.title}\n`;
				}
			}
			markdown += '\n';
		}

		return markdown;
	}

	/**
	 * Parse markdown to board object
	 */
	private markdownToBoard(content: string): KanbanBoard | null {
		const lanes: KanbanLane[] = [];
		const lines = content.split('\n');
		let currentLane: KanbanLane | null = null;

		for (const line of lines) {
			// Parse headers as lanes
			const headerMatch = line.match(/^##\s+(.+)$/);
			if (headerMatch) {
				if (currentLane) {
					lanes.push(currentLane);
				}
				currentLane = {
					title: headerMatch[1].trim(),
					children: [],
				};
				continue;
			}

			// Parse list items as cards
			const itemMatch = line.match(/^-\s+\[[ x]\]\s+(.+)$/);
			if (itemMatch && currentLane) {
				const item: KanbanItem = {
					titleRaw: itemMatch[1].trim(),
					title: itemMatch[1].trim(),
				};
				currentLane.children!.push(item);
			}
		}

		if (currentLane) {
			lanes.push(currentLane);
		}

		return lanes.length > 0 ? { lanes } : null;
	}

	/**
	 * Add a task to a specific lane in a board
	 */
	async addTask(boardPath: string, laneTitle: string, taskTitle: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(boardPath);
		if (!(file instanceof TFile)) {
			new Notice('Board file not found');
			return false;
		}

		const content = await this.app.vault.read(file);
		const board = this.markdownToBoard(content);

		if (!board) {
			new Notice('Failed to parse board');
			return false;
		}

		// Find the lane
		const lane = board.lanes.find((l) => l.title.toLowerCase() === laneTitle.toLowerCase());
		if (!lane) {
			new Notice(`Lane "${laneTitle}" not found`);
			return false;
		}

		// Add the task
		if (!lane.children) {
			lane.children = [];
		}
		lane.children.push({
			titleRaw: taskTitle,
			title: taskTitle,
		});

		// Save the updated board
		const newContent = this.boardToMarkdown(board);
		await this.app.vault.modify(file, newContent);
		
		new Notice(`Added task "${taskTitle}" to "${laneTitle}"`);
		return true;
	}

	/**
	 * Create a new lane in a board
	 */
	async addLane(boardPath: string, laneTitle: string, position?: 'first' | 'last'): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(boardPath);
		if (!(file instanceof TFile)) {
			new Notice('Board file not found');
			return false;
		}

		const content = await this.app.vault.read(file);
		const board = this.markdownToBoard(content);

		if (!board) {
			new Notice('Failed to parse board');
			return false;
		}

		// Check if lane already exists
		if (board.lanes.some((l) => l.title.toLowerCase() === laneTitle.toLowerCase())) {
			new Notice(`Lane "${laneTitle}" already exists`);
			return false;
		}

		// Add the lane
		const newLane: KanbanLane = {
			title: laneTitle,
			children: [],
		};

		if (position === 'first') {
			board.lanes.unshift(newLane);
		} else {
			board.lanes.push(newLane);
		}

		// Save the updated board
		const newContent = this.boardToMarkdown(board);
		await this.app.vault.modify(file, newContent);
		
		new Notice(`Created lane "${laneTitle}"`);
		return true;
	}

	/**
	 * Move a task from one lane to another
	 */
	async moveTask(boardPath: string, taskTitle: string, fromLane: string, toLane: string): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(boardPath);
		if (!(file instanceof TFile)) {
			new Notice('Board file not found');
			return false;
		}

		const content = await this.app.vault.read(file);
		const board = this.markdownToBoard(content);

		if (!board) {
			new Notice('Failed to parse board');
			return false;
		}

		// Find source and destination lanes
		const sourceLane = board.lanes.find((l) => l.title.toLowerCase() === fromLane.toLowerCase());
		const destLane = board.lanes.find((l) => l.title.toLowerCase() === toLane.toLowerCase());

		if (!sourceLane || !destLane) {
			new Notice('Source or destination lane not found');
			return false;
		}

		// Find and move the task
		const taskIndex = sourceLane.children?.findIndex((t) => t.title.toLowerCase() === taskTitle.toLowerCase());
		if (taskIndex === undefined || taskIndex === -1) {
			new Notice(`Task "${taskTitle}" not found in "${fromLane}"`);
			return false;
		}

		const task = sourceLane.children!.splice(taskIndex, 1)[0];
		if (!destLane.children) {
			destLane.children = [];
		}
		destLane.children.push(task);

		// Save the updated board
		const newContent = this.boardToMarkdown(board);
		await this.app.vault.modify(file, newContent);
		
		new Notice(`Moved "${taskTitle}" from "${fromLane}" to "${toLane}"`);
		return true;
	}

	/**
	 * List all lanes in a board
	 */
	async listLanes(boardPath: string): Promise<string[]> {
		const file = this.app.vault.getAbstractFileByPath(boardPath);
		if (!(file instanceof TFile)) {
			return [];
		}

		const content = await this.app.vault.read(file);
		const board = this.markdownToBoard(content);

		if (!board) {
			return [];
		}

		return board.lanes.map((l) => l.title);
	}

	/**
	 * List all tasks in a specific lane
	 */
	async listTasks(boardPath: string, laneTitle: string): Promise<string[]> {
		const file = this.app.vault.getAbstractFileByPath(boardPath);
		if (!(file instanceof TFile)) {
			return [];
		}

		const content = await this.app.vault.read(file);
		const board = this.markdownToBoard(content);

		if (!board) {
			return [];
		}

		const lane = board.lanes.find((l) => l.title.toLowerCase() === laneTitle.toLowerCase());
		if (!lane || !lane.children) {
			return [];
		}

		return lane.children.map((t) => t.title);
	}
}
