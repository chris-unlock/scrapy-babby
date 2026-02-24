chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'EXTRACT') {
        const meta = {
            source_url: window.location.href,
            canonical_url: document.querySelector('link[rel="canonical"]')?.href || '',
            title: document.title,
            site_name: document.querySelector('meta[property="og:site_name"]')?.content || '',
            byline: '',
            published_at: document.querySelector('meta[name*="date"], meta[property="article:published_time"]')?.content || '',
            lang: document.documentElement.lang || '',
            word_count: 0,
            excerpt: ''
        };

        let html = '';
        let text = '';
        let markdown = '';

        // Attempt Mozilla Readability parsing if vendor script loaded
        try {
            if (typeof Readability !== 'undefined') {
                const docClone = document.cloneNode(true);
                const article = new Readability(docClone).parse();
                if (article) {
                    html = article.content;
                    text = article.textContent;
                    meta.byline = article.byline || '';
                    meta.title = article.title || meta.title;
                }
            }
        } catch (e) {
            console.log("Readability fallback", e);
        }

        if (!html) {
            html = document.body.innerHTML;
            text = document.body.innerText;
        }

        meta.word_count = text.split(/\s+/).filter(w => w.length > 0).length;
        meta.excerpt = text.substring(0, 200).replace(/\n/g, ' ').trim();

        // Attempt HTML to MD conversion if vendor script loaded
        try {
            if (typeof TurndownService !== 'undefined') {
                const turndownService = new TurndownService();
                markdown = turndownService.turndown(html);
            } else {
                markdown = text;
            }
        } catch (e) {
            markdown = text;
        }

        // Element collections
        const tmp = document.createElement('div');
        tmp.innerHTML = html;

        const links = Array.from(tmp.querySelectorAll('a')).map(a => a.href).filter(Boolean);
        const images = Array.from(tmp.querySelectorAll('img')).map(img => img.src).filter(Boolean);

        sendResponse({
            meta,
            markdown,
            text,
            links: [...new Set(links)],
            images: [...new Set(images)]
        });
    }
    return true;
});
