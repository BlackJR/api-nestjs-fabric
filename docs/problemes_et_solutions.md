# Registre des Problèmes & Solutions (Architecture Hybride Cloud-Ledger)

Ce document répertorie les défis techniques majeurs rencontrés lors de la mise en place de la plateforme de certification (Svelte ↔ Cloud Run ↔ Cloudflare ↔ Lenovo Node ↔ Hyperledger Fabric), ainsi que leurs résolutions adoptées.

---

## 1. Conflits de Versionnement Golang (Chaincode Fabric)

**Symptôme** :  
Impossibilité de compiler le smart contract (chaincode) avec le script `network.sh deployCC`. L'image Docker de compilation `fabric-ccenv` rejetait les versions récentes de Go (1.23+) présentes dans le `go.mod` de base, générant des conflits massifs sur des dépendances implicites (ex: `golang.org/x/net`).  

**Solution Adoptée** :  
Abandon du chaincode Golang au profit d'un environnement **TypeScript**. Le chaincode TypeScript s'appuie sur `npm` et s'abstrait de la rigidité requise par l'outil `go mod`. Le déploiement s'est fait naturellement de bout en bout (`-ccl typescript`).

---

## 2. Crash de l'API Gateway sur Cloud Run (Credentials Isolés)

**Symptôme** :  
Le déploiement du `NestJS` sur GCP échouait ou crashait en boucle sur Cloud Run. L'application tentait de récupérer les identifiants `.pem` (Certificats et clés privées Fabric) absents du système de fichiers Cloud, car ils se situaient sur le PC local (Lenovo).

**Solution Adoptée** :  
Création d'un **Mode Hybride** géré par la variable environnementale `APP_MODE`. 
- `APP_MODE=WORKER` (sur Lenovo) : Initie le client gRPC natif et discute avec le noeud Fabric et les certificats locaux.
- `APP_MODE=GATEWAY` (sur Cloud Run) : Agit comme un **Proxy HTTP intelligent** et transmet la requête de l'utilisateur final vers le PC Lenovo en empruntant le tunnel Cloudflare sécurisé (`FABRIC_TUNNEL_URL`).

---

## 3. Génération PDF Lente et Gourmande sur le Cloud

**Symptôme** :  
Générer et hascher le diplôme nécessitait la conversion d'un template "HTML vers PDF" à l'empreinte constante. L'utilisation initiale de navigateurs *Headless* (ex: Puppeteer/Chromium) écroulait la limite de RAM de l'instance gratuite Cloud Run et exigeait des installations système complexes non documentées dans l'image Dockerfile classique d'Alpine/Debian.

**Solution Adoptée** :  
Transition vers la bibliothèque matricielle **PDFKit**. Le PDF (y compris le traçage du QrCode) est tracé mathématiquement et stocké directement dans un `Buffer` volant en mémoire. Il est haché ultra-rapidement (SHA-256) puis poussé sur Google Cloud Storage, économisant des dizaines de Megaoctets de RAM.

---

## 4. Endossements Refusés (Payloads Non-Déterministes)

**Symptôme** :  
Lors de l'émission logicielle du diplôme via l'API locale, `Hyperledger Fabric` abortait la transaction de stockage avec l’erreur fatale :
> `ProposalResponsePayloads do not match` (Code 10 ABORTED)

**Solution Adoptée** :  
Analyse des traces de débogage qui a pointé vers le chaincode. Sur Fabric, un contrat doit être purement **déterministe** (tous les nœuds l'exécutant simultanément doivent accoucher du même résultat kilooctet pour kilooctet). 
Or, le constructeur TypeScript du chaincode exécutait `new Date().toISOString()`. La variance de temps de calcul (en millisecondes) entre `peer0.org1` et `peer0.org2` produisait des dates distinctes.
Le contrat a été expurgé de tout calcul libre (la Date d'émission est désormais fixée et envoyée comme simple argument textuel lors de l'appel par NestJS).

---

## 5. Gel du Script lors de Déploiements Multi-Organisations (3 Orgs)

**Symptôme** :  
Mise à jour du réseau avec la troisième organisation "Org3" ajoutée en live !  
Le script de gestion native `deployCC.sh` tombait dans des boucles de validation erronées (ou vérifiait mal le quorum `CheckCommitReadiness`) du fait que le processus d'installation/approbation s'embourbait avec les versions cachées existantes pour Org1 et Org2.

**Solution Adoptée** :  
Conception d'un script artisanal Shell (`deploy_manual.sh`). 
Il calcule expressément l'empreinte hexadécimale du code source à base d'archivages `tar.gz` (`peer lifecycle chaincode calculatepackageid`). Puis il dispatche la consigne impérative d'approbation asynchrone individuellement à chaque Peer (`Org1`, `Org2` et `Org3`) à l'aide de leur Profil cryptographique propre, avant de forcer le vote majoritaire de `Commit` global sur le channel.
