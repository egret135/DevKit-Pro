// JSON Worker Client - offload heavy format/minify/sort for large documents

const JsonWorkerClient = (function () {
    'use strict';

    const WORKER_URL = 'workers/json-format-worker.js';
    const TASK_TIMEOUT_MS = 180000;

    let worker = null;
    let workerFailed = false;
    let nextId = 1;
    const pending = new Map();

    function runSync(op, text, options) {
        switch (op) {
            case 'format':
                return { text: JsonUtils.format(text, options || {}) };
            case 'minify':
                return { text: JsonUtils.minify(text) };
            case 'sortKeys': {
                const parsed = JsonUtils.parse(text);
                if (!parsed.ok) throw new Error(parsed.error);
                const sorted = JsonUtils.sortKeys(parsed.value);
                return { text: JsonUtils.format(sorted, options || {}) };
            }
            default:
                throw new Error(`Unsupported op: ${op}`);
        }
    }

    function settleTask(id, ok, payload) {
        const task = pending.get(id);
        if (!task) return;

        pending.delete(id);
        clearTimeout(task.timer);

        if (ok) task.resolve(payload);
        else task.reject(new Error(payload));
    }

    function failWorker(error) {
        workerFailed = true;
        if (worker) {
            worker.terminate();
            worker = null;
        }

        const queue = Array.from(pending.entries());
        pending.clear();
        queue.forEach(([id, task]) => {
            clearTimeout(task.timer);
            try {
                task.resolve(runSync(task.op, task.text, task.options));
            } catch (syncError) {
                task.reject(syncError);
            }
            void id;
        });

        console.warn('JsonWorkerClient fallback to main thread:', error);
    }

    function ensureWorker() {
        if (workerFailed || typeof Worker === 'undefined') return null;
        if (worker) return worker;

        try {
            worker = new Worker(WORKER_URL);
            worker.onmessage = (event) => {
                const { id, ok, result, error } = event.data;
                settleTask(id, ok, ok ? result : error);
            };
            worker.onerror = (event) => {
                failWorker(event.message || 'worker error');
            };
        } catch (error) {
            workerFailed = true;
            worker = null;
            return null;
        }

        return worker;
    }

    function shouldUseWorker(text) {
        return typeof JsonUtils !== 'undefined'
            && JsonUtils.getDocumentProfile(text).useWorker;
    }

    function run(op, text, options) {
        if (!shouldUseWorker(text) || !ensureWorker()) {
            return Promise.resolve(runSync(op, text, options));
        }

        return new Promise((resolve, reject) => {
            const id = nextId++;
            const timer = setTimeout(() => {
                if (!pending.has(id)) return;
                pending.delete(id);
                reject(new Error('JSON 处理超时，请稍后重试'));
            }, TASK_TIMEOUT_MS);

            pending.set(id, { resolve, reject, timer, op, text, options });
            worker.postMessage({ id, op, text, options: options || {} });
        });
    }

    function format(text, options) {
        return run('format', text, options).then((result) => result.text);
    }

    function minify(text) {
        return run('minify', text).then((result) => result.text);
    }

    function sortAndFormat(text, options) {
        return run('sortKeys', text, options).then((result) => result.text);
    }

    return {
        format,
        minify,
        sortAndFormat,
        shouldUseWorker
    };
})();

if (typeof window !== 'undefined') {
    window.JsonWorkerClient = JsonWorkerClient;
}
