import { RequestUrlResponse, requestUrl } from 'obsidian';
import ReadItLaterPlugin from 'src/main';

export const DEFAULT_JINA_READER_ENDPOINT = 'https://r.jina.ai';

/**
 * Shape of the JSON envelope returned by the Jina Reader API when `Accept: application/json` is sent.
 * Fields are optional because the API omits them depending on the requested format.
 */
export interface JinaReaderResponse {
    code?: number;
    status?: number;
    data?: {
        title?: string;
        description?: string;
        url?: string;
        content?: string;
        text?: string;
        html?: string;
        publishedTime?: string;
        screenshotUrl?: string;
        pageshotUrl?: string;
        screenshot?: string;
        pageshot?: string;
        [key: string]: unknown;
    };
    message?: string;
    readableMessage?: string;
}

/**
 * Calls Jina Reader (https://github.com/jina-ai/reader) for the given page.
 * `format` is one of the documented response formats, e.g. `markdown`, `screenshot` or `pageshot`.
 */
export async function requestJinaReader(
    plugin: ReadItLaterPlugin,
    url: URL,
    format: string,
    extraHeaders: Record<string, string> = {},
): Promise<RequestUrlResponse> {
    const endpoint = (plugin.settings.jinaReaderEndpoint || DEFAULT_JINA_READER_ENDPOINT).replace(/\/+$/, '');
    const headers: Record<string, string> = {
        Accept: 'application/json',
        // Current header name and its older alias, both documented by Jina Reader.
        'X-Respond-With': format,
        'X-Return-Format': format,
        ...extraHeaders,
    };

    const apiKey = plugin.settings.jinaReaderApiKey?.trim();
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await requestUrl({
        url: `${endpoint}/${url.href}`,
        method: 'GET',
        headers,
        throw: false,
    });

    if (response.status >= 400) {
        let message = `HTTP ${response.status}`;
        try {
            const json = response.json as JinaReaderResponse;
            message = json.readableMessage || json.message || message;
        } catch (e) {
            // not a JSON error body
        }
        throw new Error(`Jina Reader request failed: ${message}`);
    }

    return response;
}

export function parseJinaReaderResponse(response: RequestUrlResponse): JinaReaderResponse | null {
    try {
        const json = JSON.parse(response.text);
        return typeof json === 'object' && json !== null ? (json as JinaReaderResponse) : null;
    } catch (e) {
        return null;
    }
}
