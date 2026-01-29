import { App, Notice } from 'obsidian';

export class LatexIntegration {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	isAvailable(): boolean {
		return !!this.app.plugins.plugins['obsidian-latex-suite'];
	}

	getPlugin(): any {
		return this.app.plugins.plugins['obsidian-latex-suite'];
	}

	/**
	 * Insert LaTeX formula into the active editor
	 */
	async insertFormula(formula: string, displayMode: boolean = false): Promise<boolean> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file');
			return false;
		}

		// Get the active editor view
		const activeView = this.app.workspace.getActiveViewOfType('markdown');
		if (!activeView) {
			new Notice('No active markdown view');
			return false;
		}

		const editor = activeView.editor;
		if (!editor) {
			new Notice('No editor available');
			return false;
		}

		// Format the formula based on display mode
		const latex = displayMode ? `$$${formula}$$` : `$${formula}$`;

		// Insert at cursor position
		editor.replaceSelection(latex);
		
		new Notice('LaTeX formula inserted');
		return true;
	}

	/**
	 * Generate common LaTeX formulas
	 */
	getCommonFormulas(): Record<string, string> {
		return {
			// Math operators
			fraction: '\\frac{a}{b}',
			square_root: '\\sqrt{x}',
			nth_root: '\\sqrt[n]{x}',
			summation: '\\sum_{i=1}^{n}',
			product: '\\prod_{i=1}^{n}',
			integral: '\\int_{a}^{b}',
			limit: '\\lim_{x \\to \\infty}',
			
			// Logic symbols
			therefore: '\\therefore',
			because: '\\because',
			implies: '\\implies',
			iff: '\\iff',
			forall: '\\forall',
			exists: '\\exists',
			
			// Sets
			in: '\\in',
			subset: '\\subset',
			superset: '\\supset',
			union: '\\cup',
			intersection: '\\cap',
			empty_set: '\\emptyset',
			
			// Greek letters
			alpha: '\\alpha',
			beta: '\\beta',
			gamma: '\\gamma',
			delta: '\\delta',
			epsilon: '\\epsilon',
			theta: '\\theta',
			lambda: '\\lambda',
			mu: '\\mu',
			sigma: '\\sigma',
			pi: '\\pi',
			phi: '\\phi',
			omega: '\\omega',
			
			// Superscripts and subscripts
			squared: 'x^2',
			cubed: 'x^3',
			subscript: 'x_i',
			superscript: 'x^{n}',
			
			// Brackets
			parentheses: '\\left( x \\right)',
			brackets: '\\left[ x \\right]',
			braces: '\\left\\{ x \\right\\}',
			
			// Matrices
			matrix_2x2: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}',
			matrix_3x3: '\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}',
			
			// Physics
			force: 'F = ma',
			kinetic_energy: 'E_k = \\frac{1}{2}mv^2',
			potential_energy: 'E_p = mgh',
			newton_law: 'F = G\\frac{m_1m_2}{r^2}',
			einstein: 'E = mc^2',
			wave_equation: '\\psi(x,t) = Ae^{i(kx-\\omega t)}',
			schrodinger: 'i\\hbar\\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi',
			
			// Calculus
			derivative: '\\frac{dy}{dx}',
			partial_derivative: '\\frac{\\partial f}{\\partial x}',
			gradient: '\\nabla f',
			divergence: '\\nabla \\cdot \\vec{F}',
			curl: '\\nabla \\times \\vec{F}',
			
			// Statistics
			mean: '\\bar{x}',
			standard_deviation: '\\sigma',
			variance: '\\sigma^2',
			probability: 'P(X=x)',
			conditional_probability: 'P(A|B)',
			
			// Chemistry
			chemical_equation: 'A + B \\rightarrow C + D',
			equilibrium: 'A + B \\rightleftharpoons C + D',
		};
	}

	/**
	 * Get formula by name or keyword
	 */
	getFormula(name: string): string | null {
		const formulas = this.getCommonFormulas();
		const lowerName = name.toLowerCase();

		// Direct match
		if (formulas[name]) {
			return formulas[name];
		}

		// Fuzzy match
		for (const [key, value] of Object.entries(formulas)) {
			if (key.toLowerCase().includes(lowerName) || lowerName.includes(key)) {
				return value;
			}
		}

		return null;
	}

	/**
	 * Format a math expression as LaTeX
	 */
	formatExpression(expression: string): string {
		// Common replacements for natural language to LaTeX
		const replacements: Record<string, string> = {
			'sqrt': '\\sqrt',
			'frac': '\\frac',
			'integral': '\\int',
			'sum': '\\sum',
			'product': '\\prod',
			'lim': '\\lim',
			'infinity': '\\infty',
			'therefore': '\\therefore',
			'because': '\\because',
			'implies': '\\implies',
			'iff': '\\iff',
			'forall': '\\forall',
			'exists': '\\exists',
			'alpha': '\\alpha',
			'beta': '\\beta',
			'gamma': '\\gamma',
			'delta': '\\delta',
			'theta': '\\theta',
			'pi': '\\pi',
			'sigma': '\\sigma',
			'phi': '\\phi',
			'omega': '\\omega',
		};

		let latex = expression;

		// Apply replacements
		for (const [pattern, replacement] of Object.entries(replacements)) {
			const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
			latex = latex.replace(regex, replacement);
		}

		return latex;
	}

	/**
	 * Generate matrix LaTeX
	 */
	generateMatrix(rows: number, cols: number, values?: string[][]): string {
		if (!values || values.length === 0) {
			// Generate empty matrix
			const cells = Array(rows).fill(0).map(() => Array(cols).fill('a_{i,j}').join(' & '));
			return `\\begin{pmatrix}\n${cells.join(' \\\\\n')}\n\\end{pmatrix}`;
		}

		// Use provided values
		const rows_latex = values.map((row) => row.join(' & ')).join(' \\\\\n');
		return `\\begin{pmatrix}\n${rows_latex}\n\\end{pmatrix}`;
	}

	/**
	 * Generate equation LaTeX
	 */
	generateEquation(lhs: string, rhs: string): string {
		return `${lhs} = ${rhs}`;
	}

	/**
	 * Generate system of equations
	 */
	generateSystem(equations: string[]): string {
		const eqs = equations.join(' \\\\\n');
		return `\\begin{cases}\n${eqs}\n\\end{cases}`;
	}

	/**
	 * Generate piecewise function
	 */
	generatePiecewise(cases: Array<{ condition: string; expression: string }>): string {
		const cases_latex = cases.map((c) => `${c.expression} & \\text{if } ${c.condition}`).join(' \\\\\n');
		return `\\begin{cases}\n${cases_latex}\n\\end{cases}`;
	}
}
