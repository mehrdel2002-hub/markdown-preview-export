import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as puppeteer from 'puppeteer';
import { getHtmlForWebview, getChromeExecutableCandidates } from './helpers';

let browserInstance: puppeteer.Browser | null = null;
let browserInitPromise: Promise<puppeteer. Browser> | null = null;

async function initBrowser(): Promise<puppeteer.Browser> {
    if (browserInstance && browserInstance.connected) {
        return browserInstance;
    }

    if (browserInitPromise) {
        return browserInitPromise;
    }

    browserInitPromise = (async () => {
        const candidates = getChromeExecutableCandidates();
        let lastError: Error | null = null;

        // Strategy 1: Try puppeteer's bundled Chromium
        try {
            console.log('Attempting to launch bundled Chromium...');
            const browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ]
            });
            browserInstance = browser;
            console.log('Successfully launched bundled Chromium');
            return browser;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            console. error('Failed to launch bundled Chromium:', lastError. message);
        }

        // Strategy 2: Try system Chrome/Chromium installations
        for (const executablePath of candidates) {
            try {
                if (! fs.existsSync(executablePath)) {
                    console. log(`Skipping non-existent path: ${executablePath}`);
                    continue;
                }

                console.log(`Attempting to launch browser at: ${executablePath}`);
                const browser = await puppeteer.launch({
                    executablePath,
                    headless: true,
                    args:  [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-gpu'
                    ]
                });
                browserInstance = browser;
                console.log(`Successfully launched browser at: ${executablePath}`);
                return browser;
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(`Failed to launch browser at ${executablePath}:`, lastError.message);
            }
        }

        // If all strategies failed, throw the last error
        const errorMessage = lastError
            ? `Failed to launch browser.  Last error: ${lastError.message}. Please ensure Chrome or Chromium is installed. `
            : 'Failed to launch browser. No executable paths were tried.';

        throw new Error(errorMessage);
    })();

    try {
        const browser = await browserInitPromise;
        return browser;
    } finally {
        browserInitPromise = null;
    }
}

async function getBrowserInstance(): Promise<puppeteer.Browser> {
    if (browserInstance && browserInstance.connected) {
        return browserInstance;
    }
    return await initBrowser();
}

async function cleanupBrowser() {
    if (browserInstance) {
        try {
            await browserInstance.close();
            console.log('Browser instance closed successfully');
        } catch (error) {
            console.error('Error closing browser:', error);
        } finally {
            browserInstance = null;
        }
    }
}

