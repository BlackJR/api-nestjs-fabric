import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const CLOUD_RUN_URL = 'https://api-nest-js-73524228217.europe-west1.run.app';
const API_URL = `${CLOUD_RUN_URL}/diploma/issue`;
const API_KEY = process.env.API_KEY || 'default-secret-change-me-in-prod';

async function seedDiplomas() {
    console.log('🚀 Début de la génération de 45 diplômes...');
    console.log(`⚠️ Ciblage de l'API (Cloud Run) : ${API_URL}`);

    for (let i = 1; i <= 45; i++) {
        const diploma = {
            org: 'Ministère de l\'Éducation',
            id: `DIP-sdsdsd-${(String(i)).padStart(4, '0')}`,
            studentName: `Étudiant Modèle N°${i}`,
            schoolName: 'Université '
        };

        try {
            console.log(`⏳ [${i}/45] Émission du diplôme pour ${diploma.studentName}...`);
            const response = await axios.post(API_URL, diploma, {
                headers: { 'x-api-key': API_KEY }
            });
            console.log(`✅ Succès: ${response.data.diplomaId} (Hash: ${response.data.documentHash})`);
        } catch (error: any) {
            const errorMsg = error.response?.data?.message || error.response?.data || error.message || error;
            console.error(`❌ Erreur [${i}/45] :`, errorMsg);
        }

        // Pause légère entre chaque pour ne pas surcharger la boucle Node
        await new Promise(resolve => setTimeout(resolve, 300));

        // Le ThrottlerGuard bloque à 20 requêtes par minute. On fait une pause si besoin.
        if (i % 20 === 0 && i !== 45) {
            console.log('⏳ Pause de 60 secondes pour respecter le Rate Limit de l\'API (20 req/min)...');
            await new Promise(resolve => setTimeout(resolve, 61000));
        }
    }

    console.log('🎉 Terminé ! 45 diplômes émis.');
}

seedDiplomas().catch(console.error);
