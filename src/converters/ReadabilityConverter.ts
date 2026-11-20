import { Notice } from 'obsidian';
import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { ConversionProvider } from 'src/enums/conversionProvider';
import { parseHtmlContent } from 'src/parsers/parsehtml';
import { ConversionInput, ConversionResult, HtmlConverter } from './HtmlConverter';

export class ReadabilityConverter implements HtmlConverter {
    readonly id = ConversionProvider.Readability;
    readonly name = 'Mozilla Readability';
    readonly requiresDocument = true;

    async convert({ document }: ConversionInput): Promise<ConversionResult | null> {
        if (document === null) {
            return null;
        }

        if (!isProbablyReaderable(document)) {
            new Notice('@mozilla/readability considers this document to unlikely be readerable.');
        }

        const article = new Readability(document).parse();
        if (article === null || !Object.prototype.hasOwnProperty.call(article, 'content')) {
            return null;
        }

        return {
            provider: this.id,
            title: article.title ?? '',
            content: await parseHtmlContent(article.content),
            textContent: article.textContent ?? '',
            excerpt: article.excerpt ?? '',
            siteName: article.siteName ?? '',
            author: article.byline ?? '',
            publishedTime: article.publishedTime ?? null,
            lang: article.lang ?? '',
            raw: article,
        };
    }
}
