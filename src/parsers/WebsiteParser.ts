import { Notice, Platform, RequestUrlResponse, requestUrl } from 'obsidian';
import * as DOMPurify from 'isomorphic-dompurify';
import { getBaseUrl, normalizeFilename } from 'src/helpers/fileutils';
import { replaceImages } from 'src/helpers/replaceImages';
import { desktopBrowserUserAgent } from 'src/helpers/networkUtils';
import { ConversionProvider } from 'src/enums/conversionProvider';
import { ConversionResult, HtmlConverter } from 'src/converters/HtmlConverter';
import { Note } from './Note';
import { ParseOptions, Parser } from './Parser';

interface WebsiteNoteData {
    date: string;
    articleTitle: string;
    articleURL: string;
    articleReadingTime: number;
    articleContent: string;
    siteName: string;
    author: string;
    previewURL: string;
    publishedTime: string;
    /** Raw Readability article. Only populated when the Readability provider produced the note. */
    readabilityArticle: unknown;
    /** Raw response of the provider which produced the note. */
    conversionResult: unknown;
    conversionProvider: string;
    articleExcerpt: string;
    articleOgDescription: string;
    articleMetaAuthor: string;
    articlePublishedTime: string;
}

const THIN_CONTENT_THRESHOLD = 100;

class WebsiteParser extends Parser {
    test(url: string): boolean {
        return this.isValidUrl(url);
    }

    async prepareNote(url: string, options?: ParseOptions): Promise<Note> {
        const originUrl = new URL(url);
        const provider = this.getConversionProvider(options);
        const converter = this.plugin.getConverterRegistry().get(provider);

        let document: Document | null;
        try {
            document = await this.getDocument(originUrl);
        } catch (error) {
            // Providers fetching the page by themselves (e.g. Jina Reader) can still succeed.
            if (converter.requiresDocument) {
                throw error;
            }
            console.warn(`ReadItLater: unable to fetch ${originUrl.href} locally, continuing with ${converter.name}`);
            document = null;
        }

        return this.makeNote(document, originUrl, options);
    }

    protected getConversionProvider(options?: ParseOptions): ConversionProvider {
        return (
            options?.conversionProvider ??
            (this.plugin.settings.htmlConversionProvider as ConversionProvider) ??
            ConversionProvider.Readability
        );
    }

    protected async makeNote(document: Document | null, originUrl: URL, options?: ParseOptions): Promise<Note> {
        const createdAt = new Date();
        const previewUrl = document ? this.extractPreviewUrl(document) : null;

        // Extract OG/meta fields for template variables and thin-content fallback
        const meta = (selector: string): string => document?.querySelector(selector)?.getAttribute('content') ?? '';
        const ogTitle = meta('meta[property="og:title"]');
        const ogDescription = meta('meta[property="og:description"]');
        const ogSiteName = meta('meta[property="og:site_name"]');
        const metaAuthor = meta('meta[name="author"]') || meta('meta[property="article:author"]');
        const rawPublishedTime = meta('meta[property="article:published_time"]');

        const article = await this.convertDocument(document, originUrl, this.getConversionProvider(options));

        // Fall back to not-parsable path for missing or thin content (JS-rendered pages, paywalls, etc.)
        if (article === null || article.textContent.trim().length < THIN_CONTENT_THRESHOLD) {
            return this.notParsableArticle(originUrl.href, previewUrl, createdAt, {
                title: article?.title || ogTitle,
                description: ogDescription,
                siteName: ogSiteName,
            });
        }

        return this.parsableArticle(
            {
                date: this.getFormattedDateForContent(createdAt),
                articleTitle: article.title || ogTitle || 'No title',
                articleURL: originUrl.href,
                articleReadingTime: this.getEstimatedReadingTime(article),
                articleContent: article.content,
                siteName: article.siteName || ogSiteName || '',
                author: article.author || metaAuthor || '',
                previewURL: previewUrl || '',
                publishedTime: article.publishedTime ? this.getFormattedDateForContent(article.publishedTime) : '',
                readabilityArticle: article.provider === ConversionProvider.Readability ? article.raw : {},
                conversionResult: article.raw,
                conversionProvider: article.provider,
                articleExcerpt: article.excerpt || ogDescription,
                articleOgDescription: ogDescription,
                articleMetaAuthor: metaAuthor,
                articlePublishedTime: rawPublishedTime ? this.getFormattedDateForContent(rawPublishedTime) : '',
            },
            createdAt,
        );
    }

