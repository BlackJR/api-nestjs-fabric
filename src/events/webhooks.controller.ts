import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { EventsGateway } from './events.gateway';

@Controller('webhooks')
export class WebhooksController {
    private readonly logger = new Logger(WebhooksController.name);

    constructor(private readonly eventsGateway: EventsGateway) { }

    @Post('firefly')
    @HttpCode(HttpStatus.OK)
    async handleFireFlyWebhook(@Body() payload: any) {
        this.logger.log(`Webhook reçu de FireFly ! Type: ${payload.type}`);

        // FireFly envoie un tableau d'événements
        if (Array.isArray(payload) && payload.length > 0) {
            for (const event of payload) {
                if (event.type === 'transaction_submitted' || event.type === 'blockchain_event') {
                    this.logger.log(`Transaction confirmée par webhook: ${event.transaction}`);
                    // Pousse l'info au frontend !
                    this.eventsGateway.notifyTransactionSuccess(event.transaction, event);
                }
            }
        }

        return { received: true };
    }
}
