# Obsidian AI Copilot

An intelligent AI assistant for Obsidian, powered by Google Gemini and the Vercel AI SDK.

## Features

- 🤖 **AI Chat Interface**: Interactive chat with Google Gemini in Obsidian's sidebar
- 📁 **Vault Indexing**: Automatically indexes your vault for better context awareness
- 📎 **@ Mentions**: Reference files, images, and notes using @ mentions
- 💾 **Conversation History**: Saves conversations in `.aicon` format
- 📖 **.aicon Viewer**: Built-in viewer for conversation files
- 🔍 **Smart Search**: Find relevant notes and files quickly
- 🎨 **Beautiful UI**: Modern, clean interface that matches Obsidian's theme

## Installation

### From Source

1. Clone this repository into your Obsidian vault's `.obsidian/plugins/` directory:

   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/yourusername/obsidian-ai-copilot
   cd obsidian-ai-copilot
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Build the plugin:

   ```bash
   bun run build
   ```

4. Enable the plugin in Obsidian's settings

## Setup

1. Get a Google Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Open Obsidian Settings → AI Copilot
3. Enter your API key
4. Configure your preferences (model, temperature, etc.)

## Usage

### Opening the Copilot

- Click the bot icon (🤖) in the ribbon
- Use the command palette: "Open AI Copilot"
- The copilot will open in the right sidebar

### Using @ Mentions

Type `@` in the chat input to see a list of files in your vault:

```
@my-note Tell me about this note
```

The AI will have access to the content of the mentioned files.

### Conversation Management

- **New**: Start a new conversation
- **Save**: Save the current conversation
- **Load**: Load a previous conversation
- **Export**: Export conversation to Markdown

### .aicon Format

Conversations are saved in a custom `.aicon` format that combines YAML frontmatter with JSON:

```yaml
---
id: "conv_1234567890_abc123"
title: "My Conversation"
createdAt: 1234567890000
updatedAt: 1234567891000
---
[{ "role": "user", "content": "Hello!", "timestamp": 1234567890000 }, ...]
```

Click on any `.aicon` file to view it in a beautiful, readable format.

## Development

### Dev Mode

Run the plugin in development with hot reload:

```bash
bun run dev
```

### Project Structure

```
obsidian-ai-copilot/
├── src/
│   ├── main.ts                    # Plugin entry point
│   ├── ai/
│   │   └── aiService.ts           # AI/Gemini integration
│   ├── conversations/
│   │   └── conversationManager.ts # Conversation CRUD
│   ├── indexing/
│   │   └── vaultIndexer.ts        # Vault file indexing
│   ├── settings/
│   │   ├── settings.ts            # Settings interface
│   │   └── settingsTab.ts         # Settings UI
│   └── views/
│       ├── AICopilotView.ts       # Main chat interface
│       ├── AiconViewerView.ts     # .aicon file viewer
│       └── mentionHandler.ts      # @ mention autocomplete
├── styles.css                     # Plugin styles
├── manifest.json                  # Plugin manifest
└── package.json                   # Dependencies

```

## Technologies

- **Runtime**: [Bun](https://bun.sh)
- **AI SDK**: [Vercel AI SDK](https://sdk.vercel.ai)
- **AI Provider**: [Google Gemini](https://ai.google.dev)
- **Framework**: [Obsidian API](https://docs.obsidian.md)

## License

MIT

## Support

If you encounter any issues or have suggestions, please open an issue on GitHub.
