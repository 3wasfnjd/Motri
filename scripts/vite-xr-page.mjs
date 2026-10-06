import { readFile } from 'node:fs/promises'

// Reuse Motri's DOM shell without maintaining a second copy of its 800-line UI.
// The base URL also keeps every runtime GLB/audio/decoder URL on the main asset path.
export function xrHTML(html, entry, styles = []) {
    return html
        .replace('<head>', '<head>\n    <base href="../">')
        .replace('<title>موتري</title>', '<title>موتري XR — Meta Quest</title>')
        .replace('<html lang="ar" dir="rtl">', '<html lang="ar" dir="rtl" class="motri-xr">')
        .replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, '')
        .replace('</head>', `${styles.map(path => `<link rel="stylesheet" href="./${path}">`).join('\n')}\n<style>.motri-xr .game>:not(canvas){display:none!important}</style>\n</head>`)
        .replace('</body>', `<script type="module" src="${entry}"></script>\n</body>`)
}

export function motriXRPage() {
    return {
        name: 'motri-xr-page',
        enforce: 'post',
        configureServer(server) {
            server.middlewares.use(async (req, res, next) => {
                const path = req.url.split('?')[0]
                if(path === '/xr') { res.writeHead(302, { Location: '/xr/' }); res.end(); return }
                if(path !== '/xr/' && path !== '/xr/index.html') return next()
                try {
                    const html = await readFile(new URL('../sources/index.html', import.meta.url), 'utf8')
                    const transformed = await server.transformIndexHtml('/index.html', xrHTML(html, '/xr/index.js'))
                    res.setHeader('Content-Type', 'text/html; charset=utf-8')
                    res.end(transformed)
                } catch(error) { next(error) }
            })
        },
        generateBundle(_options, bundle) {
            const root = bundle['index.html']
            const entry = Object.values(bundle).find(item => item.type === 'chunk' && item.isEntry && item.name === 'xr')
            if(!root || !entry) throw new Error('XR page requires the main HTML and XR entry')
            this.emitFile({ type: 'asset', fileName: 'xr/index.html', source: xrHTML(root.source, `./${entry.fileName}`, [...entry.viteMetadata.importedCss]) })
        }
    }
}
