function handlePort() {
	let { port1: port, port2 } = new MessageChannel();

	let workerMap = new Map();
	port.onmessage = e => {
		if (e.data.type === "worker") {
			let port = e.data.port;
			let worker = new Worker(...e.data.args);
			worker.onmessage = e => { port.postMessage(e.data) };
			port.onmessage = e => { worker.postMessage(e.data) };
			console.log("OWORKER CREATED", e.data.id);
			port.start();

			workerMap.set(e.data.id, worker);
		} else if (e.data.type === "workerKill") {
			workerMap.get(e.data.id).terminate();
			workerMap.delete(e.data.id);
			console.log("OWORKER DEAD", e.data.id);
		}
	};
	port.start();

	return port2;
}

async function setup() {
	console.log("OWORKER SETUP");
	let sw = (await navigator.serviceWorker.ready).active;
	let lastPing = 0;
	let ready = false;

	navigator.serviceWorker.onmessage = e => {
		if (e.data.type === "ready")
			ready = true;
		else if (e.data.type === "ping")
			lastPing = performance.now();
	};
	sw.onerror = () => errored = true;

	while (!ready) {
		await new Promise(r => setTimeout(r, 1000));
		console.log("OWORKER CONTACTING");
		sw.postMessage({ type: "init" });
	}

	let port2 = handlePort();
	port2.onmessageerror = () => errored = true;
	sw.postMessage({ type: "port", port: port2 }, [port2]);
	console.log("OWORKER CONTACTED");

	lastPing = performance.now()

	while (performance.now() - lastPing < 2000) {
		await new Promise(r => setTimeout(r, 1000));
	}
	setup();
}
await setup();
