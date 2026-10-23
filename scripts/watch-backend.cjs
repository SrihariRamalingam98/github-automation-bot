const { spawn } = require('node:child_process');
const path = require('node:path');
const ts = require('typescript');

function startDevelopment(directory = path.resolve(__dirname, '../apps/backend')) {
    let child;
    let stopping = false;
    let revision = 0;
    let restarting = Promise.resolve();

    async function stopServer() {
        const previous = child;
        if (!previous || previous.exitCode !== null || previous.signalCode !== null) return;
        await new Promise((resolve) => {
            const timeout = setTimeout(() => previous.kill('SIGKILL'), 5000);
            previous.once('close', () => {
                clearTimeout(timeout);
                resolve();
            });
            previous.kill('SIGTERM');
        });
    }

    function restartServer() {
        const currentRevision = ++revision;
        restarting = restarting
            .then(async () => {
                if (stopping || currentRevision !== revision) return;
                await stopServer();
                if (stopping || currentRevision !== revision) return;
                console.log('[backend] Compilation succeeded; starting server.');
                child = spawn(process.execPath, ['dist/main.js'], {
                    cwd: directory,
                    stdio: 'inherit',
                });
                child.on('error', (error) => {
                    console.error(`Backend failed to start: ${error.code || 'unknown error'}`);
                });
            })
            .catch(() => {
                console.error('[backend] Server restart failed. Restart npm run dev.');
                process.exitCode = 1;
            });
    }

    const reportStatus = ts.createWatchStatusReporter(ts.sys, false);
    const host = ts.createWatchCompilerHost(
        path.join(directory, 'tsconfig.json'),
        { noEmitOnError: true, preserveWatchOutput: true },
        ts.sys,
        ts.createEmitAndSemanticDiagnosticsBuilderProgram,
        ts.createDiagnosticReporter(ts.sys, true),
        (diagnostic, newLine, options, errorCount) => {
            reportStatus(diagnostic, newLine, options, errorCount);
            // The summary arrives after all output files have been emitted.
            if (errorCount === 0) restartServer();
        },
    );
    const watcher = ts.createWatchProgram(host);

    async function stop() {
        stopping = true;
        watcher.close();
        await restarting;
        await stopServer();
        for (const signal of ['SIGINT', 'SIGTERM']) process.removeListener(signal, stop);
    }
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
    return stop;
}

module.exports = { startDevelopment };
if (require.main === module) startDevelopment();