export function activate(context: vscode. ExtensionContext) {
    console.log('Markdown Rich Preview & Export is now active!');

    // Register the command
    const disposable = vscode.commands.registerCommand('markdown-rich-preview.showPreview', () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a markdown file first');
            return;
        }

        // Create and show webview panel
        const panel = vscode. window.createWebviewPanel(
            'markdown-rich-preview',
            `Preview:  ${path.basename(editor.document.fileName)}`,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.file(path.join(context.extensionPath, 'media'))
                ]
            }
        );

        // Initial update
        updateContent(panel, editor.document, context);

        // Update content when the document changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e. document.uri.toString() === editor.document.uri. toString()) {
                updateContent(panel, e.document, context);
            }
        });

        // Clean up resources when panel is closed
        panel.onDidDispose(() => {
            changeDocumentSubscription. dispose();
        });
    });

    context.subscriptions.push(disposable);

    // Register the export to HTML command
    const exportToHtmlCommand = vscode.commands.registerCommand('markdown-rich-preview.exportToHtml', async () => {
        const editor = vscode. window.activeTextEditor;

        if (!editor || editor. document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a Markdown file first to export.');
            return;
        }

        const markdownContent = editor.document.getText();
        // For exported HTML we can reference local files via file://
        const assetBaseForExport = `file://${path.join(context.extensionPath, 'assets', 'vendor')}`;
        const htmlContent = getHtmlForWebview(markdownContent, false, assetBaseForExport);

        const defaultFileName = path.basename(editor.document.fileName, path.extname(editor.document. fileName)) + '.html';
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(editor.document.uri.fsPath, '..', defaultFileName)),
            filters: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'HTML Files': ['html']
            }
        });

        if (uri) {
            try {
                fs.writeFileSync(uri.fsPath, htmlContent, 'utf8');
                vscode.window.showInformationMessage(`Successfully exported HTML to ${uri.fsPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to export HTML: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    });

    context.subscriptions.push(exportToHtmlCommand);

    // Register the export to PDF command
    const exportToPdfCommand = vscode.commands.registerCommand('markdown-rich-preview.exportToPdf', async () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showErrorMessage('Please open a Markdown file first to export to PDF.');
            return;
        }

        const markdownContent = editor.document.getText();
        // Pass true for isForPdf to include PDF-specific styles
        // For PDF export we prefer absolute file URIs so Puppeteer can load local assets
        const assetBaseForExport = `file://${path.join(context.extensionPath, 'assets', 'vendor')}`;
        const htmlContent = getHtmlForWebview(markdownContent, true, assetBaseForExport);

        const defaultFileName = path.basename(editor. document.fileName, path.extname(editor.document.fileName)) + '.pdf';
        const uri = await vscode.window.showSaveDialog({
            defaultUri:  vscode.Uri.file(path.join(editor.document.uri.fsPath, '..', defaultFileName)),
            filters: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'PDF Files': ['pdf']
            }
        });

        if (uri) {
            let page: puppeteer.Page | null = null;
            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation. Notification,
                    title: 'Generating PDF...',
                    cancellable: false
                }, async () => {
                    try {
                        const browser = await getBrowserInstance();
                        page = await browser.newPage();

                        // Set a timeout for page operations
                        page.setDefaultNavigationTimeout(30000);

                        // Use domcontentloaded for faster rendering since we're not waiting for network resources
                        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

                        // صبر برای رندر شدن نمودارهای Mermaid
                        try {
                            await page. waitForFunction(() => (window as any).mermaidReady === true, {
                                timeout: 10000
                            });
                            console.log('Mermaid diagrams rendered successfully');
                        } catch (e) {
                            console. log('Mermaid rendering timeout or no mermaid diagrams present');
                        }

                        // Wait for any remaining resources to load (with a timeout)
                        try {
                            await page.waitForNetworkIdle({ timeout:  2000 });
                        } catch (e) {
                            // Ignore timeout errors, proceed with what we have
                        }

                        const pdfBuffer = await page.pdf({
                            format: 'A4',
                            printBackground:  true,
                            margin: {
                                top: '2mm',
                                right: '2mm',
                                bottom: '2mm',
                                left:  '2mm'
                            },
                            preferCSSPageSize: true
                        });

                        fs.writeFileSync(uri.fsPath, pdfBuffer);
                        vscode.window. showInformationMessage(`Successfully exported PDF to ${path.basename(uri.fsPath)}`);
                    } catch (error) {
                        vscode.window.showErrorMessage(`Failed to export PDF: ${error instanceof Error ? error.message : String(error)}`);
                        console.error('PDF Export Error:', error);
                        throw error; // Re-throw to ensure the progress indicator shows the error
                    } finally {
                        if (page && ! page.isClosed()) {
                            await page.close().catch(console.error);
                        }
                    }
                });
            } catch (error) {
                console.error('Error in PDF export:', error);
                // Don't close the browser here as we want to reuse it
            }
        }
    });

    context.subscriptions.push(exportToPdfCommand);
}

function updateContent(panel: vscode. WebviewPanel, document: vscode.TextDocument, context: vscode.ExtensionContext) {
    // Get the markdown content
    const markdownContent = document.getText();

    // Compute asset base for webview resources using asWebviewUri
    let assetBase;
    try {
        const vendorFolder = vscode.Uri.file(path. join(context.extensionPath, 'assets', 'vendor'));
        assetBase = panel.webview.asWebviewUri(vendorFolder).toString();
    } catch (e) {
        // fallback to undefined (CDN)
        assetBase = undefined;
    }

    // Convert markdown to HTML, preferring bundled assets for the webview
    const html = getHtmlForWebview(markdownContent, false, assetBase);

    // Update webview content
    panel.webview.html = html;
}

export function deactivate() {
    void cleanupBrowser();
}