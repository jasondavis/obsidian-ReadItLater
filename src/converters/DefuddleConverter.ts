import Defuddle from 'defuddle/full';
import { ConversionProvider } from 'src/enums/conversionProvider';
import { ConversionInput, ConversionResult, HtmlConverter } from './HtmlConverter';

export class DefuddleConverter implements HtmlConverter {
    readonly id = ConversionProvider.Defuddle;
    readonly name = 'Defuddle';
    readonly requiresDocument = true;

    async convert({ url, document }: ConversionInput): Promise<ConversionResult | null> {
        if (document === null) {
            return null;
        }

        // Undo the Readability specific workaround applied while fetching the page (see WebsiteParser.getDocument)
        document.querySelectorAll('br-keep').forEach((element) => element.replaceWith(document.createElement('br')));

        // Synchronous parse: async extractors would use the global fetch, which is subject to CORS in Obsidian.
        const result = new Defuddle(document, {
            url: url.href,
            separateMarkdown: true,
            useAsync: false,
        }).parse();

        const markdown = result.contentMarkdown ?? '';
        if (markdown.trim() === '') {
            return null;
        }

        return {
            provider: this.id,
            title: result.title ?? '',
            content: markdown,
            textContent: htmlToText(result.content ?? '') || markdown,
            excerpt: result.description ?? '',
            siteName: result.site ?? '',
            author: result.author ?? '',
            publishedTime: result.published || null,
            lang: result.language ?? '',
            raw: result,
        };
    }
}

function htmlToText(html: string): string {
    return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
}
