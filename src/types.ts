export type Data = {
    files: Files
    cycles?: number[][]
}

export type Files = {
    file_name: string[]
    file_path: string[]
    line_count: number[]
    imports: number[][]
    imports_node_modules: string[][]
    imports_direct: number[]
    imports_depth: number[]
    complexity: number[]
    max_depth: number[]

    commits?: number[]
    commits_bug?: number[]
    jest?: number[]
}
