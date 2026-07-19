import { create, createFileRegistry, toJson } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';
import { createGrpcTransport, Http2SessionManager } from '@connectrpc/connect-node';
import { DynamicDispatchClient, ServerReflectionClient } from '@lambdalisue/connectrpc-grpcreflect/client';

export const reflectedSymbols = [
	'osmosis.poolmanager.v1beta1.Query',
	'ibc.applications.transfer.v1.Query',
	'ibc.core.channel.v1.Query',
	'ibc.core.connection.v1.Query',
	'ibc.core.client.v1.Query',
	'osmosis.gamm.v1beta1.Pool',
	'osmosis.gamm.poolmodels.stableswap.v1beta1.Pool',
	'osmosis.concentratedliquidity.v1beta1.Pool',
	'osmosis.cosmwasmpool.v1beta1.CosmWasmPool',
];

export function extractRetryAfterMs(error, now = Date.now()) {
	const value = error?.metadata?.get?.('retry-after');
	if (!value) return undefined;
	if (/^\d+$/.test(value)) return Number(value) * 1_000;
	const date = Date.parse(value);
	return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

export function extractHttpStatus(error) {
	if (Number.isInteger(error?.status)) return error.status;
	const match = /\bHTTP\s+(\d{3})\b/i.exec(error?.rawMessage || error?.message || '');
	return match ? Number(match[1]) : undefined;
}

export async function paginateRpc(call, service, method, field, pageSize = 1_000) {
	const items = [];
	let key;

	do {
		const pagination = { limit: BigInt(pageSize) };
		if (key) pagination.key = new Uint8Array(Buffer.from(key, 'base64'));
		const response = await call(service, method, { pagination });
		items.push(...(response[field] || []));
		key = response.pagination?.nextKey || '';
	} while (key);

	return items;
}

export function orderFileDescriptors(files) {
	const ordered = [];
	const visited = new Set();
	const visiting = new Set();

	function visit(file) {
		if (!file?.name || visited.has(file.name)) return;
		if (visiting.has(file.name)) {
			throw new Error(`Circular protobuf dependency detected at ${file.name}`);
		}

		visiting.add(file.name);
		for (const dependency of file.dependency || []) {
			const dependencyFile = files.get(dependency);
			if (!dependencyFile) {
				throw new Error(`Missing reflected protobuf dependency ${dependency}, imported by ${file.name}`);
			}
			visit(dependencyFile);
		}
		visiting.delete(file.name);
		visited.add(file.name);
		ordered.push(file);
	}

	for (const file of files.values()) visit(file);
	return ordered;
}

async function buildServiceRegistry(transport) {
	const reflection = new ServerReflectionClient(transport);
	const files = new Map();

	async function addFile(file) {
		if (!file?.name || files.has(file.name)) return;
		files.set(file.name, file);
		for (const dependency of file.dependency || []) {
			await addFile(await reflection.getFileByFilename(dependency));
		}
	}

	try {
		for (const symbol of reflectedSymbols) {
			await addFile(await reflection.getFileContainingSymbol(symbol));
		}
		return createFileRegistry(create(FileDescriptorSetSchema, { file: orderFileDescriptors(files) }));
	} finally {
		await reflection.close();
	}
}

function responseToJson(response, registry) {
	const descriptor = registry.getMessage(response.$typeName);
	if (!descriptor) throw new Error(`Unknown gRPC response type ${response.$typeName}`);
	return toJson(descriptor, response, { registry });
}

export class GrpcClient {
	#endpointIndex = 0;
	#clients = new Map();

	constructor(endpoints, { timeoutMs = 30_000 } = {}) {
		if (!endpoints?.length) throw new Error('At least one gRPC endpoint is required');
		this.endpoints = endpoints;
		this.timeoutMs = timeoutMs;
	}

	async #endpointClient(endpoint) {
		if (this.#clients.has(endpoint)) return this.#clients.get(endpoint);

		const sessionManager = new Http2SessionManager(endpoint, {
			idleConnectionTimeoutMs: 60_000,
		});
		const transport = createGrpcTransport({
			baseUrl: endpoint,
			sessionManager,
			defaultTimeoutMs: this.timeoutMs,
		});
		const registry = await buildServiceRegistry(transport);
		const client = {
			dispatch: new DynamicDispatchClient(transport, registry),
			registry,
			sessionManager,
		};
		this.#clients.set(endpoint, client);
		return client;
	}

	async call(service, method, request) {
		const endpoint = this.endpoints[this.#endpointIndex];
		try {
			const client = await this.#endpointClient(endpoint);
			const response = await client.dispatch.call(service, method, request);
			return responseToJson(response, client.registry);
		} catch (error) {
			if (error && typeof error === 'object') {
				error.status ??= extractHttpStatus(error);
				error.retryAfterMs ??= extractRetryAfterMs(error);
			}
			this.#endpointIndex = (this.#endpointIndex + 1) % this.endpoints.length;
			throw error;
		}
	}

	paginate(service, method, field, pageSize) {
		return paginateRpc(this.call.bind(this), service, method, field, pageSize);
	}

	close() {
		for (const client of this.#clients.values()) client.sessionManager.abort();
		this.#clients.clear();
	}
}
