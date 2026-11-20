import { Editor, Notice } from 'obsidian';
import ParserCreator from './parsers/ParserCreator';
import { VaultRepository } from './repository/VaultRepository';
import { Note } from './parsers/Note';
import FileExistsError from './error/FileExists';
import FileExistsAsk from './modal/FileExistsAsk';
import { FileExistsStrategy } from './enums/fileExistsStrategy';
import ReadItLaterPlugin from './main';
import { getAndCheckUrls } from './helpers/stringUtils';
import { ParseOptions } from './parsers/Parser';
import { HTTPS_PROTOCOL, HTTP_PROTOCOL } from './constants/urlProtocols';
import { isValidUrl } from './helpers/fileutils';
import { formatDate } from './helpers/date';
import TemplateEngine from './template/TemplateEngine';
import { ScreenshotService } from './screenshot/ScreenshotService';

export class NoteService {
    constructor(
        private parserCreator: ParserCreator,
        private plugin: ReadItLaterPlugin,
        private repository: VaultRepository,
        private screenshotService: ScreenshotService,
        private templateEngine: TemplateEngine,
    ) {}

    public async createNote(content: string, options?: ParseOptions): Promise<void> {
        const note = await this.makeNote(content, options);
        await this.saveSingleNote(note);
    }

    /**
     * Creates a note containing only a screenshot of the given URL, rendered with the screenshot note template.
     */
    public async createScreenshotNote(url: string): Promise<void> {
        const note = await this.makeScreenshotNote(url);
        await this.saveSingleNote(note);
    }

    /**
     * Captures a screenshot of the URL, saves it to the vault and inserts its embed at the cursor position.
     */
    public async insertScreenshotAtCursor(url: string, editor: Editor): Promise<void> {
        const pageUrl = this.parseScreenshotUrl(url);
        const notice = new Notice(`ReadItLater: Capturing screenshot of ${pageUrl.href}…`, 0);
        try {
            const activeFile = this.plugin.app.workspace.getActiveFile();
            const saved = await this.screenshotService.captureAndSave(
                pageUrl,
                activeFile?.basename ?? pageUrl.hostname,
                this.plugin.settings.screenshotContentTypeSlug,
                new Date(),
            );
            editor.replaceRange(saved.embed, editor.getCursor());
        } catch (error) {
            new Notice(`ReadItLater: Unable to capture screenshot. ${error.message}`);
            throw error;
        } finally {
            notice.hide();
        }
    }

    private async saveSingleNote(note: Note): Promise<void> {
        try {
            await this.repository.saveNote(note);
        } catch (error) {
            if (error instanceof FileExistsError) {
                this.handleFileExistsError([note]);
            }
        }
    }

    public async createNotesFromBatch(contentBatch: string, options?: ParseOptions): Promise<void> {
        const urlCheckResult = getAndCheckUrls(contentBatch, this.plugin.settings.batchProcessDelimiter);
        const existingNotes: Note[] = [];

        for (const contentSegment of urlCheckResult.everyLineIsURL ? urlCheckResult.urls : [contentBatch]) {
            const note = await this.makeNote(contentSegment, options);
            try {
                await this.repository.saveNote(note);
            } catch (error) {
                if (error instanceof FileExistsError) {
                    existingNotes.push(note);
                }
            }
        }

        if (existingNotes.length > 0) {
            this.handleFileExistsError(existingNotes);
        }
    }

    public async insertContentAtEditorCursorPosition(
        content: string,
        editor: Editor,
        options?: ParseOptions,
    ): Promise<void> {
        const note = await this.makeNote(content, options);
        editor.replaceRange(note.content, editor.getCursor());
    }

    private async makeNote(content: string, options?: ParseOptions): Promise<Note> {
        try {
            const parser = await this.parserCreator.createParser(content);
            const note = await parser.prepareNote(content, options);
            const sourceUrl = isValidUrl(content.trim(), [HTTP_PROTOCOL, HTTPS_PROTOCOL]) ? content.trim() : null;
            return await this.screenshotService.fillPlaceholders(note, sourceUrl);
        } catch (error) {
            new Notice(`ReadItLater: Failed to process content. ${error.message}`);
            throw error;
        }
    }

