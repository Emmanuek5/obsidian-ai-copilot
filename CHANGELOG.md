# Changelog & Roadmap

## Version 0.1.0 (Current) - Initial Release

### ✅ Features Implemented

#### Core Functionality

- [x] Google Gemini AI integration via Vercel AI SDK
- [x] Streaming responses for real-time interaction
- [x] Multiple model support (gemini-2.0-flash-exp, gemini-2.5-flash, gemini-2.5-pro)
- [x] Configurable temperature and max tokens

#### User Interface

- [x] Sidebar chat interface
- [x] Message streaming with markdown rendering
- [x] Conversation history view
- [x] Settings page with full configuration
- [x] Ribbon icon for quick access
- [x] Command palette integration

#### Vault Integration

- [x] Automatic vault indexing
- [x] Real-time index updates (create, modify, delete, rename)
- [x] Tag extraction from notes
- [x] Wikilink extraction
- [x] File content caching for fast access
- [x] Search functionality

#### @ Mention System

- [x] Autocomplete dropdown
- [x] Fuzzy file search
- [x] Keyboard navigation (arrows, enter, escape)
- [x] File type indicators
- [x] File path display
- [x] Automatic content attachment

#### Conversation Management

- [x] Save conversations in .aicon format
- [x] Load previous conversations
- [x] List all conversations with metadata
- [x] Delete conversations
- [x] Auto-save on exit
- [x] Export to Markdown

#### .aicon Format

- [x] YAML frontmatter + JSON body
- [x] Metadata storage (title, timestamps, tags)
- [x] Message array with roles and attachments
- [x] Human-readable structure
- [x] Built-in .aicon file viewer
- [x] Formatted display in Obsidian

## Planned Features

### v0.2.0 - Enhanced Context & Search

#### RAG Implementation

- [ ] Embedding generation for notes
- [ ] Vector database integration
- [ ] Semantic search across vault
- [ ] Automatic relevant note retrieval
- [ ] Context-aware responses

#### Improved Indexing

- [ ] Incremental indexing for large vaults
- [ ] Index progress indicator
- [ ] Configurable file type filters
- [ ] Folder-specific indexing
- [ ] Index statistics dashboard

#### Advanced @ Mentions

- [ ] @tag support (mention by tag)
- [ ] @folder support (mention entire folders)
- [ ] @recent (recent files)
- [ ] @all (entire vault context - with limits)
- [ ] Multiple file selection

### v0.3.0 - Conversation Enhancements

#### Conversation Features

- [ ] Conversation search
- [ ] Tagging conversations
- [ ] Conversation folders/organization
- [ ] Conversation templates
- [ ] Share conversations (export options)
- [ ] Conversation merging

#### UI Improvements

- [ ] Multi-tab support (multiple conversations)
- [ ] Conversation preview in sidebar
- [ ] Markdown editor for messages
- [ ] Code block syntax highlighting
- [ ] Image preview in chat
- [ ] Copy message button
- [ ] Regenerate response option

### v0.4.0 - Multimodal & Generation

#### Image Support

- [ ] Image input (attach images to messages)
- [ ] Image analysis with Gemini
- [ ] Diagram understanding
- [ ] OCR for handwritten notes
- [ ] Image generation (via Imagen)
- [ ] Image preview in conversations

#### Content Generation

- [ ] Note templates based on AI suggestions
- [ ] Auto-generate backlinks
- [ ] Content expansion (expand bullet points)
- [ ] Summary generation for long notes
- [ ] Automatic tagging suggestions

### v0.5.0 - Advanced AI Features

#### Custom Prompts

- [ ] System prompt customization
- [ ] Prompt templates library
- [ ] Per-conversation system prompts
- [ ] Prompt variables (vault context, current file, etc.)
- [ ] Prompt sharing/import

#### Model Options

- [ ] Support for OpenAI (GPT-4, GPT-3.5)
- [ ] Support for Anthropic (Claude)
- [ ] Support for local models
- [ ] Model comparison mode
- [ ] Automatic model selection based on task

#### Tools & Actions

- [ ] Function calling for note operations
- [ ] Create notes from conversations
- [ ] Update existing notes
- [ ] Calendar integration
- [ ] Task creation/management
- [ ] Daily note integration

### v1.0.0 - Polish & Performance

#### Performance

- [ ] Lazy loading for large conversations
- [ ] Virtual scrolling in chat
- [ ] Optimized indexing for large vaults
- [ ] Caching strategies
- [ ] Background indexing
- [ ] Request batching

#### Polish

- [ ] Onboarding tutorial
- [ ] Contextual help
- [ ] Keyboard shortcuts configuration
- [ ] Theme customization
- [ ] Accessibility improvements
- [ ] Mobile support optimization

#### Developer Features

- [ ] Plugin API for extensions
- [ ] Event system for hooks
- [ ] Custom provider interface
- [ ] Webhook support
- [ ] Debug mode

## Community Requested Features

Vote on [GitHub Discussions](https://github.com/yourusername/obsidian-ai-copilot/discussions) for features you'd like to see!

Popular requests:

- Voice input/output
- Obsidian graph integration (AI-suggested connections)
- Collaboration features
- Multi-language support
- Offline mode
- Custom fine-tuned models

## Breaking Changes

### v0.1.0

- Initial release, no breaking changes

## Known Issues

See [GitHub Issues](https://github.com/yourusername/obsidian-ai-copilot/issues) for current bugs and limitations.

Current known issues:

- Very large vaults (>10,000 files) may have slow initial indexing
- Images in @ mentions not yet supported (coming in v0.4.0)
- Mobile rendering could be improved
- Some markdown elements may not render perfectly in chat

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Priority areas for contribution:

- Testing on various vault sizes
- UI/UX improvements
- Documentation
- Bug fixes
- Performance optimizations

---

**Want to influence the roadmap?**

Share your ideas in [GitHub Discussions](https://github.com/yourusername/obsidian-ai-copilot/discussions) or vote on existing feature requests!
