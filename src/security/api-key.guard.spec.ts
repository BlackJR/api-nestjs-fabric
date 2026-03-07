import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule, ThrottlerStorage } from '@nestjs/throttler';
import { ApiKeyThrottlerGuard } from './api-key.guard';

describe('ApiKeyThrottlerGuard', () => {
    let guard: ApiKeyThrottlerGuard;

    beforeEach(async () => {
        // Le ThrottlerGuard (parent) nécessite au moins le module Throttler pour exister
        const module: TestingModule = await Test.createTestingModule({
            imports: [
                ThrottlerModule.forRoot([{
                    ttl: 60000,
                    limit: 10,
                }]),
            ],
            providers: [ApiKeyThrottlerGuard],
        }).compile();

        guard = module.get<ApiKeyThrottlerGuard>(ApiKeyThrottlerGuard);

        // Réinitialise l'environnement pour chaque test
        process.env.API_KEY = 'test-secret-key';
    });

    const createMockExecutionContext = (headers: Record<string, string>, ip = '127.0.0.1'): ExecutionContext => ({
        switchToHttp: () => ({
            getRequest: () => ({
                headers,
                ip,
                url: '/test-route'
            }),
            getResponse: () => ({}),
            getNext: () => jest.fn(),
        }),
        getHandler: () => jest.fn(),
        getClass: () => jest.fn(),
    } as unknown as ExecutionContext);

    it('devrait être défini', () => {
        expect(guard).toBeDefined();
    });

    it('devrait refuser une requête SANS la clé (Missing Header)', async () => {
        const mockContext = createMockExecutionContext({}); // Aucun header

        // Pour ce test, on court-circuite le throttling parent pour se concentrer sur l'API Key
        jest.spyOn(Object.getPrototypeOf(ApiKeyThrottlerGuard.prototype), 'canActivate').mockResolvedValue(true);

        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
        await expect(guard.canActivate(mockContext)).rejects.toThrow('Clé API (x-api-key) manquante.');
    });

    it('devrait refuser une requête avec une clé INVALIDE', async () => {
        const mockContext = createMockExecutionContext({
            'x-api-key': 'wrong-secret-key'
        });

        jest.spyOn(Object.getPrototypeOf(ApiKeyThrottlerGuard.prototype), 'canActivate').mockResolvedValue(true);

        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
        await expect(guard.canActivate(mockContext)).rejects.toThrow('Clé API invalide.');
    });

    it('devrait accepter une requête avec la BONNE clé', async () => {
        const mockContext = createMockExecutionContext({
            'x-api-key': 'test-secret-key'
        });

        jest.spyOn(Object.getPrototypeOf(ApiKeyThrottlerGuard.prototype), 'canActivate').mockResolvedValue(true);

        const result = await guard.canActivate(mockContext);
        expect(result).toBe(true);
    });

    it('devrait refuser une requête avec la BONNE clé, mais une clé de LONGUEUR différente', async () => {
        const mockContext = createMockExecutionContext({
            'x-api-key': 'test-secret-key-too-long'
        });

        jest.spyOn(Object.getPrototypeOf(ApiKeyThrottlerGuard.prototype), 'canActivate').mockResolvedValue(true);

        await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });
});
