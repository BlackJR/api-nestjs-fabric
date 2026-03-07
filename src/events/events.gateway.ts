import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
    cors: {
        origin: '*', // En production, restreindre à l'URL du frontend Svelte!
    },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(EventsGateway.name);

    handleConnection(client: Socket) {
        this.logger.log(`Client Svelte connecté : ${client.id}`);
    }

    handleDisconnect(client: Socket) {
        this.logger.log(`Client Svelte déconnecté : ${client.id}`);
    }

    /**
     * Pousse une notification au frontend spécifiquement pour un certain ID de transaction.
     * Svelte pourra écouter cet event de cette façon: socket.on('tx_confirmed', (data) => ...)
     */
    notifyTransactionSuccess(transactionId: string, assetData: any) {
        this.logger.log(`Notification WebSocket envoyée pour la tx: ${transactionId}`);
        this.server.emit('tx_confirmed', {
            transactionId,
            status: 'success',
            data: assetData
        });
    }

    notifyTransactionFailed(transactionId: string, errorMsg: string) {
        this.logger.log(`Notification d'erreur WebSocket pour la tx: ${transactionId}`);
        this.server.emit('tx_failed', {
            transactionId,
            status: 'failed',
            error: errorMsg
        });
    }
}
