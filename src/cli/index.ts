#!/usr/bin/env node

import { program } from "commander"
import fs from "fs"
import { Data } from "../types"

type G = {
    d: Data | null
    data: Data
}

const g: G = {
    d: null,
    get data(): Data {
        if (!g.d) {
            const data_buffer = fs.readFileSync(program.data)
            g.d = JSON.parse(data_buffer.toString())
        }
        return g.d as Data
    }
}

program.option("--data <file>", "ts_analysis.json file", "ts_analysis.json")
program.command("summary").description("Print a summary").action(print_summary)
program.command("files").description("Stats on files").action(print_files)
program.command("cycles").description("Print any cycles").action(print_cycles)
program.command("tests").description("stats on tests").action(print_tests)

program.parse(process.argv)

function print_summary() {
    console.log("[Files]")
    print_files()
    if (g.data.cycles) {
        console.log("\n[Cycles]")
        print_cycles()
    }
    console.log("\n[Tests]")
    print_tests()
}

function print_files() {
    console.log(
        "%s files ",
        g.data.files.file_name.length
    )
}

function print_cycles() {
    if (!g.data.cycles) return
    console.log(`${g.data.cycles.length} cycle(s) found`)
    for (const cycle of g.data.cycles) {
        console.log(cycle.map(i => g.data.files.file_name[i]).join(" -> "))
    }
}

function print_tests() {
    if (!g.data.files.jest) return
    let total = 0
    let max = 0
    let min = 100
    let count_zero = 0
    for (const pct of g.data.files.jest) {
        total += pct
        max = Math.max(max, pct)
        min = Math.min(min, pct)
        if (pct === 0) count_zero += 1
    }
    console.log("Average:", total / g.data.files.jest.length)
    console.log("Max/min:", max, "/", min)
    console.log("Files w/o tests:", count_zero)
}
