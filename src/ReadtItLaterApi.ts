import { Editor } from 'obsidian';
import { NoteService } from './NoteService';
import { ParseOptions } from './parsers/Parser';

export class ReadItLaterApi {
    constructor(private noteService: NoteService) {}

    /**
     * Create single note from provided input.
     */
    public async processContent(content: string, options?: ParseOptions): Promise<void> {
        this.noteService.createNote(content, options);
    }

    /**
     * Create multiple notes from provided input delimited by delimiter defined in plugin settings.
     */
    public async processContentBatch(contentBatch: string, options?: ParseOptions): Promise<void> {
        this.noteService.createNotesFromBatch(contentBatch, options);
    }

    /**
     * Insert processed content from input at current position in editor.
     */
    public async insertContentAtEditorCursorPosition(
        content: string,
        editor: Editor,
        options?: ParseOptions,
    ): Promise<void> {
        this.noteService.insertContentAtEditorCursorPosition(content, editor, options);
    }

    /**
     * Create a note with a screenshot of the provided URL.
     */
    public async createScreenshotNote(url: string): Promise<void> {
        this.noteService.createScreenshotNote(url);
    }

    /**
     * Capture a screenshot of the provided URL and insert it at current position in editor.
     */
    public async insertScreenshotAtCursor(url: string, editor: Editor): Promise<void> {
        this.noteService.insertScreenshotAtCursor(url, editor);
    }
}
