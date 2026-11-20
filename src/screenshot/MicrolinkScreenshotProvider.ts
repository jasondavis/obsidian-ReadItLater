import { ScreenshotProvider as ScreenshotProviderId } from 'src/enums/screenshotProvider';
import ReadItLaterPlugin from 'src/main';
import { ScreenshotCapture, ScreenshotOptions, ScreenshotProvider, downloadImage } from './ScreenshotProvider';

/**
 * Microlink screenshot API (https://microlink.io/docs/api/parameters/screenshot).
 * Free usage works without an API key; a key switches to the pro endpoint.
 */
export class MicrolinkScreenshotProvider implements ScreenshotProvider {
    readonly id = ScreenshotProviderId.Microlink;
    readonly name = 'Microlink';

    constructor(private plugin: ReadItLaterPlugin) {}

    async capture(url: URL, options: ScreenshotOptions): Promise<ScreenshotCapture> {
        const apiKey = this.plugin.settings.microlinkApiKey?.trim();
        const endpoint = new URL(apiKey ? 'https://pro.microlink.io/' : 'https://api.microlink.io/');
        endpoint.searchParams.set('url', url.href);
        endpoint.searchParams.set('screenshot', 'true');
        endpoint.searchParams.set('meta', 'false');
        // Respond with the image itself instead of a JSON envelope
        endpoint.searchParams.set('embed', 'screenshot.url');
        endpoint.searchParams.set('viewport.width', String(options.viewportWidth));
        if (options.fullPage) {
            endpoint.searchParams.set('screenshot.fullPage', 'true');
        }

        return downloadImage(endpoint.href, apiKey ? { 'x-api-key': apiKey } : {}, '');
    }
}
