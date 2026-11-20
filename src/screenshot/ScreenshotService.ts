import { CapacitorAdapter, FileSystemAdapter, Notice, normalizePath } from 'obsidian';
import { ScreenshotProvider as ScreenshotProviderId } from 'src/enums/screenshotProvider';
import { HTTPS_PROTOCOL, HTTP_PROTOCOL } from 'src/constants/urlProtocols';
import { formatDate } from 'src/helpers/date';
import { getOsOptimizedPath, isValidUrl, normalizeFilename } from 'src/helpers/fileutils';
import ReadItLaterPlugin from 'src/main';
import { Note } from 'src/parsers/Note';
import TemplateEngine from 'src/template/TemplateEngine';
import { CustomUrlScreenshotProvider } from './CustomUrlScreenshotProvider';
import { JinaScreenshotProvider } from './JinaScreenshotProvider';
import { MicrolinkScreenshotProvider } from './MicrolinkScreenshotProvider';
import { ScreenshotProvider } from './ScreenshotProvider';

export interface SavedScreenshot {
    /** Vault path of the saved image. */
    path: string;
    /** Markdown image embed of the saved image. */
    embed: string;
    /** Public URL of the screenshot when the provider hosts it, empty otherwise. */
    remoteUrl: string;
}

export interface ScreenshotTemplateData {
    screenshot: string;
    screenshotPath: string;
    screenshotURL: string;
}

/** Matches `{{ screenshot }}`, `{{ screenshotPath }}` and `{{ screenshotURL }}` including optional filters. */
const SCREENSHOT_PLACEHOLDER_PATTERN = /{{\s*screenshot(?:Path|URL)?\s*(?:\|[^}]*)?}}/g;
const MAX_FILENAME_INDEX = 1000;

export class ScreenshotService {
    private providers = new Map<ScreenshotProviderId, ScreenshotProvider>();

    constructor(private plugin: ReadItLaterPlugin, private templateEngine: TemplateEngine) {
        this.register(new JinaScreenshotProvider(plugin));
        this.register(new MicrolinkScreenshotProvider(plugin));
        this.register(new CustomUrlScreenshotProvider(plugin));
    }

    public register(provider: ScreenshotProvider): void {
        this.providers.set(provider.id, provider);
    }

    public getProvider(): ScreenshotProvider | null {
        const id = this.plugin.settings.screenshotProvider as ScreenshotProviderId;
        return this.providers.get(id) ?? null;
    }

    public isEnabled(): boolean {
        return this.getProvider() !== null;
    }

    public containsPlaceholder(content: string): boolean {
        return new RegExp(SCREENSHOT_PLACEHOLDER_PATTERN.source).test(content);
    }

    /**
     * Captures a screenshot of `url` and writes it to the screenshot assets directory.
     */
    public async captureAndSave(
        url: URL,
        noteFileName: string,
        contentType: string,
        createdAt: Date,
    ): Promise<SavedScreenshot> {
        const provider = this.getProvider();
        if (provider === null) {
            throw new Error('Screenshot provider is disabled in ReadItLater settings.');
        }

        const capture = await provider.capture(url, {
            fullPage: this.plugin.settings.screenshotFullPage,
            viewportWidth: Number(this.plugin.settings.screenshotViewportWidth) || 1280,
        });

        const assetsDir = this.getAssetsDir(noteFileName, contentType, createdAt);
        await this.plugin.getVaultRepository().createDirectory(assetsDir);

        const baseName = normalizeFilename(noteFileName || url.hostname) || 'screenshot';
        const path = await this.chooseFilePath(assetsDir, `${baseName}-screenshot`, capture.extension);
        await this.plugin.app.vault.createBinary(path, capture.data);

        return {
            path,
            embed: `![Screenshot](${path.replace(/\s/g, '%20')})`,
            remoteUrl: capture.remoteUrl,
        };
    }

    /**
     * Resolves screenshot placeholders left in a rendered note. Placeholders are left unresolved by the parsers,
     * so screenshots work with every content type. A screenshot is captured only when a placeholder is present.
     */
    public async fillPlaceholders(note: Note, sourceUrl: string | null): Promise<Note> {
        if (!this.containsPlaceholder(note.content)) {
            return note;
        }

        let data: ScreenshotTemplateData = { screenshot: '', screenshotPath: '', screenshotURL: '' };
        if (this.isEnabled() && sourceUrl !== null && isValidUrl(sourceUrl, [HTTP_PROTOCOL, HTTPS_PROTOCOL])) {
            try {
                const saved = await this.captureAndSave(
                    new URL(sourceUrl),
                    note.fileName,
                    note.contentType,
                    note.createdAt,
                );
                data = this.toTemplateData(saved);
            } catch (error) {
                console.error('ReadItLater: screenshot capture failed', error);
                new Notice(`ReadItLater: Unable to capture screenshot. ${error.message}`);
            }
        }

        const content = note.content.replace(SCREENSHOT_PLACEHOLDER_PATTERN, (placeholder) =>
            this.templateEngine.render(placeholder, data),
        );

        return new Note(note.fileName, note.fileExtension, content, note.contentType, note.createdAt);
    }

    public toTemplateData(saved: SavedScreenshot): ScreenshotTemplateData {
        return { screenshot: saved.embed, screenshotPath: saved.path, screenshotURL: saved.remoteUrl };
    }

    private getAssetsDir(noteFileName: string, contentType: string, createdAt: Date): string {
        const template = this.plugin.settings.screenshotAssetsDir?.trim() || this.plugin.settings.assetsDir;
        return this.templateEngine.render(template, {
            date: formatDate(createdAt, this.plugin.settings.dateTitleFmt),
            fileName: normalizeFilename(noteFileName),
            contentType,
        });
    }

    private async chooseFilePath(dir: string, baseName: string, extension: string): Promise<string> {
        const adapter = this.plugin.app.vault.adapter;
        for (let index = 0; index < MAX_FILENAME_INDEX; index++) {
            const fileName = `${baseName}${index === 0 ? '' : `-${index}`}.${extension}`;
            const path =
                adapter instanceof CapacitorAdapter || adapter instanceof FileSystemAdapter
                    ? getOsOptimizedPath(dir, fileName, adapter, this.plugin.getFileSystemLimits())
                    : normalizePath(`${dir}/${fileName}`);

            if (!(await adapter.exists(path))) {
                return path;
            }
        }

        throw new Error(`Unable to find a free file name for ${baseName} in ${dir}`);
    }
}
