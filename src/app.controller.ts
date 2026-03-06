import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {

  @Get()
  getHello(): string {
    return "✅ Connexion réussie via Cloudflare Tunnel !";
  }

  @Get('fabric-test')
  testFabricLogic() {
    return {
      status: 'success',
      message: 'Le tunnel fonctionne, prêt pour Hyperledger.',
      timestamp: new Date().toISOString(),
      node_info: {
        location: 'Maison (Montréal)',
        env: 'Development'
      }
    };
  }
}