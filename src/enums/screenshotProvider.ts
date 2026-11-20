import { DropdownEnumOption } from './enum';

/**
 * Services that can capture a screenshot of a web page.
 * To add a new provider: add a value here, implement `ScreenshotProvider` and register it in `ScreenshotService`.
 */
export enum ScreenshotProvider {
    None = 'none',
    JinaReader = 'jinaReader',
    Microlink = 'microlink',
    CustomUrl = 'customUrl',
}

export function getScreenshotProviderOptions(): DropdownEnumOption[] {
    return [
        { label: 'Disabled', option: ScreenshotProvider.None },
        { label: 'Jina Reader API', option: ScreenshotProvider.JinaReader },
        { label: 'Microlink API', option: ScreenshotProvider.Microlink },
        { label: 'Custom URL template', option: ScreenshotProvider.CustomUrl },
    ];
}
