import { ConversionProvider } from 'src/enums/conversionProvider';
import { parseJinaReaderResponse, requestJinaReader } from 'src/helpers/jinaReader';
import ReadItLaterPlugin from 'src/main';
import { ConversionInput, ConversionResult, HtmlConverter } from './HtmlConverter';

/**
 * Converts pages with the hosted Jina Reader API. The page is rendered and converted by Jina,
 * so this works for JavaScript-heavy pages as well, but the URL is sent to a third party.
 */
export class JinaReaderConverter implements HtmlConverter {
    readonly id = ConversionProvider.JinaReader;
    readonly name = 'Jina Reader';
    readonly requiresDocument = false;

    constructor(private plugin: ReadItLaterPlugin) {}

    async convert({ url }: ConversionInput): Promise<ConversionResult | null> {
        const extraHeaders: Record<string, string> = {};
        const settings = this.plugin.settings;
        if (settings.jinaReaderTargetSelector?.trim()) {
            extraHeaders['X-Target-Selector'] = settings.jinaReaderTargetSelector.trim();
        }
        if (settings.jinaReaderGeneratedAlt) {
            extraHeaders['X-With-Generated-Alt'] = 'true';
        }

        const response = await requestJinaReader(this.plugin, url, 'markdown', extraHeaders);
        const json = parseJinaReaderResponse(response);

        let title = '';
        let description = '';
        let publishedTime: string | null = null;
        let content: string;

        if (json?.data) {
            title = json.data.title ?? '';
            description = json.data.description ?? '';
            publishedTime = json.data.publishedTime || null;
            content = json.data.content ?? '';
        } else {
            // Plain text response: "Title: ...\nURL Source: ...\nMarkdown Content:\n..."
            const parsed = parsePlainTextResponse(response.text);
            title = parsed.title;
            publishedTime = parsed.publishedTime;
            content = parsed.content;
        }

        if (content.trim() === '') {
            return null;
        }

        return {
            provider: this.id,
            title,
            content: content.trim(),
            textContent: content,
            excerpt: description,
            siteName: '',
            author: '',
            publishedTime,
            lang: '',
            raw: json?.data ?? { content },
        };
    }
}

function parsePlainTextResponse(text: string): { title: string; publishedTime: string | null; content: string } {
    const title = text.match(/^Title:\s*(.*)$/m)?.[1]?.trim() ?? '';
    const publishedTime = text.match(/^Published Time:\s*(.*)$/m)?.[1]?.trim() || null;
    const markerIndex = text.indexOf('Markdown Content:');
    const content = markerIndex >= 0 ? text.substring(markerIndex + 'Markdown Content:'.length) : text;

    return { title, publishedTime, content };
}
