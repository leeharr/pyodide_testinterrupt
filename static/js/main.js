"use strict";

let pyodideWorker = new Worker("static/js/worker.js", {type:"module"});

let echolines = [];
let trickle_add = function(line){
    let lines;
    if (line.includes('\n')){
        lines = line.split('\n');
        for (let line of lines){
            echolines.push(line);
        }
    } else {
        echolines.push(line);
    }
}
globalThis['trickle_add'] = trickle_add;

const testoutput = document.querySelector('#testoutput');

let trickle_write = function(){
    let t = 10; // show 10 lines at a time
    while (echolines && t > 0){
        let l = echolines.shift();
        t -= 1;
        if (l){
            testoutput.innerHTML += l;
            testoutput.innerHTML += '<br/>\n';
        }
    }
}

let trickle = function(){
    trickle_write();
    setTimeout(trickle, 25);
}

let main = async function(){
    trickle();
    trickle_add('Loading...');

    pyodideWorker.onmessage = function(e){
        let kind;
        if (e.data.get){
            kind = e.data.get('kind');
        } else {
            kind =  e.data['kind'];
        }

        switch(kind){
            case 'READY':
                trickle_add('Ready');
                break;
            case 'STDOUT':
                trickle_add(e.data.txt);
                break;
            case 'STDERR':
                trickle_add(e.data.txt);
                break;
            case 'SETBUF':
                setInterruptBuffer();
                break;
        }
    }
}
main();

let interruptBuffer = new Uint8Array(new SharedArrayBuffer(1))

let setInterruptBuffer = async function(){
    pyodideWorker.postMessage({ cmd: "setInterruptBuffer", b: interruptBuffer });
}

let interruptExecution = async function() {
    interruptBuffer[0] = 2;
    trickle_add('REQUESTING Keyboard Interrupt\n');
}
window.interruptExecution = interruptExecution;

let clearOutput = async function(){
    testoutput.innerHTML = '';
}
window.clearOutput = clearOutput;


let runInterruptTest = async function(testname){
    pyodideWorker.postMessage({ cmd: testname});
}
window.runInterruptTest = runInterruptTest


