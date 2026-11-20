import { ConversionProvider } from 'src/enums/conversionProvider';
import ReadItLaterPlugin from 'src/main';
import { HtmlConverter } from './HtmlConverter';
import { ReadabilityConverter } from './ReadabilityConverter';
import { DefuddleConverter } from './DefuddleConverter';
import { JinaReaderConverter } from './JinaReaderConverter';

/**
 * Holds every available HTML to markdown converter. Register future providers here.
 */
export class ConverterRegistry {
    private converters = new Map<ConversionProvider, HtmlConverter>();

    constructor(plugin: ReadItLaterPlugin) {
        this.register(new ReadabilityConverter());
        this.register(new DefuddleConverter());
        this.register(new JinaReaderConverter(plugin));
    }

    public register(converter: HtmlConverter): void {
        this.converters.set(converter.id, converter);
    }

    public get(provider: ConversionProvider): HtmlConverter {
        return this.converters.get(provider) ?? this.getDefault();
    }

    public getDefault(): HtmlConverter {
        return this.converters.get(ConversionProvider.Readability);
    }

    public getAll(): HtmlConverter[] {
        return Array.from(this.converters.values());
    }
}
