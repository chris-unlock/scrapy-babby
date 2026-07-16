// Folder slug from the URL path: /services/web-design/ -> "services-web-design".
// Query strings are ignored; the homepage (empty path) becomes "home".
export function urlToSlug(urlStr) {
    try {
        let path = new URL(urlStr).pathname;
        try { path = decodeURIComponent(path); } catch (e) { /* keep encoded form */ }
        const joined = path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '-');
        if (!joined) return 'home';
        return slugify(joined);
    } catch (e) {
        return 'home';
    }
}

export function slugify(text) {
    if (!text) return 'untitled';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '')
        .substring(0, 50);
}
