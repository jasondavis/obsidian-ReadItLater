import { ScreenshotProvider as ScreenshotProviderId } from 'src/enums/screenshotProvider';
import ReadItLaterPlugin from 'src/main';
import { ScreenshotCapture, ScreenshotOptions, ScreenshotProvider, downloadImage } from './ScreenshotProvider';

export const DEFAULT_SCREENSHOT_URL_TEMPLATE = 'https://image.thum.io/get/width/{{ width }}/{{ url }}';

/**
 * Any screenshot service that returns image bytes for a GET request.
 * Supported placeholders: `{{ url }}`, `{{ encodedUrl }}`, `{{ width }}`, `{{ fullPage }}`.
 */
export class CustomUrlScreenshotProvider implements ScreenshotProvider {
    readonly id = ScreenshotProviderId.CustomUrl;
    readonly name = 'Custom URL';

    constructor(private plugin: ReadItLaterPlugin) {}

    async capture(url: URL, options: ScreenshotOptions): Promise<ScreenshotCapture> {
        const template = this.plugin.settings.screenshotCustomUrlTemplate?.trim() || DEFAULT_SCREENSHOT_URL_TEMPLATE;
        const values: Record<string, string> = {
            url: url.href,
            encodedUrl: encodeURIComponent(url.href),
            width: String(options.viewportWidth),
            fullPage: String(options.fullPage),
        };
        const requestUrl = template.replace(/{{\s*(url|encodedUrl|width|fullPage)\s*}}/g, (_match, key) => values[key]);

        return downloadImage(requestUrl, {}, '');
    }
}
