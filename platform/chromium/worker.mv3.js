let handler = () => {};
self.onmessage = e => handler(e);

async function createOffscreen() {
	const offscreenUrl = chrome.runtime.getURL("/offscreen.html");
	const existing = await chrome.runtime.getContexts({
		contextTypes: ["OFFSCREEN_DOCUMENT"],
		documentUrls: [offscreenUrl],
	});
	if (!existing.length) {
		chrome.offscreen.createDocument({ url: offscreenUrl, reasons: ["WORKERS"], justification: "polyfilling workers" });
		console.log("OFFSCREEN CREATED");
	} else {
		console.log("OFFSCREEN ALIVE");
	}
	return new Promise(r => {
		handler = e => {
			if (e.data.type === "init") {
				console.log("OFFSCREEN CONTACTED");
				e.source.postMessage({ type: "ready" });
				setInterval(() => e.source.postMessage({ type: "ping" }), 1000);
			} else if (e.data.type === "port") {
				console.log("OFFSCREEN CONNECTED");
				r(e.data.port);
			}
		}
	})
}

let genuid = () => {
	return [...Array(16)].reduce(a => a + Math.random().toString(36)[2], '')
};

let ready = createOffscreen();

class Worker extends EventTarget {
	build(port, args) {
		let { port1, port2 } = new MessageChannel();
		port.postMessage({ type: "worker", args, port: port2, id: this.id, }, [port2]);

		this.port = port1;
		port1.onmessage = e => {
			if (this.onmessage)
				this.onmessage(e);
			this.dispatchEvent(new MessageEvent("message", { data: e.data }));
		};

		for (let x of this.backlog.splice(0, this.backlog.length)) {
			this.port.postMessage(...x);
		}
		port1.start();
	}

	backlog = [];
	id = genuid();

	constructor(...args) {
		super();

		console.log("WORKER CONSTRUCTOR");

		if (ready instanceof Promise) {
			ready.then(port => {
				ready = port;
				console.log("WORKER CONSTRUCTOR READY");
				this.build(port, args);
			});
		} else {
			this.build(ready, args);
		}
	}

	postMessage(...args) {
		if (this.port) {
			this.port.postMessage(...args);
		} else {
			this.backlog.push(args);
		}
	}

	terminate() {
		if (!this.port) throw new Error("guh");

		ready.postMessage({
			type: "workerKill",
			id: this.id
		})
	}
}
globalThis.Worker = Worker;
