import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FireFlyService {
    private readonly logger = new Logger(FireFlyService.name);

    // En production sur Cloud Run, cette variable sera https://fabrique.hypertest.foo
    private readonly fireflyBaseUrl = process.env.FIREFLY_URL || 'http://127.0.0.1:5000';

    constructor(private readonly httpService: HttpService) { }

    /**
     * Helper centralisé pour envoyer des requêtes à Firefly
     */
    private async sendInvoke(methodName: string, input: any) {
        const url = `${this.fireflyBaseUrl}/api/v1/namespaces/default/apis/academic-api/invoke/${methodName}`;
        try {
            this.logger.log(`Envoi de la transaction à FireFly [${methodName}]...`);
            const response: any = await firstValueFrom(this.httpService.post(url, { input }));

            this.logger.log(`Transaction acceptée par FireFly. ID: ${response.data.id}`);
            return response.data;
        } catch (error: any) {
            this.logger.error(`Erreur FireFly [${methodName}]: ${error.response?.data?.error || error.message}`);
            throw new HttpException(
                'Erreur lors de la communication avec la blockchain',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }

    private async sendQuery(methodName: string, input: any) {
        const url = `${this.fireflyBaseUrl}/api/v1/namespaces/default/apis/academic-api/query/${methodName}`;
        try {
            const response: any = await firstValueFrom(this.httpService.post(url, { input }));
            return response.data;
        } catch (error: any) {
            throw new HttpException('Erreur Blockchain', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }


    /**
     * Crée un nouveau diplôme
     */
    async createDiploma(id: string, studentName: string, school: string, pdfHash: string, date: string) {
        return this.sendInvoke('CreateDiploma', {
            id,
            studentName,
            school,
            pdfHash,
            date
        });
    }

    /**
     * Révoque définitivement un document
     */
    async revokeDocument(id: string) {
        return this.sendInvoke('RevokeDocument', { id });
    }

    /**
     * Remplace un document avec des métadonnées modifiées (Version++)
     */
    async replaceDocument(oldId: string, newId: string, newDocumentType: string, newStudentName: string, newDocumentHash: string, newIssuerId: string, newIssueDate: string) {
        return this.sendInvoke('ReplaceDocument', {
            oldId,
            newId,
            newDocumentType,
            newStudentName,
            newDocumentHash,
            newIssuerId,
            newIssueDate
        });
    }

    /**
     * Met à jour le Hash d'un document existant (Correction Bulletin - Version++)
     */
    async updateDocumentHash(id: string, newDocumentHash: string) {
        return this.sendInvoke('UpdateDocumentHash', {
            id,
            newDocumentHash
        });
    }

    /**
     * Permet de lire "Le World State" actuel d'un document
     */
    async readDocument(id: string) {
        return this.sendQuery('ReadDocument', { id });
    }

    /**
     * Récupère la liste de tous les diplômes depuis la blockchain (Lecture seule)
     */
    async getAllDiplomas() {
        try {
            this.logger.log(`Interrogation du registre Fabric pour tous les diplômes...`);
            return await this.sendQuery('GetAllDocuments', {});
        } catch (error: any) {
            this.logger.error(`Erreur de lecture FireFly: ${error.message}`);
            return [];
        }
    }
}
