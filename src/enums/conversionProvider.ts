import { DropdownEnumOption } from './enum';

/**
 * Providers that can convert a web page into markdown.
 * To add a new provider: add a value here, implement `HtmlConverter` and register it in `ConverterRegistry`.
 */
export enum ConversionProvider {
    Readability = 'readability',
    Defuddle = 'defuddle',
    JinaReader = 'jinaReader',
}

export function getConversionProviderOptions(): DropdownEnumOption[] {
    return [
        { label: 'Mozilla Readability (built-in default)', option: ConversionProvider.Readability },
        { label: 'Defuddle', option: ConversionProvider.Defuddle },
        { label: 'Jina Reader API', option: ConversionProvider.JinaReader },
    ];
}
