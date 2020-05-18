import { h, app } from "https://unpkg.com/hyperapp"
import data from "./data.js"

const cycles = data.cycles && data.cycles.length > 0 ? 1 : 0

const saved_raw_texts_str = window.localStorage.getItem("saved_raw_texts")
const saved_raw_texts = saved_raw_texts_str ? JSON.parse(saved_raw_texts_str) : { raw: [] }

const init = {
    data,
    tab: "files",
    warnings_count: cycles, // + ...
    warnings_show: false,
    raw_text: '[foo]\nbar',
    saved_raw_texts,
    diagram_x: "commits",
    diagram_y: "complexity",
    diagram_r: "line_count",
}

app({ init, view, node: document.getElementById("app") })

function view (s) {
    return h("div", {}, [
        // s.warnings_count > 0 && show_warnings(s),
        h("div", { class: "panel" }, [
            h("div", { class: "panel__left" }, [
                h("div", { class: "tabs" }, [
                    h("button", { onClick: s => ({ ...s, tab: "files" }) }, "Files"),
                    h("button", { onClick: s => ({ ...s, tab: "imports" }) }, "Imports"),
                    h("button", { onClick: s => ({ ...s, tab: "diagram" }) }, "Diagram"),
                ]),
                show_left(s)
            ]),
            h("div", { class: "panel__right" }, [
                h("textarea", {
                    class: "raw__textarea",
                    value: s.raw_text,
                    onInput: (s, e) => ({ ...s, raw_text: e.target.value }),
                }),
                h("div", {}, [
                    "Load: ",
                    h("select", {
                        disabled: !s.saved_raw_texts.raw.length,
                        onChange: (s, e) => e.target.value ? { ...s, raw_text: e.target.value } : s
                    }, [
                        h("option", { value: "" }, "-"),
                        s.saved_raw_texts.raw.map(({ name, text }) => h("option", { value: text }, name))
                    ]),
                    " | ",
                    h("button", {
                        onClick: s => {
                            const saved_str = window.localStorage.getItem("saved_raw_texts")
                            const saved_raw_texts = saved_str ? JSON.parse(saved_str) : { raw: [] }
                            const name = prompt("Saved it as...")
                            saved_raw_texts.raw.push({ name, text: s.raw_text })
                            window.localStorage.setItem("saved_raw_texts", JSON.stringify(saved_raw_texts))
                            return { ...s, saved_raw_texts }
                        }
                    }, "Save")
                ])
            ])
        ])
    ])
}

/*
function show_warnings(s) {
    return !s.warnings_show
        ? h("div", {
            class: "warnings-bar",
            onClick: s => ({ ...s, warnings_show: true })
        }, `${s.warnings_count} warnings`)
        : h("div", { class: "warnings" }, [
            h("button", { style: { float: "right" }, onClick: s => ({ ...s, warnings_show: false }) }, "x"),
            `${s.data.cycles.length} cycle(s) detected`,
            h("ul", {}, s.data.cycles
                .map(cycle => h("li", {}, h("code", {}, cycle
                    .map(i => s.data.files.file_name[i])
                    .join(" → ")
                )))
            )
        ])
}
*/

function show_left(s) {
    switch (s.tab) {
        case "files":
            return show_grouped_files(s)
        case "imports":
            return show_imports(s)
        case "diagram":
            return show_diagram(s)
    }
}

function show_grouped_files(s) {
    const { groups } = raw_text_to_groups(s.raw_text, s.data.files.file_name)

    return h("div", { class: "grouped-files" }, groups.map(g => {
        return h("div", { class: "grouped-files__group" }, [
            h("p", { class: "grouped-files__name" }, g.name),
            h("ul", { class: "grouped-files__list" }, g.files
                .map(i => s.data.files.file_name[i])
                .map(f => h("li", { class: "grouped-files__filename" }, f))
            )
        ])
    }))
}

function raw_text_to_groups(raw_text, file_names) {
    const file_to_group = []
    const groups = [{ name: "Ungrouped", order: -Infinity, files: [] }]

    /**
     * Create groups
     */
    for (const line of raw_text.split("\n")) {
        const l = line.trim()
        if (!l) continue // blank
        if (l[0] === "/" && l[1] === "/") continue // comment

        if (l[0] === "[") {
            const [name, rest] = l.slice(1, -1).split(";").map(s => s.trim())
            const attr = {}
            for (const a of (rest || "").split(",")) {
                const [k, v] = a.split("=").map(s => s.trim())
                attr[k] = v
            }
            attr.order = attr.hasOwnProperty("order") ? Number(attr.order) : groups.length + 100
            groups.push({
                name,
                ...attr,
                regex: [],
                files: [],
            })
        } else {
            try {
                groups[groups.length - 1].regex.push(new RegExp(l))
            } catch (e) {} // noop
        }
    }

    /**
     * Put file names into groups
     */
    next_file:
    for (let i = 0; i < file_names.length; i++) {
        for (let j = 1; j < groups.length; j++) {
            for (const r of groups[j].regex) {
                if (r.test(file_names[i])) {
                    groups[j].files.push(i)
                    continue next_file
                }
            }
        }
        groups[0].files.push(i)
    }

    groups.sort((a, b) => a.order - b.order)

    for (let i = 0; i < groups.length; i++) {
        for (const f of groups[i].files) {
            file_to_group[f] = i
        }
    }

    return { groups, file_to_group }
}

