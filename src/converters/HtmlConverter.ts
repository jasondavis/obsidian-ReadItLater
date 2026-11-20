import { ConversionProvider } from 'src/enums/conversionProvider';

export interface ConversionInput {
    /** URL of the page being converted. */
    url: URL;
    /**
     * Pre-processed DOM of the page fetched by the plugin. Each converter receives its own clone, so it may mutate it.
     * `null` when the page could not be fetched locally (only converters with `requiresDocument === false` can work then).
     */
    document: Document | null;
}

export interface ConversionResult {
    /** Provider that produced the result. */
    provider: ConversionProvider;
    title: string;
    /** Article body converted to markdown. */
    content: string;
    /** Plain text of the article used for thin content detection and reading time estimation. */
    textContent: string;
    excerpt: string;
    siteName: string;
    author: string;
    /** Raw published time as reported by the provider. */
    publishedTime: string | null;
    lang: string;
    /** Provider specific raw response, exposed to templates for advanced use. */
    raw: unknown;
}

/**
 * Converts a web page into markdown. Implementations must be platform agnostic (Desktop + Mobile),
 * i.e. use Obsidian's `requestUrl` instead of `fetch` and no Node.js APIs.
 */
export interface HtmlConverter {
    readonly id: ConversionProvider;
    readonly name: string;
    /** Whether the converter works on the locally fetched DOM, or fetches the page by itself. */
    readonly requiresDocument: boolean;

    /**
     * Returns `null` when the converter could not extract any article content.
     * Throws on unexpected failures (network errors, invalid API responses, ...).
     */
    convert(input: ConversionInput): Promise<ConversionResult | null>;
}
