import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as crypto from 'crypto';

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
    private readonly appLogger = new Logger(ApiKeyThrottlerGuard.name);

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 1. Vérification du Throttling (Spam)
        // On appelle canActivate sur le parent (ThrottlerGuard) pour compter les requêtes de l'IP
        const isAllowedByThrottler = await super.canActivate(context);
        if (!isAllowedByThrottler) {
            return false;
        }

        const request = context.switchToHttp().getRequest();
        const clientIp = request.ip || request.connection.remoteAddress;
        const apiKeyHeader = request.headers['x-api-key'];

        // Le secret attendu depuis l'environnement
        const secretKey = process.env.API_KEY || 'default-secret-change-me-in-prod';

        if (!apiKeyHeader) {
            this.appLogger.warn(`Requête bloquée (Aucune clé) depuis IP: ${clientIp} vers ${request.url}`);
            throw new UnauthorizedException('Clé API (x-api-key) manquante.');
        }

        // 2. Vérification cryptographique à Temps Constant (Anti Timing-Attack)
        const expectedBuffer = Buffer.from(secretKey);
        const inputBuffer = Buffer.from(apiKeyHeader as string);

        let isKeyValid = false;
        if (expectedBuffer.length === inputBuffer.length) {
            isKeyValid = crypto.timingSafeEqual(expectedBuffer, inputBuffer);
        }

        if (!isKeyValid) {
            this.appLogger.warn(`Tentative d'accès non autorisée depuis IP: ${clientIp} avec une clé invalide.`);
            throw new UnauthorizedException('Clé API invalide.');
        }

        return true;
    }
}
