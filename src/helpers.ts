import * as process from 'process';
import { marked } from 'marked';
import type { MarkedOptions } from 'marked';
import hljs from 'highlight.js';
import twemoji from 'twemoji';
import markedKatex from 'marked-katex-extension';
import DOMPurify from 'isomorphic-dompurify';

// اطمینان حاصل کنید که این تابع export شده است
export function getChromeExecutableCandidates(): string[] {
    const candidates:  Array<string> = [];
    const platform = process.platform;
    if (platform === 'linux') {
        candidates.push(
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            '/opt/google/chrome/chrome'
        );
    } else if (platform === 'darwin') {
        candidates.push(
            '/Applications/Google Chrome. app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/Applications/Comet. app/Contents/MacOS/Comet',
            '/Applications/Dia.app/Contents/MacOS/Dia'
        );
    } else if (platform === 'win32') {
        candidates.push(
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Google/Chrome/Application/chrome. exe',
            'C:/Program Files/Chromium/Application/chrome.exe'
        );
    }

    const envPaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        process.env.CHROME_PATH
    ].filter((p): p is string => !!p && p.length > 0);
    return [... envPaths, ...candidates]. filter((p, idx, arr) => arr.indexOf(p) === idx);
}

interface ExtendedMarkedOptions extends MarkedOptions {
    highlight?: (code: string, lang:  string) => string;
    langPrefix?: string;
    gfm?: boolean;
    breaks?: boolean;
    smartLists?: boolean;
    smartypants?: boolean;
    xhtml?: boolean;
}

