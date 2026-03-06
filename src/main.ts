import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Récupère le port via la variable d'environnement 'PORT' (injectée par Cloud Run)
  // Si elle n'existe pas (en local), on utilise le port 3000 par défaut.
  const port = process.env.PORT || 3000;

  // 2. IMPORTANT : On écoute sur '0.0.0.0' pour que Docker accepte les connexions externes.
  // Sans cela, Cloud Run affichera une erreur de santé (Health Check).
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application démarrée sur le port : ${port}`);
}
bootstrap();