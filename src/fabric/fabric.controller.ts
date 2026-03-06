import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FabricService } from './fabric.service';

interface InvokeDto {
    org: string;
    channel?: string;
    chaincode?: string;
    function: string;
    args?: string[];
}

@Controller('ledger')
export class FabricController {
    private readonly logger = new Logger(FabricController.name);

    constructor(
        private readonly fabricService: FabricService,
        private readonly config: ConfigService,
    ) { }

    /**
     * GET /ledger/health
     * Returns connection status for all 3 orgs.
     */
    @Get('health')
    getHealth() {
        return {
            status: 'ok',
            orgs: this.fabricService.getHealthStatus(),
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * GET /ledger/query?org=org1&fn=GetAllAssets&args=arg1,arg2
     * Query the ledger (read-only).
     */
    @Get('query')
    async queryLedger(
        @Query('org') org: string,
        @Query('fn') fn: string,
        @Query('args') argsStr?: string,
        @Query('channel') channel?: string,
        @Query('chaincode') chaincode?: string,
    ) {
        if (!org || !fn) {
            throw new HttpException(
                'Les paramètres "org" et "fn" sont requis.',
                HttpStatus.BAD_REQUEST,
            );
        }

        const defaultChannel = this.config.get('FABRIC_CHANNEL_NAME', 'mychannel');
        const defaultChaincode = this.config.get('FABRIC_CHAINCODE_NAME', 'basic');
        const args = argsStr ? argsStr.split(',') : [];

        try {
            const result = await this.fabricService.queryLedger(
                org,
                channel || defaultChannel,
                chaincode || defaultChaincode,
                fn,
                ...args,
            );
            return { status: 'success', data: result };
        } catch (error) {
            this.logger.error(`Query failed: ${error.message}`);
            throw new HttpException(
                { status: 'error', message: error.message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * POST /ledger/invoke
     * Submit a transaction to the ledger.
     * Body: { org, channel?, chaincode?, function, args? }
     */
    @Post('invoke')
    async invokeLedger(@Body() dto: InvokeDto) {
        if (!dto.org || !dto.function) {
            throw new HttpException(
                'Les champs "org" et "function" sont requis.',
                HttpStatus.BAD_REQUEST,
            );
        }

        const defaultChannel = this.config.get('FABRIC_CHANNEL_NAME', 'mychannel');
        const defaultChaincode = this.config.get('FABRIC_CHAINCODE_NAME', 'basic');

        try {
            const result = await this.fabricService.invokeLedger(
                dto.org,
                dto.channel || defaultChannel,
                dto.chaincode || defaultChaincode,
                dto.function,
                ...(dto.args || []),
            );
            return { status: 'success', data: result };
        } catch (error) {
            this.logger.error(`Invoke failed: ${error.message}`);
            throw new HttpException(
                { status: 'error', message: error.message },
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}