export function getHtmlForWebview(markdownContent: string, isForPdf: boolean = false, assetBase?: string): string {
    const renderer = new marked.Renderer();

    // Custom code block renderer که Mermaid را شناسایی می‌کند
    renderer.code = (code:  string, language: string | undefined) => {
        const lang = language || 'plaintext';

        // اگر زبان mermaid بود، نمودار mermaid رندر کنید
        if (lang === 'mermaid') {
            return `
                <div class="mermaid-container">
                    <pre class="mermaid">${code}</pre>
                </div>
            `;
        }

        // در غیر این صورت، رندر معمولی code block
        try {
            const validLanguage = hljs.getLanguage(lang) ? lang : 'plaintext';
            const highlightedCode = hljs.highlight(code, { language: validLanguage }).value;

            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="language">${lang}</span>
                        <button class="copy-button" onclick="copyToClipboard(this)" title="Copy to clipboard">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <pre><code class="hljs language-${validLanguage}">${highlightedCode}</code></pre>
                </div>
            `;
        } catch (error) {
            console.error(`Error highlighting code: ${error}`);
            return `
                <div class="code-block">
                    <div class="code-header">
                        <span class="language">${lang}</span>
                        <button class="copy-button" onclick="copyToClipboard(this)" title="Copy to clipboard">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                    <pre><code>${code}</code></pre>
                </div>
            `;
        }
    };

    const markedOptions: ExtendedMarkedOptions = {
        renderer,
        highlight: function(code: string, lang: string) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs. highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        gfm: true,
        breaks:  false,
        smartLists: true,
        smartypants: false,
        xhtml: false
    };

    marked.use(markedKatex());
    marked.setOptions(markedOptions);

    let htmlContent = marked. parse(markdownContent) as string;

    // Sanitize - اضافه کردن تگ‌های مجاز برای Mermaid SVG
    htmlContent = DOMPurify.sanitize(htmlContent, {
        USE_PROFILES: { html: true },
        ADD_TAGS: [
            'math', 'semantics', 'mrow', 'mi', 'mo', 'mn', 'msup', 'sub', 'sup', 'annotation',
            'svg', 'path', 'rect', 'g', 'text', 'tspan', 'defs', 'marker', 'line',
            'polyline', 'polygon', 'circle', 'ellipse', 'foreignObject'
        ],
        ADD_ATTR: [
            'xmlns', 'viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y',
            'width', 'height', 'rx', 'ry', 'id', 'class', 'transform', 'cx', 'cy',
            'r', 'x1', 'y1', 'x2', 'y2', 'points', 'font-family', 'font-size',
            'text-anchor', 'dominant-baseline', 'style', 'marker-start', 'marker-end'
        ],
    });

    if (isForPdf) {
        htmlContent = twemoji.parse(htmlContent, {
            folder: 'svg',
            ext: '.svg',
            base: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/'
        }) as string;
    }

    const vendor = assetBase ? assetBase. replace(/\/$/, '') : undefined;

    return `<! DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown:  Rich Preview</title>
    <link rel="stylesheet" href="${vendor ?  vendor + '/highlight/styles/github-dark.min.css' : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/styles/github-dark.min.css'}">
    <link rel="stylesheet" href="${vendor ?  vendor + '/katex/katex.min.css' : 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min. css'}">
    
    <!-- اضافه کردن Mermaid -->
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        
        mermaid.initialize({ 
            startOnLoad: true,
            theme: 'default',
            securityLevel: 'loose',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });
        
        // برای PDF export، صبر کنید تا همه نمودارها رندر شوند
        window.addEventListener('load', async () => {
            try {
                await mermaid.run({
                    querySelector: '.mermaid'
                });
                // سیگنال به Puppeteer که رندر تمام شده
                window.mermaidReady = true;
            } catch (error) {
                console.error('Mermaid rendering error:', error);
                window.mermaidReady = true;
            }
        });
    </script>
    
    <script src="${vendor ? vendor + '/highlight/highlight.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.8.0/highlight.min.js'}"></script>
    <script>
        // Initialize highlight.js
        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('pre code').forEach((block) => {
                if (typeof hljs !== 'undefined' && hljs.highlightElement) {
                    hljs. highlightElement(block);
                }
            });
        });

        // Copy to clipboard function
        function copyToClipboard(button) {
            const codeBlock = button.closest('.code-block');
            const code = codeBlock.querySelector('code').textContent;
            navigator.clipboard.writeText(code).then(() => {
                const originalText = button.textContent;
                button.textContent = 'Copied!';
                button.style.backgroundColor = '#4CAF50';
                button.style.color = 'white';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.style.backgroundColor = '';
                    button.style.color = '';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:  ', err);
            });
        }
    </script>
    <style>
        ${isForPdf ? `
        @media print {
            h1, h2, h3 {
                page-break-before: auto;
            }
            pre, . code-block, figure, table, . mermaid-container {
                page-break-inside: avoid;
            }
            hr {
                page-break-after: auto;
            }
        }
        ` : ''}
       </style>
    <style>
        /* تنظیمات کلی صفحه */
        body {
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.6;
            margin: 5%;
            max-width: max-content;
            padding: 10px;
            background-color: #ffffff;
            color: #24292e;
            direction: rtl;
            text-align: right;
        }

        h1, h2, h3 {
            border-bottom: 1px solid #eaecef;
            padding-bottom: 0.3em;
            margin-top: 2em;
            margin-bottom: 1em;
        }

        /* استایل بلوک کد */
        .code-block {
            position: relative;
            margin: 1.5em 0;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
            overflow: hidden;
            background-color: #f6f8fa;
        }

        .code-header {
            display: flex;
            direction: ltr;
            justify-content: space-between;
            align-items: center;
            padding: 0.6rem 1rem;
            background-color: #f1f3f5;
            border-bottom: 1px solid #e1e4e8;
            font-size: 0.9em;
        }

        .language {
            color: #586069;
            font-weight: 500;
        }

        .copy-button {
            padding: 0.3rem 0.7rem;
            font-size: 0.85em;
            color: #24292e;
            background: transparent;
            border: 1px solid #d1d5da;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .copy-button:hover {
            background-color: #e9ecef;
            border-color: #c1c4c8;
        }

        pre {
            margin: 0;
            padding: 1rem;
            overflow-x: auto;
            direction: ltr;
            text-align: left;
        }

        pre code {
            font-family: SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace;
            font-size: 0.95em;
        }

        /* اطمینان از خوانایی در RTL */
        code {
            direction: ltr;
            display: block;
        }
        img { display: block; max-width: fit-content; height: auto; margin-left: auto; margin-right: auto;
        max-width: 100%; box-sizing: content-box; }
        img.emoji { height: 1em; width: 1em; margin: 0 .05em 0 .1em; vertical-align: -0.1em; display: inline; }
         h1, h2, h3, h4, h5, h6 { font-weight: 600; margin-top: 24px; margin-bottom: 16px; line-height: 1.25; } 
         h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 0.67em 0; }
          h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; margin-top: 1.5em; }
           h3 { font-size: 1.25em; margin-top: 1.25em; } h4 { font-size: 1em; margin-top: 1em; }
            a { color: #0366d6; text-decoration: none; } a:hover { text-decoration: underline; }
             strong { font-weight: 600; }
    </style> 
</head>
<body>
    ${htmlContent}
</body>
</html>`;
}