function show_imports(s) {
    const { groups, file_to_group } = raw_text_to_groups(s.raw_text, s.data.files.file_name)
    const file_count_total = s.data.files.file_name.length
    const line_count_total = s.data.files.line_count.reduce((a, b) => a + b, 0)
    const group_height = 100
    const calc_y = (gi, offset) => (gi * (group_height + 20)) + offset
    let x_good_off = 20
    let x_bad_off = 20

    return h("svg", { class: "graph", height: groups.length * (group_height + 20) + 20 }, [
        // Connections
        groups.map((g, gi) => g.files.map(f => {
            return s.data.files.imports[f].map(imp => {
                const y1 = calc_y(gi, 50)
                const y2 = calc_y(file_to_group[imp], 50)
                if (y1 === y2) return null
                const is_good = y1 < y2
                const x = is_good ? 100 : 300
                let x_offset = is_good
                    ? x - (x_good_off += 5)
                    : x + (x_bad_off += 5)

                if (!is_good) {
                    console.log(
                        "[%s] %s  ->  [%s] %s",
                        g.name,
                        s.data.files.file_name[f],
                        groups[file_to_group[imp]].name,
                        s.data.files.file_name[imp]
                    )
                }

                return h("path", {
                    class: `graph__connection graph__connection--${is_good ? "good" : "bad"}`,
                    d: `M${x},${y1} C${x_offset},${y1} ${x_offset},${y2} ${x},${y2}`
                })
            })
        })),

        // Groups
        groups.map((g, gi) => {
            const file_count = g.files.length
            const sum = (a, b) => a + b
            const line_count = g.files.map(f => s.data.files.line_count[f]).reduce(sum, 0)
            const avg = x => parseInt(g.files.map(f => s.data.files[x][f]).reduce(sum, 0) / file_count) || 0
            const complexity = avg("complexity")
            const test_cov = s.data.files.jest ? g.files.map(f => s.data.files.jest[f]).reduce(sum, 0) : 0
            const commits = s.data.files.commits ? avg("commits") : 0
            const commits_bug = s.data.files.commits_bug ? avg("commits_bug") : 0

            return h("g", { class: "graph__group" }, [
                h("rect", {
                    class: "graph__group-bg",
                    width: 200,
                    height: group_height,
                    x: 100,
                    y: calc_y(gi, 20)
                }),
                h("text", {
                    class: "graph__group-name",
                    x: 105,
                    y: calc_y(gi, 35)
                }, g.name),
                h("text", { x: 105, y: calc_y(gi, 50) }, `${file_count} files (${parseInt(file_count / file_count_total * 100)}%)`),
                h("text", { x: 105, y: calc_y(gi, 65) }, `${line_count} lines (${parseInt(line_count / line_count_total * 100)}%)`),
                h("text", { x: 105, y: calc_y(gi, 80) }, `${complexity} complexity`),
                h("text", { x: 105, y: calc_y(gi, 95) }, `${parseInt(test_cov / file_count || 0)}% test`),
                h("text", { x: 105, y: calc_y(gi, 110) }, `${commits} commits (${commits_bug} w/ bug)`),
            ])
        })
    ])
}

function show_diagram(s) {
    const options = [
        "line_count",
        "complexity",
        "tests",
        "commits",
        "commits_bug",
        "imports",
        "imports_direct",
        "max_depth",
    ]

    return h("div", { class: "diagram" }, [
        h("div", { class: "diagram__controls" }, [
            "y axis: ",
            h("select", {
                onChange: (s, e) => ({ ...s, diagram_y: e.target.value }),
            }, options.map(opt => h("option", { value: opt, selected: opt === s.diagram_y }, opt))),
            h("br"),
            "x axis: ",
            h("select", {
                onChange: (s, e) => ({ ...s, diagram_x: e.target.value }),
            }, options.map(opt => h("option", { value: opt, selected: opt === s.diagram_x }, opt))),
            h("br"),
            "radius: ",
            h("select", {
                onChange: (s, e) => ({ ...s, diagram_r: e.target.value }),
            }, options.map(opt => h("option", { value: opt, selected: opt === s.diagram_r }, opt))),
        ]),
        h("svg", { class: "diagram__svg" }, [
            s.data.files.file_name.map((f, v) => {
                const c = {
                    x: parseInt(get_score(s, v, s.diagram_x) * 560 + 20),
                    y: parseInt(380 - get_score(s, v, s.diagram_y) * 360),
                    r: parseInt(get_score(s, v, s.diagram_r) * 17 + 3)
                }
                return h("g", {
                    class: "diagram__g",
                    onClick: s => alert(f) || s
                }, [
                    h("circle", { class: "diagram__dot", cx: c.x, cy: c.y, r: c.r }),
                    h("text", { class: "diagram__file", x: c.x, y: c.y - 7 }, f)
                ])
            })
        ])
    ])
}

function get_score(s, v, opt) {
    const max = o => s.data.files[o].reduce((a, b) => Math.max(a, b))
    const a = o => s.data.files[o][v]
    if (opt === "tests") {
        opt = "jest"
    }
    switch (opt) {
        case "line_count":
        case "complexity":
        case "commits":
        case "commits_bug":
        case "imports":
        case "imports_direct":
        case "max_depth":
        case "jest":
            const hi = max(opt)
            const me = a(opt)
            return me / hi
        default:
            return 0
    }
}
