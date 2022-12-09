import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext) {

	const provider = new ColorsViewProvider(context.extensionUri);
	const channel = vscode.window.createOutputChannel('Webview Slow');
	channel.appendLine("Loading...");

	const delay = vscode.workspace.getConfiguration('foo').get<number>('webviewSlow', 0);

	await new Promise((resolve) => setTimeout(resolve, delay));
	channel.appendLine(`Loaded after ${delay}`);

	for (const color of (['red', 'blue', 'green'] as const)) {
		const content: string[] = []; 
		if (color !== 'red') {
		for (let i = 0; i < 60; i += 1) {
			content.push(`<div>${i}</div>`);
		}
	}
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			color,
			{
				resolveWebviewView(webviewView, context, token) {
					webviewView.webview.html = `<!DOCTYPE html>
					<html lang="en">
					<head>
						<meta charset="UTF-8">
						<style>
						body, html {
							background-color: ${color};
							color: white;
							border: white dashed 3px;
							box-sizing: border-box;
							width: 100%;
							height: 100%;
							margin: 0;
							padding: 0;
						}
						div{display:inline-block; margin: 0.4em;}
						</style>
		
						<title>Cat Colors</title>
					</head>
					<body>
						
					${content.join("")}
					</body>
					</html>`;
				},
			},
			{webviewOptions: {retainContextWhenHidden: color === "blue"}}
		));
	}

	context.subscriptions.push(
		vscode.window.createTreeView(
			"tree",
			{
				treeDataProvider: {
					getChildren(element) {
						if (element !== undefined) return [];
						const ret = [];
						for (let i = 0; i < 200; i++) {
							ret.push(
								new vscode.TreeItem(
									i.toString()

								)
							);
						}
						return ret;
					},
					getTreeItem(element) {
						return element;
					},

				} as vscode.TreeDataProvider<vscode.TreeItem>
			}
		)
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('calicoColors.addColor', () => {
			provider.addColor();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('calicoColors.clearColors', () => {
			provider.clearColors();
		}));
}

class ColorsViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'calicoColors.colorsView';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'colorSelected':
					{
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
						break;
					}
			}
		});
	}

	public addColor() {
		if (this._view) {
			this._view.show?.(true); // `show` is not implemented in 1.49 but is for 1.50 insiders
			this._view.webview.postMessage({ type: 'addColor' });
		}
	}

	public clearColors() {
		if (this._view) {
			this._view.webview.postMessage({ type: 'clearColors' });
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

		// Do the same for the stylesheet.
		const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
		const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
		const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

		// Use a nonce to only allow a specific script to be run.
		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading styles from our extension directory,
					and only allow scripts that have a specific nonce.
					(See the 'webview-sample' extension sample for img-src content security policy examples)
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">

				<title>Cat Colors</title>
			</head>
			<body>
				<ul class="color-list">
				</ul>

				<button class="add-color-button">Add Color</button>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