    private async makeScreenshotNote(url: string): Promise<Note> {
        const pageUrl = this.parseScreenshotUrl(url);
        const settings = this.plugin.settings;
        const createdAt = new Date();
        const variables = {
            url: pageUrl.href,
            domain: pageUrl.hostname,
            date: formatDate(createdAt, settings.dateTitleFmt),
        };
        const fileName = this.templateEngine.render(settings.screenshotNoteTitle, variables);

        const notice = new Notice(`ReadItLater: Capturing screenshot of ${pageUrl.href}…`, 0);
        try {
            const saved = await this.screenshotService.captureAndSave(
                pageUrl,
                fileName,
                settings.screenshotContentTypeSlug,
                createdAt,
            );
            const content = this.templateEngine.render(settings.screenshotNote, {
                ...variables,
                date: formatDate(createdAt, settings.dateContentFmt),
                ...this.screenshotService.toTemplateData(saved),
            });

            return new Note(fileName, 'md', content, settings.screenshotContentTypeSlug, createdAt);
        } catch (error) {
            new Notice(`ReadItLater: Unable to capture screenshot. ${error.message}`);
            throw error;
        } finally {
            notice.hide();
        }
    }

    private parseScreenshotUrl(url: string): URL {
        const trimmed = url.trim();
        if (!isValidUrl(trimmed, [HTTP_PROTOCOL, HTTPS_PROTOCOL])) {
            new Notice('ReadItLater: Screenshot requires a valid http(s) URL.');
            throw new Error(`Invalid screenshot URL: ${trimmed}`);
        }
        if (!this.screenshotService.isEnabled()) {
            new Notice('ReadItLater: Select a screenshot provider in the plugin settings first.');
            throw new Error('Screenshot provider is disabled.');
        }

        return new URL(trimmed);
    }

    private openNote(note: Note): void {
        if (this.plugin.settings.openNewNote || this.plugin.settings.openNewNoteInNewTab) {
            try {
                const file = this.repository.getFileByPath(note.filePath);
                this.plugin.app.workspace
                    .getLeaf(this.plugin.settings.openNewNoteInNewTab ? 'tab' : false)
                    .openFile(file);
            } catch (error) {
                console.error(error);
                new Notice(`Unable to open ${note.getFullFilename()}`);
            }
        }
    }

    private async handleFileExistsError(notes: Note[]): Promise<void> {
        switch (this.plugin.settings.fileExistsStrategy) {
            case FileExistsStrategy.Ask:
                new FileExistsAsk(this.plugin.app, notes, (strategy, doNotAskAgain) => {
                    this.handleFileAskModalResponse(strategy, doNotAskAgain, notes);
                }).open();
                break;
            case FileExistsStrategy.Nothing:
                this.handleFileExistsStrategyNothing(notes);
                break;
            case FileExistsStrategy.AppendToExisting:
                this.handleFileExistsStrategyAppend(notes);
                break;
        }
    }

    private async handleFileAskModalResponse(
        strategy: FileExistsStrategy,
        doNotAskAgain: boolean,
        notes: Note[],
    ): Promise<void> {
        switch (strategy) {
            case FileExistsStrategy.Nothing:
                this.handleFileExistsStrategyNothing(notes);
                break;
            case FileExistsStrategy.AppendToExisting:
                this.handleFileExistsStrategyAppend(notes);
                break;
        }

        if (doNotAskAgain) {
            this.plugin.saveSetting('fileExistsStrategy', strategy as FileExistsStrategy);
        }

        if (notes.length === 1) {
            this.openNote(notes.shift());
        }
    }

    private async handleFileExistsStrategyAppend(notes: Note[]): Promise<void> {
        for (const note of notes) {
            try {
                await this.repository.appendToExistingNote(note);
                new Notice(`${note.getFullFilename()} was updated.`);
            } catch (error) {
                console.error(error);
                new Notice(`${note.getFullFilename()} was not updated!`, 0);
            }
        }
    }

    private handleFileExistsStrategyNothing(notes: Note[]): void {
        for (const note of notes) {
            new Notice(`${note.getFullFilename()} already exists.`);
        }
    }
}
