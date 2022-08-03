/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InputBoxOptions, QuickPickOptions, window } from 'vscode';

/**
 * Shows a pick list using window.showQuickPick().
 */
export async function showQuickPick() {
	let i = 0;
	const result = await window.showQuickPick(['eins', 'zwei', 'drei'], {
		placeHolder: 'eins, zwei or drei',
		title: "title",
		step: 2,
		totalSteps: 4,
		onDidSelectItem: item => window.showInformationMessage(`Focus ${++i}: ${item}`)
	} as QuickPickOptions);
	window.showInformationMessage(`Got: ${result}`);
}

/**
 * Shows an input box using window.showInputBox().
 */
export async function showInputBox() {
	const result = await window.showInputBox({
		value: 'abcdef',
		title: "title title",
		valueSelection: [2, 4],
		placeHolder: 'For example: fedcba. But not: 123',
		prompt: "prompt prompt",
		step: 3,
		totalSteps: 6,
		validateInput: text => {
			window.showInformationMessage(`Validating: ${text}`);
			return text === '123' ? 'Not 123!' : null;
		}
	} as InputBoxOptions);
	window.showInformationMessage(`Got: ${result}`);
}
