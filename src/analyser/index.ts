#!/usr/bin/env node

import fs from "fs"
import ts from "typescript"
import path from "path"
import { exec } from "child_process"
import { program } from "commander"
import { get_complexity_and_depth } from "./complexity"
import { Data, Files } from "../types"

program
    .option("--root <file>", "Path to your index.ts file", "src/index.ts")
    .option("--tsconfig <file>", "Path to your tsconfig.json", "tsconfig.json")
    .option("--jest-coverage <file>", "Path to Jest json coverage report. Usually at \"./coverage/coverage-summary.json\"")
    .option("--output <file>", "output file", "ts_analysis.json")
    .parse(process.argv)

const tsconfig_str = fs.readFileSync(program.tsconfig).toString()
const options: ts.CompilerOptions = JSON.parse(tsconfig_str).compilerOptions || {}

const files_lookup = new Map<string, number>() // file_name -> index
const processed_files = new Set<number>()

const data: Data = {
    files: {
        file_name: [],
        file_path: [],
        line_count: [],
        imports: [],
        imports_node_modules: [],
        imports_direct: [],
        imports_depth: [],
        complexity: [],
        max_depth: [],
    },
}

analyse().then(() => {
    const content = JSON.stringify(data, null, 4)

    // Write to user defined output
    fs.writeFileSync(program.output, content)

    // Write to server
    fs.writeFileSync(path.join(__dirname, "..", "..", "server", "data.js"), `export default ${content}`)
})

async function analyse() {
    await process_file(program.root, options, data) // Mutates data

    /**
     * Make a short version, eg foo/bar.ts
     */
    const common_prefix = data.files.file_path.reduce((prefix, file_path) => {
        let common = ""
        for (let i = 0; i < prefix.length; i++) {
            if (prefix[i] !== file_path[i]) return common
            common += prefix[i]
        }
        return common
    })
    data.files.file_name = data.files.file_path.map(file_path =>
        file_path.slice(common_prefix.length)
    )

    /**
     * Walk imports, to find:
     *  1. How many times are each file imported
     *  2. What is the deepest level the imports run from the root?
     */
    walk_imports(0, 0, data.files)

    /**
     * Jest
     */
    if (program.jestCoverage) {
        const cwd = process.cwd()
        const buffer = fs.readFileSync(path.join(cwd, program.jestCoverage))
        const summary = JSON.parse(buffer.toString())
        
        data.files.jest = data.files.file_path.map(file_path => {
            return summary[path.join(cwd, file_path)]?.statements?.pct || 0
        })
    }

    /**
     * Cycles
     */
    const cycles = get_cycles(0, data.files.imports)
    if (cycles.length) {
        data.cycles = cycles
    }
}

async function process_file(file_path: string, options: ts.CompilerOptions, data: Data): Promise<void> {
    let v = get_index(file_path)

    if (processed_files.has(v)) return
    processed_files.add(v)

    const src = fs.readFileSync(file_path).toString()
    const target = options.target || ts.ScriptTarget.ES2015
    const source = ts.createSourceFile(file_path, src, target, true)

    /**
     * Line count
     */
    data.files.line_count[v] = source.getLineAndCharacterOfPosition(source.getEnd()).line

    /**
     * Imports & Node Imports
     */
    data.files.imports[v] = []
    data.files.imports_node_modules[v] = []
    for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue
        if (!node.parent || !ts.isSourceFile(node.parent)) continue
        if (!node.moduleSpecifier) continue
        if (!ts.isSourceFile(node.parent)) continue

        const file_name = node.parent.fileName

        if(file_name.endsWith('.d.ts')) continue
        if (!ts.isStringLiteral(node.moduleSpecifier)) continue

        const import_file_name = node.moduleSpecifier.text
        const resolved = ts.resolveModuleName(import_file_name, file_name, options, ts.sys)

        if (!resolved || !resolved.resolvedModule) continue
        const f = resolved.resolvedModule.resolvedFileName

        if (f.includes("node_modules")) {
            data.files.imports_node_modules[v].push(import_file_name)
        } else {
            data.files.imports[v].push(get_index(f))
        }
    }

    /**
     * Complexity & Max depth
     */
    const [ complexity, max_depth ] = get_complexity_and_depth(source)
    data.files.complexity[v] = complexity
    data.files.max_depth[v] = max_depth

    /**
     * Commits
     */
    const commits_promise = new Promise(resolve => {
        exec(` git log --follow --oneline -- ${source.fileName}`, (err, stdout) => {
            if (err) return resolve()
            data.files.commits = data.files.commits || []
            data.files.commits_bug = data.files.commits_bug || []
            const commits = stdout.split("\n")
            data.files.commits[v] = commits.length - 1 // ends with a blank line
            data.files.commits_bug[v] = commits.filter(commit => commit.toLowerCase().includes("bug")).length
            resolve()
        })
    })

    const process_imports = data.files.imports[v]
        .map(u => process_file(data.files.file_path[u], options, data))

    await Promise.all([ commits_promise, ...process_imports ])
}

function get_index(file_path: string): number {
    let v = files_lookup.get(file_path)
    if (v == null) {
        v = data.files.file_path.length
        data.files.file_path.push(file_path)
        files_lookup.set(file_path, v)
    }
    return v
}

function get_cycles(v: number, imports: number[][], visited: boolean[] = [], stack: number[] = []): number[][] {
    visited[v] = true
    stack.push(v)
    const cycles: number[][] = []
    for (const u of imports[v]) {
        if (!visited[u]) {
            cycles.push(...get_cycles(u, imports, visited, stack))
        } else if (stack.includes(u)) {
            const idx = stack.indexOf(u)
            cycles.push([ ...stack.slice(idx), u ])
        }
    }
    stack.pop()
    return cycles
}

function walk_imports(v: number, depth: number, files: Files, stack: boolean[] = []) {
    files.imports_direct[v] = files.imports_direct[v] || 0
    files.imports_depth[v] = files.imports_depth[v] || 0
    stack[v] = true
    for (const u of files.imports[v]) {
        if (stack[u]) continue // filter out cycles
        files.imports_direct[u] += 1
        files.imports_depth[u] = Math.max(files.imports_depth[u] || 0, depth)
        walk_imports(u, depth + 1, files, stack)
    }
    stack[v] = false
}
