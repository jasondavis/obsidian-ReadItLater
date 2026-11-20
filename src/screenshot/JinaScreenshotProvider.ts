import { ScreenshotProvider as ScreenshotProviderId } from 'src/enums/screenshotProvider';
import { parseJinaReaderResponse, requestJinaReader } from 'src/helpers/jinaReader';
import ReadItLaterPlugin from 'src/main';
import {
    ScreenshotCapture,
    ScreenshotOptions,
    ScreenshotProvider,
    captureFromImageResponse,
    downloadImage,
    isImageResponse,
} from './ScreenshotProvider';

/**
 * Uses the Jina Reader `screenshot` (first screen) or `pageshot` (full page) response format,
 * which returns a URL of the rendered screenshot.
 */
export class JinaScreenshotProvider implements ScreenshotProvider {
    readonly id = ScreenshotProviderId.JinaReader;
    readonly name = 'Jina Reader';

    constructor(private plugin: ReadItLaterPlugin) {}

    async capture(url: URL, options: ScreenshotOptions): Promise<ScreenshotCapture> {
        const format = options.fullPage ? 'pageshot' : 'screenshot';
        const response = await requestJinaReader(this.plugin, url, format);

        if (isImageResponse(response)) {
            return captureFromImageResponse(response, '');
        }

        const data = parseJinaReaderResponse(response)?.data;
        const candidates = [data?.screenshotUrl, data?.pageshotUrl, data?.screenshot, data?.pageshot];
        let imageUrl = candidates.find((candidate) => typeof candidate === 'string' && /^https?:\/\//.test(candidate));

        if (!imageUrl) {
            imageUrl = response.text.match(/https?:\/\/\S+/)?.[0];
        }
        if (!imageUrl) {
            throw new Error('Jina Reader did not return a screenshot URL');
        }

        return downloadImage(imageUrl);
    }
}
