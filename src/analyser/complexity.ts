export { get_complexity_and_depth }

import ts from "typescript"

function get_complexity_and_depth(source: ts.Node, depth: number = 1): [ number, number ] {
    let score = syntax_score[source.kind] || 0
    let complexity = score * (depth + 10)
    let max_depth = depth

    ts.forEachChild(source, node => {
        const [ c, d ] = get_complexity_and_depth(node, depth)
        complexity += c
        if (d > max_depth) max_depth = d
    })

    return [ complexity, max_depth ]
}

// See: https://github.com/microsoft/TypeScript/blob/master/src/compiler/scanner.ts
const syntax_score: Partial<Record<ts.SyntaxKind, number>> = {
    // keywords
    [ts.SyntaxKind.AnyKeyword]: 10,
    [ts.SyntaxKind.AsKeyword]: 10,
    [ts.SyntaxKind.CaseKeyword]: 1,
    [ts.SyntaxKind.ClassKeyword]: 2,
    [ts.SyntaxKind.ContinueKeyword]: 1,
    [ts.SyntaxKind.ConstKeyword]: 1,
    [ts.SyntaxKind.DeleteKeyword]: 10,
    [ts.SyntaxKind.ElseKeyword]: 2,
    [ts.SyntaxKind.ForKeyword]: 5,
    [ts.SyntaxKind.FunctionKeyword]: 2,
    [ts.SyntaxKind.GetKeyword]: 2,
    [ts.SyntaxKind.IfKeyword]: 3,
    [ts.SyntaxKind.ImplementsKeyword]: 7,
    [ts.SyntaxKind.ImportKeyword]: 2,
    [ts.SyntaxKind.LetKeyword]: 2,
    [ts.SyntaxKind.NewKeyword]: 2,
    [ts.SyntaxKind.RequireKeyword]: 2,
    [ts.SyntaxKind.SetKeyword]: 3,
    [ts.SyntaxKind.SwitchKeyword]: 4,
    [ts.SyntaxKind.ThisKeyword]: 1,
    [ts.SyntaxKind.TryKeyword]: 4,
    [ts.SyntaxKind.VarKeyword]: 2,
    [ts.SyntaxKind.WhileKeyword]: 5,
    [ts.SyntaxKind.WithKeyword]: 20, // do not use with, ever
    [ts.SyntaxKind.YieldKeyword]: 2,

    // tokens
    [ts.SyntaxKind.QuestionToken]: 3, // ternary
}

