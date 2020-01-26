'use strict';
import * as vscode from 'vscode';
import { Range, Position } from 'vscode';
import { run_cmd } from './utils';

export class Formatter {
  constructor(private logger: vscode.OutputChannel) {}

  instantFormat(e: vscode.TextDocumentChangeEvent) {
    if (vscode.window.activeTextEditor === undefined) {
      return;
    }
    if (e.contentChanges.length === 0) {
      //protect against empty contentChanges arrays...
      return;
    }
    const text = e.contentChanges[0].text;
    const rangeLength = e.contentChanges[0].rangeLength;
    const line = e.contentChanges[0].range.start.line;
    if (
      text === '.' &&
      rangeLength === 0 &&
      vscode.workspace.getConfiguration('beancount')['instantAlignment']
    ) {
      // the user just inserted a new decimal point
      this.alignSingleLine(line);
    }
    if (text === '\n' && rangeLength === 0) {
      // the user just inserted a new line
      const lineText = vscode.window.activeTextEditor.document.lineAt(line)
        .text;
      const transRegex = /([0-9]{4})([\-|/])([0-9]{2})([\-|/])([0-9]{2}) (\*|\!)/;
      const transArray = transRegex.exec(lineText);
      if (transArray != null) {
        // the user inserted a new line under a transaction
        const r = new Range(
          new Position(line + 1, 0),
          new Position(line + 1, 0)
        );
        const tabSize = vscode.window.activeTextEditor.options
          .tabSize as number;
        const edit = new vscode.TextEdit(r, ' '.repeat(tabSize));
        const wEdit = new vscode.WorkspaceEdit();
        wEdit.set(vscode.window.activeTextEditor.document.uri, [edit]);
        vscode.workspace.applyEdit(wEdit); // insert spaces for a new posting line
      }
    }
  }

  alignSingleLine(line: number) {
    if (vscode.window.activeTextEditor === undefined) {
      return;
    }
    const activeEditor = vscode.window.activeTextEditor;
    const originalText = activeEditor.document.lineAt(line).text;
    // save the original text length and cursor position
    const originalCursorPosition = activeEditor.selection.active;
    const originalLength = originalText.length;
    // find an account name first
    const accountRegex = /([A-Z][A-Za-z0-9\-]+)(:)/;
    const accountArray = accountRegex.exec(originalText);
    if (accountArray === null) {
      return;
    } // A commodity record always starts with an account.
    // find a number with a decimal point
    const amountRegex = /([\-|\+]?)(?:\d|\d[\d,]*\d)(\.)/;
    const amountArray = amountRegex.exec(originalText);
    if (amountArray === null) {
      return;
    }
    const contentBefore = ('s' + originalText.substring(0, amountArray.index))
      .trim()
      .substring(1);
    let contentAfterAmount = '';
    if (amountArray.index + amountArray[0].length < originalText.length) {
      // get all the contents after the decimal point
      contentAfterAmount = originalText.substring(
        amountArray.index + amountArray[0].length
      );
    }
    const targetDotPosition =
      vscode.workspace.getConfiguration('beancount')['separatorColumn'] - 1;
    const whiteLength =
      targetDotPosition - contentBefore.length - (amountArray[0].length - 1);
    if (whiteLength > 0) {
      const newText =
        contentBefore +
        new Array(whiteLength + 1).join(' ') +
        amountArray[0] +
        contentAfterAmount;
      const r = new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, originalText.length)
      );
      const edit = new vscode.TextEdit(r, newText);
      const wEdit = new vscode.WorkspaceEdit();
      wEdit.set(activeEditor.document.uri, [edit]);
      vscode.workspace.applyEdit(wEdit).then(value => {
        if (value && line === originalCursorPosition.line) {
          const newPositionChar =
            1 +
            originalCursorPosition.character +
            newText.length -
            originalLength;
          activeEditor.selection = new vscode.Selection(
            line,
            newPositionChar,
            line,
            newPositionChar
          );
        }
      });
    }
  }

  async provideDocumentRangeFormattingEdits(
    document: vscode.TextDocument,
    range: vscode.Range,
    options: vscode.FormattingOptions,
    token: vscode.CancellationToken
  ) {
    const wholeLineRange = new vscode.Range(
      range.start.with(undefined, 0),
      new vscode.Position(range.end.line + 1, 0),
    );
    const text = document.getText(wholeLineRange);

    const python3Path = vscode.workspace.getConfiguration('beancount')['python3Path'];
    const separatorColumn = vscode.workspace.getConfiguration('beancount')['separatorColumn'];
    // bean-format doesn't support align by decimal point. Assume two decimal places here.
    const currencyColumn = separatorColumn + 4;
    const pyArgs = ['-m', 'beancount.scripts.format', '-c', `${currencyColumn}`];
    this.logger.appendLine(
      `running ${python3Path} ${pyArgs} to format file...`
    );
    const formattedText = await run_cmd(
      python3Path,
      pyArgs,
      undefined,
      text,
      str => this.logger.append(str)
    );
    return [
      vscode.TextEdit.replace(wholeLineRange, formattedText),
    ];
  }
}
