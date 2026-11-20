import { Note } from './Note';
import { ParseOptions } from './Parser';
import WebsiteParser from './WebsiteParser';

export default class GithubParser extends WebsiteParser {
    private PATTERN = /^https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)\/?/i;

    test(url: string): boolean {
        return this.isValidUrl(url) && this.PATTERN.test(url);
    }

    async prepareNote(url: string, options?: ParseOptions): Promise<Note> {
        const originUrl = new URL(url);
        const document = await this.getDocument(originUrl);

        // Extract readme content (may be null on issue/PR pages, profile pages, etc.)
        const readme = document.querySelector('article.markdown-body');
        if (readme) {
            // Remove anchor elements causing to show empty links
            readme.querySelectorAll('[aria-label^="Permalink:"]').forEach((anchorElement) => anchorElement.remove());
            document.querySelector('body').innerHTML = readme.outerHTML;
        }

        return this.makeNote(document, originUrl, options);
    }
}
