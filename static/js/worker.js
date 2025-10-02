"use strict";

let pyodide;
let pyconsole;
let await_fut;
let clear_console;

let interruptBuffer;
let setInterruptBuffer = function(b){
    interruptBuffer = b;
    pyodide.setInterruptBuffer(b);
}

let pmchk = function(m){
    // check pyodide for interrupt before doing postMessage
    pyodide.checkInterrupt();
    postMessage(m);
}

async function main() {
    console.log('Loading...');
    const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/v0.28.3/full/pyodide.mjs");
    pyodide = await loadPyodide({indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/"});

    pyodide.runPython(
        `
        import pyodide
        from pyodide.ffi import to_js
        from pyodide.console import PyodideConsole
        import __main__
        pyconsole = PyodideConsole(__main__.__dict__)
        import builtins

        async def await_fut(fut):
            res = await fut
            if res is not None:
                builtins._ = res
            return to_js([res], depth=1)

        def clear_console():
            pyconsole.buffer = []
    `
    );

    pyconsole = pyodide.globals.get("pyconsole");
    await_fut = pyodide.globals.get("await_fut");
    clear_console = pyodide.globals.get("clear_console");

    let m;
    pyconsole.stdout_callback = function(s){
        m = {kind:'STDOUT', 'txt': s}
        pmchk(m);
    }
    pyconsole.stderr_callback = function(s){
        m = {kind:'STDERR', 'txt': s}
        pmchk(m);
    }

    m = {kind: 'SETBUF'};
    postMessage(m);

    m = {kind:'READY'}
    postMessage(m);
}

let do_run_code = async function(code, fname){
    let fut;
    if (fname){
        //fut = pyconsole.runsource(code, fname);
        fut = pyconsole.runsource(code);
    } else {
        fut = pyconsole.push(code);
    }

    let sc;
    let ok;
    let m;
    switch (fut.syntax_check) {
        case "syntax-error":
            sc = 'syntax-error';
            ok = false;
            break;
        case "incomplete":
            sc = 'incomplete';
            ok = true;
            break;
        case "complete":
            sc = 'complete';
            ok = true;
            break;
        default:
            sc = "unknown";
            ok = false;
    }
    console.log('OK', sc, ok);


    let wrapped = await_fut(fut);
    try{
        let [value] = await wrapped;
        if (value !== undefined){
            if (value === true){value = 'True';}
            if (value === false){value = 'False';}
            m = {kind:'STDOUT', txt: value.toString()};
            pmchk(m);
        }
    } catch (e) {
        if (e.constructor.name === "PythonError") {
            let message = fut.formatted_error || e.message;
            m = {kind:'STDERR', txt: message};
            console.log('SE2', m);
            pmchk(m);
            ok = false;
        } else {
            console.log('THROW E', e);
            throw e;
        }
    } finally {
        console.log('F');
    }

    return ok;
}

let do_run_code_page = async function(page, fname){
    let part = '';
    let lines = page.split('\n');
    let ok;
    for (let line of lines){
        let lts = line.trimStart();
        if (line && (line==lts)){
            // line starts at the beginning of the line
            if (part){
                ok = await do_run_code(part, fname);
                if (!ok){return;}
                part = '';
            }
            part = part + line + '\n';
        } else if (line) {
            part = part + line + '\n';
        } else {
            part = part + '\n';
        }
    }

    if (part){
        do_run_code(part, fname);
    }
}

let run_test_nosleep = function(){
    let code = `
import js
import pyodide

print('Starting No sleep test');
print('pyodide version '+pyodide.__version__);
print('Output on js console');

i = 0
while True:
    i += 1
    if not i%100000:
        js.console.log(i)
`;
    do_run_code_page(code, 'filenameA');
}

let run_test_withsleep = function(){
    let code = `
import js
import time
import pyodide

print('Starting With sleep test');
print('pyodide version '+pyodide.__version__);
print('Output on js console');

i = 0
while True:
    i += 1
    time.sleep(0.001)
    if not i%1000:
        js.console.log(i)
        print(i)
`;
    do_run_code_page(code, 'filenameB');
}

let run_test_withprint = function(){
    let code = `
import js
import pyodide

print('Starting With PRINT test');
print('pyodide version '+pyodide.__version__);

i = 0
while True:
    i += 1
    if not i%1000000:
        print(i)
`;
    do_run_code_page(code, 'filenameC');
}

let run_test_timetime = function(){
    let code = `
import js
import pyodide
import time

print('Starting time test');
print('pyodide version '+pyodide.__version__);

i = 0
t0 = time.time()
while True:
    i += 1
    if not i%1000000:
        print('%s at %.1f' % (i, dt))
    t = time.time()
    dt = t - t0
    if dt > 10:
        break
print('Elapsed time %.1f' % dt)
`;
    do_run_code_page(code, 'filenameD');
}

self.addEventListener("message", async (msg) => {
    switch(msg.data.cmd){
        case "setInterruptBuffer":
            setInterruptBuffer(msg.data.b);
            break;

        case "nosleep":
            run_test_nosleep();
            break;

        case "withsleep":
            run_test_withsleep();
            break;

        case "withprint":
            run_test_withprint();
            break;

        case "timetime":
            run_test_timetime();
            break;
    }
});

await main();

