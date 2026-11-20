import { RequestUrlResponse, requestUrl } from 'obsidian';
import { ScreenshotProvider as ScreenshotProviderId } from 'src/enums/screenshotProvider';
import { getFileExtensionFromMimeType } from 'src/helpers/fileutils';

export interface ScreenshotOptions {
    fullPage: boolean;
    viewportWidth: number;
}

export interface ScreenshotCapture {
    data: ArrayBuffer;
    /** File extension without dot, e.g. `png`. */
    extension: string;
    /** Public URL of the screenshot, when the service hosts it. Empty otherwise. */
    remoteUrl: string;
}

/**
 * Captures a screenshot of a web page. Implementations must be platform agnostic (Desktop + Mobile).
 */
export interface ScreenshotProvider {
    readonly id: ScreenshotProviderId;
    readonly name: string;

    capture(url: URL, options: ScreenshotOptions): Promise<ScreenshotCapture>;
}

export function isImageResponse(response: RequestUrlResponse): boolean {
    return (response.headers['content-type'] ?? '').toLowerCase().startsWith('image/');
}

export function captureFromImageResponse(response: RequestUrlResponse, remoteUrl: string): ScreenshotCapture {
    const contentType = (response.headers['content-type'] ?? '').split(';')[0].trim();
    return {
        data: response.arrayBuffer,
        extension: getFileExtensionFromMimeType(contentType) || 'png',
        remoteUrl,
    };
}

export async function downloadImage(
    url: string,
    headers: Record<string, string> = {},
    remoteUrl: string = url,
): Promise<ScreenshotCapture> {
    const response = await requestUrl({ url, method: 'GET', headers, throw: false });
    if (response.status >= 400) {
        throw new Error(`Screenshot download failed with HTTP ${response.status}`);
    }
    if (!isImageResponse(response)) {
        throw new Error(
            `Screenshot service did not return an image (${response.headers['content-type'] ?? 'unknown'})`,
        );
    }

    return captureFromImageResponse(response, remoteUrl);
}
