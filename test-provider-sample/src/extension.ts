import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { getContentFromFilesystem, MarkdownTestData, TestCase, testData, TestFile } from './testTree';

export async function activate(context: vscode.ExtensionContext) {
	const ctrl = vscode.tests.createTestController('mathTestController', 'Markdown Math');
	context.subscriptions.push(ctrl);

	const runHandler = (request: vscode.TestRunRequest, cancellation: vscode.CancellationToken) => {
		const queue: { test: vscode.TestItem; data: TestCase }[] = [];
		const run = ctrl.createTestRun(request);
		// map of file uris to statements on each line:
		const coveredLines = new Map</* file uri */ string, (vscode.StatementCoverage | undefined)[]>();

		const discoverTests = async (tests: Iterable<vscode.TestItem>) => {
			for (const test of tests) {
				if (request.exclude?.includes(test)) {
					continue;
				}

				const data = testData.get(test);
				if (data instanceof TestCase) {
					run.enqueued(test);
					queue.push({ test, data });
				} else {
					if (data instanceof TestFile && !data.didResolve) {
						await data.updateFromDisk(ctrl, test);
					}

					await discoverTests(gatherTestItems(test.children));
				}

				if (test.uri && !coveredLines.has(test.uri.toString())) {
					try {
						const lines = (await getContentFromFilesystem(test.uri)).split('\n');
						coveredLines.set(
							test.uri.toString(),
							lines.map((lineText, lineNo) =>
								lineText.trim().length ? new vscode.StatementCoverage(0, new vscode.Position(lineNo, 0)) : undefined
							)
						);
					} catch {
						// ignored
					}
				}
			}
		};

		const runTestQueue = async () => {
			for (const { test, data } of queue) {
				run.appendOutput(`Running ${test.id}\r\n`);
				if (cancellation.isCancellationRequested) {
					run.skipped(test);
				} else {
					run.started(test);
					await data.run(test, run);
				}

				const lineNo = test.range!.start.line;
				const fileCoverage = coveredLines.get(test.uri!.toString());
				if (fileCoverage) {
					fileCoverage[lineNo]!.executionCount++;
				}

				run.appendOutput(`Completed ${test.id}\r\n`);
			}

			run.end();
		};

		run.coverageProvider = {
			provideFileCoverage() {
				const coverage: vscode.FileCoverage[] = [];
				for (const [uri, statements] of coveredLines) {
					coverage.push(
						vscode.FileCoverage.fromDetails(
							vscode.Uri.parse(uri),
							statements.filter((s): s is vscode.StatementCoverage => !!s)
						)
					);
				}

				return coverage;
			},
		};

		discoverTests(request.include ?? gatherTestItems(ctrl.items)).then(runTestQueue);
	};
	const fitItems  = async (_item: vscode.TestItem|undefined) => {
		const eg = ctrl.createTestItem('eg', 'Error');
		eg.error = randomUUID();
		const eg2 = ctrl.createTestItem('eg2', 'Sort sortText');
		for (let i = 0; i < 3; i++) {
			const item = ctrl.createTestItem(`eg2-${i}`, `Item ${i}`);
			const sort = randomUUID().substring(0, 3);
			item.label += ` ${sort}`;
			item.sortText = sort;
			eg2.children.add(item);
		}
		const eg3 = ctrl.createTestItem('eg3', 'Sort label');
		for (let i = 0; i < 3; i++) {
			const item = ctrl.createTestItem(`eg3-${i}`, `Item`);
			const sort = randomUUID().substring(0, 3);
			item.label += ` ${sort} ${i}`;
			eg3.children.add(item);
		}
		ctrl.items.replace([eg, eg2, eg3]);

		// if (!item) {
		// 	context.subscriptions.push(...startWatchingWorkspace(ctrl));
		// 	return;
		// }

		// const data = testData.get(item);
		// if (data instanceof TestFile) {
		// 	await data.updateFromDisk(ctrl, item);
		// }
	};

	ctrl.refreshHandler = async () => {
		await fitItems(undefined);
		//await Promise.all(getWorkspaceTestPatterns().map(({ pattern }) => findInitialFiles(ctrl, pattern)));
	};

	ctrl.createRunProfile('Run Tests', vscode.TestRunProfileKind.Run, runHandler, true);

	ctrl.resolveHandler = fitItems;


	function updateNodeForDocument(e: vscode.TextDocument) {
		if (e.uri.scheme !== 'file') {
			return;
		}

		if (!e.uri.path.endsWith('.md')) {
			return;
		}

		const { file, data } = getOrCreateFile(ctrl, e.uri);
		data.updateFromContents(ctrl, e.getText(), file);
	}

	for (const document of vscode.workspace.textDocuments) {
		updateNodeForDocument(document);
	}

	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(updateNodeForDocument),
		vscode.workspace.onDidChangeTextDocument(e => updateNodeForDocument(e.document)),
	);
}

function getOrCreateFile(controller: vscode.TestController, uri: vscode.Uri) {
	const existing = controller.items.get(uri.toString());
	if (existing) {
		return { file: existing, data: testData.get(existing) as TestFile };
	}

	const file = controller.createTestItem(uri.toString(), uri.path.split('/').pop()!, uri);
	controller.items.add(file);

	const data = new TestFile();
	testData.set(file, data);

	file.canResolveChildren = true;
	return { file, data };
}

function gatherTestItems(collection: vscode.TestItemCollection) {
	const items: vscode.TestItem[] = [];
	collection.forEach(item => items.push(item));
	return items;
}

function getWorkspaceTestPatterns() {
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	return vscode.workspace.workspaceFolders.map(workspaceFolder => ({
		workspaceFolder,
		pattern: new vscode.RelativePattern(workspaceFolder, '**/*.md'),
	}));
}

async function findInitialFiles(controller: vscode.TestController, pattern: vscode.GlobPattern) {
	for (const file of await vscode.workspace.findFiles(pattern)) {
		getOrCreateFile(controller, file);
	}
}

function startWatchingWorkspace(controller: vscode.TestController) {
	return getWorkspaceTestPatterns().map(({ workspaceFolder, pattern }) => {
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		watcher.onDidCreate(uri => getOrCreateFile(controller, uri));
		watcher.onDidChange(uri => {
			const { file, data } = getOrCreateFile(controller, uri);
			if (data.didResolve) {
				data.updateFromDisk(controller, file);
			}
		});
		watcher.onDidDelete(uri => controller.items.delete(uri.toString()));

		findInitialFiles(controller, pattern);

		return watcher;
	});
}