    /**
     * Converts the page with the selected provider. When it fails and the fallback is enabled,
     * the built-in Readability converter is used instead.
     */
    private async convertDocument(
        document: Document | null,
        url: URL,
        provider: ConversionProvider,
    ): Promise<ConversionResult | null> {
        const registry = this.plugin.getConverterRegistry();
        const converter = registry.get(provider);
        const fallback = registry.getDefault();

        let result: ConversionResult | null = null;
        let failure: Error | null = null;
        try {
            result = await this.runConverter(converter, document, url);
        } catch (error) {
            console.error(`ReadItLater: ${converter.name} conversion failed`, error);
            failure = error instanceof Error ? error : new Error(String(error));
        }

        const shouldFallback =
            converter.id !== fallback.id &&
            this.plugin.settings.conversionFallbackToReadability &&
            document !== null &&
            (result === null || result.textContent.trim().length < THIN_CONTENT_THRESHOLD);

        if (shouldFallback) {
            new Notice(
                `ReadItLater: ${converter.name} ${
                    failure ? `failed (${failure.message})` : 'found no content'
                }. Falling back to ${fallback.name}.`,
            );
            return this.runConverter(fallback, document, url);
        }

        if (failure) {
            throw failure;
        }

        return result;
    }

    private async runConverter(
        converter: HtmlConverter,
        document: Document | null,
        url: URL,
    ): Promise<ConversionResult | null> {
        // Every converter gets its own copy because Readability and Defuddle mutate the DOM.
        const documentCopy = document ? (document.cloneNode(true) as Document) : null;
        return converter.convert({ url, document: documentCopy });
    }

    protected async getDocument(url: URL): Promise<Document> {
        const document = await this.parseHtmlDom(url);

        //check for existing base element
        const originBasElements = document.getElementsByTagName('base');
        let originBaseUrl = null;
        if (originBasElements.length > 0) {
            originBaseUrl = originBasElements.item(0).getAttribute('href');
            Array.from(originBasElements).forEach((originBasEl) => {
                originBasEl.remove();
            });
        }

        // Set base to allow Readability to resolve relative path's
        const baseEl = document.createElement('base');
        baseEl.setAttribute('href', getBaseUrl(originBaseUrl ?? url.href, url.origin));
        document.head.append(baseEl);
        const cleanDocumentBody = DOMPurify.sanitize(document.body.innerHTML);
        document.body.innerHTML = cleanDocumentBody;

        /*
        DOM optimizations from MarkDownload. Distributed under an Apache License 2.0: https://github.com/deathau/markdownload/blob/main/LICENSE
        */
        document.body.querySelectorAll('pre br')?.forEach((br) => {
            // we need to keep <br> tags because they are removed by Readability.js
            br.outerHTML = '<br-keep></br-keep>';
        });

        document.body.querySelectorAll('h1, h2, h3, h4, h5, h6')?.forEach((header) => {
            // Readability.js will strip out headings from the dom if certain words appear in their className
            // See: https://github.com/mozilla/readability/issues/807
            header.className = '';
        });

        document.body.querySelectorAll('[class*=highlight-text],[class*=highlight-source]')?.forEach((codeSource) => {
            const language = codeSource.className.match(/highlight-(?:text|source)-([a-z0-9]+)/)?.[1];
            if (codeSource.firstElementChild.nodeName == 'PRE') {
                codeSource.removeAttribute('data-snippet-clipboard-copy-content');
                codeSource.firstElementChild.id = `code-lang-${language}`;
            }
        });

        document.body.querySelectorAll('[class*=language-]')?.forEach((codeSource) => {
            const language = codeSource.className.match(/language-([a-z0-9]+)/)?.[1];
            codeSource.id = `code-lang-${language}`;
        });

        document.body.querySelectorAll('.codehilite > pre')?.forEach((codeSource) => {
            if (codeSource.firstChild.nodeName !== 'CODE' && !codeSource.className.includes('language')) {
                codeSource.id = 'code-lang-text';
            }
        });

        //fix for substack images
        document.body.querySelectorAll('.captioned-image-container figure')?.forEach((figure) => {
            const imgEl = figure.querySelector('img');
            if (!imgEl) {
                return;
            }

            figure.querySelector('.image-link').remove();
            figure.prepend(imgEl);
        });

        //fix for Readability removing <figure> elements in <div>
        document.body.querySelectorAll('div > figure')?.forEach((figure) => {
            const figureEl = figure;
            figure.parentElement.before(figureEl);
        });

        //fix for WeChat site (https://github.com/DominikPieper/obsidian-ReadItLater/issues/187)
        document.body.querySelector('.rich_media_content.js_underline_content')?.removeAttribute('style');
        document.body.querySelectorAll('.rich_media_content.js_underline_content img[data-src]')?.forEach((imgEl) => {
            if (imgEl.getAttribute('src') === null) {
                imgEl.setAttribute('src', imgEl.getAttribute('data-src'));
            }
        });

        return document;
    }

    protected async parsableArticle(data: WebsiteNoteData, createdAt: Date): Promise<Note> {
        const fileNameTemplate = this.templateEngine.render(this.plugin.settings.parseableArticleNoteTitle, {
            title: data.articleTitle,
            date: this.getFormattedDateForFilename(createdAt),
        });

        let processedContent = this.templateEngine.render(this.plugin.settings.parsableArticleNote, data);

        if (this.plugin.settings.downloadImages && Platform.isDesktop) {
            processedContent = await replaceImages(
                this.plugin,
                normalizeFilename(fileNameTemplate),
                processedContent,
                this.getAssetsDir(fileNameTemplate, createdAt),
            );
        }

        return new Note(
            fileNameTemplate,
            'md',
            processedContent,
            this.plugin.settings.parseableArticleContentType,
            createdAt,
        );
    }

