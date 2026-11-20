import { App } from 'obsidian';
import TemplateEngine from 'src/template/TemplateEngine';
import ReadItLaterPlugin from 'src/main';
import { isValidUrl } from 'src/helpers/fileutils';
import { formatDate } from 'src/helpers/date';
import { ConversionProvider } from 'src/enums/conversionProvider';
import { Note } from './Note';

export interface ParseOptions {
    /** Overrides the HTML to markdown conversion provider selected in settings for this run. */
    conversionProvider?: ConversionProvider;
}

export abstract class Parser {
    protected app: App;
    protected plugin: ReadItLaterPlugin;
    protected templateEngine: TemplateEngine;

    constructor(app: App, plugin: ReadItLaterPlugin, templateEngine: TemplateEngine) {
        this.app = app;
        this.plugin = plugin;
        this.templateEngine = templateEngine;
    }

    abstract test(clipboardContent: string): boolean | Promise<boolean>;

    abstract prepareNote(clipboardContent: string, options?: ParseOptions): Promise<Note>;

    protected isValidUrl(url: string): boolean {
        return isValidUrl(url);
    }

    protected getFormattedDateForFilename(date: Date | string): string {
        return formatDate(date, this.plugin.settings.dateTitleFmt);
    }

    protected getFormattedDateForContent(date: Date | string): string {
        return formatDate(date, this.plugin.settings.dateContentFmt);
    }
}
