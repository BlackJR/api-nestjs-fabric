import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as grpc from '@grpc/grpc-js';
import {
    connect,
    Contract,
    Gateway,
    Identity,
    Signer,
    signers,
} from '@hyperledger/fabric-gateway';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/** Configuration for a single Fabric organization */
interface OrgConfig {
    peerEndpoint: string;
    peerHostAlias: string;
    mspId: string;
    certPath: string;
    keyDir: string;
    tlsCertPath: string;
}

/** Active connection to a Fabric peer */
interface OrgConnection {
    client: grpc.Client;
    gateway: Gateway;
}

@Injectable()
export class FabricService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(FabricService.name);
    private readonly connections = new Map<string, OrgConnection>();
    private networkBasePath: string;
    private appMode: 'GATEWAY' | 'WORKER';
    private tunnelUrl: string;

    constructor(private readonly config: ConfigService) { }

    async onModuleInit(): Promise<void> {
        this.appMode = this.config.get<'GATEWAY' | 'WORKER'>('APP_MODE') || 'WORKER';
        this.tunnelUrl = this.config.get<string>('FABRIC_TUNNEL_URL', '');

        if (this.appMode === 'GATEWAY') {
            this.logger.warn(`☁️ Mode GATEWAY (Cloud Run) activé. Les requêtes seront relayées vers le tunnel : ${this.tunnelUrl}`);
            return;
        }

        this.logger.log('🖥️ Mode WORKER (Lenovo) activé. Connexion locale à Hyperledger Fabric via gRPC.');
        this.networkBasePath = this.config.getOrThrow<string>('FABRIC_NETWORK_PATH');
        const orgIds = ['org1', 'org2', 'org3'];

        for (const orgId of orgIds) {
            try {
                await this.initOrg(orgId);
                this.logger.log(`✅ ${orgId.toUpperCase()} — connexion établie`);
            } catch (error) {
                this.logger.error(
                    `❌ ${orgId.toUpperCase()} — échec de connexion: ${error.message}`,
                );
            }
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.appMode === 'GATEWAY') return;

        for (const [orgId, conn] of this.connections) {
            try {
                conn.gateway.close();
                conn.client.close();
                this.logger.log(`🔌 ${orgId.toUpperCase()} — connexion fermée`);
            } catch (error) {
                this.logger.warn(
                    `⚠️ ${orgId.toUpperCase()} — erreur lors de la fermeture: ${error.message}`,
                );
            }
        }
        this.connections.clear();
    }

    // ─── Public API ──────────────────────────────────────────────

    /**
     * Query the ledger (read-only)
     */
    async queryLedger(
        orgId: string,
        channelName: string,
        chaincodeName: string,
        functionName: string,
        ...args: string[]
    ): Promise<unknown> {
        if (this.appMode === 'GATEWAY') {
            return this.proxyRequest('GET', '/ledger/query', { org: orgId, channel: channelName, chaincode: chaincodeName, fn: functionName, args: args.join(',') });
        }

        const contract = this.getContract(orgId, channelName, chaincodeName);
        const resultBytes = await contract.evaluateTransaction(
            functionName,
            ...args,
        );
        return this.decode(resultBytes);
    }

    /**
     * Submit a transaction to the ledger (write)
     */
    async invokeLedger(
        orgId: string,
        channelName: string,
        chaincodeName: string,
        functionName: string,
        ...args: string[]
    ): Promise<unknown> {
        if (this.appMode === 'GATEWAY') {
            return this.proxyRequest('POST', '/ledger/invoke', { org: orgId, channel: channelName, chaincode: chaincodeName, function: functionName, args });
        }

        const contract = this.getContract(orgId, channelName, chaincodeName);
        const resultBytes = await contract.submitTransaction(
            functionName,
            ...args,
        );
        return this.decode(resultBytes);
    }

    /**
     * Helper HTTP Proxy pour Cloud Run
     */
    private async proxyRequest(method: string, endpoint: string, payload: any): Promise<unknown> {
        const url = new URL(`${this.tunnelUrl}${endpoint}`);
        let init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };

        if (method === 'GET') {
            Object.keys(payload).forEach(key => payload[key] && url.searchParams.append(key, payload[key]));
        } else {
            init.body = JSON.stringify(payload);
        }

        this.logger.log(`🌐 [PROXY] Relay Request to Lenovo: ${method} ${url.toString()}`);
        const response = await fetch(url.toString(), init);

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Worker Error (${response.status}): ${errBody}`);
        }
        const data = await response.json();
        return data.data; // Le FabricController renvoie { status: 'success', data: ... }
    }

    /**
     * Returns health status for all connected orgs.
     */
    async getHealthStatus(): Promise<Record<string, boolean>> {
        if (this.appMode === 'GATEWAY') {
            try {
                const response = await fetch(`${this.tunnelUrl}/ledger/health`);
                if (response.ok) {
                    const data = await response.json();
                    return data.orgs || { "worker_available": true };
                }
                return { "worker_available": false };
            } catch {
                return { "worker_available": false };
            }
        }

        const status: Record<string, boolean> = {};
        for (const orgId of ['org1', 'org2', 'org3']) {
            status[orgId] = this.connections.has(orgId);
        }
        return status;
    }

    // ─── Private Helpers ─────────────────────────────────────────

    private getOrgConfig(orgId: string): OrgConfig {
        const prefix = orgId.toUpperCase(); // ORG1, ORG2, ORG3
        return {
            peerEndpoint: this.config.getOrThrow(`${prefix}_PEER_ENDPOINT`),
            peerHostAlias: this.config.getOrThrow(`${prefix}_PEER_HOST_ALIAS`),
            mspId: this.config.getOrThrow(`${prefix}_MSP_ID`),
            certPath: path.resolve(
                this.networkBasePath,
                this.config.getOrThrow(`${prefix}_CERT_RELATIVE_PATH`),
            ),
            keyDir: path.resolve(
                this.networkBasePath,
                this.config.getOrThrow(`${prefix}_KEY_RELATIVE_DIR`),
            ),
            tlsCertPath: path.resolve(
                this.networkBasePath,
                this.config.getOrThrow(`${prefix}_TLS_CERT_RELATIVE_PATH`),
            ),
        };
    }

    private async initOrg(orgId: string): Promise<void> {
        const orgConfig = this.getOrgConfig(orgId);

        // 1. TLS credentials
        const tlsCert = await fs.readFile(orgConfig.tlsCertPath);
        const tlsCredentials = grpc.credentials.createSsl(tlsCert);

        // 2. gRPC client
        const client = new grpc.Client(orgConfig.peerEndpoint, tlsCredentials, {
            'grpc.ssl_target_name_override': orgConfig.peerHostAlias,
        });

        // 3. User identity (X.509)
        const identity = await this.newIdentity(orgConfig);

        // 4. Signer (private key)
        const signer = await this.newSigner(orgConfig);

        // 5. Gateway connection
        const gateway = connect({
            client,
            identity,
            signer,
            evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
            endorseOptions: () => ({ deadline: Date.now() + 15000 }),
            submitOptions: () => ({ deadline: Date.now() + 5000 }),
            commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
        });

        this.connections.set(orgId, { client, gateway });
    }

    private async newIdentity(orgConfig: OrgConfig): Promise<Identity> {
        const certPem = await fs.readFile(orgConfig.certPath, 'utf8');
        return {
            mspId: orgConfig.mspId,
            credentials: Buffer.from(certPem),
        };
    }

    private async newSigner(orgConfig: OrgConfig): Promise<Signer> {
        const files = await fs.readdir(orgConfig.keyDir);
        const keyFile = files.find(
            (f) => f.endsWith('_sk') || f === 'priv_sk' || f.endsWith('.key'),
        );
        if (!keyFile) {
            throw new Error(
                `Aucune clé privée trouvée dans ${orgConfig.keyDir}`,
            );
        }
        const keyPem = await fs.readFile(
            path.join(orgConfig.keyDir, keyFile),
            'utf8',
        );
        const privateKey = crypto.createPrivateKey(keyPem);
        return signers.newPrivateKeySigner(privateKey);
    }

    private getContract(
        orgId: string,
        channelName: string,
        chaincodeName: string,
    ): Contract {
        const conn = this.connections.get(orgId);
        if (!conn) {
            throw new Error(
                `Organisation "${orgId}" non connectée. Vérifiez les certificats et le peer.`,
            );
        }
        return conn.gateway.getNetwork(channelName).getContract(chaincodeName);
    }

    private decode(resultBytes: Uint8Array): unknown {
        const text = Buffer.from(resultBytes).toString('utf8');
        if (!text) return null;
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }
}