    protected async notParsableArticle(
        url: string,
        previewUrl: string | null,
        createdAt: Date,
        ogData?: { title?: string; description?: string; siteName?: string },
    ): Promise<Note> {
        console.error('Website not parseable');

        let content = this.templateEngine.render(this.plugin.settings.notParsableArticleNote, {
            articleURL: url,
            previewURL: previewUrl ?? '',
            articleTitle: ogData?.title ?? '',
            articleOgDescription: ogData?.description ?? '',
            siteName: ogData?.siteName ?? '',
        });

        const fileNameTemplate = this.templateEngine.render(this.plugin.settings.notParseableArticleNoteTitle, {
            date: this.getFormattedDateForFilename(createdAt),
        });

        if (this.plugin.settings.downloadImages && Platform.isDesktop) {
            content = await replaceImages(
                this.plugin,
                normalizeFilename(fileNameTemplate),
                content,
                this.getAssetsDir(fileNameTemplate, createdAt),
            );
        }

        return new Note(
            fileNameTemplate,
            'md',
            content,
            this.plugin.settings.notParseableArticleContentType,
            createdAt,
        );
    }

    /**
     * Extracts a preview URL from the document.
     * Searches for OpenGraph `og:image` and Twitter `twitter:image` meta tags.
     * @param document The document to extract preview URL from
     */
    protected extractPreviewUrl(document: Document): string | null {
        let previewMetaElement = document.querySelector('meta[property="og:image"]');
        if (previewMetaElement == null) {
            previewMetaElement = document.querySelector('meta[name="twitter:image"]');
        }
        return previewMetaElement?.getAttribute('content');
    }

    protected getAssetsDir(fileName: string, createdAt: Date): string {
        if (this.plugin.settings.downloadImagesInArticleDir) {
            const assetsDir = this.templateEngine.render(this.plugin.settings.assetsDir, {
                date: '',
                fileName: '',
                contentType: '',
            });
            return `${assetsDir}/${normalizeFilename(fileName)}`;
        }

        return this.templateEngine.render(this.plugin.settings.assetsDir, {
            date: this.getFormattedDateForFilename(createdAt),
            fileName: normalizeFilename(fileName),
            contentType: this.plugin.settings.parseableArticleContentType,
        });
    }

    /**
     * Returns estimated reading time of article in minutes
     */
    private getEstimatedReadingTime(article: ConversionResult): number {
        const readingSpeed = this.getReadingSpeed((article.lang || 'en').split('-')[0].toLowerCase());
        const words = article.textContent.trim().split(/\s+/).length;

        return Math.ceil(words / readingSpeed);
    }

    /**
     * Reading speed in words per minute. Data are gathered from this study https://irisreading.com/average-reading-speed-in-various-languages/
     */
    private getReadingSpeed(lang: string): number {
        const readingSpeed = new Map([
            ['en', 228],
            ['ar', 138],
            ['de', 179],
            ['es', 218],
            ['fi', 161],
            ['fr', 195],
            ['he', 187],
            ['it', 188],
            ['ja', 193],
            ['nl', 202],
            ['pl', 166],
            ['pt', 181],
            ['ru', 184],
            ['sk', 190],
            ['sl', 180],
            ['sv', 199],
            ['tr', 166],
            ['zh', 158],
        ]);

        return readingSpeed.get(lang) || readingSpeed.get('en');
    }

    private async parseHtmlDom(url: URL, charsetOverride: string | null = null): Promise<Document> {
        const response = await requestUrl({
            method: 'GET',
            url: url.href,
            headers: { ...desktopBrowserUserAgent },
        });

        const charset: string = charsetOverride ?? this.getCharsetFromResponseHeader(response);

        const buffer = response.arrayBuffer;
        const decoder = new TextDecoder(charset);
        const text = decoder.decode(buffer);

        const parser = new DOMParser();
        const document = parser.parseFromString(text, 'text/html');

        // Double-check meta tags for charset
        const metaCharset = document.querySelector('meta[charset], meta[http-equiv="Content-Type"]');
        if (metaCharset) {
            const docCharset =
                metaCharset.getAttribute('charset') ||
                metaCharset.getAttribute('content')?.match(/charset=([^;]+)/i)?.[1];
            if (docCharset && docCharset !== charset) {
                // If different charset found in meta, re-decode
                return this.parseHtmlDom(url, docCharset);
            }
        }

        return document;
    }

    private getCharsetFromResponseHeader(response: RequestUrlResponse): string {
        const contentType = response.headers?.['content-type'];
        let charset = 'UTF-8';

        // Try to extract charset from content-type header
        const charsetMatch = contentType?.match(/charset=([^;]+)/i);
        if (charsetMatch) {
            charset = charsetMatch[1];
        }

        return charset;
    }
}

export default WebsiteParser;
